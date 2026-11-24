import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:dama_mobile/core/theme/dama_theme.dart';
import 'package:dama_mobile/features/game/board_ply_flight.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Phone/tablet width gate - aligns with web Tailwind `lg` (1023px).
const double kSmartBoardCompactMaxWidth = 1023;

/// Web `BoardStackLayoutMode` parity: hug = width-square only (no height feedback).
class BoardStackLayoutScope extends InheritedWidget {
  const BoardStackLayoutScope({
    super.key,
    required this.hug,
    required super.child,
  });

  final bool hug;

  static BoardStackLayoutScope? maybeOf(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<BoardStackLayoutScope>();
  }

  @override
  bool updateShouldNotify(covariant BoardStackLayoutScope oldWidget) {
    return hug != oldWidget.hug;
  }
}

/// Provides chrome double-tap toggle to [PlayBoardFrame] seat rows (not the board plane).
class SmartBoardChromeScope extends InheritedWidget {
  const SmartBoardChromeScope({
    super.key,
    required this.onChromeDoubleTap,
    required this.expanded,
    required this.onToggleButton,
    required super.child,
  });

  final VoidCallback onChromeDoubleTap;
  final bool expanded;
  final VoidCallback onToggleButton;

  static SmartBoardChromeScope? maybeOf(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<SmartBoardChromeScope>();
  }

  @override
  bool updateShouldNotify(covariant SmartBoardChromeScope oldWidget) {
    return expanded != oldWidget.expanded ||
        onChromeDoubleTap != oldWidget.onChromeDoubleTap ||
        onToggleButton != oldWidget.onToggleButton;
  }
}

/// Phone/tablet: auto-maximize over top chrome when [active].
/// Overlay hugs board+seats+FAB (no tall white band). Empty overlay space does
/// not absorb hits so the Live rail keeps scrolling - pre-game parity.
class SmartBoardShell extends StatefulWidget {
  const SmartBoardShell({
    super.key,
    required this.active,
    this.popSignal = false,
    required this.child,
  });

  final bool active;

  /// Rising edge while [active] forces maximize (match/spectate start).
  /// Web `SmartBoardHost.popSignal` parity.
  final bool popSignal;
  final Widget child;

  /// Play-rail compose sheet is open - tuck the popped board (web SmartBoardHost parity).
  static final ValueNotifier<bool> suppressExpand = ValueNotifier<bool>(false);

  @override
  State<SmartBoardShell> createState() => _SmartBoardShellState();
}

class _SmartBoardShellState extends State<SmartBoardShell>
    with SingleTickerProviderStateMixin {
  final OverlayPortalController _portal = OverlayPortalController();
  final OverlayPortalController _fabPortal = OverlayPortalController();
  final GlobalKey _boardKey = GlobalKey();
  final GlobalKey _spacerKey = GlobalKey();
  bool _collapsed = false;
  bool _overlayOwnsBoard = false;
  bool? _lastCompact;
  bool _prevPopSignal = false;
  DateTime _toggleLockUntil = DateTime.fromMillisecondsSinceEpoch(0);
  double _spacerH = 0;
  Offset? _fabPos;

  late final AnimationController _anim;
  late final Animation<double> _fade;
  late final Animation<Offset> _slide;

  static const _animMs = Duration(milliseconds: 340);
  static const _toggleLock = Duration(milliseconds: 900);

  bool _isCompact(BuildContext context) {
    return MediaQuery.sizeOf(context).width <= kSmartBoardCompactMaxWidth;
  }

  bool _wantExpanded(BuildContext context) {
    return _isCompact(context) &&
        widget.active &&
        !_collapsed &&
        !SmartBoardShell.suppressExpand.value;
  }

  Timer? _plyDeferPortal;

  void _onSuppressExpand() {
    if (!mounted) return;
    setState(() {});
    // Compose tuck must drop overlay for focus; if a ply is airborne, defer the
    // remount until land (BoardPlyFlight) so ticker/land sync are not aborted.
    _syncPortal(force: true);
  }

  void _deferPortalUntilPlyIdle({required bool force}) {
    _plyDeferPortal?.cancel();
    final startedAt = DateTime.now();
    _plyDeferPortal = Timer.periodic(const Duration(milliseconds: 32), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      // Stuck BoardPlyFlight must not defer portal forever (mid-game freeze).
      if (BoardPlyFlight.isActive &&
          DateTime.now().difference(startedAt) < BoardPlyFlight.idleTimeout) {
        return;
      }
      // Fail-open remount: do not clear() first - that let sticky ply-sync treat
      // the board as idle and tip-snap under a still-airborne fly. Remount dispose
      // forceRecoverStall land-syncs + leave(); clear only after remount commits
      // (double post-frame). Immediate clear() raced dispose leave() and aborted
      // land sync → mid-game frozen board after maximize/minimize/compose tuck.
      t.cancel();
      _plyDeferPortal = null;
      _syncPortal(force: force);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          if (BoardPlyFlight.isActive) BoardPlyFlight.clear();
        });
      });
    });
  }

  @override
  void initState() {
    super.initState();
    SmartBoardShell.suppressExpand.addListener(_onSuppressExpand);
    _anim = AnimationController(vsync: this, duration: _animMs);
    _fade = CurvedAnimation(parent: _anim, curve: Curves.easeOutCubic);
    _slide = Tween<Offset>(
      begin: const Offset(0, -0.04),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _anim, curve: Curves.easeOutCubic));
  }

  void _openOverlay() {
    if (_overlayOwnsBoard && _portal.isShowing) {
      if (_anim.status != AnimationStatus.completed &&
          _anim.status != AnimationStatus.forward) {
        _anim.forward();
      }
      return;
    }
    _overlayOwnsBoard = true;
    if (!_portal.isShowing) _portal.show();
    if (_anim.status != AnimationStatus.completed &&
        _anim.status != AnimationStatus.forward) {
      _anim.forward();
    }
    _scheduleSpacerSync();
  }

  void _closeOverlay() {
    if (!_overlayOwnsBoard && !_portal.isShowing) return;
    void finish() {
      if (!mounted) return;
      if (_wantExpanded(context)) return;
      if (_portal.isShowing) _portal.hide();
      if (_overlayOwnsBoard || _spacerH != 0) {
        setState(() {
          _overlayOwnsBoard = false;
          _spacerH = 0;
        });
      }
    }

    if (_anim.status != AnimationStatus.dismissed &&
        _anim.status != AnimationStatus.reverse) {
      _anim.reverse().whenComplete(finish);
    } else {
      finish();
    }
  }

  void _syncPortal({required bool force}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_wantExpanded(context)) {
        // Opening overlay remounts inline→portal - wait out pick→put (web parity).
        if (BoardPlyFlight.isActive) {
          _deferPortalUntilPlyIdle(force: force);
          return;
        }
        _plyDeferPortal?.cancel();
        _plyDeferPortal = null;
        if (!_overlayOwnsBoard) {
          setState(_openOverlay);
        } else {
          _openOverlay();
        }
      } else if (force || _overlayOwnsBoard) {
        // Closing overlay remounts the board inline - wait out pick→put.
        if (BoardPlyFlight.isActive) {
          _deferPortalUntilPlyIdle(force: force);
          return;
        }
        _closeOverlay();
      }
    });
  }

  void _scheduleSpacerSync() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final boardBox =
          _boardKey.currentContext?.findRenderObject() as RenderBox?;
      if (boardBox == null || !boardBox.hasSize) return;
      // Web parity: spacer = boardBottom − spacerTop (not raw height). Overlay
      // sits above the in-tree slot; raw height leaves a band under the seat.
      final spacerBox =
          _spacerKey.currentContext?.findRenderObject() as RenderBox?;
      double next = boardBox.size.height;
      if (spacerBox != null && spacerBox.hasSize) {
        final boardBottom =
            boardBox.localToGlobal(Offset(0, boardBox.size.height)).dy;
        final spacerTop = spacerBox.localToGlobal(Offset.zero).dy;
        next = (boardBottom - spacerTop).clamp(0.0, double.infinity);
      }
      // Wider epsilon stops 1px layout oscillation (zoom thrash on real devices).
      if ((next - _spacerH).abs() <= 2) return;
      setState(() => _spacerH = next);
    });
  }

  void _scheduleFabSync() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (!_isCompact(context) || !widget.active) {
        if (_fabPortal.isShowing) _fabPortal.hide();
        if (_fabPos != null) setState(() => _fabPos = null);
        return;
      }
      final box = _boardKey.currentContext?.findRenderObject() as RenderBox?;
      if (box == null || !box.hasSize) return;
      final origin = box.localToGlobal(Offset.zero);
      final media = MediaQuery.sizeOf(context);
      final padding = MediaQuery.paddingOf(context);
      final raw = Offset(
        origin.dx + box.size.width - 44,
        origin.dy + box.size.height + 4,
      );
      // Keep FAB on-screen (web visualViewport clamp parity).
      final next = Offset(
        raw.dx.clamp(8.0, media.width - 48),
        raw.dy.clamp(padding.top + 8, media.height - padding.bottom - 56),
      );
      final prev = _fabPos;
      if (prev != null && (prev - next).distance <= 1.5) {
        if (!_fabPortal.isShowing) _fabPortal.show();
        return;
      }
      setState(() => _fabPos = next);
      if (!_fabPortal.isShowing) _fabPortal.show();
    });
  }

  bool _toggleFlushScheduled = false;

  void _toggle() {
    if (!_isCompact(context) || !widget.active) return;
    if (DateTime.now().isBefore(_toggleLockUntil)) return;
    // Overlay↔inline remounts the board. Never toggle mid pick→put or the
    // ticker + land sync die (web SmartBoardHost ply-inflight lock parity).
    // Stuck gate must not drop the tap forever - defer with fail-open.
    if (BoardPlyFlight.isActive) {
      unawaited(_toggleWhenIdle());
      return;
    }
    _applyToggle();
  }

  Future<void> _toggleWhenIdle() async {
    if (_toggleFlushScheduled) return;
    _toggleFlushScheduled = true;
    try {
      await BoardPlyFlight.waitUntilIdle();
      if (!mounted) return;
      if (!_isCompact(context) || !widget.active) return;
      if (DateTime.now().isBefore(_toggleLockUntil)) return;
      _applyToggle();
    } finally {
      _toggleFlushScheduled = false;
    }
  }

  void _applyToggle() {
    HapticFeedback.selectionClick();
    setState(() => _collapsed = !_collapsed);
    _syncPortal(force: true);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final compact = _isCompact(context);
    if (_lastCompact == compact) return;
    _lastCompact = compact;
    _syncPortal(force: true);
  }

  @override
  void didUpdateWidget(covariant SmartBoardShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active && !oldWidget.active) {
      _collapsed = false;
      _prevPopSignal = widget.popSignal;
      _toggleLockUntil = DateTime.now().add(_toggleLock);
      _syncPortal(force: true);
      return;
    }
    if (!widget.active && oldWidget.active) {
      _collapsed = false;
      _prevPopSignal = false;
      _toggleLockUntil = DateTime.fromMillisecondsSinceEpoch(0);
      _syncPortal(force: true);
      return;
    }
    // Match/spectate start while shell was already active+minimized.
    if (widget.active && widget.popSignal && !_prevPopSignal) {
      _collapsed = false;
      _toggleLockUntil = DateTime.now().add(_toggleLock);
      _syncPortal(force: true);
    }
    _prevPopSignal = widget.popSignal;
  }

  @override
  void dispose() {
    SmartBoardShell.suppressExpand.removeListener(_onSuppressExpand);
    _plyDeferPortal?.cancel();
    _plyDeferPortal = null;
    if (_portal.isShowing) _portal.hide();
    if (_fabPortal.isShowing) _fabPortal.hide();
    _anim.dispose();
    super.dispose();
  }

  Widget _scoped(Widget child, {required bool expanded}) {
    // Always hug on compact smart boards (web parity). Budget+host-height feedback
    // causes infinite zoom / postage-stamp collapse on real devices.
    return BoardStackLayoutScope(
      hug: true,
      child: SmartBoardChromeScope(
        onChromeDoubleTap: _toggle,
        onToggleButton: _toggle,
        expanded: expanded,
        child: child,
      ),
    );
  }

  /// Glassy floating FAB (web backdrop-blur parity). Drawn in an Overlay so
  /// parent overflow / rail paint cannot crop or bury it under the seats’ clock.
  Widget _maximizeFab({required bool expanded}) {
    final tokens = damaColorsOf(context);
    return ClipOval(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
        child: Material(
          color: tokens.card.withValues(alpha: 0.55),
          elevation: 6,
          shadowColor: Colors.black.withValues(alpha: 0.22),
          shape: CircleBorder(
            side: BorderSide(color: tokens.border.withValues(alpha: 0.7)),
          ),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: _toggle,
            child: Tooltip(
              message: expanded ? 'Minimize board' : 'Maximize board',
              child: SizedBox(
                width: 40,
                height: 40,
                child: Icon(
                  expanded ? Icons.fullscreen_exit : Icons.fullscreen,
                  size: 18,
                  color: Theme.of(context).colorScheme.onSurface,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _boardColumn({required bool expanded}) {
    // No in-tree FAB - portaled below board so it cannot be cropped or cover clocks.
    // Inline: full section width. Pop only: regular side inset (web max-lg:px-3 parity).
    // Always keep Padding in the tree - flipping Padding on/off remounts the board
    // mid pick→put and aborts ply land sync (flicker / freeze).
    final column = _scoped(widget.child, expanded: expanded);
    return KeyedSubtree(
      key: _boardKey,
      child: Padding(
        padding: expanded
            ? const EdgeInsets.symmetric(horizontal: 12)
            : EdgeInsets.zero,
        child: column,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final compact = _isCompact(context);
    final wantExpanded = _wantExpanded(context);
    final tokens = damaColorsOf(context);
    final leaveSmart = !compact || !widget.active;
    // Compact→desktop / active-off while overlay owns the board mid pick→put:
    // keep overlay tree until land (web SmartBoardHost applyWhenIdle parity).
    final holdOverlayForPly = leaveSmart &&
        BoardPlyFlight.isActive &&
        (_overlayOwnsBoard || _portal.isShowing);

    if (leaveSmart && !holdOverlayForPly) {
      if (_portal.isShowing || _overlayOwnsBoard || _fabPortal.isShowing) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          if (_isCompact(context) && widget.active) return;
          if (BoardPlyFlight.isActive &&
              (_overlayOwnsBoard || _portal.isShowing)) {
            _deferPortalUntilPlyIdle(force: true);
            return;
          }
          if (_portal.isShowing) _portal.hide();
          if (_fabPortal.isShowing) _fabPortal.hide();
          if (_overlayOwnsBoard || _spacerH != 0 || _fabPos != null) {
            setState(() {
              _overlayOwnsBoard = false;
              _spacerH = 0;
              _fabPos = null;
            });
          }
        });
      }
      // Same KeyedSubtree + Padding + scope tree as compact hug so compact↔desktop
      // / active flips do not remount the board mid pick→put.
      return _boardColumn(expanded: false);
    }

    if (holdOverlayForPly) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _deferPortalUntilPlyIdle(force: true);
      });
    }

    final boardInOverlay =
        _overlayOwnsBoard && (wantExpanded || holdOverlayForPly);
    final media = MediaQuery.sizeOf(context);
    if (boardInOverlay) {
      _scheduleSpacerSync();
    }
    _scheduleFabSync();

    return OverlayPortal(
      controller: _fabPortal,
      overlayChildBuilder: (context) {
        final pos = _fabPos;
        if (pos == null) return const SizedBox.shrink();
        // Full-screen stack with only the FAB hit-tested - never cropped by the
        // board column / rail (web body-portal parity).
        return Stack(
          children: [
            Positioned(
              left: pos.dx,
              top: pos.dy,
              child: _maximizeFab(expanded: wantExpanded),
            ),
          ],
        );
      },
      child: OverlayPortal(
        controller: _portal,
        overlayChildBuilder: (context) {
          if (!boardInOverlay) return const SizedBox.shrink();
          // Pop covers app bar (web top-0 / z-60 parity). Hug section sizing only.
          // Leave play-rail min height so character fields stay tappable under the
          // popped board (web PLAY_RAIL_MIN_PX / --dama-play-rail-min parity).
          final pad = MediaQuery.paddingOf(context);
          final stableH =
              media.height; // MediaQuery size is stable vs viewInsets churn
          const railMin = 220.0;
          final maxBoardH =
              (stableH - pad.bottom - railMin).clamp(280.0, stableH);
          return Align(
            alignment: Alignment.topCenter,
            child: FadeTransition(
              opacity: _fade,
              child: SlideTransition(
                position: _slide,
                child: Material(
                  color: Colors.transparent,
                  elevation: 0,
                  child: Padding(
                    // Status-bar only; board card covers the app bar below it.
                    padding: EdgeInsets.only(top: pad.top),
                    child: Material(
                      color: tokens.card,
                      elevation: 2,
                      shadowColor: Colors.black.withValues(alpha: 0.12),
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          maxWidth: media.width,
                          maxHeight:
                              (maxBoardH - pad.top).clamp(280.0, maxBoardH),
                        ),
                        child: _boardColumn(expanded: true),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
        },
        child: boardInOverlay
            ? SizedBox(
                key: _spacerKey,
                height: _spacerH > 0
                    ? _spacerH
                    : (media.width * 0.92 + 80)
                        .clamp(280.0, media.height * 0.7),
                width: double.infinity,
              )
            : _boardColumn(expanded: false),
      ),
    );
  }
}

/// Same-spot double-tap detector for seat / frame chrome only.
class SmartBoardChromeTap extends StatefulWidget {
  const SmartBoardChromeTap({
    super.key,
    required this.onDoubleTap,
    required this.child,
  });

  final VoidCallback onDoubleTap;
  final Widget child;

  @override
  State<SmartBoardChromeTap> createState() => _SmartBoardChromeTapState();
}

class _SmartBoardChromeTapState extends State<SmartBoardChromeTap> {
  DateTime? _lastTapAt;
  Offset? _lastTapPos;

  static const _dblMs = Duration(milliseconds: 320);
  static const _dblPx = 28.0;

  void _onPointerUp(PointerUpEvent e) {
    final now = DateTime.now();
    final prevAt = _lastTapAt;
    final prevPos = _lastTapPos;
    if (prevAt != null &&
        prevPos != null &&
        now.difference(prevAt) <= _dblMs &&
        (e.position - prevPos).distance <= _dblPx) {
      _lastTapAt = null;
      _lastTapPos = null;
      widget.onDoubleTap();
      return;
    }
    _lastTapAt = now;
    _lastTapPos = e.position;
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerUp: _onPointerUp,
      child: widget.child,
    );
  }
}
