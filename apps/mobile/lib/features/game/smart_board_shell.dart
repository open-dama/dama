import 'dart:ui' show ImageFilter;

import 'package:dama_mobile/core/theme/dama_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Phone/tablet width gate - aligns with web Tailwind `lg` (1023px).
const double kSmartBoardCompactMaxWidth = 1023;

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
    required this.child,
  });

  final bool active;
  final Widget child;

  @override
  State<SmartBoardShell> createState() => _SmartBoardShellState();
}

class _SmartBoardShellState extends State<SmartBoardShell>
    with SingleTickerProviderStateMixin {
  final OverlayPortalController _portal = OverlayPortalController();
  final OverlayPortalController _fabPortal = OverlayPortalController();
  final GlobalKey _boardKey = GlobalKey();
  bool _collapsed = false;
  bool _overlayOwnsBoard = false;
  bool? _lastCompact;
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
    return _isCompact(context) && widget.active && !_collapsed;
  }

  @override
  void initState() {
    super.initState();
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
        if (!_overlayOwnsBoard) {
          setState(_openOverlay);
        } else {
          _openOverlay();
        }
      } else if (force || _overlayOwnsBoard) {
        _closeOverlay();
      }
    });
  }

  void _scheduleSpacerSync() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final box = _boardKey.currentContext?.findRenderObject() as RenderBox?;
      if (box == null || !box.hasSize) return;
      final next = box.size.height;
      if ((next - _spacerH).abs() <= 1) return;
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
      final next = Offset(
        origin.dx + box.size.width - 44,
        origin.dy + box.size.height + 4,
      );
      if (_fabPos != next) setState(() => _fabPos = next);
      if (!_fabPortal.isShowing) _fabPortal.show();
    });
  }

  void _toggle() {
    if (!_isCompact(context) || !widget.active) return;
    if (DateTime.now().isBefore(_toggleLockUntil)) return;
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
      _toggleLockUntil = DateTime.now().add(_toggleLock);
      _syncPortal(force: true);
      return;
    }
    if (!widget.active && oldWidget.active) {
      _collapsed = false;
      _toggleLockUntil = DateTime.fromMillisecondsSinceEpoch(0);
      _syncPortal(force: true);
    }
  }

  @override
  void dispose() {
    if (_portal.isShowing) _portal.hide();
    if (_fabPortal.isShowing) _fabPortal.hide();
    _anim.dispose();
    super.dispose();
  }

  Widget _scoped(Widget child, {required bool expanded}) {
    return SmartBoardChromeScope(
      onChromeDoubleTap: _toggle,
      onToggleButton: _toggle,
      expanded: expanded,
      child: child,
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
    return KeyedSubtree(
      key: _boardKey,
      child: _scoped(widget.child, expanded: expanded),
    );
  }

  @override
  Widget build(BuildContext context) {
    final compact = _isCompact(context);
    final wantExpanded = _wantExpanded(context);
    final tokens = damaColorsOf(context);

    if (!compact || !widget.active) {
      if (_portal.isShowing || _overlayOwnsBoard || _fabPortal.isShowing) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          if (_isCompact(context) && widget.active) return;
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
      return widget.child;
    }

    final boardInOverlay = wantExpanded && _overlayOwnsBoard;
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
          return Align(
            alignment: Alignment.topCenter,
            child: FadeTransition(
              opacity: _fade,
              child: SlideTransition(
                position: _slide,
                child: Material(
                  color: tokens.card,
                  elevation: 2,
                  shadowColor: Colors.black.withValues(alpha: 0.12),
                  child: SafeArea(
                    bottom: false,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
                      child: _boardColumn(expanded: true),
                    ),
                  ),
                ),
              ),
            ),
          );
        },
        child: boardInOverlay
            ? SizedBox(
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
