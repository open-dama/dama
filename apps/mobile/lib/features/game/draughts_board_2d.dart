import 'dart:async';
import 'dart:math' as math;

import 'package:dama_mobile/core/audio/game_notify.dart';
import 'package:dama_mobile/core/board_square.dart';
import 'package:dama_mobile/core/theme/dama_theme.dart';
import 'package:dama_mobile/core/types/game.dart';
import 'package:dama_mobile/core/ui/shimmer_skeletons.dart';
import 'package:dama_mobile/features/game/board_ply_flight.dart';
import 'package:dama_mobile/features/game/palace_piece.dart';
import 'package:flutter/material.dart';

/// Flat Chess.com-style board (default). Same tap + move_history animation
/// contract as [DraughtsBoard3D] (pick→hold→travel→land, legal/select/must,
/// last-ply highlights).
class DraughtsBoard2D extends StatefulWidget {
  const DraughtsBoard2D({
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
    this.replayMode = false,
    this.onPlyAnimated,
    this.illegalShakeKey = 0,
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
  final bool flipBoard;
  final int? yourPlayer;
  final List<MoveHistoryEntry> moveHistory;
  final bool replayMode;
  final void Function(List<List<dynamic>> boardAfter)? onPlyAnimated;
  final int illegalShakeKey;

  @override
  State<DraughtsBoard2D> createState() => _DraughtsBoard2DState();
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

class _DraughtsBoard2DState extends State<DraughtsBoard2D>
    with TickerProviderStateMixin, WidgetsBindingObserver {
  static const _holdPhaseEnd = 0.34;
  static const _landPhaseStart = 0.72;
  /** Snappy product timing (web/3D parity) - same for own + opponent. */
  static const _moveDurationMinMs = 340;
  static const _captureDurationMinMs = 440;
  static const _durationPerSquareMs = 90;
  static const _moveDurationMaxMs = 820;
  static const _stallGraceMs = 250;
  /// Web lastFrameAtRef parity: recover when ticker claims animating but value stalls.
  static const _deadTickerMs = 2000;

  late final AnimationController _anim;
  late final AnimationController _shakeCtrl;
  List<List<dynamic>> _renderBoard = const [];
  _ActiveAnim? _active;
  double _progress = 0;
  final List<_ActiveAnim> _queue = [];
  int _prevHistoryLen = 0;
  bool _holdSync = false;
  /// True while this board holds BoardPlyFlight (holdSync OR active OR queue).
  bool _plyGateHeld = false;
  Timer? _stallWatch;
  bool _finishQueued = false;
  /// True while app lifecycle paused the flight clock (web document.hidden parity).
  /// Stall recover must not snap land while the clock is intentionally frozen.
  bool _flightClockPaused = false;
  /// Last monotonic ms when `_anim.value` advanced (dead-ticker detect).
  int _lastAnimAdvanceMs = 0;
  double _lastAnimAdvanceValue = -1;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
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
        // Do not setState every tick - fly uses AnimatedBuilder. Only rebuild
        // on land commit (board + SFX), same idea as web DOM-driven flight.
        final prev = _progress;
        _progress = _anim.value;
        if (_progress != _lastAnimAdvanceValue) {
          _lastAnimAdvanceValue = _progress;
          _lastAnimAdvanceMs = DateTime.now().millisecondsSinceEpoch;
        }
        final active = _active;
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
            // Put-down only - Chess.com move / capture / promote.
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
    _shakeCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 420),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Web tab-hidden freeze: pause flight clock so resume does not fast-forward.
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
        // finishQueued / holdSync stuck mid-game - force recover (web 250ms parity).
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
  void didUpdateWidget(covariant DraughtsBoard2D oldWidget) {
    super.didUpdateWidget(oldWidget);
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

  static _ActiveAnim? _diffAnim(
    List<List<dynamic>> prev,
    List<List<dynamic>> next,
    List<List<int>> legalHint,
  ) {
    if (prev.isEmpty || next.isEmpty || prev.length != next.length) return null;
    final size = prev.length;
    final emptied = <(int, int)>[];
    final filled = <(int, int)>[];
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        final a = r < prev.length && c < prev[r].length ? prev[r][c] : null;
        final b = r < next.length && c < next[r].length ? next[r][c] : null;
        final aMap = a is Map ? a : null;
        final bMap = b is Map ? b : null;
        if (aMap != null && bMap == null) emptied.add((r, c));
        if (aMap == null && bMap != null) filled.add((r, c));
        if (aMap != null &&
            bMap != null &&
            (aMap['p'] != bMap['p'] || aMap['k'] != bMap['k'])) {
          emptied.add((r, c));
          filled.add((r, c));
        }
      }
    }
    if (filled.length != 1) return null;
    final to = filled.first;
    final dest = next[to.$1][to.$2];
    if (dest is! Map) return null;
    final destP = (dest['p'] as num?)?.toInt() ?? 1;
    (int, int)? from;
    final captures = <(int, int)>[];
    for (final sq in emptied) {
      final was = prev[sq.$1][sq.$2];
      if (was is! Map) continue;
      final wp = (was['p'] as num?)?.toInt();
      if (wp == destP) {
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
      player: destP == 2 ? 2 : 1,
      isKing: isKing,
      isPromotion: isKing && !wasKing,
      captures: captures,
      isCapture: captures.isNotEmpty,
      boardAfter: next,
    );
  }

  @override
  void dispose() {
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

  bool _isDark(int row, int col) => (row + col).isOdd;

  // Suppress select/legal/must while the ply fly is up. Parent flips
  // _boardPlySynced at LAND_PHASE so cues would otherwise flash mid put-down.
  bool get _moveCuesActive => _active == null;

  int? get _cueSelectedRow => _moveCuesActive ? widget.selectedRow : null;
  int? get _cueSelectedCol => _moveCuesActive ? widget.selectedCol : null;
  int? get _cueMustRow => _moveCuesActive ? widget.mustContinueRow : null;
  int? get _cueMustCol => _moveCuesActive ? widget.mustContinueCol : null;
  List<List<int>> get _cueLegalMoves =>
      _moveCuesActive ? widget.legalMoves : const <List<int>>[];

  Set<String> get _targets {
    final out = <String>{};
    final sr = _cueSelectedRow;
    final sc = _cueSelectedCol;
    final hasSel = sr != null && sc != null;
    for (final m in _cueLegalMoves) {
      if (m.length < 4) continue;
      if (hasSel) {
        if (m[0] == sr && m[1] == sc) {
          out.add('${m[2]},${m[3]}');
        }
      }
    }
    return out;
  }

  Set<String> get _origins {
    final out = <String>{};
    if (_cueSelectedRow != null) return out;
    for (final m in _cueLegalMoves) {
      if (m.length >= 2) out.add('${m[0]},${m[1]}');
    }
    return out;
  }

  Set<String> get _hiddenKeys {
    final a = _active;
    // Hide for the whole flight; progress is AnimatedBuilder-driven.
    if (a == null) return {};
    final set = <String>{'${a.fromR},${a.fromC}', '${a.toR},${a.toC}'};
    for (final c in a.captures) {
      set.add('${c.$1},${c.$2}');
    }
    return set;
  }

  (String, String)? get _lastMoveKeys {
    if (widget.replayMode || _active != null || widget.moveHistory.isEmpty) {
      return null;
    }
    final last = widget.moveHistory.last;
    if (last.from.length < 2 || last.to.length < 2) return null;
    return (
      '${last.from[0]},${last.from[1]}',
      '${last.to[0]},${last.to[1]}',
    );
  }

  /// Visual travel fraction after pick/hold.
  double _travelT(double progress) {
    if (progress < _holdPhaseEnd) return 0;
    if (progress >= _landPhaseStart) return 1;
    final t = (progress - _holdPhaseEnd) / (_landPhaseStart - _holdPhaseEnd);
    return t < 0.5 ? 4 * t * t * t : 1 - math.pow(-2 * t + 2, 3).toDouble() / 2;
  }

  @override
  Widget build(BuildContext context) {
    final tokens = damaColorsOf(context);
    final size = widget.boardSize;
    if (size <= 0) return const BoardAreaSkeleton();

    // Always paint _renderBoard (web `renderBoard.length ? renderBoard : board`).
    // Switching to widget.board when idle rewound landed pieces if parent lagged
    // board_after for one frame (clock/WS) - pick→put flicker.
    final display = _renderBoard.isNotEmpty ? _renderBoard : widget.board;
    final targets = _targets;
    final origins = _origins;
    final hidden = _hiddenKeys;
    final lastMove = _lastMoveKeys;

    return AspectRatio(
      aspectRatio: 1,
      child: AnimatedBuilder(
        animation: _shakeCtrl,
        builder: (context, child) {
          final shakeT = _shakeCtrl.value;
          final shakeAmp = (1.0 - shakeT) * 4.0;
          final shakeDx = shakeAmp > 0.05
              ? math.sin(shakeT * math.pi * 10) * shakeAmp
              : 0.0;
          return Transform.translate(offset: Offset(shakeDx, 0), child: child);
        },
        // Continuous opaque plane under cells (web/3D parity) so anti-alias
        // seams never composite against the dark scaffold as black borders.
        child: ColoredBox(
          color: tokens.boardDark,
          child: LayoutBuilder(
            builder: (context, constraints) {
              final side =
                  math.min(constraints.maxWidth, constraints.maxHeight);
              final cell = side / size;
              final active = _active;
              // Match resting FractionallySizedBox 0.78 of cell (web DraughtsBoard2D).
              final piece = cell * 0.78;
              // Fly overlay only - avoids rebuilding the full 10×10 grid every frame.
              final Widget? fly = active == null
                  ? null
                  : AnimatedBuilder(
                      animation: _anim,
                      builder: (context, child) {
                        final progress = _anim.value;
                        // Keep fly at destination until _finishAndAdvance clears
                        // _active. Shrinking at progress>=1 left a blank hole while
                        // resting was still hidden (pick→put flicker).
                        final t = _travelT(progress);
                        final fromR = widget.flipBoard
                            ? size - 1 - active.fromR
                            : active.fromR;
                        final fromC = widget.flipBoard
                            ? size - 1 - active.fromC
                            : active.fromC;
                        final toR = widget.flipBoard
                            ? size - 1 - active.toR
                            : active.toR;
                        final toC = widget.flipBoard
                            ? size - 1 - active.toC
                            : active.toC;
                        final vr = fromR + (toR - fromR) * t;
                        final vc = fromC + (toC - fromC) * t;
                        // Constant 1. A 1→1.035→1 pulse re-rasterizes the disc and
                        // flickers on pick and put. No Transform.scale layer either -
                        // identity scale still flickered on put-down.
                        return Positioned(
                          left: vc * cell + (cell - piece) / 2,
                          top: vr * cell + (cell - piece) / 2,
                          width: piece,
                          height: piece,
                          child: child ?? const SizedBox.shrink(),
                        );
                      },
                      child: _PieceDisc(
                        player: active.player,
                        king: active.isKing,
                        light: tokens.pieceLight,
                        dark: tokens.pieceDark,
                        darkSplit: tokens.pieceDarkSplit,
                        border: Colors.transparent,
                        borderWidth: 0,
                      ),
                    );

              return Stack(
                clipBehavior: Clip.hardEdge,
                children: [
                  GridView.builder(
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: size,
                    ),
                    itemCount: size * size,
                    itemBuilder: (context, i) {
                      final visualRow = i ~/ size;
                      final visualCol = i % size;
                      final row =
                          widget.flipBoard ? size - 1 - visualRow : visualRow;
                      final col =
                          widget.flipBoard ? size - 1 - visualCol : visualCol;
                      final dark = _isDark(row, col);
                      final cellData =
                          (row < display.length && col < display[row].length)
                              ? display[row][col]
                              : null;
                      final selected =
                          _cueSelectedRow == row && _cueSelectedCol == col;
                      final must = _cueMustRow == row && _cueMustCol == col;
                      final key = '$row,$col';
                      final isTarget = targets.contains(key);
                      final isLastFrom = lastMove?.$1 == key;
                      final isLastTo = lastMove?.$2 == key;
                      int? player;
                      var king = false;
                      if (cellData is Map) {
                        final p = cellData['p'];
                        if (p is num) player = p.toInt();
                        king = cellData['k'] == true;
                      }
                      // Select / dest / must use boardSelected; last-move uses Chess yellow.
                      final isLast = isLastFrom || isLastTo;
                      final squareHighlighted = selected ||
                          isTarget ||
                          must ||
                          isLast ||
                          (_cueSelectedRow == null && origins.contains(key));
                      final hidePiece = hidden.contains(key);
                      // 3D/web parity: only lock own piece while still in the air.
                      final ownAirLocked = _active != null &&
                          widget.yourPlayer != null &&
                          _active!.player == widget.yourPlayer &&
                          !_active!.boardApplied;
                      final canTap =
                          widget.interactive && dark && !ownAirLocked;
                      final hi = tokens.boardSelected;
                      final lastHi = tokens.lastMove;
                      final disc = Color.lerp(hi, Colors.white, 0.45) ?? hi;
                      final squareColor = !squareHighlighted
                          ? (dark ? tokens.boardDark : tokens.boardLight)
                          : (isLast && !selected && !must && !isTarget
                              ? lastHi
                              : hi);
                      // Quiet = web DraughtsBoard2D quietShade (160deg + inset rim).
                      final isQuiet = !squareHighlighted;
                      final base = dark ? tokens.boardDark : tokens.boardLight;
                      // CSS linear-gradient(160deg) ≈ this axis (not pure 135° diagonal).
                      final quietGradient = LinearGradient(
                        begin: const Alignment(-0.34, -1.0),
                        end: const Alignment(0.34, 1.0),
                        colors: dark
                            ? [
                                Color.lerp(base, Colors.white, 0.18) ?? base,
                                base,
                                Color.lerp(base, Colors.black, 0.12) ?? base,
                              ]
                            : [
                                Color.lerp(base, Colors.white, 0.28) ?? base,
                                base,
                                Color.lerp(
                                        base, const Color(0xFF9A9A7A), 0.1) ??
                                    base,
                              ],
                        stops: dark
                            ? const [0.0, 0.42, 1.0]
                            : const [0.0, 0.48, 1.0],
                      );

                      return Material(
                        color: Colors.transparent,
                        elevation: 0,
                        shadowColor: Colors.transparent,
                        surfaceTintColor: Colors.transparent,
                        type: MaterialType.canvas,
                        borderRadius: BorderRadius.zero,
                        child: InkWell(
                          borderRadius: BorderRadius.zero,
                          onTap: canTap
                              ? () => widget.onSelectSquare(row, col)
                              : null,
                          child: Ink(
                            decoration: BoxDecoration(
                              color: isQuiet ? null : squareColor,
                              gradient: isQuiet ? quietGradient : null,
                            ),
                            child: Stack(
                              alignment: Alignment.center,
                              children: [
                                // Web inset rim: inset 0 1px 0 white mix.
                                if (isQuiet)
                                  Positioned(
                                    left: 0,
                                    right: 0,
                                    top: 0,
                                    height: 1,
                                    child: ColoredBox(
                                      color: Colors.white.withValues(
                                        alpha: dark ? 0.10 : 0.35,
                                      ),
                                    ),
                                  ),
                                ..._boardCoordLabels(
                                  row: row,
                                  col: col,
                                  boardSize: size,
                                  flipBoard: widget.flipBoard,
                                  isDark: dark,
                                  light: tokens.boardLight,
                                  darkColor: tokens.boardDark,
                                ),
                                if (isTarget)
                                  FractionallySizedBox(
                                    widthFactor: 0.44,
                                    heightFactor: 0.44,
                                    // Flat fill disc like 3D destination mesh - no stroke.
                                    child: DecoratedBox(
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: disc.withValues(alpha: 0.95),
                                        boxShadow: [
                                          BoxShadow(
                                            color: hi.withValues(alpha: 0.7),
                                            blurRadius: 10,
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                if (player != null && !hidePiece)
                                  FractionallySizedBox(
                                    // Web DraughtsBoard2D PieceDisc wrapper is 78% of cell.
                                    widthFactor: 0.78,
                                    heightFactor: 0.78,
                                    // Square fill is the movable cue - no under-piece ring.
                                    child: _PieceDisc(
                                      player: player,
                                      king: king,
                                      light: tokens.pieceLight,
                                      dark: tokens.pieceDark,
                                      darkSplit: tokens.pieceDarkSplit,
                                      border: Colors.transparent,
                                      borderWidth: 0,
                                      glow: selected || must ? hi : null,
                                      // No CSS/Flutter scale on select - 3D uses mesh cue only (web parity).
                                      scale: 1.0,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                  if (fly != null) fly,
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

/// Chess.com-style in-square algebraic rails (palette-contrast ink).
List<Widget> _boardCoordLabels({
  required int row,
  required int col,
  required int boardSize,
  required bool flipBoard,
  required bool isDark,
  required Color light,
  required Color darkColor,
}) {
  final showRank = isVisualLeftFile(col, boardSize, flipBoard);
  final showFile = isVisualBottomRank(row, boardSize, flipBoard);
  if (!showRank && !showFile) return const [];
  final ink = boardCoordUsesLightInk(isDark) ? light : darkColor;
  final fontSize = boardSize >= 10 ? 9.0 : 10.5;
  final style = TextStyle(
    color: ink,
    fontSize: fontSize,
    fontWeight: FontWeight.w700,
    height: 1,
  );
  return [
    if (showRank)
      Positioned(
        left: 3,
        top: 2,
        child: Text(
          '${boardRankNumber(row, boardSize)}',
          style: style,
        ),
      ),
    if (showFile)
      Positioned(
        right: 3,
        bottom: 2,
        child: Text(
          boardFileLetter(col),
          style: style,
        ),
      ),
  ];
}

class _PieceDisc extends StatelessWidget {
  const _PieceDisc({
    required this.player,
    required this.king,
    required this.light,
    required this.dark,
    required this.border,
    required this.borderWidth,
    this.darkSplit = false,
    this.glow,
    this.scale = 1,
  });

  final int player;
  final bool king;
  final Color light;
  final Color dark;
  final bool darkSplit;
  final Color border;
  final double borderWidth;
  final Color? glow;
  final double scale;

  @override
  Widget build(BuildContext context) {
    final role = palacePieceRole(player, king);
    // Neo silhouette fills the square (Chess.com Neo pattern) - not a stamped disc.
    // Skip identity Transform.scale - fly/rest handoff flickered with an empty layer.
    final disc = DecoratedBox(
      decoration: BoxDecoration(
        boxShadow: [
          const BoxShadow(
            color: Color(0x55000000),
            blurRadius: 3,
            offset: Offset(0, 2),
          ),
          if (glow != null)
            BoxShadow(
              color: glow!.withValues(alpha: 0.85),
              blurRadius: 12,
              spreadRadius: 1,
            ),
        ],
      ),
      child: PalacePieceMark(
        role: role,
        pieceLight: light,
        pieceDark: dark,
        player: player,
        darkSplit: darkSplit,
      ),
    );
    if ((scale - 1.0).abs() < 0.001) return disc;
    return Transform.scale(scale: scale, child: disc);
  }
}
