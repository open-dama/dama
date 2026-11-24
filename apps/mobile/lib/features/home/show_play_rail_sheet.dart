import 'dart:async';
import 'dart:convert';

import 'package:dama_mobile/core/cache/query_cache.dart';
import 'package:dama_mobile/core/network/api_config.dart';
import 'package:dama_mobile/core/prefs/board_palette_prefs.dart';
import 'package:dama_mobile/core/types/types.dart';
import 'package:dama_mobile/features/auth/auth_cubit.dart';
import 'package:dama_mobile/features/auth/practice_token.dart';
import 'package:dama_mobile/features/auth/sign_in_dialog.dart';
import 'package:dama_mobile/features/game/cubit/feature_flags_cubit.dart';
import 'package:dama_mobile/features/game/match_board_page.dart';
import 'package:dama_mobile/features/game/matchmaking_page.dart';
import 'package:dama_mobile/features/home/play_rail_panel.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:http/http.dart' as http;

/// Right-side play rail (New Game | Games | Players) for tablet/phone
/// tournaments browse - web `/?view=tournaments` FAB → sheet parity.
Future<void> showPlayRailSheet(BuildContext context) {
  return showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    barrierColor: Colors.black54,
    transitionDuration: const Duration(milliseconds: 280),
    pageBuilder: (ctx, anim, secondary) {
      // Host owns width/compose so character focus can expand smoothly.
      return const _PlayRailSheetHost();
    },
    transitionBuilder: (ctx, anim, secondary, child) {
      final offset = Tween<Offset>(
        begin: const Offset(1, 0),
        end: Offset.zero,
      ).animate(CurvedAnimation(parent: anim, curve: Curves.easeOutCubic));
      return SlideTransition(position: offset, child: child);
    },
  );
}

/// Side sheet that expands to a full-bleed compose panel on character text focus.
class _PlayRailSheetHost extends StatefulWidget {
  const _PlayRailSheetHost();

  @override
  State<_PlayRailSheetHost> createState() => _PlayRailSheetHostState();
}

class _PlayRailSheetHostState extends State<_PlayRailSheetHost> {
  bool _compose = false;
  double _composeDrag = 0;

  /// Keep rail body State (and text focus) across compose chrome insert.
  final GlobalKey _railBodyKey = GlobalKey();

  void _setCompose(bool open) {
    if (_compose == open) return;
    final prior = FocusManager.instance.primaryFocus;
    setState(() {
      _compose = open;
      _composeDrag = 0;
    });
    if (!open) {
      FocusManager.instance.primaryFocus?.unfocus();
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_compose) return;
      prior?.requestFocus();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _compose) prior?.requestFocus();
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final sheetW = size.width < 440 ? size.width : 440.0;
    final tokens = Theme.of(context).colorScheme;

    final topInset = _compose ? MediaQuery.viewPaddingOf(context).top : 0.0;
    // Drop top SafeArea while compose so the sheet reaches the screen top.
    return SafeArea(
      top: !_compose,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Always mount backdrop so the rail keeps a stable Stack slot (focus).
          Positioned.fill(
            child: IgnorePointer(
              ignoring: !_compose,
              child: AnimatedOpacity(
                opacity: _compose ? 1 : 0,
                duration: const Duration(milliseconds: 280),
                curve: Curves.easeOut,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => _setCompose(false),
                  // Do not compete with the text field for focus on pointer down.
                  onTapDown: (_) {},
                  child: const ColoredBox(color: Color(0x73000000)),
                ),
              ),
            ),
          ),
          AnimatedPositioned(
            key: const ValueKey<String>('dama-fab-play-rail-compose'),
            duration: const Duration(milliseconds: 320),
            curve: Curves.easeOutCubic,
            top: _compose ? _composeDrag : 0,
            bottom: _compose ? -_composeDrag : 0,
            right: 0,
            width: _compose ? size.width : sheetW,
            child: Material(
              elevation: _compose ? 12 : 8,
              color: tokens.surface,
              // Full-bleed compose - no top radius gap (web top-0 parity).
              borderRadius: BorderRadius.zero,
              clipBehavior: Clip.antiAlias,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Always keep chrome layout size (opacity only) so open does not
                  // push the focused field and drop the keyboard.
                  IgnorePointer(
                    ignoring: !_compose,
                    child: Opacity(
                      opacity: _compose ? 1 : 0,
                      child: Padding(
                        padding: EdgeInsets.fromLTRB(8, 6 + topInset, 4, 4),
                        child: Row(
                          children: [
                            Expanded(
                              child: GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onVerticalDragUpdate: (d) {
                                  setState(() {
                                    _composeDrag = (_composeDrag + d.delta.dy)
                                        .clamp(0.0, 240.0);
                                  });
                                },
                                onVerticalDragEnd: (_) {
                                  if (_composeDrag >= 88) {
                                    _setCompose(false);
                                  } else {
                                    setState(() => _composeDrag = 0);
                                  }
                                },
                                child: Column(
                                  children: [
                                    Container(
                                      width: 40,
                                      height: 4,
                                      decoration: BoxDecoration(
                                        color: tokens.outlineVariant,
                                        borderRadius: BorderRadius.circular(99),
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                  ],
                                ),
                              ),
                            ),
                            IconButton(
                              tooltip: MaterialLocalizations.of(context)
                                  .closeButtonTooltip,
                              onPressed: () => _setCompose(false),
                              icon: const Icon(Icons.close, size: 20),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: _PlayRailSheetBody(
                      key: _railBodyKey,
                      onComposeSheetChanged: _setCompose,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PlayRailSheetBody extends StatefulWidget {
  const _PlayRailSheetBody({super.key, this.onComposeSheetChanged});

  final ValueChanged<bool>? onComposeSheetChanged;

  @override
  State<_PlayRailSheetBody> createState() => _PlayRailSheetBodyState();
}

class _PlayRailSheetBodyState extends State<_PlayRailSheetBody> {
  PlayChrome? _playChrome;
  PlayRailChrome? _railChrome;
  bool _loading = true;
  String _unavailable = '';
  int _tab = 0;
  int? _aiDepth;
  String _clockLabel = '';
  int? _clockSeconds;
  List<MatchClockPreset> _timeControlPresets = const [];
  bool _timeControlsLoading = true;
  BoardPaletteId _boardPaletteId = BoardPaletteId.forest;
  PiecePaletteId _piecePaletteId = PiecePaletteId.whiteBlack;

  @override
  void initState() {
    super.initState();
    unawaited(_bootstrap());
  }

  Future<void> _bootstrap() async {
    await Future.wait([
      _loadPlayChrome(),
      _loadRailChrome(),
      _loadProgressionClock(),
      _loadPalettes(),
    ]);
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _loadPalettes() async {
    final board = await readBoardPaletteId();
    final piece = await readPiecePaletteId();
    if (!mounted) return;
    setState(() {
      _boardPaletteId = board;
      _piecePaletteId = piece;
    });
  }

  Future<void> _loadPlayChrome() async {
    try {
      final res = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/v1/public/play-chrome'),
      );
      if (res.statusCode >= 300) return;
      final chrome = PlayChrome.fromJson(
        jsonDecode(res.body) as Map<String, dynamic>,
      );
      if (!mounted) return;
      setState(() => _playChrome = chrome);
    } catch (_) {}
  }

  Future<void> _loadRailChrome() async {
    try {
      final res = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/v1/public/play-rail-chrome'),
      );
      Map<String, dynamic>? map;
      try {
        final decoded = jsonDecode(res.body);
        if (decoded is Map<String, dynamic>) map = decoded;
      } catch (_) {}
      if (res.statusCode >= 300) {
        if (!mounted) return;
        setState(() {
          _railChrome = null;
          _unavailable = PlayRailChrome.unavailableFrom(map);
        });
        return;
      }
      final chrome = PlayRailChrome.fromJson(map);
      if (!mounted) return;
      setState(() {
        _railChrome = chrome;
        _unavailable =
            chrome == null ? PlayRailChrome.unavailableFrom(map) : '';
      });
    } catch (_) {}
  }

  Future<void> _loadProgressionClock() async {
    try {
      final cached = QueryCache.read<ProgressionConfig>(
        CacheKeys.progression,
        maxAge: QueryCache.platformTtl,
        allowStale: true,
      );
      if (cached?.matchClock?.active == true) {
        final sec = cached!.matchClock!.initialSeconds;
        if (mounted) {
          setState(() {
            _clockLabel = _formatClock(sec);
            _clockSeconds = sec;
            _timeControlPresets = cached.matchClock!.presets;
            if (_timeControlPresets.isNotEmpty) _timeControlsLoading = false;
          });
        }
      }
      final res = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/v1/progression'),
      );
      if (res.statusCode >= 300) {
        if (mounted) setState(() => _timeControlsLoading = false);
        return;
      }
      final progression = ProgressionConfig.fromJson(
        jsonDecode(res.body) as Map<String, dynamic>,
      );
      QueryCache.write(CacheKeys.progression, progression);
      final clock = progression.matchClock;
      if (!mounted) return;
      if (clock == null || !clock.active) {
        setState(() => _timeControlsLoading = false);
        return;
      }
      setState(() {
        _clockLabel = _formatClock(clock.initialSeconds);
        _clockSeconds = clock.initialSeconds;
        _timeControlPresets = clock.presets;
        _timeControlsLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _timeControlsLoading = false);
    }
  }

  String _formatClock(int seconds) {
    if (seconds <= 0) return '';
    final m = seconds ~/ 60;
    final s = seconds % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  Future<void> _onPlayAi(int timeControlSeconds) async {
    if (timeControlSeconds <= 0) return;
    final depth = _aiDepth;
    if (depth == null) return;
    var token = context.read<AuthCubit>().state.token;
    token ??= await ensurePracticeToken();
    if (!mounted || token == null || token.isEmpty) return;
    Navigator.of(context).pop();
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => MatchBoardPage(
          accessToken: token!,
          mode: 'ai',
          aiDepth: depth,
          timeControlSeconds: timeControlSeconds,
        ),
      ),
    );
  }

  Future<void> _onPlayMatch() async {
    var token = context.read<AuthCubit>().state.token;
    if (token == null || token.isEmpty) {
      token = await showSignInDialog(context);
    }
    if (!mounted || token == null || token.isEmpty) return;
    Navigator.of(context).pop();
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => MatchmakingPage(token: token!),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final title =
        (_playChrome?.lobbyTitle ?? _playChrome?.pageTitle ?? '').trim();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 4, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
              ),
              IconButton(
                tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close, size: 20),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(child: _body()),
      ],
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    final play = _playChrome;
    final rail = _railChrome;
    if (play == null || rail == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            _unavailable,
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    final token = context.read<AuthCubit>().state.token;
    return BlocProvider(
      create: (_) => FeatureFlagsCubit()..load(accessToken: token),
      child: BlocConsumer<FeatureFlagsCubit, FeatureFlagsState>(
        listener: (context, state) {
          if (state.aiDepths.isEmpty) {
            if (_aiDepth != null) setState(() => _aiDepth = null);
            return;
          }
          if (_aiDepth == null || !state.aiDepths.contains(_aiDepth)) {
            setState(() => _aiDepth = state.aiDepths.first);
          }
        },
        builder: (context, state) {
          return PlayRailPanel(
            railChrome: rail,
            playChrome: play,
            clockLabel: _clockLabel,
            clockSeconds: _clockSeconds,
            timeControlPresets: _timeControlPresets,
            timeControlsLoading: _timeControlsLoading,
            tab: _tab,
            aiDepth: _aiDepth,
            flags: state,
            onTab: (i) => setState(() => _tab = i),
            onDepth: (d) => setState(() => _aiDepth = d),
            onPlayAi: _onPlayAi,
            onPlayMatch: _onPlayMatch,
            boardPaletteId: _boardPaletteId,
            onBoardPalette: (id) async {
              setState(() => _boardPaletteId = id);
              await writeBoardPaletteId(id);
            },
            piecePaletteId: _piecePaletteId,
            onPiecePalette: (id) async {
              setState(() => _piecePaletteId = id);
              await writePiecePaletteId(id);
            },
            onComposeSheetChanged: widget.onComposeSheetChanged,
          );
        },
      ),
    );
  }
}
