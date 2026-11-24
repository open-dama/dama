import 'dart:async';

/// Process-wide pick→put flight gate (web `data-dama-ply-inflight` parity).
///
/// SmartBoardShell must not portal↔inline remount the board while a ply is
/// airborne - that aborts the ticker and freezes land sync.
class BoardPlyFlight {
  BoardPlyFlight._();

  static int _depth = 0;

  /// Max wait before fail-open clear. A stuck depth (hot reload / missed leave)
  /// must not freeze portal/prefs/`waitUntilIdle` forever mid-match.
  /// Must cover multi-capture chains (~0.82s × 5 + slack). A 3s cap remounted
  /// the board mid-chain → pick→put flicker / land-sync stall (web PLY_IDLE_FAIL_OPEN_MS).
  static const Duration idleTimeout = Duration(milliseconds: 5500);

  static bool get isActive => _depth > 0;

  static void enter() {
    _depth += 1;
  }

  static void leave() {
    if (_depth > 0) _depth -= 1;
  }

  static void clear() {
    _depth = 0;
  }

  /// Web `board-view.ts` plyInflight defer parity - wait out pick→put.
  /// Fail-open after [idleTimeout] so a stuck gate cannot freeze chrome forever.
  /// Do not [clear] on timeout: wiping depth while the scene is still airborne
  /// lets parent sticky ply-sync treat the board as idle and snap tip under the
  /// fly (pick→put flicker). Web `runWhenPlyIdle` likewise never clears the attr;
  /// remounts land-sync via dispose/`forceRecoverStall`.
  static Future<void> waitUntilIdle({Duration? timeout}) async {
    final limit = timeout ?? idleTimeout;
    final end = DateTime.now().add(limit);
    while (isActive && DateTime.now().isBefore(end)) {
      await Future<void>.delayed(const Duration(milliseconds: 32));
    }
  }
}
