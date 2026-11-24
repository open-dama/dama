import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:dama_mobile/core/audio/game_notify.dart';
import 'package:dama_mobile/core/board_square.dart';
import 'package:dama_mobile/core/theme/dama_theme.dart';
import 'package:dama_mobile/core/types/game.dart';
import 'package:dama_mobile/core/ui/shimmer_skeletons.dart';
import 'package:dama_mobile/features/game/board_ply_flight.dart';
import 'package:dama_mobile/features/game/palace_piece.dart';
import 'package:flutter/material.dart';

/// Perspective 3D draughts board (parity with web DraughtsScene3D / R3F).
/// Pick→hold→travel→land from `move_history`/`board_after` (board-diff fallback).
class DraughtsBoard3D extends StatefulWidget {
  const DraughtsBoard3D({
    super.key,
    required this.board,
    required this.boardSize,
    required this.legalMoves,
    required this.selectedRow,
    required this.selectedCol,
    required this.onSelectSquare,
    this.mustContinueRow,
    this.mustContinueCol,
    this.interactive = true,
    this.flipBoard = false,
    this.yourPlayer,
    this.moveHistory = const [],
    this.onPlyAnimated,
    this.illegalShakeKey = 0,
    this.replayMode = false,
    this.onPaintReady,
  });

  final List<List<dynamic>> board;
  final int boardSize;

  /// Moves as `[fromR, fromC, toR, toC, captureCount?]`.
  final List<List<int>> legalMoves;
  final int? selectedRow;
  final int? selectedCol;
  final int? mustContinueRow;
  final int? mustContinueCol;
  final void Function(int row, int col) onSelectSquare;
  final bool interactive;

  /// Player-2 seat: rotate 180° so own pieces sit at the bottom (web parity).
  final bool flipBoard;

  /// Seat number (1|2) for opponent-fast humanization (web DraughtsScene3D parity).
  final int? yourPlayer;
  final List<MoveHistoryEntry> moveHistory;
  final void Function(List<List<dynamic>> boardAfter)? onPlyAnimated;

  /// Increment to trigger horizontal reject shake (illegal destination). Not used for captures.
  final int illegalShakeKey;

  /// History scrub / replay: no land SFX (2D parity).
  final bool replayMode;

  /// Hub sizing: true after first paint (idle full-column shimmer gate; web parity).
  final ValueChanged<bool>? onPaintReady;

  @override
  State<DraughtsBoard3D> createState() => _DraughtsBoard3DState();
}

class _ActiveAnim {
  _ActiveAnim({
    required this.fromR,
    required this.fromC,
    required this.toR,
    required this.toC,
    required this.player,
    required this.isKing,
    required this.isPromotion,
    required this.captures,
    required this.isCapture,
    this.boardAfter,
  });

  final int fromR;
  final int fromC;
  final int toR;
  final int toC;
  final int player;
  final bool isKing;
  final bool isPromotion;
  final List<(int, int)> captures;
  final bool isCapture;
  final List<List<dynamic>>? boardAfter;
  bool boardApplied = false;

  /// One land SFX per animation (land phase + finish must not double).
  bool soundPlayed = false;
}

class _DraughtsBoard3DState extends State<DraughtsBoard3D>
    with TickerProviderStateMixin, WidgetsBindingObserver {
  static const _pickPhaseEnd = 0.24;
  static const _holdPhaseEnd = 0.34;
  static const _landPhaseStart = 0.72;
  /** Snappy product timing (web 2D/3D parity) - same for own + opponent. */
  static const _moveDurationMinMs = 340;
  static const _captureDurationMinMs = 440;
  static const _durationPerSquareMs = 90;
  static const _moveDurationMaxMs = 820;
  static const _stallGraceMs = 250;

  /// Web lastFrameAtRef parity: recover when ticker claims animating but value stalls.
  static const _deadTickerMs = 2000;

  double _pitch = 0.55;
  double _yaw = 0.18;

  /// Pinch zoom (web OrbitControls minDistance/maxDistance parity ≈ 0.75-1.9).
  double _zoom = 1.0;
  double _zoomAtScaleStart = 1.0;
  late final AnimationController _anim;
  List<List<dynamic>> _renderBoard = const [];
  _ActiveAnim? _active;
  double _progress = 0;
  final List<_ActiveAnim> _queue = [];
  int _prevHistoryLen = 0;
  bool _holdSync = false;

  /// True while this board holds BoardPlyFlight (holdSync OR active OR queue).
  bool _plyGateHeld = false;
  late final AnimationController _shakeCtrl;
  Timer? _stallWatch;
  bool _finishQueued = false;

  /// True while app lifecycle paused the flight clock (web document.hidden parity).
  /// Stall recover must not snap land while the clock is intentionally frozen.
  bool _flightClockPaused = false;

  /// Last monotonic ms when `_anim.value` advanced (dead-ticker detect).
  int _lastAnimAdvanceMs = 0;
  double _lastAnimAdvanceValue = -1;

  /// Board size whose first paint notified parent (height gates; no overlay).
  int? _paintReadyForSize;

  void _schedulePaintReady() {
    final forSize = widget.boardSize;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || widget.boardSize != forSize) return;
        if (_paintReadyForSize == forSize) return;
        _paintReadyForSize = forSize;
        widget.onPaintReady?.call(true);
      });
    });
  }

  // Suppress select/legal/must while the ply fly is up. Parent flips
  // _boardPlySynced at LAND_PHASE so cues would otherwise flash mid put-down.
  bool get _moveCuesActive => _active == null;

  int? get _cueSelectedRow => _moveCuesActive ? widget.selectedRow : null;
  int? get _cueSelectedCol => _moveCuesActive ? widget.selectedCol : null;
  int? get _cueMustRow => _moveCuesActive ? widget.mustContinueRow : null;
  int? get _cueMustCol => _moveCuesActive ? widget.mustContinueCol : null;
  List<List<int>> get _cueLegalMoves =>
      _moveCuesActive ? widget.legalMoves : const <List<int>>[];

  Set<String> get _highlights {
    final set = <String>{};
    final sr = _cueSelectedRow;
    final sc = _cueSelectedCol;
    final mcR = _cueMustRow;
    final mcC = _cueMustCol;
    if (mcR != null && mcC != null) set.add('$mcR:$mcC');
    if (sr != null && sc != null) {
      // Selected square uses the same solid highlight fill as destinations.
      set.add('$sr:$sc');
      for (final m in _cueLegalMoves) {
        if (m.length >= 4 && m[0] == sr && m[1] == sc) {
          set.add('${m[2]}:${m[3]}');
        }
      }
      return set;
    }
    // All movable FROM squares (quiet + capture) - fastest play cue.
    for (final m in _cueLegalMoves) {
      if (m.length >= 2) set.add('${m[0]}:${m[1]}');
    }
    return set;
  }

  /// Legal destination squares only (2D ghost-dot targets).
  Set<String> get _destinationKeys {
    final sr = _cueSelectedRow;
    final sc = _cueSelectedCol;
    if (sr == null || sc == null) return {};
    final set = <String>{};
    for (final m in _cueLegalMoves) {
      if (m.length >= 4 && m[0] == sr && m[1] == sc) {
        set.add('${m[2]}:${m[3]}');
      }
    }
    return set;
  }

  /// Chess.com-style yellow last-ply from/to (skipped while animating/scrubbing).
  Set<String> get _lastMoveKeys {
    if (widget.replayMode || _active != null || widget.moveHistory.isEmpty) {
      return {};
    }
    final last = widget.moveHistory.last;
    if (last.from.length < 2 || last.to.length < 2) return {};
    return {
      '${last.from[0]}:${last.from[1]}',
      '${last.to[0]}:${last.to[1]}',
    };
  }

  Set<String> get _hiddenKeys {
    final a = _active;
    // Hide for the whole flight; progress is AnimatedBuilder-driven.
    if (a == null) return {};
    final set = <String>{'${a.fromR}:${a.fromC}', '${a.toR}:${a.toC}'};
    for (final c in a.captures) {
      set.add('${c.$1}:${c.$2}');
    }
    return set;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(NeoPieceImages.ensureLoaded().then((_) {
      if (mounted) setState(() {});
    }));
    _renderBoard = _cloneBoard(widget.board);
    _prevHistoryLen = widget.moveHistory.length;
    // Remount mid pick→put (e.g. 2D↔3D): history already at tip so no ply queues.
    // Sync parent immediately - otherwise _boardPlySynced freezes until 2.5s safety.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || widget.replayMode) return;
      if (_holdSync || _active != null || _queue.isNotEmpty) return;
      if (widget.moveHistory.isEmpty) return;
      final after = widget.moveHistory.last.boardAfter;
      if (after == null || after.isEmpty) return;
      if (_boardsEqual(widget.board, after)) return;
      if (!_boardsEqual(_renderBoard, after)) {
        setState(() => _renderBoard = _cloneBoard(after));
      }
      widget.onPlyAnimated?.call(after);
    });
    _anim = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 900))
      ..addListener(() {
        // Flight paints via AnimatedBuilder - avoid full setState every tick.
        final prev = _progress;
        _progress = _anim.value;
        if (_progress != _lastAnimAdvanceValue) {
          _lastAnimAdvanceValue = _progress;
          _lastAnimAdvanceMs = DateTime.now().millisecondsSinceEpoch;
        }
        final active = _active;
        // Commit board as the piece puts down (captures disappear with the land).
        if (active != null &&
            active.boardAfter != null &&
            active.boardAfter!.isNotEmpty &&
            prev < _landPhaseStart &&
            _progress >= _landPhaseStart) {
          if (!active.boardApplied) {
            active.boardApplied = true;
            // Skip clone when equal (avoids resting remount flicker on land).
            if (!_boardsEqual(_renderBoard, active.boardAfter!)) {
              setState(() {
                _renderBoard = _cloneBoard(active.boardAfter!);
              });
            }
            widget.onPlyAnimated?.call(active.boardAfter!);
          }
          if (!active.soundPlayed && !widget.replayMode) {
            active.soundPlayed = true;
            // Put-down only - wood + piece contact (never during travel).
            unawaited(
              GameNotify.playPiecePlace(
                captured: active.isCapture,
                promoted: active.isPromotion,
              ),
            );
          }
        }
      })
      ..addStatusListener((status) {
        if (status == AnimationStatus.completed) {
          if (_finishQueued) return;
          _finishQueued = true;
          try {
            _finishAndAdvance();
          } catch (_) {
            // Never leave the board frozen after a land commit error.
            _forceRecoverStall();
          }
        }
      });
    // Illegal-destination reject shake (horizontal). Captures never trigger this.
    // Shake + fly share AnimatedBuilder below - no per-tick setState.
    _shakeCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 420),
    );
    _schedulePaintReady();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      // Gate on _active (not only isAnimating). A hitch-stopped mid-fly still
      // needs the pause flag or stall watch forceRecover snaps on background.
      if (_active != null) {
        _flightClockPaused = true;
        if (_anim.isAnimating) {
          _anim.stop(canceled: false);
        }
      }
    } else if (state == AppLifecycleState.resumed) {
      // Re-arm stall clock (web lastFrameAtRef visibility parity) before clearing
      // pause so a concurrent stall tick cannot false-trigger dead-ticker recover.
      if (_active != null) {
        _lastAnimAdvanceMs = DateTime.now().millisecondsSinceEpoch;
      }
      // Forward before clearing pause so a concurrent stall tick cannot snap land.
      if (_active != null && !_anim.isAnimating && _anim.value < 1) {
        _anim.forward();
      }
      _flightClockPaused = false;
    }
  }

  void _cancelStallWatch() {
    _stallWatch?.cancel();
    _stallWatch = null;
  }

  void _armStallWatch(int durationMs) {
    _cancelStallWatch();
    _stallWatch = Timer(
      Duration(milliseconds: durationMs + _stallGraceMs),
      () {
        if (!mounted) return;
        // Lifecycle-paused mid-flight - wait another grace.
        if (_flightClockPaused) {
          _armStallWatch(_stallGraceMs);
          return;
        }
        // Dead ticker: isAnimating can stay true while value never advances
        // (WebView hitch). Re-arming forever left the board frozen mid pick→put.
        if (_anim.isAnimating) {
          final now = DateTime.now().millisecondsSinceEpoch;
          if (_active != null &&
              _lastAnimAdvanceMs > 0 &&
              now - _lastAnimAdvanceMs > _deadTickerMs) {
            _forceRecoverStall();
            return;
          }
          _armStallWatch(_stallGraceMs);
          return;
        }
        if (_active != null || _holdSync || _finishQueued) {
          _forceRecoverStall();
        }
      },
    );
  }

  void _bindFlightActive(_ActiveAnim? next) {
    _active = next;
    _syncPlyFlightGate();
  }

  /// Gate remounts from holdSync rise (not only when `_active` binds) - web
  /// `markPlyInflight` / `data-dama-ply-inflight` same-turn parity.
  void _syncPlyFlightGate() {
    final busy = _active != null || _holdSync || _queue.isNotEmpty;
    if (busy && !_plyGateHeld) {
      _plyGateHeld = true;
      BoardPlyFlight.enter();
    } else if (!busy && _plyGateHeld) {
      _plyGateHeld = false;
      BoardPlyFlight.leave();
    }
  }

  void _forceRecoverStall() {
    _cancelStallWatch();
    _finishQueued = false;
    _anim.stop();
    // Sync parent to board_after before clearing fly - otherwise _boardPlySynced
    // stays false and the match board freezes mid-game (web parity).
    final anim = _active;
    List<List<dynamic>>? after;
    if (anim != null &&
        anim.boardAfter != null &&
        anim.boardAfter!.isNotEmpty) {
      after = anim.boardAfter;
    } else if (widget.moveHistory.isNotEmpty) {
      after = widget.moveHistory.last.boardAfter;
    }
    if (after != null && after.isNotEmpty) {
      if (anim != null) anim.boardApplied = true;
      // Skip clone when already landed (avoids resting remount flicker).
      if (!_boardsEqual(_renderBoard, after)) {
        _renderBoard = _cloneBoard(after);
      }
      widget.onPlyAnimated?.call(after);
    }
    setState(() {
      _active = null;
      _progress = 0;
      _holdSync = false;
      _queue.clear();
      _syncPlyFlightGate();
    });
  }

  void _startNext() {
    if (_queue.isEmpty) {
      _cancelStallWatch();
      _finishQueued = false;
      // Never clear holdSync without a parent land sync (freeze root / web parity).
      // Always notify parent even when LAND_PHASE already applied locally (missed
      // callback → _boardPlySynced freeze). Parent _boardsMatch no-ops when synced
      // (no pick→put remount flicker) - web empty startNext parity.
      final dangling = _active;
      if (dangling != null &&
          dangling.boardAfter != null &&
          dangling.boardAfter!.isNotEmpty) {
        dangling.boardApplied = true;
        if (!_boardsEqual(_renderBoard, dangling.boardAfter!)) {
          _renderBoard = _cloneBoard(dangling.boardAfter!);
        }
        widget.onPlyAnimated?.call(dangling.boardAfter!);
      } else {
        final after = widget.moveHistory.isNotEmpty
            ? widget.moveHistory.last.boardAfter
            : null;
        if (after != null && after.isNotEmpty) {
          if (!_boardsEqual(_renderBoard, after)) {
            _renderBoard = _cloneBoard(after);
          }
          widget.onPlyAnimated?.call(after);
        }
      }
      _active = null;
      _progress = 0;
      _holdSync = false;
      _syncPlyFlightGate();
      if (mounted) setState(() {});
      return;
    }
    final next = _queue.removeAt(0);
    final dr = (next.toR - next.fromR).toDouble();
    final dc = (next.toC - next.fromC).toDouble();
    final dist = math.sqrt(dr * dr + dc * dc);
    final base = next.isCapture ? _captureDurationMinMs : _moveDurationMinMs;
    final ms = (base + dist * _durationPerSquareMs)
        .clamp(
          next.isCapture ? _captureDurationMinMs : _moveDurationMinMs,
          _moveDurationMaxMs,
        )
        .round();
    _finishQueued = false;
    // Assign fly state synchronously BEFORE setState. When called from
    // didUpdateWidget (history grew), the following build must already hide the
    // origin and show the fly - otherwise one painted frame of resting piece
    // flashes on pick→put (web useLayoutEffect parity).
    // Reset controller to 0 BEFORE paint - a completed ply leaves value=1, so the
    // first build of the next fly would draw at the destination (pick→put flash).
    _anim.stop();
    _anim.value = 0;
    _bindFlightActive(next);
    _progress = 0;
    _lastAnimAdvanceValue = 0;
    _lastAnimAdvanceMs = DateTime.now().millisecondsSinceEpoch;
    _anim.duration = Duration(milliseconds: ms);
    _armStallWatch(ms);
    if (mounted) setState(() {});
    _anim.forward(from: 0);
  }

  void _finishAndAdvance() {
    final finished = _active;
    // Never snap back to widget.board after a successful land - that rewound the
    // piece and could enqueue a second board-diff animation (double SFX).
    if (finished != null &&
        finished.boardAfter != null &&
        finished.boardAfter!.isNotEmpty) {
      if (!finished.boardApplied) {
        finished.boardApplied = true;
        if (!_boardsEqual(_renderBoard, finished.boardAfter!)) {
          setState(() {
            _renderBoard = _cloneBoard(finished.boardAfter!);
          });
        }
        widget.onPlyAnimated?.call(finished.boardAfter!);
      }
      if (!finished.soundPlayed && !widget.replayMode) {
        finished.soundPlayed = true;
        unawaited(
          GameNotify.playPiecePlace(
            captured: finished.isCapture,
            promoted: finished.isPromotion,
          ),
        );
      }
    }
    // Do not clear _active here (web finishAndAdvance parity). Empty _startNext
    // owns clear + dangling land sync; clearing first made dangling=null and
    // could flash a blank fly frame before the next ply primed.
    _progress = 0;
    _finishQueued = false;
    // Always route through _startNext (web finishAndAdvance → startNext parity).
    // Bare holdSync=false on empty queue skipped parent land sync when boardAfter
    // was missing on the finished anim and froze _boardPlySynced mid-game.
    _startNext();
  }

  @override
  void didUpdateWidget(covariant DraughtsBoard3D oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.boardSize != oldWidget.boardSize) {
      _paintReadyForSize = null;
      _schedulePaintReady();
    }
    if (widget.illegalShakeKey != oldWidget.illegalShakeKey &&
        widget.illegalShakeKey != 0) {
      _shakeCtrl.forward(from: 0);
    }
    if (widget.replayMode) {
      // Rising into replay mid pick→put: land-sync parent before clearing fly
      // (bare clear snapped put-down and left _boardPlySynced false).
      if (_active != null || _holdSync || _queue.isNotEmpty) {
        _forceRecoverStall();
      }
      if (!_boardsEqual(_renderBoard, widget.board)) {
        _renderBoard = _cloneBoard(widget.board);
      }
      return;
    }
    final len = widget.moveHistory.length;
    if (len < _prevHistoryLen) {
      // History shrink (scrub / reset) mid-fly: same land-sync-before-clear as replay.
      if (_active != null || _holdSync || _queue.isNotEmpty) {
        _forceRecoverStall();
      }
      _prevHistoryLen = len;
      if (!_boardsEqual(_renderBoard, widget.board)) {
        _renderBoard = _cloneBoard(widget.board);
      }
      return;
    }
    if (len > _prevHistoryLen) {
      final start = _prevHistoryLen;
      final newEntries = widget.moveHistory.sublist(start);
      _prevHistoryLen = len;
      _holdSync = true;
      // Gate remounts from holdSync rise - _startNext may still be a frame away.
      _syncPlyFlightGate();
      for (var i = 0; i < newEntries.length; i++) {
        final e = newEntries[i];
        final prevBoard = i == 0
            ? (start > 0 ? widget.moveHistory[start - 1].boardAfter : null)
            : newEntries[i - 1].boardAfter;
        final anim = _animFromHistory(e, prevBoard);
        if (anim != null) _queue.add(anim);
      }
      if (_active == null) {
        // History grew but nothing to fly: sync immediately so _boardPlySynced
        // cannot stick false and freeze input (web parity).
        if (_queue.isEmpty) {
          final after = widget.moveHistory.isNotEmpty
              ? widget.moveHistory.last.boardAfter
              : null;
          if (after != null && after.isNotEmpty) {
            if (!_boardsEqual(_renderBoard, after)) {
              _renderBoard = _cloneBoard(after);
            }
            widget.onPlyAnimated?.call(after);
          }
          _holdSync = false;
          _syncPlyFlightGate();
        } else {
          _startNext();
        }
      }
      return;
    }
    if (_holdSync || _active != null || _queue.isNotEmpty) return;
    if (widget.moveHistory.isNotEmpty) {
      final completed = widget.moveHistory.last.boardAfter;
      // Web remount-sync parity: idle with parent behind tip (missed land / remount).
      // Sync parent - never rewind landed pieces to a lagging freeze.
      if (completed != null &&
          completed.isNotEmpty &&
          !_boardsEqual(widget.board, completed)) {
        if (!_boardsEqual(_renderBoard, completed)) {
          _renderBoard = _cloneBoard(completed);
        }
        widget.onPlyAnimated?.call(completed);
        return;
      }
    }
    if (!_boardsEqual(_renderBoard, widget.board)) {
      if (widget.moveHistory.isEmpty) {
        final next = _diffAnim(_renderBoard, widget.board, widget.legalMoves);
        if (next != null) {
          _queue.add(next);
          _holdSync = true;
          _syncPlyFlightGate();
          _startNext();
        } else {
          _renderBoard = _cloneBoard(widget.board);
        }
      } else {
        _renderBoard = _cloneBoard(widget.board);
      }
    }
  }

  static _ActiveAnim? _animFromHistory(
    MoveHistoryEntry e, [
    List<List<dynamic>>? prevBoard,
  ]) {
    if (e.from.length < 2 || e.to.length < 2) return null;
    final caps = e.captures.map((c) => (c[0], c[1])).toList();
    var isKing = false;
    if (e.boardAfter != null &&
        e.to[0] < e.boardAfter!.length &&
        e.to[1] < e.boardAfter![e.to[0]].length) {
      final cell = e.boardAfter![e.to[0]][e.to[1]];
      if (cell is Map) isKing = cell['k'] == true;
    }
    var wasKing = false;
    if (prevBoard != null &&
        e.from[0] < prevBoard.length &&
        e.from[1] < prevBoard[e.from[0]].length) {
      final fromCell = prevBoard[e.from[0]][e.from[1]];
      if (fromCell is Map) wasKing = fromCell['k'] == true;
    }
    return _ActiveAnim(
      fromR: e.from[0],
      fromC: e.from[1],
      toR: e.to[0],
      toC: e.to[1],
      player: e.player,
      isKing: isKing,
      isPromotion: isKing && !wasKing,
      captures: caps,
      isCapture: caps.isNotEmpty,
      boardAfter: e.boardAfter,
    );
  }

  @override
  void dispose() {
    // Do not call onPaintReady(false) - parent paint gates latch true; false remount-loops.
    WidgetsBinding.instance.removeObserver(this);
    _cancelStallWatch();
    // Remount (2D↔3D / shell) mid pick→put: land-sync parent before ticker dies.
    if (_active != null || _holdSync) {
      final anim = _active;
      List<List<dynamic>>? after;
      if (anim != null &&
          anim.boardAfter != null &&
          anim.boardAfter!.isNotEmpty) {
        after = anim.boardAfter;
      } else if (widget.moveHistory.isNotEmpty) {
        after = widget.moveHistory.last.boardAfter;
      }
      if (after != null && after.isNotEmpty) {
        widget.onPlyAnimated?.call(after);
      }
    }
    _active = null;
    _holdSync = false;
    _queue.clear();
    _syncPlyFlightGate();
    _anim.dispose();
    _shakeCtrl.dispose();
    super.dispose();
  }

  static List<List<dynamic>> _cloneBoard(List<List<dynamic>> board) {
    return board.map((row) => List<dynamic>.from(row)).toList();
  }

  static bool _cellKing(dynamic cell) {
    if (cell is! Map) return false;
    final k = cell['k'];
    return k == true || k == 1;
  }

  static int? _cellPlayer(dynamic cell) {
    if (cell is! Map) return null;
    final p = cell['p'];
    if (p is num) return p.toInt();
    return null;
  }

  /// Content equality (web boardsEqual parity). Strict `k`/`p` identity used to
  /// fail keep-landed and rewind pieces mid put-down.
  static bool _boardsEqual(List<List<dynamic>> a, List<List<dynamic>> b) {
    if (identical(a, b)) return true;
    if (a.length != b.length) return false;
    for (var r = 0; r < a.length; r++) {
      if (a[r].length != b[r].length) return false;
      for (var c = 0; c < a[r].length; c++) {
        final x = a[r][c];
        final y = b[r][c];
        if (x == null && y == null) continue;
        if (x is! Map || y is! Map) return false;
        if (_cellPlayer(x) != _cellPlayer(y) || _cellKing(x) != _cellKing(y)) {
          return false;
        }
      }
    }
    return true;
  }

  static _ActiveAnim? _diffAnim(
    List<List<dynamic>> prev,
    List<List<dynamic>> next,
    List<List<int>> legalHint,
  ) {
    if (prev.isEmpty || next.isEmpty || prev.length != next.length) return null;
    final emptied = <(int, int)>[];
    final filled = <(int, int)>[];
    for (var r = 0; r < prev.length; r++) {
      for (var c = 0; c < prev[r].length; c++) {
        final a = prev[r][c];
        final b = next[r][c];
        final aPiece = a is Map;
        final bPiece = b is Map;
        if (aPiece && !bPiece) emptied.add((r, c));
        if (!aPiece && bPiece) filled.add((r, c));
        if (aPiece && bPiece && (a['p'] != b['p'] || a['k'] != b['k'])) {
          emptied.add((r, c));
          filled.add((r, c));
        }
      }
    }
    if (filled.length != 1) return null;
    final to = filled.first;
    final dest = next[to.$1][to.$2];
    if (dest is! Map) return null;
    (int, int)? from;
    final captures = <(int, int)>[];
    for (final sq in emptied) {
      final was = prev[sq.$1][sq.$2];
      if (was is! Map) continue;
      if (was['p'] == dest['p']) {
        from = sq;
      } else {
        captures.add(sq);
      }
    }
    if (from == null) {
      for (final m in legalHint) {
        if (m.length >= 4 && m[2] == to.$1 && m[3] == to.$2) {
          from = (m[0], m[1]);
          break;
        }
      }
    }
    if (from == null) return null;
    final isKing = dest['k'] == true;
    final fromCell = prev[from.$1][from.$2];
    final wasKing = fromCell is Map && fromCell['k'] == true;
    return _ActiveAnim(
      fromR: from.$1,
      fromC: from.$2,
      toR: to.$1,
      toC: to.$2,
      player: (dest['p'] as num?)?.toInt() ?? 1,
      isKing: isKing,
      isPromotion: isKing && !wasKing,
      captures: captures,
      isCapture: captures.isNotEmpty,
      boardAfter: next,
    );
  }

  /// Returns (col, row, lift, scale, yawTwist).
  static (double, double, double, double, double) _pieceTransform(
    double progress,
    int fromR,
    int fromC,
    int toR,
    int toC,
    bool isCapture,
  ) {
    const rest = 0.0;
    // Keep capture lift close to quiet moves - tall arcs read as the board dipping.
    final carry = isCapture ? 0.52 : 0.5;
    if (progress < _pickPhaseEnd) {
      final t = progress / _pickPhaseEnd;
      final ease = t * t * (3 - 2 * t);
      return (
        fromC.toDouble(),
        fromR.toDouble(),
        rest + ease * (carry - rest),
        // Height lift only. XY scale pulse flickered the piece on pick and put.
        1,
        0,
      );
    }
    if (progress < _holdPhaseEnd) {
      return (fromC.toDouble(), fromR.toDouble(), carry, 1, 0);
    }
    if (progress < _landPhaseStart) {
      final t = (progress - _holdPhaseEnd) / (_landPhaseStart - _holdPhaseEnd);
      // easeInOutCubic-ish - no yaw twist (looked like the board twisting/pushing).
      final smooth =
          t < 0.5 ? 4 * t * t * t : 1 - math.pow(-2 * t + 2, 3).toDouble() / 2;
      return (
        fromC + (toC - fromC) * smooth,
        fromR + (toR - fromR) * smooth,
        carry,
        1,
        0,
      );
    }
    final t = (progress - _landPhaseStart) / (1 - _landPhaseStart);
    final ease = t * t * (3 - 2 * t);
    return (
      toC.toDouble(),
      toR.toDouble(),
      carry - ease * (carry - rest),
      1,
      0,
    );
  }

  @override
  Widget build(BuildContext context) {
    final tokens = damaColorsOf(context);
    if (widget.boardSize <= 0) return const BoardAreaSkeleton();

    // Always paint _renderBoard (web `renderBoard.length ? renderBoard : board`).
    // Switching to widget.board when idle rewound landed pieces if parent lagged
    // board_after for one frame (clock/WS) - pick→put flicker.
    final display = _renderBoard.isNotEmpty ? _renderBoard : widget.board;

    final boardPaint = AnimatedBuilder(
      animation: Listenable.merge([_anim, _shakeCtrl]),
      builder: (context, _) {
        (double, double, double, double, double)? fly;
        final progress =
            _anim.isAnimating || _active != null ? _anim.value : 0.0;
        // Keep fly at destination until _finishAndAdvance clears _active.
        // Dropping at progress>=1 left a blank hole while resting was still hidden.
        if (_active != null) {
          fly = _pieceTransform(
            progress.clamp(0.0, 1.0),
            _active!.fromR,
            _active!.fromC,
            _active!.toR,
            _active!.toC,
            _active!.isCapture,
          );
        }
        final shakeT = _shakeCtrl.value;
        final shakeAmp = (1.0 - shakeT) * 6.0;
        final shakeDx =
            shakeAmp > 0.05 ? math.sin(shakeT * math.pi * 10) * shakeAmp : 0.0;
        final a = _active;
        final burstT = () {
          if (a == null || !a.isCapture || progress <= _holdPhaseEnd) {
            return 0.0;
          }
          if (progress >= _landPhaseStart) return 1.0;
          return (progress - _holdPhaseEnd) / (_landPhaseStart - _holdPhaseEnd);
        }();
        return Transform.translate(
          offset: Offset(shakeDx, 0),
          child: CustomPaint(
            isComplex: true,
            // willChange:true promoted the full board layer every flight frame and
            // shimmered on fly→rest handoff (web 2D avoids will-change for the same).
            painter: _Board3DPainter(
              board: display,
              size: widget.boardSize,
              pitch: _pitch,
              yaw: _yaw,
              flipBoard: widget.flipBoard,
              selectedRow: _cueSelectedRow,
              selectedCol: _cueSelectedCol,
              mustContinueRow: _cueMustRow,
              mustContinueCol: _cueMustCol,
              highlights: _highlights,
              destinationKeys: _destinationKeys,
              lastMoveKeys: _lastMoveKeys,
              hiddenKeys: _hiddenKeys,
              light: tokens.boardLight,
              dark: tokens.boardDark,
              frame: tokens.boardFrame,
              pieceLight: tokens.pieceLight,
              pieceDark: tokens.pieceDark,
              pieceDarkSplit: tokens.pieceDarkSplit,
              gold: tokens.boardSelected,
              lastMove: tokens.lastMove,
              bg: tokens.boardFrame,
              flyCol: fly?.$1,
              flyRow: fly?.$2,
              flyLift: fly?.$3,
              flyScale: fly?.$4 ?? 1,
              flyYaw: fly?.$5 ?? 0,
              flyPlayer: _active?.player,
              flyKing: _active?.isKing ?? false,
              captureBursts: _active?.captures ?? const [],
              burstProgress: burstT,
            ),
          ),
        );
      },
    );

    // 2D/web parity: only lock own piece while still in the air. Gating the
    // whole GestureDetector on `_active == null` froze multi-jump / next-turn
    // taps for the full settle after boardApplied (mid-game "frozen board").
    final ownAirLocked = _active != null &&
        widget.yourPlayer != null &&
        _active!.player == widget.yourPlayer &&
        !_active!.boardApplied;

    return AspectRatio(
      aspectRatio: 1,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Stack(
          fit: StackFit.expand,
          children: [
            GestureDetector(
              onScaleStart: (_) {
                _zoomAtScaleStart = _zoom;
              },
              onScaleUpdate: (d) {
                setState(() {
                  if (d.pointerCount >= 2) {
                    // Pinch zoom (smart-menu / web OrbitControls 7-32 distance band).
                    _zoom = (_zoomAtScaleStart * d.scale).clamp(0.75, 1.9);
                  } else {
                    final dx = widget.flipBoard
                        ? -d.focalPointDelta.dx
                        : d.focalPointDelta.dx;
                    final dy = widget.flipBoard
                        ? -d.focalPointDelta.dy
                        : d.focalPointDelta.dy;
                    _yaw = (_yaw + dx * 0.004).clamp(-0.65, 0.65);
                    _pitch = (_pitch - dy * 0.004).clamp(0.25, 1.05);
                  }
                });
              },
              onTapUp: widget.interactive && !ownAirLocked
                  ? (details) {
                      final box = context.findRenderObject() as RenderBox?;
                      if (box == null) return;
                      var local = details.localPosition;
                      if (widget.flipBoard) {
                        local = Offset(
                          box.size.width - local.dx,
                          box.size.height - local.dy,
                        );
                      }
                      final hit = _Board3DPainter(
                        board: display,
                        size: widget.boardSize,
                        pitch: _pitch,
                        yaw: _yaw,
                        flipBoard: widget.flipBoard,
                        selectedRow: _cueSelectedRow,
                        selectedCol: _cueSelectedCol,
                        mustContinueRow: _cueMustRow,
                        mustContinueCol: _cueMustCol,
                        highlights: _highlights,
                        destinationKeys: _destinationKeys,
                        lastMoveKeys: _lastMoveKeys,
                        hiddenKeys: _hiddenKeys,
                        light: tokens.boardLight,
                        dark: tokens.boardDark,
                        frame: tokens.boardFrame,
                        pieceLight: tokens.pieceLight,
                        pieceDark: tokens.pieceDark,
                        pieceDarkSplit: tokens.pieceDarkSplit,
                        gold: tokens.boardSelected,
                        lastMove: tokens.lastMove,
                        bg: tokens.boardFrame,
                        captureBursts: const [],
                        burstProgress: 0,
                      ).findSquareAt(local, box.size);
                      if (hit != null) widget.onSelectSquare(hit.$1, hit.$2);
                    }
                  : null,
              child: Transform.scale(
                scale: _zoom,
                child: widget.flipBoard
                    ? Transform.rotate(angle: math.pi, child: boardPaint)
                    : boardPaint,
              ),
            ),
            // No BoardAreaSkeleton overlay: parent owns the single shimmer (web 2D/3D parity).
            // A second shell on refresh looked like shimmer showing twice.
          ],
        ),
      ),
    );
  }
}

class _Board3DPainter extends CustomPainter {
  _Board3DPainter({
    required this.board,
    required this.size,
    required this.pitch,
    required this.yaw,
    required this.flipBoard,
    required this.selectedRow,
    required this.selectedCol,
    this.mustContinueRow,
    this.mustContinueCol,
    required this.highlights,
    required this.destinationKeys,
    required this.lastMoveKeys,
    required this.hiddenKeys,
    required this.light,
    required this.dark,
    required this.frame,
    required this.pieceLight,
    required this.pieceDark,
    this.pieceDarkSplit = false,
    required this.gold,
    required this.lastMove,
    required this.bg,
    required this.captureBursts,
    required this.burstProgress,
    this.flyCol,
    this.flyRow,
    this.flyLift,
    this.flyScale = 1,
    this.flyYaw = 0,
    this.flyPlayer,
    this.flyKing = false,
  });

  final List<List<dynamic>> board;
  final int size;
  final double pitch;
  final double yaw;

  /// When true the paint is wrapped in a 180° Transform - place rails so they
  /// land on the viewer left/bottom after that rotate.
  final bool flipBoard;
  final int? selectedRow;
  final int? selectedCol;
  final int? mustContinueRow;
  final int? mustContinueCol;
  final Set<String> highlights;
  final Set<String> destinationKeys;
  final Set<String> lastMoveKeys;
  final Set<String> hiddenKeys;
  final Color light;
  final Color dark;
  final Color frame;
  final Color pieceLight;
  final Color pieceDark;
  final bool pieceDarkSplit;
  final Color gold;
  final Color lastMove;
  final Color bg;
  final List<(int, int)> captureBursts;
  final double burstProgress;
  final double? flyCol;
  final double? flyRow;
  final double? flyLift;
  final double flyScale;
  final double flyYaw;
  final int? flyPlayer;
  final bool flyKing;

  Offset _project(double x, double y, double z, Size canvas) {
    final cp = math.cos(pitch);
    final sp = math.sin(pitch);
    final cy = math.cos(yaw);
    final sy = math.sin(yaw);

    final x1 = x * cy + z * sy;
    final z1 = -x * sy + z * cy;
    final y1 = y * cp - z1 * sp;
    final z2 = y * sp + z1 * cp;

    final persp = 1 / (1 + z2 * 0.045);
    // Pulled-back default framing (parity with web 3D camera pull-back; was 0.055).
    final scale = math.min(canvas.width, canvas.height) * 0.047 * persp;
    return Offset(
      canvas.width / 2 + x1 * scale,
      canvas.height * 0.42 + y1 * scale,
    );
  }

  (int, int)? findSquareAt(Offset local, Size canvas) {
    double best = double.infinity;
    (int, int)? hit;
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        final wx = c - size / 2 + 0.5;
        final wz = r - size / 2 + 0.5;
        final p = _project(wx, 0, wz, canvas);
        final d = (p - local).distance;
        if (d < best && d < canvas.shortestSide / (size * 1.4)) {
          best = d;
          hit = (r, c);
        }
      }
    }
    return hit;
  }

  void _drawSquareCoords(
    Canvas canvas,
    Size canvasSize,
    int row,
    int col,
    bool isDark,
    List<Offset> corners,
  ) {
    final showRank = isVisualLeftFile(col, size, flipBoard);
    final showFile = isVisualBottomRank(row, size, flipBoard);
    if (!showRank && !showFile) return;
    // corners: [NW, NE, SE, SW] in board space before outer Transform.rotate.
    // After flip Transform.rotate(π), NW↔SE - paint opposite corner so labels
    // still read top-left / bottom-right on screen.
    final ink = boardCoordUsesLightInk(isDark) ? light : dark;
    final fontSize =
        (canvasSize.shortestSide / (size * (size >= 10 ? 3.4 : 3.0)))
            .clamp(7.0, 12.0);
    final style = TextStyle(
      color: ink,
      fontSize: fontSize,
      fontWeight: FontWeight.w700,
      height: 1,
    );
    if (showRank) {
      final anchor = flipBoard ? corners[2] : corners[0];
      final tp = TextPainter(
        text: TextSpan(text: '${boardRankNumber(row, size)}', style: style),
        textDirection: TextDirection.ltr,
      )..layout();
      final origin = flipBoard
          ? Offset(anchor.dx - tp.width - 1, anchor.dy - tp.height - 1)
          : Offset(anchor.dx + 2, anchor.dy + 1);
      tp.paint(canvas, origin);
    }
    if (showFile) {
      final anchor = flipBoard ? corners[0] : corners[2];
      final tp = TextPainter(
        text: TextSpan(text: boardFileLetter(col), style: style),
        textDirection: TextDirection.ltr,
      )..layout();
      final origin = flipBoard
          ? Offset(anchor.dx + 2, anchor.dy + 1)
          : Offset(anchor.dx - tp.width - 1, anchor.dy - tp.height - 1);
      tp.paint(canvas, origin);
    }
  }

  void _drawPiece(
    Canvas canvas,
    Size canvasSize,
    double col,
    double row,
    int player,
    bool king,
    bool selected, {
    double lift = 0,
    double scale = 1,
    double yawTwist = 0,
  }) {
    // Match 2D: square fill is the only movable cue - no ring around the piece.
    // No select lift - clearing selection on put dropped the mesh before the
    // fly overlay picked up (pick→put flicker). 2D/web use square glow only.
    const selLift = 0.0;
    final wx = col - size / 2 + 0.5;
    final wz = row - size / 2 + 0.5;
    // Approximate yaw twist as a small horizontal skew in screen space.
    final skew = math.sin(yawTwist) * 0.12;
    final foot = _project(wx + skew, -0.02 - lift - selLift, wz, canvasSize);
    final unit = (canvasSize.shortestSide / (size * 2.05)) * scale;
    final isLight = player == 1;
    final splitDark = !isLight && pieceDarkSplit;
    final base = isLight ? pieceLight : pieceDark;
    final shade = splitDark
        ? pieceLight
        : isLight
            ? Color.lerp(pieceLight, const Color(0xFF8A8A8A), 0.55)!
            : Color.lerp(pieceDark, const Color(0xFF0A0A0A), 0.4)!;
    final left = splitDark ? pieceLight : base;
    final right = splitDark ? pieceDark : shade;
    final glow = selected ? Color.lerp(base, gold, 0.35)! : null;

    // Contact shadow
    canvas.drawOval(
      Rect.fromCenter(
        center: foot.translate(0, unit * 0.12),
        width: unit * 1.15,
        height: unit * 0.32,
      ),
      Paint()..color = const Color(0x55000000),
    );

    // Soft AO rim from shade (web 3D mesh has no hard black contour stroke).
    final edge = isLight
        ? Color.lerp(pieceLight, const Color(0xFF8A8A8A), 0.28)!
        : Color.lerp(pieceDark, const Color(0xFF1A1A1A), 0.35)!;
    _drawNeoStaunton3D(
      canvas,
      foot: foot,
      unit: unit,
      crowned: king,
      base: glow ?? left,
      shade: glow != null ? Color.lerp(glow, right, 0.45)! : right,
      outline: edge,
    );
  }

  /// Standing Neo Staunton pawn / king - layered volumes (web mesh parity).
  void _drawNeoStaunton3D(
    Canvas canvas, {
    required Offset foot,
    required double unit,
    required bool crowned,
    required Color base,
    required Color shade,
    required Color outline,
  }) {
    final cx = foot.dx;
    final stroke = unit * 0.055;
    final stemH = crowned ? unit * 0.72 : unit * 0.52;
    final baseCy = foot.dy - unit * 0.1;
    final stemBot = baseCy - unit * 0.14;
    final stemTop = stemBot - stemH;
    final collarCy = stemTop - unit * 0.02;
    final headR = crowned ? unit * 0.33 : unit * 0.3;
    final headCy = collarCy - unit * 0.1 - headR * 0.55;

    Paint aaFill(Color c) => Paint()
      ..color = c
      ..isAntiAlias = true
      ..filterQuality = FilterQuality.high;
    Paint aaStroke(Color c) => Paint()
      ..color = c
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeJoin = StrokeJoin.round
      ..isAntiAlias = true
      ..filterQuality = FilterQuality.high;

    void paintSplitOval(Rect rect) {
      final path = Path()..addOval(rect);
      canvas.drawPath(path, aaFill(base));
      canvas.save();
      canvas.clipPath(path);
      canvas.drawRect(
        Rect.fromLTRB(cx, rect.top - 1, rect.right + 1, rect.bottom + 1),
        aaFill(shade),
      );
      canvas.restore();
      canvas.drawPath(path, aaStroke(outline));
    }

    void paintSplitPath(Path path) {
      canvas.drawPath(path, aaFill(base));
      canvas.save();
      canvas.clipPath(path);
      final bounds = path.getBounds();
      canvas.drawRect(
        Rect.fromLTRB(cx, bounds.top - 1, bounds.right + 1, bounds.bottom + 1),
        aaFill(shade),
      );
      canvas.restore();
      canvas.drawPath(path, aaStroke(outline));
    }

    // Flared pedestal (foreshortened cylinder)
    paintSplitOval(Rect.fromCenter(
      center: Offset(cx, baseCy),
      width: unit * 1.12,
      height: unit * 0.34,
    ));
    paintSplitOval(Rect.fromCenter(
      center: Offset(cx, baseCy - unit * 0.1),
      width: unit * 0.95,
      height: unit * 0.26,
    ));

    // Tapered stem - denser stacked discs (web 72-seg cylinder parity).
    final stemSteps = crowned ? 12 : 10;
    for (var i = 0; i < stemSteps; i++) {
      final t = i / (stemSteps - 1);
      final y = stemBot - t * stemH;
      final w = ui.lerpDouble(unit * 0.72, unit * 0.4, t)!;
      paintSplitOval(Rect.fromCenter(
        center: Offset(cx, y),
        width: w,
        height: unit * 0.2,
      ));
    }

    // Collar ring
    paintSplitOval(Rect.fromCenter(
      center: Offset(cx, collarCy),
      width: unit * 0.88,
      height: unit * 0.26,
    ));

    // Head sphere
    paintSplitOval(Rect.fromCenter(
      center: Offset(cx, headCy),
      width: headR * 2,
      height: headR * 1.85,
    ));

    if (crowned) {
      // Crown bowl
      paintSplitOval(Rect.fromCenter(
        center: Offset(cx, headCy - headR * 0.72),
        width: unit * 0.7,
        height: unit * 0.24,
      ));
      // Neo king cross
      final crossY = headCy - headR - unit * 0.22;
      final cross = Path()
        ..addRRect(RRect.fromRectAndRadius(
          Rect.fromCenter(
              center: Offset(cx, crossY),
              width: unit * 0.14,
              height: unit * 0.48),
          Radius.circular(unit * 0.03),
        ))
        ..addRRect(RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: Offset(cx, crossY - unit * 0.02),
            width: unit * 0.4,
            height: unit * 0.14,
          ),
          Radius.circular(unit * 0.03),
        ));
      paintSplitPath(cross);
    }
  }

  void _drawCaptureBursts(Canvas canvas, Size canvasSize) {
    if (captureBursts.isEmpty || burstProgress <= 0) return;
    final t = 1 - math.pow(1 - burstProgress, 3).toDouble(); // easeOutCubic
    for (final c in captureBursts) {
      final wx = c.$2 - size / 2 + 0.5;
      final wz = c.$1 - size / 2 + 0.5;
      final center = _project(wx, -0.35 - t * 0.35, wz, canvasSize);
      final radius = (canvasSize.shortestSide / (size * 3.2)) *
          math.max(0.01, 1 - t * 0.9);
      canvas.drawCircle(
        center,
        radius * 0.55,
        Paint()
          ..color =
              const Color(0xFFC0264A).withValues(alpha: 0.85 * (1 - t * 0.5)),
      );
      canvas.drawCircle(
        center,
        radius * 0.35,
        Paint()..color = const Color(0xFFA31D38).withValues(alpha: 0.7),
      );
    }
  }

  @override
  void paint(Canvas canvas, Size canvasSize) {
    canvas.drawRect(Offset.zero & canvasSize, Paint()..color = bg);

    final framePts = <Offset>[
      _project(-size / 2 - 0.35, 0.35, -size / 2 - 0.35, canvasSize),
      _project(size / 2 + 0.35, 0.35, -size / 2 - 0.35, canvasSize),
      _project(size / 2 + 0.35, 0.35, size / 2 + 0.35, canvasSize),
      _project(-size / 2 - 0.35, 0.35, size / 2 + 0.35, canvasSize),
    ];
    canvas.drawPath(
      Path()..addPolygon(framePts, true),
      Paint()..color = frame.withValues(alpha: 0.95),
    );

    final squares = <({int r, int c, double depth})>[];
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        final wx = c - size / 2 + 0.5;
        final wz = r - size / 2 + 0.5;
        final depth = -wx * math.sin(yaw) + wz * math.cos(yaw);
        squares.add((r: r, c: c, depth: depth));
      }
    }
    squares.sort((a, b) => a.depth.compareTo(b.depth));

    for (final s in squares) {
      final r = s.r;
      final c = s.c;
      final isDark = (r + c).isOdd;
      final key = '$r:$c';
      final highlighted = highlights.contains(key);
      final isLast = !highlighted && lastMoveKeys.contains(key);
      final corners = <Offset>[
        _project(c - size / 2, 0, r - size / 2, canvasSize),
        _project(c - size / 2 + 1, 0, r - size / 2, canvasSize),
        _project(c - size / 2 + 1, 0, r - size / 2 + 1, canvasSize),
        _project(c - size / 2, 0, r - size / 2 + 1, canvasSize),
      ];
      // Cue squares: flat gold/lastMove (web/Flutter 2D highlight parity).
      // Quiet squares: same quietShade gradient stops as web DraughtsBoard2D CSS.
      final path = Path()..addPolygon(corners, true);
      if (highlighted || isLast) {
        canvas.drawPath(
          path,
          Paint()..color = highlighted ? gold : lastMove,
        );
      } else {
        final base = isDark ? dark : light;
        final bounds = path.getBounds();
        final shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: isDark
              ? [
                  Color.lerp(base, Colors.white, 0.18) ?? base,
                  base,
                  Color.lerp(base, Colors.black, 0.12) ?? base,
                ]
              : [
                  Color.lerp(base, Colors.white, 0.28) ?? base,
                  base,
                  Color.lerp(base, const Color(0xFF9A9A7A), 0.1) ?? base,
                ],
          stops: isDark ? const [0.0, 0.42, 1.0] : const [0.0, 0.48, 1.0],
        ).createShader(bounds);
        canvas.drawPath(path, Paint()..shader = shader);
      }
      _drawSquareCoords(
        canvas,
        canvasSize,
        r,
        c,
        isDark,
        corners,
      );
    }

    // 2D parity: lightened circular ghost on legal destination squares.
    final disc = Color.lerp(gold, Colors.white, 0.45) ?? gold;
    for (final key in destinationKeys) {
      final parts = key.split(':');
      if (parts.length != 2) continue;
      final r = int.tryParse(parts[0]);
      final c = int.tryParse(parts[1]);
      if (r == null || c == null) continue;
      final center = _project(
        c - size / 2 + 0.5,
        0.02,
        r - size / 2 + 0.5,
        canvasSize,
      );
      final radius = canvasSize.shortestSide / (size * 4.5);
      // 2D parity: soft hi glow under the lightened disc (BoxShadow(hi, 0.7)).
      canvas.drawCircle(
        center,
        radius * 1.35,
        Paint()
          ..color = gold.withValues(alpha: 0.7)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
      );
      canvas.drawCircle(
        center,
        radius,
        Paint()..color = disc.withValues(alpha: 0.95),
      );
    }

    for (final s in squares) {
      final r = s.r;
      final c = s.c;
      if (hiddenKeys.contains('$r:$c')) continue;
      if (r >= board.length || c >= board[r].length) continue;
      final cell = board[r][c];
      if (cell is! Map) continue;
      final p = (cell['p'] as num?)?.toInt() ?? 1;
      // 2D parity: piece glow on selected OR must-continue (`glow: selected || must`).
      final isSelected = selectedRow == r && selectedCol == c;
      final isMust = mustContinueRow == r && mustContinueCol == c;
      _drawPiece(
        canvas,
        canvasSize,
        c.toDouble(),
        r.toDouble(),
        p,
        cell['k'] == true,
        isSelected || isMust,
      );
    }

    _drawCaptureBursts(canvas, canvasSize);

    if (flyCol != null && flyRow != null && flyPlayer != null) {
      _drawPiece(
        canvas,
        canvasSize,
        flyCol!,
        flyRow!,
        flyPlayer!,
        flyKing,
        false,
        lift: flyLift ?? 0,
        scale: flyScale,
        yawTwist: flyYaw,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _Board3DPainter old) {
    return old.board != board ||
        old.pitch != pitch ||
        old.yaw != yaw ||
        old.flipBoard != flipBoard ||
        old.selectedRow != selectedRow ||
        old.selectedCol != selectedCol ||
        old.mustContinueRow != mustContinueRow ||
        old.mustContinueCol != mustContinueCol ||
        old.highlights != highlights ||
        old.destinationKeys != destinationKeys ||
        old.lastMoveKeys != lastMoveKeys ||
        old.lastMove != lastMove ||
        old.light != light ||
        old.dark != dark ||
        old.frame != frame ||
        old.bg != bg ||
        old.pieceDarkSplit != pieceDarkSplit ||
        old.pieceLight != pieceLight ||
        old.pieceDark != pieceDark ||
        old.hiddenKeys != hiddenKeys ||
        old.flyCol != flyCol ||
        old.flyRow != flyRow ||
        old.flyLift != flyLift ||
        old.flyScale != flyScale ||
        old.flyYaw != flyYaw ||
        old.burstProgress != burstProgress ||
        old.captureBursts != captureBursts ||
        old.gold != gold;
  }
}
