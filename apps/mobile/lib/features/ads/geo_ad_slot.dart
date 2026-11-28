import 'dart:async';
import 'dart:convert';

import 'package:dama_mobile/core/ads/ad_viewer_session.dart';
import 'package:dama_mobile/core/ads/lobby_soft_pause.dart';
import 'package:dama_mobile/core/cache/query_cache.dart';
import 'package:dama_mobile/core/geo/device_locate.dart';
import 'package:dama_mobile/core/network/api_config.dart';
import 'package:dama_mobile/core/ads/resolve_viewport_creative.dart';
import 'package:dama_mobile/core/theme/dama_theme.dart';
import 'package:dama_mobile/core/types/types.dart';
import 'package:dama_mobile/features/ads/viewport_ad_creative.dart';
import 'package:dama_mobile/features/home/player_shell_controller.dart';
import 'package:dama_mobile/core/ui/shimmer_skeletons.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

/// Player-facing geo ad slot: serve + one-shot impression from backend only.
class GeoAdSlot extends StatefulWidget {
  const GeoAdSlot({super.key});

  @override
  State<GeoAdSlot> createState() => _GeoAdSlotState();
}

class _GeoAdSlotState extends State<GeoAdSlot> with WidgetsBindingObserver {
  ServedAdCampaign? _ad;
  String? _impressedShowKey;
  /// Last painted serve generation awaiting impress (web showKey parity).
  String? _pendingShowKey;
  String? _lobbyPlacement;
  ViewportBreakpoints? _viewportBreakpoints;
  Map<String, String>? _scheduleChrome;
  bool _loading = true;
  bool _lobbyRotateEnabled = false;
  int _lobbyRotateSeconds = 0;
  bool _appVisible = true;
  Map<String, String> _lastQs = const {};
  String _lastCacheKey = '';
  Timer? _rotateTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    LobbySoftPause.open.addListener(_onSoftPauseChanged);
    PlayerShellController.instance.addListener(_onShellRouteChanged);
    unawaited(_load(showSkeleton: true));
  }

  @override
  void dispose() {
    LobbySoftPause.open.removeListener(_onSoftPauseChanged);
    PlayerShellController.instance.removeListener(_onShellRouteChanged);
    WidgetsBinding.instance.removeObserver(this);
    _rotateTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Depend on ModalRoute so Navigator push/pop re-arms or pauses rotate.
    final _ = ModalRoute.of(context)?.isCurrent;
    _armRotateTimer();
    unawaited(_flushPendingImpress());
  }

  /// Phase A: rotate only while home/play lobby tab is selected (IndexedStack keep-alive).
  bool get _homeLobbySurfaceActive {
    final key = PlayerShellController.instance.activeRouteKey.trim();
    return key.isEmpty || key == 'home' || key == 'play';
  }

  /// Web surfaceActive parity: pause tile under pushed wallet/matchmaking/profile routes.
  bool get _routeIsCurrent {
    final route = ModalRoute.of(context);
    if (route == null) return true;
    return route.isCurrent;
  }

  bool get _canImpressSurface {
    return _appVisible &&
        _homeLobbySurfaceActive &&
        _routeIsCurrent &&
        !LobbySoftPause.open.value;
  }

  void _onSoftPauseChanged() {
    if (LobbySoftPause.open.value) {
      _rotateTimer?.cancel();
      return;
    }
    _armRotateTimer();
    // Soft fail / close: bill the painted tile if impress was skipped (web parity).
    unawaited(_flushPendingImpress());
  }

  void _onShellRouteChanged() {
    _armRotateTimer();
    unawaited(_flushPendingImpress());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final visible = state == AppLifecycleState.resumed;
    if (visible == _appVisible) return;
    _appVisible = visible;
    if (visible) {
      // Web useAdPlaybackQuery focus/refetch parity: pick up admin rotate knobs.
      unawaited(_refreshPlaybackKnobs());
      unawaited(_flushPendingImpress());
    } else {
      _rotateTimer?.cancel();
    }
  }

  /// Refresh Phase A rotate knobs without a full geo re-serve.
  Future<void> _refreshPlaybackKnobs() async {
    try {
      if (!await _loadPlacement()) return;
      if (!mounted) return;
      _armRotateTimer();
    } catch (_) {
      // Keep prior knobs on transient failure.
    }
  }

  void _armRotateTimer() {
    _rotateTimer?.cancel();
    if (!_appVisible ||
        !_homeLobbySurfaceActive ||
        !_routeIsCurrent ||
        !_lobbyRotateEnabled ||
        _lobbyRotateSeconds < 1 ||
        LobbySoftPause.open.value) {
      return;
    }
    _rotateTimer = Timer.periodic(Duration(seconds: _lobbyRotateSeconds), (_) {
      if (!mounted ||
          !_appVisible ||
          !_homeLobbySurfaceActive ||
          !_routeIsCurrent ||
          _lastCacheKey.isEmpty ||
          LobbySoftPause.open.value) {
        return;
      }
      QueryCache.invalidate(_lastCacheKey);
      unawaited(
        _fetchAndApply(_lastQs, _lastCacheKey, recordImpression: true),
      );
    });
  }

  Future<bool> _loadPlacement() async {
    final playback = await http.get(
      Uri.parse('${ApiConfig.baseUrl}/api/v1/ads/playback'),
    );
    if (playback.statusCode >= 300) return false;
    final pb = jsonDecode(playback.body) as Map<String, dynamic>;
    final chrome = pb['player_chrome'] as Map<String, dynamic>?;
    final place = (chrome?['placement_lobby']?.toString() ?? '').trim();
    if (place.isEmpty) return false;
    _lobbyPlacement = place;
    // Phase A: strict true only (web GeoAdSlot === true parity).
    _lobbyRotateEnabled = pb['lobby_rotate_enabled'] == true;
    final rotateSec = int.tryParse(
          pb['lobby_rotate_interval_seconds']?.toString() ?? '',
        ) ??
        0;
    _lobbyRotateSeconds = rotateSec;
    final scheduleRaw = pb['schedule_chrome'];
    if (scheduleRaw is Map<String, dynamic>) {
      final scheduleChrome = scheduleRaw.map(
        (k, v) => MapEntry(k, v?.toString() ?? ''),
      );
      _viewportBreakpoints = parseViewportBreakpoints(scheduleChrome);
      _scheduleChrome = scheduleChrome;
    }
    return true;
  }

  Future<void> _load({required bool showSkeleton}) async {
    if (showSkeleton && _ad == null && mounted) {
      setState(() => _loading = true);
    }
    try {
      if (!await _loadPlacement()) {
        if (mounted) setState(() => _loading = false);
        return;
      }
      final located = await locateWithDeviceGps(
        locateUrl: '${ApiConfig.baseUrl}/api/v1/geo/locate',
        preferDeviceGps: FeatureFlagsWire.preferDeviceGpsCached(),
      );
      // Web country|lat parity: empty country is OK when GPS coords are present.
      if (located == null ||
          (located.countryCode.isEmpty && located.latitude == null)) {
        if (mounted) setState(() => _loading = false);
        return;
      }
      final country = located.countryCode;
      final region = (located.region ?? '').toLowerCase();
      final district = (located.city ?? '').toLowerCase();
      final viewer = await AdViewerSession.viewerKey();
      final session = await AdViewerSession.sessionKey();
      // Parity with web: do not serve/rank without keys (freq + session caps).
      if (viewer.isEmpty || session.isEmpty) {
        if (mounted) setState(() => _loading = false);
        return;
      }
      final qs = <String, String>{
        'viewer_key': viewer,
        'session_key': session,
      };
      if (located.latitude != null) {
        qs['lat'] = located.latitude!.toString();
      }
      if (located.longitude != null) {
        qs['lng'] = located.longitude!.toString();
      }

      final cacheKey = CacheKeys.geoAd(country, region, district);
      _lastQs = qs;
      _lastCacheKey = cacheKey;
      final cachedAd = QueryCache.read<ServedAdCampaign>(
        cacheKey,
        maxAge: QueryCache.sessionTtl,
        allowStale: true,
      );
      if (cachedAd != null && mounted) {
        setState(() {
          _ad = cachedAd;
          _loading = false;
        });
        // Warm cache paint is instant; still re-serve and impress once this mount so
        // session/cross-placement caps stay accurate before the first rotate tick.
        unawaited(_fetchAndApply(qs, cacheKey, recordImpression: true));
        _armRotateTimer();
        return;
      }

      await _fetchAndApply(qs, cacheKey, recordImpression: true);
      _armRotateTimer();
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _fetchAndApply(
    Map<String, String> qs,
    String cacheKey, {
    required bool recordImpression,
  }) async {
    final viewer = qs['viewer_key'] ?? await AdViewerSession.viewerKey();
    final session = qs['session_key'] ?? await AdViewerSession.sessionKey();
    final headers = <String, String>{};
    if (viewer.isNotEmpty) {
      headers['X-Device-Id'] = viewer;
    }
    final uri = Uri.parse('${ApiConfig.baseUrl}/api/v1/ads/serve')
        .replace(queryParameters: qs.isEmpty ? null : qs);
    final serve = await http.get(uri, headers: headers);
    if (serve.statusCode >= 300 || !mounted) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    final served = AdsServeResponse.fromJson(
      jsonDecode(serve.body) as Map<String, dynamic>,
    );
    final bp = _viewportBreakpoints;
    ServedAdCampaign? chosen;
    if (bp != null && mounted) {
      final width = MediaQuery.sizeOf(context).width;
      final slot = resolveViewportSlot(width, bp);
      for (final c in served.campaigns) {
        if ((c.title ?? '').trim().isEmpty) continue;
        final picked = pickCampaignCreative(
          viewportSourceFromServed(c),
          slot,
        );
        final videoId =
            isStubVideoId(picked.videoId.trim()) ? '' : picked.videoId.trim();
        final imageUrl = resolvePublicMediaUrl(picked.imageUrl);
        if (videoId.isNotEmpty || imageUrl.isNotEmpty) {
          chosen = c;
          break;
        }
      }
    }
    if (chosen == null) {
      QueryCache.invalidate(cacheKey);
      if (mounted) {
        setState(() {
          _ad = null;
          _loading = false;
        });
      }
      return;
    }
    QueryCache.write(cacheKey, chosen);
    if (!mounted) return;
    setState(() {
      _ad = chosen;
      _loading = false;
    });
    if (!recordImpression) return;
    // One impression per successful serve apply (rotate re-shows count again).
    // Do not burn impressed under soft/surface skip (web unpaid-showKey parity).
    _pendingShowKey =
        '${chosen.id}:${DateTime.now().millisecondsSinceEpoch}';
    await _flushPendingImpress(
      viewerOverride: viewer,
      sessionOverride: session,
    );
  }

  Future<void> _flushPendingImpress({
    String? viewerOverride,
    String? sessionOverride,
  }) async {
    if (!mounted) return;
    final chosen = _ad;
    final showKey = (_pendingShowKey ?? '').trim();
    if (chosen == null || chosen.id.isEmpty || showKey.isEmpty) return;
    if (_impressedShowKey == showKey) return;
    if (!_canImpressSurface) return;
    final placement = (_lobbyPlacement ?? '').trim();
    if (placement.isEmpty) return;
    final viewer =
        (viewerOverride ?? _lastQs['viewer_key'] ?? await AdViewerSession.viewerKey())
            .trim();
    final session =
        (sessionOverride ?? _lastQs['session_key'] ?? await AdViewerSession.sessionKey())
            .trim();
    if (viewer.isEmpty || session.isEmpty) return;
    if (!_canImpressSurface || _impressedShowKey == showKey) return;
    String? viewport;
    final bp = _viewportBreakpoints;
    if (bp != null && mounted) {
      final width = MediaQuery.sizeOf(context).width;
      viewport = resolveViewportSlot(width, bp).name;
    }
    final body = <String, dynamic>{
      'viewer_key': viewer,
      'session_key': session,
      'placement': placement,
    };
    if (viewport != null && viewport.isNotEmpty) {
      body['viewport'] = viewport;
    }
    final res = await http.post(
      Uri.parse(
          '${ApiConfig.baseUrl}/api/v1/ads/campaigns/${chosen.id}/impression'),
      headers: {'Content-Type': 'application/json', 'X-Device-Id': viewer},
      body: jsonEncode(body),
    );
    // Soft / surface / visibility may flip during the await (web unpaid-showKey
    // parity). Do not consume showKey if the tile is no longer eligible.
    if (!_canImpressSurface) return;
    // Mark only after a successful bill so soft min-gap misses can retry later.
    if (res.statusCode < 300) {
      _impressedShowKey = showKey;
    }
  }

  Future<void> _onTap() async {
    final id = _ad?.id;
    if (id == null || id.isEmpty) return;
    try {
      await http.post(
          Uri.parse('${ApiConfig.baseUrl}/api/v1/ads/campaigns/$id/click'));
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    // Soft owns the lobby surface (one creative at a time): hide the tile visually.
    return ValueListenableBuilder<bool>(
      valueListenable: LobbySoftPause.open,
      builder: (context, softOpen, _) {
        if (softOpen) return const SizedBox.shrink();
        final tokens = damaColorsOf(context);
        if (_loading) return const GeoAdSlotSkeleton();
        final ad = _ad;
        final title = ad?.title;
        if (ad == null || title == null || title.isEmpty) {
          return const SizedBox.shrink();
        }
        final bp = _viewportBreakpoints;
        if (bp == null) {
          return const SizedBox.shrink();
        }
        final source = viewportSourceFromServed(ad);
        final width = MediaQuery.sizeOf(context).width;
        final picked = pickCampaignCreative(
          source,
          resolveViewportSlot(width, bp),
        );
        var videoId = picked.videoId.trim();
        if (isStubVideoId(videoId)) videoId = '';
        final imageUrl = resolvePublicMediaUrl(picked.imageUrl);
        final hasCreative = videoId.isNotEmpty || imageUrl.isNotEmpty;
        // Exact-slot serve: hide lobby tile when this screen has no creative.
        if (!hasCreative) {
          return const SizedBox.shrink();
        }
        return Padding(
          padding: const EdgeInsets.only(top: 16),
          child: Material(
            color: tokens.card,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: _onTap,
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: TextStyle(
                            color: tokens.gold, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    ViewportAdCreative(
                      source: source,
                      breakpoints: _viewportBreakpoints,
                      scheduleChrome: _scheduleChrome,
                      maxWidth: double.infinity,
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
