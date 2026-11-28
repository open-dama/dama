import 'dart:async';
import 'dart:convert';

import 'package:dama_mobile/core/ads/ad_viewer_session.dart';
import 'package:dama_mobile/core/ads/lobby_soft_pause.dart';
import 'package:dama_mobile/core/ads/resolve_viewport_creative.dart';
import 'package:dama_mobile/core/audio/game_notify.dart';
import 'package:dama_mobile/core/geo/device_locate.dart';
import 'package:dama_mobile/core/network/api_config.dart';
import 'package:dama_mobile/core/theme/dama_theme.dart';
import 'package:dama_mobile/core/types/ads.dart';
import 'package:dama_mobile/core/types/feature_flags.dart';
import 'package:dama_mobile/features/ads/viewport_ad_creative.dart';
import 'package:dama_mobile/features/game/matchmaking_realtime.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

/// Phase B: soft full-screen lobby ad after idle dwell (opt-in via admin).
/// Uses GET /ads/serve (placement lobby) + freq caps. Prefer Phase C lobby_takeover.
/// Caller passes [blocked] for queue / invite / match start / wallet-KYC / compose.
class LobbySoftInterstitial extends StatefulWidget {
  const LobbySoftInterstitial({super.key, required this.blocked});

  final bool blocked;

  @override
  State<LobbySoftInterstitial> createState() => _LobbySoftInterstitialState();
}

class _LobbySoftInterstitialState extends State<LobbySoftInterstitial>
    with WidgetsBindingObserver {
  Timer? _idleTimer;
  Timer? _countdownTimer;
  bool _open = false;
  bool _shownThisIdle = false;
  bool _showInFlight = false;
  bool _softEnabled = false;
  int _idleThresholdSec = 90;
  int? _nonSkippable;
  int? _remaining;
  ServedAdCampaign? _campaign;
  String? _lobbyPlacement;
  Map<String, dynamic>? _playerChrome;
  ViewportBreakpoints? _viewportBreakpoints;
  Map<String, String>? _scheduleChrome;
  String _viewerKey = '';
  String _sessionKey = '';
  bool _appVisible = true;
  int _lastActivityMs = DateTime.now().millisecondsSinceEpoch;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_boot());
  }

  @override
  void didUpdateWidget(covariant LobbySoftInterstitial oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.blocked != oldWidget.blocked) {
      if (widget.blocked) {
        _clearIdle();
        // Mid-flight hard gate: stamp activity so _tryShow aborts (full idle after clear).
        if (_showInFlight) {
          _lastActivityMs = DateTime.now().millisecondsSinceEpoch;
        }
        if (_open) {
          _close();
        } else if (!_showInFlight) {
          // In-flight tryShow finally releases pause; otherwise unblock tile now.
          LobbySoftPause.open.value = false;
        }
      } else {
        _armIdle();
      }
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Depend on ModalRoute so push/pop re-arms or clears soft idle / open overlay.
    final _ = ModalRoute.of(context)?.isCurrent;
    if (!_routeIsCurrent) {
      _clearIdle();
      if (_open) {
        _close();
      } else if (!_showInFlight) {
        LobbySoftPause.open.value = false;
      }
      return;
    }
    if (!widget.blocked && _softEnabled && !_open) _armIdle();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _clearIdle();
    _countdownTimer?.cancel();
    LobbySoftPause.open.value = false;
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final visible = state == AppLifecycleState.resumed;
    if (visible == _appVisible) return;
    _appVisible = visible;
    if (!visible) {
      _clearIdle();
      // Abort in-flight soft (web lastActivityMs / document.hidden parity).
      _lastActivityMs = DateTime.now().millisecondsSinceEpoch;
      if (_open) _close();
      return;
    }
    _noteActivity();
    // Web useAdPlaybackQuery focus/refetch parity: pick up admin soft knobs.
    unawaited(_refreshPlaybackKnobs());
  }

  Future<void> _applyPlaybackMap(Map<String, dynamic> pb) async {
    final chrome = pb['player_chrome'] as Map<String, dynamic>?;
    final place = (chrome?['placement_lobby']?.toString() ?? '').trim();
    if (place.isEmpty) return;
    // Phase B: strict true only (web LobbySoftInterstitial / admin === true parity).
    final softOn = pb['lobby_soft_interstitial_enabled'] == true;
    final idleSec = int.tryParse(
          pb['lobby_idle_threshold_seconds']?.toString() ?? '',
        ) ??
        90;
    final scheduleRaw = pb['schedule_chrome'];
    Map<String, String>? scheduleChrome;
    ViewportBreakpoints? breakpoints;
    if (scheduleRaw is Map<String, dynamic>) {
      scheduleChrome = scheduleRaw.map(
        (k, v) => MapEntry(k, v?.toString() ?? ''),
      );
      breakpoints = parseViewportBreakpoints(scheduleChrome);
    }
    if (!mounted) return;
    setState(() {
      _lobbyPlacement = place;
      _playerChrome = chrome;
      _softEnabled = softOn;
      _idleThresholdSec = idleSec < 1 ? 90 : idleSec;
      _scheduleChrome = scheduleChrome;
      _viewportBreakpoints = breakpoints;
    });
    if (!softOn) {
      _clearIdle();
      if (_open) _close();
      return;
    }
    if (!widget.blocked && !_open) _armIdle();
  }

  Future<void> _boot() async {
    try {
      _viewerKey = await AdViewerSession.viewerKey();
      _sessionKey = await AdViewerSession.sessionKey();
      final playback = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/v1/ads/playback'),
      );
      if (playback.statusCode >= 300 || !mounted) return;
      final pb = jsonDecode(playback.body) as Map<String, dynamic>;
      await _applyPlaybackMap(pb);
    } catch (_) {
      // Fail closed: no soft interstitial without playback chrome.
    }
  }

  /// Refresh Phase B soft knobs without resetting viewer/session keys.
  Future<void> _refreshPlaybackKnobs() async {
    try {
      final playback = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/v1/ads/playback'),
      );
      if (playback.statusCode >= 300 || !mounted) return;
      final pb = jsonDecode(playback.body) as Map<String, dynamic>;
      await _applyPlaybackMap(pb);
    } catch (_) {
      // Keep prior knobs on transient failure.
    }
  }

  void _clearIdle() {
    _idleTimer?.cancel();
    _idleTimer = null;
  }

  /// Tile ModalRoute parity: no soft under pushed wallet/matchmaking/profile sheets.
  bool get _routeIsCurrent {
    final route = ModalRoute.of(context);
    if (route == null) return true;
    return route.isCurrent;
  }

  void _armIdle() {
    _clearIdle();
    if (widget.blocked ||
        !_softEnabled ||
        !_appVisible ||
        _open ||
        !_routeIsCurrent ||
        _viewerKey.isEmpty ||
        _sessionKey.isEmpty) {
      return;
    }
    _idleTimer = Timer(Duration(seconds: _idleThresholdSec), () {
      unawaited(_tryShow());
    });
  }

  void _noteActivity() {
    _lastActivityMs = DateTime.now().millisecondsSinceEpoch;
    if (_open) return;
    // In-flight soft: stamp activity so _tryShow aborts; finally re-arms dwell.
    if (_showInFlight) return;
    _shownThisIdle = false;
    _armIdle();
  }

  bool _rowHasCreative(ServedAdCampaign row) {
    final bp = _viewportBreakpoints;
    if (bp == null || !mounted) return false;
    final picked = pickCampaignCreative(
      viewportSourceFromServed(row),
      resolveViewportSlot(MediaQuery.sizeOf(context).width, bp),
    );
    var videoId = picked.videoId.trim();
    if (isStubVideoId(videoId)) videoId = '';
    return videoId.isNotEmpty ||
        resolvePublicMediaUrl(picked.imageUrl).isNotEmpty;
  }

  ServedAdCampaign? _pickSoft(List<ServedAdCampaign> rows) {
    final usable = rows.where(_rowHasCreative).toList();
    if (usable.isEmpty) return null;
    for (final row in usable) {
      if (row.lobbyTakeover == true) return row;
    }
    return usable.first;
  }

  /// Web `isEnteringMatchSync` parity: read controller latch mid-flight so soft
  /// cannot impress one frame before HomePage `blocked` rebuilds.
  bool _matchStartLatchSync() {
    if (!mounted) return true;
    final mm = MatchmakingRealtimeScope.maybeOf(context);
    if (mm == null) return false;
    if (mm.isEnteringMatchSync()) return true;
    if ((mm.matchedP1 ?? '').trim().isNotEmpty) return true;
    if ((mm.matchedP2 ?? '').trim().isNotEmpty) return true;
    return false;
  }

  Future<void> _tryShow() async {
    if (!mounted ||
        widget.blocked ||
        _matchStartLatchSync() ||
        _open ||
        _shownThisIdle ||
        _showInFlight ||
        !_softEnabled ||
        !_appVisible ||
        !_routeIsCurrent) {
      return;
    }
    final place = (_lobbyPlacement ?? '').trim();
    if (place.isEmpty || _viewerKey.isEmpty || _sessionKey.isEmpty) {
      // Idle tick already consumed; re-arm when keys/placement become ready.
      _armIdle();
      return;
    }
    if (_viewportBreakpoints == null || _playerChrome == null) {
      _armIdle();
      return;
    }
    final flightStartedAt = DateTime.now().millisecondsSinceEpoch;
    bool abortedByActivity() => _lastActivityMs > flightStartedAt;
    _showInFlight = true;
    try {
      // Geo before pause (web soft parity): do not hold the tile paused during GPS.
      final located = await locateWithDeviceGps(
        locateUrl: '${ApiConfig.baseUrl}/api/v1/geo/locate',
        preferDeviceGps: FeatureFlagsWire.preferDeviceGpsCached(),
      );
      if (!mounted ||
          widget.blocked ||
          _matchStartLatchSync() ||
          _open ||
          _shownThisIdle ||
          !_appVisible ||
          !_routeIsCurrent ||
          abortedByActivity()) {
        return;
      }
      // Web country|lat parity: empty country OK when GPS coords are present.
      if (located == null ||
          (located.countryCode.isEmpty && located.latitude == null)) {
        _armIdle();
        return;
      }
      final qs = <String, String>{
        'viewer_key': _viewerKey,
        'session_key': _sessionKey,
      };
      if (located.countryCode.isNotEmpty) {
        qs['country'] = located.countryCode;
      }
      final region = (located.region ?? '').trim();
      final district = (located.city ?? '').trim();
      if (region.isNotEmpty) qs['region'] = region.toLowerCase();
      if (district.isNotEmpty) qs['district'] = district.toLowerCase();
      if (located.latitude != null) {
        qs['lat'] = located.latitude!.toString();
      }
      if (located.longitude != null) {
        qs['lng'] = located.longitude!.toString();
      }
      // Pause tile impress before soft serve so a concurrent GeoAdSlot fetch
      // cannot double-count while soft is deciding (web lobbySoftOpen parity).
      LobbySoftPause.open.value = true;
      // Fresh serve at show time (web soft OOB parity): avoid opening a
      // creative the lobby tile just impressed from a stale warm cache.
      final serve = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/v1/ads/serve')
            .replace(queryParameters: qs),
      );
      if (!mounted ||
          serve.statusCode >= 300 ||
          widget.blocked ||
          _matchStartLatchSync() ||
          _open ||
          _shownThisIdle ||
          !_appVisible ||
          !_routeIsCurrent ||
          abortedByActivity()) {
        return;
      }
      final body = jsonDecode(serve.body) as Map<String, dynamic>;
      final parsed = AdsServeResponse.fromJson(body);
      final picked = _pickSoft(parsed.campaigns);
      if (picked == null || picked.id.isEmpty) return;
      final playback = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/v1/ads/playback'),
      );
      if (!mounted ||
          playback.statusCode >= 300 ||
          widget.blocked ||
          _matchStartLatchSync() ||
          _open ||
          _shownThisIdle ||
          !_appVisible ||
          !_routeIsCurrent ||
          abortedByActivity()) {
        return;
      }
      final pb = jsonDecode(playback.body) as Map<String, dynamic>;
      // Strict true only so a stringy payload cannot arm soft billing.
      if (pb['lobby_soft_interstitial_enabled'] != true) return;
      if (abortedByActivity() ||
          widget.blocked ||
          _matchStartLatchSync() ||
          !_appVisible ||
          !_routeIsCurrent) {
        return;
      }
      final ns = int.tryParse(pb['non_skippable_seconds']?.toString() ?? '') ?? 5;
      final nonSkip = ns < 1 ? 5 : ns;
      String? viewport;
      final bp = _viewportBreakpoints;
      if (bp != null && mounted) {
        viewport = resolveViewportSlot(
          MediaQuery.sizeOf(context).width,
          bp,
        ).name;
      }
      final impressBody = <String, dynamic>{
        'viewer_key': _viewerKey,
        'session_key': _sessionKey,
        'placement': place,
      };
      if (viewport != null && viewport.isNotEmpty) {
        impressBody['viewport'] = viewport;
      }
      // Web document.hidden parity: never bill while backgrounded.
      if (!_appVisible ||
          !_routeIsCurrent ||
          abortedByActivity() ||
          widget.blocked ||
          _matchStartLatchSync()) {
        return;
      }
      // Bill first: fail closed so uncapped soft cannot loop without a ledger write.
      final impressRes = await http.post(
        Uri.parse(
          '${ApiConfig.baseUrl}/api/v1/ads/campaigns/${picked.id}/impression',
        ),
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': _viewerKey,
        },
        body: jsonEncode(impressBody),
      );
      if (!mounted ||
          impressRes.statusCode >= 300 ||
          widget.blocked ||
          _matchStartLatchSync() ||
          _open ||
          abortedByActivity() ||
          !_appVisible ||
          !_routeIsCurrent) {
        return;
      }
      _shownThisIdle = true;
      setState(() {
        _campaign = picked;
        _nonSkippable = nonSkip;
        _remaining = nonSkip;
        _open = true;
      });
      _startCountdown();
    } catch (_) {
      // Fail closed: stay silent on serve errors.
    } finally {
      _showInFlight = false;
      if (!_open) {
        LobbySoftPause.open.value = false;
        // Re-arm dwell so empty inventory / failed serve can retry while idle
        // (web LobbySoftInterstitial parity).
        if (mounted &&
            !widget.blocked &&
            !_matchStartLatchSync() &&
            _softEnabled &&
            _appVisible) {
          _armIdle();
        }
      }
    }
  }

  void _startCountdown() {
    _countdownTimer?.cancel();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _remaining == null) return;
      if (_remaining! <= 0) {
        _countdownTimer?.cancel();
        return;
      }
      setState(() => _remaining = _remaining! - 1);
    });
  }

  void _close() {
    _countdownTimer?.cancel();
    LobbySoftPause.open.value = false;
    setState(() {
      _open = false;
      _campaign = null;
      _nonSkippable = null;
      _remaining = null;
    });
    unawaited(GameNotify.unlock(force: true));
    _shownThisIdle = false;
    // Do not re-arm while backgrounded (visibility/lifecycle re-arms on resume).
    if (_appVisible) _armIdle();
  }

  @override
  Widget build(BuildContext context) {
    // Keep idle armed via Listener on the host; this widget only paints overlay.
    if (!_open ||
        _campaign == null ||
        _nonSkippable == null ||
        _remaining == null ||
        _playerChrome == null ||
        _viewportBreakpoints == null) {
      return const SizedBox.shrink();
    }
    final canSkip = _remaining! <= 0;
    final tokens = damaColorsOf(context);
    final chrome = _playerChrome!;
    final skipLabel = (chrome['skip_in_template']?.toString() ?? '')
        .replaceAll('{seconds}', '$_remaining');
    final source = viewportSourceFromServed(_campaign!);
    final width = MediaQuery.sizeOf(context).width;
    final bp = _viewportBreakpoints!;
    final picked = pickCampaignCreative(
      source,
      resolveViewportSlot(width, bp),
    );
    var videoId = picked.videoId.trim();
    if (isStubVideoId(videoId)) videoId = '';
    final imageUrl = resolvePublicMediaUrl(picked.imageUrl);
    final hasCreative = videoId.isNotEmpty || imageUrl.isNotEmpty;
    if (!hasCreative) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _open) _close();
      });
      return const SizedBox.shrink();
    }
    return Positioned.fill(
      child: Material(
        color: tokens.overlayScrim,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: tokens.card,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: tokens.borderSubtle),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    chrome['sponsored_label']?.toString() ?? '',
                    style: TextStyle(
                      fontSize: 11,
                      letterSpacing: 1.2,
                      color: tokens.onSurfaceMuted,
                    ),
                  ),
                  const SizedBox(height: 12),
                  GestureDetector(
                    onTap: () {
                      unawaited(
                        http.post(
                          Uri.parse(
                            '${ApiConfig.baseUrl}/api/v1/ads/campaigns/${_campaign!.id}/click',
                          ),
                          headers: {'Content-Type': 'application/json'},
                          body: '{}',
                        ),
                      );
                    },
                    child: ViewportAdCreative(
                      source: source,
                      breakpoints: _viewportBreakpoints,
                      scheduleChrome: _scheduleChrome,
                      maxWidth: 420,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(_campaign!.title ?? ''),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          canSkip
                              ? (chrome['can_continue_label']?.toString() ?? '')
                              : skipLabel,
                          style: TextStyle(color: tokens.onSurfaceMuted),
                        ),
                      ),
                      FilledButton(
                        onPressed: canSkip ? _close : null,
                        child:
                            Text(chrome['continue_action']?.toString() ?? ''),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Wraps [child] so pointer/scroll activity resets Phase B idle timer.
class LobbySoftIdleHost extends StatefulWidget {
  const LobbySoftIdleHost({
    super.key,
    required this.blocked,
    required this.child,
  });

  final bool blocked;
  final Widget child;

  @override
  State<LobbySoftIdleHost> createState() => _LobbySoftIdleHostState();
}

class _LobbySoftIdleHostState extends State<LobbySoftIdleHost> {
  final GlobalKey<_LobbySoftInterstitialState> _softKey =
      GlobalKey<_LobbySoftInterstitialState>();

  void _onActivity() {
    _softKey.currentState?._noteActivity();
  }

  @override
  Widget build(BuildContext context) {
    // Pointer + scroll + keydown (web LobbySoftInterstitial activity parity).
    return Focus(
      canRequestFocus: false,
      onKeyEvent: (node, event) {
        if (event is KeyDownEvent) _onActivity();
        return KeyEventResult.ignored;
      },
      child: Listener(
        behavior: HitTestBehavior.translucent,
        onPointerDown: (_) => _onActivity(),
        child: NotificationListener<ScrollNotification>(
          onNotification: (n) {
            if (n is ScrollUpdateNotification) _onActivity();
            return false;
          },
          child: Stack(
            fit: StackFit.expand,
            children: [
              widget.child,
              LobbySoftInterstitial(key: _softKey, blocked: widget.blocked),
            ],
          ),
        ),
      ),
    );
  }
}
