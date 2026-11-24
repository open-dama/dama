/**
 * Board pick→put flicker + mid-game freeze contract (web / Flutter / admin).
 *
 * Freeze root: stall recover cleared fly without onPlyAnimated → board behind
 * board_after → boardPlySynced stuck false. Input must not wait on that gate;
 * idle ply-sync safety uses PLY_SYNC_IDLE_GRACE_MS (not full airborne budget).
 * Flicker roots: fly shrink before resting unhide; 3D select-lift drop; 3D fly
 * mount at origin before first useFrame.
 *
 * Usage: node scripts/e2e-board-ply-freeze-flicker-check.mjs [API_BASE]
 * Optional live API (default http://127.0.0.1:18080): guest + AI start + move
 * must return board_after so clients can land-commit.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiBase = (process.argv[2] || process.env.DAMA_API_BASE_URL || "http://127.0.0.1:18080")
  .replace(/\/$/, "")
  .replace(/\/api\/v1$/, "");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}
function assert(cond, msg, detail) {
  if (!cond) {
    console.error("FAIL", msg, detail ?? "");
    process.exit(1);
  }
  console.log("PASS", msg);
}

const web2d = read("apps/web/src/components/game/DraughtsBoard2D.tsx");
const web3d = read("apps/web/src/components/game/DraughtsScene3D.tsx");
const liveHub = read("apps/web/src/components/play/LivePlayHub.tsx");
const spectateHub = read("apps/web/src/components/spectate/SpectateHub.tsx");
const fl2d = read("apps/mobile/lib/features/game/draughts_board_2d.dart");
const fl3d = read("apps/mobile/lib/features/game/draughts_board_3d.dart");
const matchPage = read("apps/mobile/lib/features/game/match_board_page.dart");
const spectatePage = read("apps/mobile/lib/features/game/spectate_page.dart");
const outcome = read("apps/web/src/lib/gameOutcome.ts");
const optimistic = read("apps/web/src/lib/applyOptimisticDraughtsMove.ts");
const merge = read("apps/web/src/lib/gameBoardStateMerge.ts");
const flWs = read("apps/mobile/lib/core/network/game_ws_client.dart");
const inMatchAd = read("apps/web/src/components/ads/InMatchAdOverlay.tsx");
const flutterInMatchAd = read("apps/mobile/lib/features/ads/in_match_ad_overlay.dart");
const matchIntroWeb = read("apps/web/src/components/chat/MatchIntroOverlay.tsx");
const matchIntroFlutter = read("apps/mobile/lib/features/chat/match_intro_overlay.dart");

// --- Freeze: stall recover must sync parent board_after ---
assert(web2d.includes("forceRecoverStall"), "web 2D has forceRecoverStall");
assert(
  /const forceRecoverStall = useCallback\(\(\) => \{[\s\S]*?onPlyAnimatedRef\.current\?\.\(/.test(
    web2d,
  ),
  "web 2D forceRecoverStall calls onPlyAnimated",
);
assert(
  web2d.includes("forceRecoverStallRef.current()") &&
    web2d.includes("holdSyncRef.current &&") &&
    !/holdSyncRef\.current = false;\s*\}\s*, 250\)/.test(
      web2d.replace(/forceRecoverStallRef\.current\(\);/g, "/*ok*/"),
    ),
  "web 2D interval recovers via forceRecoverStall (not bare holdSync clear)",
);
assert(
  web2d.includes("finishQueued but still active after grace") &&
    web2d.includes("forceRecoverStallRef.current()"),
  "web 2D finishQueued grace uses forceRecoverStall",
);

assert(web3d.includes("forceRecoverStall"), "web 3D has forceRecoverStall");
assert(
  /const forceRecoverStall = useCallback\(\(\) => \{[\s\S]*?onPlyAnimatedRef\.current\?\.\(/.test(
    web3d,
  ),
  "web 3D forceRecoverStall calls onPlyAnimated",
);
assert(
  web3d.includes("forceRecoverStallRef.current()") &&
    web3d.includes("Do NOT treat stale isAnimating alone as a stall"),
  "web 3D stall interval syncs parent (not stale isAnimating)",
);

assert(fl2d.includes("void _forceRecoverStall()"), "flutter 2D has _forceRecoverStall");
assert(
  /void _forceRecoverStall\(\) \{[\s\S]*?widget\.onPlyAnimated\?\.call\(after\)/.test(fl2d),
  "flutter 2D stall recover calls onPlyAnimated",
);
assert(fl3d.includes("void _forceRecoverStall()"), "flutter 3D has _forceRecoverStall");
assert(
  /void _forceRecoverStall\(\) \{[\s\S]*?widget\.onPlyAnimated\?\.call\(after\)/.test(fl3d),
  "flutter 3D stall recover calls onPlyAnimated",
);
assert(
  fl3d.includes("ownAirLocked") &&
    fl3d.includes("!_active!.boardApplied") &&
    fl3d.includes("onTapUp: widget.interactive && !ownAirLocked") &&
    !fl3d.includes("onTapUp: widget.interactive && _active == null"),
  "flutter 3D unlocks taps after boardApplied (not full-fly _active==null freeze)",
);

assert(outcome.includes("export function isBoardPlySynced"), "isBoardPlySynced exists");
assert(liveHub.includes("isBoardPlySynced(game)"), "LivePlayHub gates on boardPlySynced");
assert(
  liveHub.includes("lastBoardAfter") &&
    liveHub.includes("PLY_IDLE_FAIL_OPEN_MS") &&
    liveHub.includes("PLY_SYNC_IDLE_GRACE_MS") &&
    liveHub.includes("arm(PLY_SYNC_IDLE_GRACE_MS)") &&
    liveHub.includes("data-dama-ply-inflight") &&
    liveHub.includes('phase !== "finished"') &&
    liveHub.includes("plySyncSafetyTimerRef") &&
    liveHub.includes("if (plySyncSafetyTimerRef.current != null) return"),
  "LivePlayHub sticky ply safety sync (idle grace + airborne poll)",
);
assert(
  liveHub.includes("boardInputEnabled") &&
    liveHub.includes("interactive={boardInputEnabled}") &&
    matchPage.includes("_boardInputEnabled") &&
    matchPage.includes("interactive: _boardInputEnabled"),
  "web+flutter interactive follows turn (not boardPlySynced)",
);
assert(
  read("apps/web/src/lib/board-view.ts").includes("PLY_SYNC_IDLE_GRACE_MS = 400") &&
    read("apps/mobile/lib/features/game/board_ply_flight.dart").includes(
      "syncIdleGrace = Duration(milliseconds: 400)",
    ),
  "ply sync idle grace is 400ms (not full airborne budget)",
);
assert(
  liveHub.includes("onPlyAnimated={handlePlyAnimated}") &&
    !liveHub.includes("onPlyAnimated={replayIndex == null ? handlePlyAnimated") &&
    !liveHub.includes('phase === "playing" ? handlePlyAnimated'),
  "LivePlayHub keeps onPlyAnimated across finished + replay scrub",
);
assert(
  fl3d.includes("if (widget.replayMode)") &&
    fl3d.includes("Rising into replay mid pick") &&
    fl2d.includes("Rising into replay mid pick") &&
    web2d.includes("Rising into replay mid pick") &&
    web3d.includes("Rising into replay mid pick"),
  "web+flutter land-sync before clearing fly on replay enter",
);
assert(
  spectatePage.includes("replayMode: _replayIndex != null"),
  "flutter spectate 3D passes replayMode",
);
assert(
  matchPage.includes("Keep land sync even after game-over UI") &&
    !/onPlyAnimated:\s*_replayIndex == null &&\s*!_gameOverVisible/.test(matchPage),
  "flutter match keeps onPlyAnimated after game-over UI",
);
assert(
  spectateHub.includes("isBoardPlySynced") &&
    spectateHub.includes("PLY_IDLE_FAIL_OPEN_MS") &&
    spectateHub.includes("PLY_SYNC_IDLE_GRACE_MS") &&
    spectateHub.includes("arm(PLY_SYNC_IDLE_GRACE_MS)") &&
    spectateHub.includes("data-dama-ply-inflight") &&
    spectateHub.includes("plySyncSafetyTimerRef") &&
    spectateHub.includes("if (plySyncSafetyTimerRef.current != null) return"),
  "SpectateHub sticky ply safety sync (idle grace + airborne poll)",
);
assert(
  matchPage.includes("_armPlySyncSafety") &&
    matchPage.includes("BoardPlyFlight.syncIdleGrace") &&
    matchPage.includes("arm(BoardPlyFlight.syncIdleGrace)") &&
    matchPage.includes("BoardPlyFlight.idleTimeout") &&
    matchPage.includes("BoardPlyFlight.isActive") &&
    spectatePage.includes("_armPlySyncSafety") &&
    spectatePage.includes("BoardPlyFlight.syncIdleGrace") &&
    spectatePage.includes("arm(BoardPlyFlight.syncIdleGrace)") &&
    spectatePage.includes("BoardPlyFlight.idleTimeout") &&
    spectatePage.includes("BoardPlyFlight.isActive"),
  "flutter match+spectate ply sync safety (idle grace + airborne poll)",
);
assert(
  /_board = boardAfter;\s*_liveBoard = boardAfter/.test(matchPage),
  "flutter match land sync updates _board and _liveBoard",
);
assert(
  /_board = boardAfter;\s*_liveBoard = boardAfter/.test(spectatePage),
  "flutter spectate land sync updates _board and _liveBoard",
);
const homePage = read("apps/mobile/lib/features/home/home_page.dart");
assert(
  homePage.includes("DraughtsBoard3D(") &&
    /DraughtsBoard3D\([\s\S]*?replayMode:\s*true/.test(homePage),
  "flutter home idle 3D uses replayMode (no ply queue)",
);

// Optimistic / merge keep board frozen until land (required for animation + sync gate)
assert(
  optimistic.includes("move_history:") &&
    !/board:\s*board,/.test(optimistic.split("return {")[1] || ""),
  "optimistic move keeps prior board (history-only)",
);
assert(
  merge.includes("board: previous.board") && merge.includes("incomingPly > previousPly"),
  "WS merge freezes board while history grows",
);
assert(
  merge.includes("Same-ply WS (clock tick, pause, vote, clock_flag, abandon)") &&
    merge.includes("must never snap") &&
    /if \(samePly\) \{[\s\S]*board: previous\.board/.test(merge),
  "WS mergeRemote same-ply always freezes board (clock_flag/abandon mid-fly)",
);

// --- Flicker: fly must stay until resting unhide; no select-lift drop ---
assert(
  !/if \(progress >= 1\) \{\s*return const SizedBox\.shrink\(\);/.test(fl2d),
  "flutter 2D must not shrink fly at progress>=1",
);
assert(
  fl2d.includes("Keep fly at destination until _finishAndAdvance clears"),
  "flutter 2D documents fly-until-clear handoff",
);
assert(
  !/if \(_active != null && progress < 1\)/.test(fl3d),
  "flutter 3D must not drop fly at progress>=1",
);
assert(
  fl3d.includes("Keep fly at destination until _finishAndAdvance clears"),
  "flutter 3D documents fly-until-clear handoff",
);
assert(
  fl3d.includes("const selLift = 0.0") || fl3d.includes("No select lift"),
  "flutter 3D has no select lift (avoids put drop flicker)",
);
assert(
  web3d.includes("Do not lift selected resting pieces") ||
    !/const liftY = selected \? 0\.12 : 0/.test(web3d),
  "web 3D resting pieces have no select lift",
);
assert(
  web3d.includes("position={[seed.x, seed.y, seed.z]}") &&
    web3d.includes("Seed world pose on mount"),
  "web 3D AnimatedOverlay seeds pose (no origin flash)",
);
assert(
  web3d.includes("Remount per ply") && web3d.includes("key={`fly-${animMask.from[0]}"),
  "web 3D remounts AnimatedOverlay per ply (no queued-ply dest flash)",
);
assert(
  /useLayoutEffect\(\(\) => \{\s*if \(activeFly\) applyFlyDom/.test(web2d),
  "web 2D applies fly DOM before paint",
);
assert(
  web2d.includes("History grew but nothing to fly") &&
    web2d.includes("queueRef.current.length === 0"),
  "web 2D empty-queue history grow syncs parent (no freeze)",
);
assert(
  web3d.includes("History grew but nothing to fly") &&
    web3d.includes("queueRef.current.length === 0"),
  "web 3D empty-queue history grow syncs parent (no freeze)",
);
assert(
  fl2d.includes("History grew but nothing to fly") && fl2d.includes("_queue.isEmpty"),
  "flutter 2D empty-queue history grow syncs parent",
);
assert(
  fl3d.includes("History grew but nothing to fly") && fl3d.includes("_queue.isEmpty"),
  "flutter 3D empty-queue history grow syncs parent",
);
assert(
  web2d.includes("Never clear holdSync without a parent land sync") &&
    /const startNext = useCallback\(\(\) => \{[\s\S]*?onPlyAnimatedRef\.current\?\.\(/.test(web2d),
  "web 2D startNext empty path syncs parent",
);
assert(
  web3d.includes("Never clear holdSync without a parent land sync") &&
    /const startNext = useCallback\(\(\) => \{[\s\S]*?onPlyAnimatedRef\.current\?\.\(/.test(web3d),
  "web 3D startNext empty path syncs parent",
);
assert(
  web2d.includes("boardsEqual(current, snap) ? current : snap") &&
    web3d.includes("boardsEqual(current, snap) ? current : snap") &&
    web2d.includes("boardsEqual(current, after) ? current : after") &&
    web3d.includes("boardsEqual(current, after) ? current : after"),
  "web 2D/3D land-sync paths skip renderBoard identity churn",
);
assert(
  fl2d.includes("Skip clone when already landed") &&
    fl3d.includes("Skip clone when already landed"),
  "flutter 2D/3D stall/empty paths skip board clone when equal",
);
assert(
  fl2d.includes("Assign fly state synchronously BEFORE setState") &&
    fl3d.includes("Assign fly state synchronously BEFORE setState"),
  "flutter 2D/3D primes fly before didUpdateWidget build (no origin flash)",
);
assert(
  fl2d.includes("Reset controller to 0 BEFORE paint") &&
    fl3d.includes("Reset controller to 0 BEFORE paint") &&
    fl2d.includes("_anim.value = 0") &&
    fl3d.includes("_anim.value = 0"),
  "flutter 2D/3D reset anim to 0 before next-ply paint (no dest flash)",
);
assert(
  web2d.includes("Parent may pass a new board ref each render") &&
    web3d.includes("Parent may pass a new board ref each render"),
  "web 2D/3D empty-history path skips board remount on identity churn",
);
assert(
  fl2d.includes("Never clear holdSync without a parent land sync"),
  "flutter 2D _startNext empty path syncs parent",
);
assert(
  fl3d.includes("Never clear holdSync without a parent land sync"),
  "flutter 3D _startNext empty path syncs parent",
);
assert(
  fl2d.includes("Always route through _startNext") &&
    !/void _finishAndAdvance\(\) \{[\s\S]*?setState\(\(\) => _holdSync = false\);/.test(fl2d),
  "flutter 2D finishAndAdvance never bare-clears holdSync",
);
assert(
  fl3d.includes("Always route through _startNext") &&
    !/void _finishAndAdvance\(\) \{[\s\S]*?setState\(\(\) => _holdSync = false\);/.test(fl3d),
  "flutter 3D finishAndAdvance never bare-clears holdSync",
);
assert(
  fl2d.includes("Do not clear _active here (web finishAndAdvance parity)") &&
    fl3d.includes("Do not clear _active here (web finishAndAdvance parity)") &&
    fl2d.includes("owns clear + dangling land sync") &&
    fl3d.includes("owns clear + dangling land sync") &&
    fl2d.includes("could flash a blank fly frame before the next ply primed") &&
    fl3d.includes("could flash a blank fly frame before the next ply primed"),
  "flutter finishAndAdvance keeps active until startNext (dangling sync + no blank fly)",
);
{
  const rl = read("apps/api/internal/middleware/ratelimit.go");
  assert(
    rl.includes("2*time.Second") &&
      rl.includes("rate limiter unavailable") &&
      !rl.includes("WithTimeout(ctx, 500*time.Millisecond)"),
    "API rate-limit Redis Eval budget allows remote Redis (avoids mid-game 503 freezes)",
  );
}
assert(
  web2d.includes("Always route through startNext") &&
    !/const finishAndAdvance = useCallback\(\(\) => \{[\s\S]*?holdSyncRef\.current = false;[\s\S]*?\}, \[commitBoardAfter, startNext\]\)/.test(
      web2d,
    ),
  "web 2D finishAndAdvance never bare-clears holdSync",
);
assert(
  web3d.includes("Always route through startNext") &&
    !/const finishAndAdvance = useCallback\(\(\) => \{[\s\S]*?holdSyncRef\.current = false;[\s\S]*?\}, \[commitBoardAfter, startNext\]\)/.test(
      web3d,
    ),
  "web 3D finishAndAdvance never bare-clears holdSync",
);

// --- Coverage: every interactive host wires onPlyAnimated ---
assert(liveHub.includes("onPlyAnimated={"), "LivePlayHub wires onPlyAnimated");
assert(
  spectateHub.includes("onPlyAnimated={handlePlyAnimated}") &&
    !spectateHub.includes("onPlyAnimated={replayIndex == null ? handlePlyAnimated"),
  "SpectateHub wires onPlyAnimated across replay scrub",
);
assert(
  matchPage.includes("_selectLiveWhenIdle") &&
    spectatePage.includes("_selectLiveWhenIdle") &&
    liveHub.includes('"live-live"') &&
    spectateHub.includes('"spectate-live"'),
  "web+flutter Live chip defers mid pick→put (no tip snap under fly)",
);
assert(matchPage.includes("onPlyAnimated:"), "match_board_page wires onPlyAnimated");
assert(spectatePage.includes("onPlyAnimated:"), "spectate_page wires onPlyAnimated");

// Parent land handlers must no-op when board content already matches (finish/empty
// re-notify must not remount pieces mid put-down).
assert(
  liveHub.includes("boardsEqual(prev.board, boardAfter)") &&
    spectateHub.includes("boardsEqual(prev.board, boardAfter)"),
  "web hosts skip ply-animated identity churn when already synced",
);
assert(
  liveHub.includes("Never raw-replace same-match state from RQ") &&
    liveHub.includes("mergeBoardStateAfterPlayerMove(prev, next)") &&
    liveHub.includes("mergeRemoteBoardState(prev, next)"),
  "LivePlayHub RQ hydrate merges (no mid-ply board snap)",
);
assert(
  liveHub.includes("Merge so pause mid pick→put cannot snap") &&
    liveHub.includes("Merge so resume cannot snap board") &&
    liveHub.includes("Merge terminal clock-flag so an in-flight ply"),
  "LivePlayHub pause/resume/clock-flag merge (no mid-ply board snap)",
);
assert(
  spectateHub.includes("Never raw-replace same-match state from RQ") &&
    spectateHub.includes("mergeRemoteBoardState(prev, next)"),
  "SpectateHub RQ hydrate merges (no mid-ply board snap)",
);
assert(
  liveHub.includes("Refetch stores raw board_after in RQ - write freeze-merged back") &&
    spectateHub.includes("Refetch stores raw board_after in RQ - write freeze-merged back"),
  "web live+spectate RQ hydrate writes freeze-merged back (no remount board_after seed)",
);
{
  const gameStateQuery = read("apps/web/src/hooks/query/useGameStateQuery.ts");
  assert(
    gameStateQuery.includes("Never let soft refetch store raw board_after") &&
      gameStateQuery.includes("mergeRemoteBoardState(prev, data)"),
    "useGameStateQuery merges refetch into freeze-painted cache (no remount seed)",
  );
}
assert(
  fl2d.includes("_flightClockPaused") &&
    fl3d.includes("_flightClockPaused") &&
    fl2d.includes("if (_flightClockPaused)") &&
    fl3d.includes("if (_flightClockPaused)") &&
    fl2d.includes("Dead ticker: isAnimating can stay true") &&
    fl3d.includes("Dead ticker: isAnimating can stay true"),
  "flutter 2D/3D stall recover skips while lifecycle paused flight clock",
);
assert(
  web2d.includes("Tab discard / long background can drop the pending RAF") &&
    web2d.includes("visibilitychange") &&
    web2d.includes("Dead RAF while a fly is active") &&
    web2d.includes("land-sync like 3D forceRecover") &&
    web3d.includes("Tab return after long hide: finishQueued grace") &&
    web3d.includes("Dead useFrame while a fly is active") &&
    web3d.includes("lastFrameAtRef") &&
    fl2d.includes("Dead ticker: isAnimating can stay true") &&
    fl3d.includes("Dead ticker: isAnimating can stay true") &&
    fl2d.includes("_deadTickerMs") &&
    fl3d.includes("_deadTickerMs"),
  "web 2D/3D + flutter resume dead flight clock (no mid-ply freeze)",
);
assert(
  web2d.includes("Seed stall clock (Flutter _lastAnimAdvanceMs)") &&
    web3d.includes("Seed stall clock (Flutter _lastAnimAdvanceMs)") &&
    web2d.includes("lastFrameAtRef.current = performance.now()") &&
    web3d.includes("lastFrameAtRef.current = performance.now()") &&
    fl2d.includes("_lastAnimAdvanceMs = DateTime.now().millisecondsSinceEpoch") &&
    fl3d.includes("_lastAnimAdvanceMs = DateTime.now().millisecondsSinceEpoch"),
  "web+flutter startNext seeds stall clock (dead RAF/useFrame from ply start recovers)",
);
assert(
  web2d.includes("Keep stall clock alive") &&
    web3d.includes("Keep stall clock alive") &&
    web2d.includes("Re-arm stall clock on return") &&
    web3d.includes("re-arm stall clock") &&
    web3d.includes("do not snap just because last aged while hidden") &&
    fl2d.includes("_flightClockPaused") &&
    fl3d.includes("_flightClockPaused") &&
    fl2d.includes("Re-arm stall clock (web lastFrameAtRef visibility parity)") &&
    fl3d.includes("Re-arm stall clock (web lastFrameAtRef visibility parity)") &&
    fl2d.includes("Gate on _active (not only isAnimating)") &&
    fl3d.includes("Gate on _active (not only isAnimating)"),
  "web+flutter hide/pause keeps stall clock (no tab-return pick→put snap)",
);
assert(
  web2d.includes("Constant 1. A 1→1.035→1 pulse") &&
    fl2d.includes("Constant 1. A 1→1.035→1 pulse") &&
    web3d.includes("Height lift only. XY scale pulse") &&
    fl3d.includes("Height lift only. XY scale pulse") &&
    web2d.includes('el.style.transform = "translate3d(-50%, -50%, 0)"') &&
    fl2d.includes("No Transform.scale layer either") &&
    fl2d.includes("Skip identity Transform.scale") &&
    fl3d.includes("willChange:true promoted the full board layer") &&
    !web2d.includes("will-change-transform"),
  "pick/put keeps piece scale at 1 (no shadow re-raster flicker)",
);
assert(
  fl2d.includes("Web remount-sync parity: idle with parent behind tip") &&
    fl3d.includes("Web remount-sync parity: idle with parent behind tip") &&
    fl2d.includes("Content equality (web boardsEqual parity)") &&
    fl3d.includes("Content equality (web boardsEqual parity)") &&
    web2d.includes("Content equality (Flutter `_boardsEqual` parity)") &&
    web3d.includes("Content equality (Flutter `_boardsEqual` parity)") &&
    web2d.includes("Boolean(a.k) !== Boolean(b.k)") &&
    web3d.includes("Boolean(a.k) !== Boolean(b.k)"),
  "flutter+web 2D/3D idle sync + content boardsEqual (no put-down rewind)",
);
assert(
  liveHub.includes("Persist freeze-merged optimistic so remount mid pick→put") &&
    liveHub.includes("qc.setQueryData(gameStateQueryKey(optimistic.id), optimistic)"),
  "LivePlayHub optimistic move persists freeze-merged board to RQ",
);
assert(
  matchPage.includes("Persist freeze-painted board so remount mid pick→put") &&
    matchPage.includes("_cachePaintedBoard(_board!)"),
  "flutter match optimistic move persists freeze-painted board to cache",
);
assert(
  web2d.includes("Remount mid pick→put (e.g. 2D↔3D)") &&
    web3d.includes("Remount mid pick→put (e.g. 2D↔3D)") &&
    fl2d.includes("Remount mid pick→put (e.g. 2D↔3D)") &&
    fl3d.includes("Remount mid pick→put (e.g. 2D↔3D)"),
  "web+flutter 2D/3D remount mid-ply syncs parent (no 2D↔3D freeze)",
);
assert(
  spectateHub.includes("Keep RQ on freeze-merged paint (reconnect mid pick→put)"),
  "SpectateHub connect writes freeze-merged back to RQ",
);
assert(
  liveHub.includes("mergeBoardStateAfterReconnect") &&
    liveHub.includes("wasReconnect") &&
    liveHub.includes("hardResyncGameState") &&
    merge.includes("export function mergeBoardStateAfterReconnect") &&
    merge.includes("incomingPly < previousPly") &&
    merge.includes("return withResolvedOutcome(incoming)"),
  "LivePlayHub WS reconnect hard-resync snaps optimistic ghost (no AI-turn freeze)",
);
assert(
  liveHub.includes("REST `/move` is primary") &&
    liveHub.includes("submitMoveViaRest") &&
    liveHub.includes("/games/${gameId}/move") &&
    liveHub.includes("void hardResyncGameState(game.id)") &&
    liveHub.includes("do not dual-send") &&
    matchPage.includes("REST `/move` is primary") &&
    matchPage.includes("_submitMoveViaRest") &&
    matchPage.includes("/api/v1/games/$id/move") &&
    matchPage.includes("mode == 'ai') return 1"),
  "web+flutter REST /move primary + flutter AI seat fallback (no WSS ghost-turn freeze)",
);
assert(
  liveHub.includes('busy && phase !== "playing"') &&
    liveHub.includes("Do not gate on `busy`") &&
    liveHub.includes("legals = game.legal_moves ?? []") &&
    liveHub.includes("Math.min(introDurationRaw, 5000)") &&
    matchPage.includes("introRaw > 5000 ? 5000") &&
    matchPage.includes("Do not gate taps on start/hydrate") &&
    !/interactive=\{\s*phase === "playing" &&\s*!busy &&/.test(liveHub),
  "web+flutter cold-start fail-open (no busy pointer/tap trap / intro cap / legal_moves safe)",
);
assert(
  matchIntroWeb.includes("Timed intro must be pointer-events-none") &&
    matchIntroWeb.includes("pointer-events-none bg-[var(--dama-bg)]/45") &&
    matchIntroFlutter.includes("IgnorePointer so VS cinematic never steals board taps") &&
    matchIntroFlutter.includes("IgnorePointer(ignoring: true, child: visual)") &&
    matchIntroFlutter.includes("AbsorbPointer(absorbing: true, child: visual)") &&
    matchIntroFlutter.includes("scrimAlpha = widget.persistent ? 0.90 : 0.45") &&
    liveHub.includes("Never mount a timed VS board cover") &&
    liveHub.includes("Sound-only; pause/result covers still mount") &&
    !/setMatchIntroActive\(true\)/.test(liveHub) &&
    matchPage.includes("Never mount timed VS board cover") &&
    matchPage.includes("GameNotify.play('game_start')"),
  "web+flutter skip timed intro cover on all live seats (pause still absorbs)",
);
assert(
  inMatchAd.includes("Never POST eligibility at t≈0") &&
    inMatchAd.includes("scheduleAfter(minFirst)") &&
    inMatchAd.includes("Never eligibility/cover a virgin board") &&
    inMatchAd.includes("(moveCount ?? 0) < 1") &&
    flutterInMatchAd.includes("Never POST eligibility at t≈0") &&
    flutterInMatchAd.includes("_schedule(minFirst)") &&
    flutterInMatchAd.includes("widget.moveCount < 1") &&
    flutterInMatchAd.includes("Never eligibility/cover a virgin board") &&
    read("apps/api/internal/rest/ads_handlers.go").includes("coldOpenFloorSec = 15") &&
    read("apps/api/internal/rest/ads_handlers.go").includes(
      "covered the virgin board → abandon with zero POST /move",
    ),
  "web+flutter first in-match eligibility deferred past cold open",
);
{
  const playCol = read("apps/web/src/components/play/PlayBoardColumn.tsx");
  assert(
    playCol.includes('className="pointer-events-none absolute inset-0 z-50 overflow-hidden"') &&
      !playCol.includes(
        'className="pointer-events-none absolute inset-0 z-50 overflow-hidden [&>*]:pointer-events-auto"',
      ) &&
      playCol.includes("empty inset-0 z-50 div ate all board taps") &&
      playCol.includes("Do NOT force [&>*]:pointer-events-auto"),
    "PlayBoardColumn cover wrapper is pointer-events-none (no child override freezing intro)",
  );
  assert(
    liveHub.includes("releaseBodyPointerEvents") &&
      liveHub.includes("Hard fail-open: intro cover must never outlive") &&
      liveHub.includes("Zero/invalid duration: never mount a cover") &&
      matchIntroFlutter.includes("IgnorePointer(child: SizedBox.shrink())") &&
      matchPage.includes("Hard fail-open: intro cover must never outlive"),
    "web+flutter intro fail-open + body pointer-events release on play",
  );
  assert(
    liveHub.includes("setInterval(releaseBodyPointerEvents, 250)") &&
      liveHub.includes("onPointerDownCapture") &&
      liveHub.includes("Clear stuck body locks before the square handler"),
    "LivePlayHub clears body pointer-events mid-play (250ms + board capture)",
  );
}
assert(
  inMatchAd.includes("Never cover the opening seconds") &&
    inMatchAd.includes("minFirstSec") &&
    flutterInMatchAd.includes("Never cover the opening seconds") &&
    flutterInMatchAd.includes("minFirst"),
  "web+flutter defer first in-match ad past cold open (no zero-move abandon)",
);
assert(
  liveHub.includes("Half-open sockets never fire onclose") &&
    liveHub.includes("void hardResyncGameState(gid)") &&
    matchPage.includes("_armAwaitingReplyWatch") &&
    matchPage.includes("Timer.periodic(const Duration(seconds: 4)") &&
    spectateHub.includes("Half-open spectate WSS stops live plies") &&
    spectatePage.includes("_armSpectatePollWatch"),
  "web+flutter poll /state while awaiting AI/opponent or spectating (half-open WSS)",
);
assert(
  liveHub.includes("moveWaitRef.current.reject") &&
    liveHub.includes("pendingLocalMoveRef.current = false") &&
    liveHub.includes("setAiThinking(false)") &&
    liveHub.includes("ws.onclose"),
  "LivePlayHub WS close clears move wait + AI thinking (no mid-game input freeze)",
);
assert(
  spectateHub.includes("wasReconnect && gameId") &&
    spectateHub.includes("refetchQueries({ queryKey: gameStateQueryKey(gameId) })") &&
    spectateHub.includes("bindSocket()"),
  "SpectateHub auto-reconnects + refetches after proxy drop",
);
assert(
  flWs.includes("_scheduleReconnect") &&
    flWs.includes("type': 'ws_open'") &&
    flWs.includes("_markDead") &&
    flWs.includes("bool sendMove") &&
    matchPage.includes("_resyncAfterWsReconnect") &&
    matchPage.includes("_wsSawOpen") &&
    matchPage.includes("authoritative: true") &&
    spectatePage.includes("_resyncSpectateAfterWs") &&
    spectatePage.includes("authoritative: true"),
  "flutter WS auto-reconnect + authoritative resync (match + spectate)",
);
assert(
  spectateHub.includes("Never raw-replace same-match cache mid pick→put") &&
    spectateHub.includes("mergeRemoteBoardState(prev, cached)"),
  "SpectateHub connect merges RQ cache (no mid-ply board snap)",
);
assert(
  matchPage.includes("_boardsMatch(_board, boardAfter)") &&
    spectatePage.includes("_boardsMatch(_board, boardAfter)"),
  "flutter hosts skip ply-animated rebuild when already synced",
);
assert(
  matchPage.includes("Same-ply WS (move_ack + game_state) must not snap") &&
    spectatePage.includes("same-ply WS must not snap mid pick→put") &&
    spectatePage.includes("_boardsMatch(_board, lastAfter)") &&
    matchPage.includes("Preserve local board_after snapshots") &&
    spectatePage.includes("Preserve local board_after snapshots"),
  "flutter match+spectate same-ply freeze + board_after merge (no mid-ply snap)",
);
assert(
  matchPage.includes("Cold attach / resume with existing history") &&
    matchPage.includes("else if (!histGrew || _board == null)") &&
    spectatePage.includes("else if (!histGrew || _board == null)"),
  "flutter match+spectate seed board when null on histGrew (no blank freeze)",
);
assert(
  liveHub.includes("Store freeze-merged state (not raw board_after)") &&
    liveHub.includes("qc.setQueryData(gameStateQueryKey(gameRef.current.id), gameRef.current)"),
  "LivePlayHub RQ cache stores freeze-merged game (no mid-ply seed snap)",
);
assert(
  liveHub.includes("Persist painted board so leave→back / remount does not re-freeze") &&
    liveHub.includes("qc.setQueryData(gameStateQueryKey(next.id), next)") &&
    spectateHub.includes("Persist painted board so leave→back / remount does not re-freeze") &&
    spectateHub.includes("queryClient.setQueryData(gameStateQueryKey(next.id), next)"),
  "web live+spectate land sync persists painted board to RQ (no remount freeze)",
);
assert(
  spectateHub.includes("Store freeze-merged state (not raw board_after)") &&
    spectateHub.includes("queryClient.setQueryData(gameStateQueryKey(merged.id), merged)"),
  "SpectateHub WS stores freeze-merged game in RQ (LivePlayHub parity)",
);
assert(
  liveHub.includes("Keep RQ on the same freeze-merged paint") &&
    (
      liveHub.match(
        /if \(merged\?\.id\) qc\.setQueryData\(gameStateQueryKey\(merged\.id\), merged\)/g,
      ) || []
    ).length >= 3,
  "LivePlayHub pause/resume/abandon sync gameRef+RQ with freeze merge",
);
assert(
  matchPage.includes("Persist painted terminal board so remount is not stuck") &&
    matchPage.includes("_cachePaintedBoard(snap)") &&
    matchPage.includes("BoardPlyFlight.idleTimeout") &&
    matchPage.includes("BoardPlyFlight.isActive") &&
    !matchPage.includes("milliseconds: 2200"),
  "flutter match game-over grace persists painted board (chain-safe, skip while airborne)",
);
assert(
  liveHub.includes("Persist painted terminal board so remount is not stuck behind board_after") &&
    liveHub.includes("syncTerminalBoard(withResolvedOutcome(prev))") &&
    liveHub.includes("qc.setQueryData(gameStateQueryKey(next.id), next)") &&
    liveHub.includes("PLY_IDLE_FAIL_OPEN_MS") &&
    liveHub.includes("data-dama-ply-inflight") &&
    !liveHub.includes(", 2200)"),
  "LivePlayHub terminal grace persists painted board (chain-safe, skip while airborne)",
);
const pauseMut = read("apps/web/src/hooks/mutation/usePauseGameMutation.ts");
const resumeMut = read("apps/web/src/hooks/mutation/useResumeGameMutation.ts");
const abandonMut = read("apps/web/src/hooks/mutation/useAbandonGameMutation.ts");
const leavePause = read("apps/web/src/lib/pause-active-game.ts");
assert(
  pauseMut.includes("mergeRemoteBoardState(prev, game)") &&
    resumeMut.includes("mergeRemoteBoardState(prev, game)") &&
    abandonMut.includes("mergeRemoteBoardState(prev, game)") &&
    leavePause.includes("setGameStateMerged") &&
    leavePause.includes("mergeRemoteBoardState(prev, payload)"),
  "pause/resume/abandon/leave-pause RQ writes merge (no mid-ply board_after seed)",
);
assert(
  matchPage.includes("payload.copyWith(board: _board ?? payload.board)") &&
    spectatePage.includes("payload.copyWith(board: _board ?? payload.board)") &&
    read("apps/mobile/lib/core/types/game.dart").includes(
      "Keep painted board when caching mid pick→put",
    ),
  "flutter match+spectate cache painted board (no mid-ply board_after seed)",
);
const flPause = read("apps/mobile/lib/features/game/pause_active_game.dart");
assert(
  flPause.includes("_writeGameStateMerged") &&
    flPause.includes("Keep painted board when history did not shrink") &&
    !/QueryCache\.write\(CacheKeys\.gameState\([^)]+\),\s*payload\)/.test(flPause),
  "flutter pause/resume cache merges painted board (no mid-ply board_after seed)",
);
assert(
  matchPage.includes("Do not raw-write board_after here; _applyBoardPayload") &&
    spectatePage.includes("Do not raw-write board_after here; _applyPayload"),
  "flutter REST hydrate defers cache write to apply (no mid-ply raw seed)",
);
assert(
  matchPage.includes("void _cachePaintedBoard") &&
    spectatePage.includes("void _cachePaintedBoard") &&
    matchPage.includes("_cachePaintedBoard(boardAfter)") &&
    spectatePage.includes("_cachePaintedBoard(boardAfter)"),
  "flutter match+spectate land sync persists painted board to cache (no remount freeze)",
);
assert(
  fl2d.includes("Always notify parent even when LAND_PHASE already applied") &&
    fl3d.includes("Always notify parent even when LAND_PHASE already applied") &&
    web2d.includes("Empty clear must still re-notify") &&
    web3d.includes("Empty clear must still re-notify") &&
    web2d.includes("if (alreadyApplied)") &&
    web3d.includes("if (alreadyApplied)"),
  "empty startNext re-notifies parent when land already applied (freeze if missed)",
);
assert(
  fl2d.includes("Web remount-sync parity: idle with parent behind tip") &&
    fl3d.includes("Web remount-sync parity: idle with parent behind tip") &&
    web2d.includes("boardsEqual(current, completed) && !boardsEqual(board, completed)") &&
    web3d.includes("boardsEqual(current, completed) && !boardsEqual(board, completed)") &&
    fl2d.includes("Always paint _renderBoard") &&
    fl3d.includes("Always paint _renderBoard"),
  "idle remount-sync + paint completed while parent lags (no pick→put rewind)",
);
assert(
  fl2d.includes("Always paint _renderBoard") &&
    fl3d.includes("Always paint _renderBoard") &&
    fl2d.includes("_renderBoard.isNotEmpty ? _renderBoard : widget.board") &&
    fl3d.includes("_renderBoard.isNotEmpty ? _renderBoard : widget.board") &&
    web2d.includes("renderBoard.length ? renderBoard : board") &&
    web3d.includes("renderBoard.length ? renderBoard : board"),
  "display prefers renderBoard (no idle switch to lagging parent board)",
);
assert(
  web2d.includes("alreadyApplied") &&
    web3d.includes("alreadyApplied") &&
    web2d.includes("Stall clear must still sync parent") &&
    web3d.includes("Stall clear must still sync parent"),
  "web forceRecover re-notifies parent when land already applied locally",
);

// Mid put-down cue flash: parent flips boardPlySynced at LAND_PHASE (~0.72) while
// the fly is still finishing. Boards must suppress select/legal/must until clear.
assert(
  web2d.includes("Suppress select/legal/must while the ply fly is up") &&
    web2d.includes("cueSelected") &&
    web2d.includes("activeFly ? null : selected"),
  "web 2D suppresses move cues while activeFly (no mid put-down flash)",
);
assert(
  web3d.includes("Suppress select/legal/must while the ply fly is up") &&
    web3d.includes("moveCuesActive") &&
    web3d.includes("!animMask"),
  "web 3D suppresses move cues while animMask (no mid put-down flash)",
);
assert(
  fl2d.includes("Suppress select/legal/must while the ply fly is up") &&
    fl2d.includes("_moveCuesActive") &&
    fl2d.includes("_cueSelectedRow"),
  "flutter 2D suppresses move cues while _active (no mid put-down flash)",
);
assert(
  fl3d.includes("Suppress select/legal/must while the ply fly is up") &&
    fl3d.includes("_moveCuesActive") &&
    fl3d.includes("_cueSelectedRow") &&
    /Set<String> get _lastMoveKeys \{[\s\S]*?widget\.replayMode/.test(fl3d),
  "flutter 3D suppresses move cues + lastMove respects replayMode",
);

// Admin: no interactive draughts board renderer
assert(
  !existsSync(join(root, "apps/admin/src/components/game/DraughtsBoard2D.tsx")),
  "admin has no DraughtsBoard2D",
);
assert(
  !existsSync(join(root, "apps/admin/src/components/game/DraughtsScene3D.tsx")),
  "admin has no DraughtsScene3D",
);
const adminPause = existsSync(
  join(root, "apps/admin/src/components/tournaments/OfficialPauseLiveBoards.tsx"),
)
  ? read("apps/admin/src/components/tournaments/OfficialPauseLiveBoards.tsx")
  : "";
assert(
  !adminPause.includes("DraughtsBoard") && !adminPause.includes("DraughtsScene"),
  "admin OfficialPauseLiveBoards is ops table only (no piece renderer)",
);

console.log("CONTRACT_OK");

// --- Optional live API: AI game move returns board_after (land-commit fuel) ---
async function liveApiCheck() {
  const health = await fetch(`${apiBase}/readyz`).catch(() => null);
  if (!health?.ok) {
    console.log(`SKIP live API (readyz not reachable at ${apiBase})`);
    return;
  }
  const guest = await fetch(`${apiBase}/api/v1/auth/guest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const guestBody = await guest.json().catch(() => ({}));
  assert(guest.ok && guestBody.access_token, "guest auth", guest.status);

  const flagsRes = await fetch(`${apiBase}/api/v1/feature-flags`);
  const flags = await flagsRes.json().catch(() => ({}));
  const depth = Array.isArray(flags.ai_depths) && flags.ai_depths.length ? flags.ai_depths[0] : 2;
  const start = await fetch(`${apiBase}/api/v1/games/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${guestBody.access_token}`,
    },
    body: JSON.stringify({
      mode: "ai",
      ai_search_depth: depth,
      time_control_seconds: 180,
    }),
  });
  const startBody = await start.json().catch(() => ({}));
  assert(
    (start.status === 200 || start.status === 201) && startBody.id,
    "AI game start",
    `${start.status} ${JSON.stringify(startBody).slice(0, 200)}`,
  );
  const legal = startBody.legal_moves || [];
  assert(Array.isArray(legal) && legal.length > 0, "AI game has legal moves");

  const mv = legal[0];
  const move = await fetch(`${apiBase}/api/v1/games/${encodeURIComponent(startBody.id)}/move`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${guestBody.access_token}`,
    },
    body: JSON.stringify({ from: mv.from, to: mv.to }),
  });
  const moveBody = await move.json().catch(() => ({}));
  assert(move.ok, "AI move accepted", move.status);
  const hist = moveBody.move_history || [];
  assert(hist.length >= 1, "move_history grew after ply");
  const last = hist[hist.length - 1];
  assert(
    Array.isArray(last?.board_after) && last.board_after.length > 0,
    "last ply has board_after (client land commit)",
  );
  // Server may advance board immediately; clients still animate from history and
  // sync via onPlyAnimated - contract is board_after presence.
  console.log("PASS live AI ply board_after present");
}

// Sticky safety + remount/flicker guards
assert(
  web2d.includes("dama-board-reject") && !/shake && "animate-pulse"/.test(web2d),
  "web 2D reject uses dama-board-reject (not opacity animate-pulse)",
);
assert(
  web2d.includes('setAttribute("data-dama-ply-inflight"') &&
    web3d.includes('setAttribute("data-dama-ply-inflight"'),
  "web 2D/3D mark ply inflight for SmartBoardHost toggle lock",
);
assert(
  web3d.includes("onPlyInflightChange") &&
    web3d.includes("setPlyInflightSync") &&
    web3d.includes("useLayoutEffect") &&
    web3d.includes("animationRef.current !== animation") &&
    !/data-dama-ply-inflight=\{isAnimating/.test(web3d) &&
    !/data-dama-ply-inflight=\{plyInflight/.test(web3d),
  "web 3D lifts ply gate via DOM sync (not React-controlled attr)",
);
assert(
  web3d.includes("if (isAnimating) onPlyInflightChange?.(true)") &&
    web3d.includes("One-way mirror") &&
    !/onPlyInflightChange\?\.\(isAnimating\)/.test(web3d),
  "web 3D isAnimating mirror is one-way raise (never clears holdSync gate)",
);
assert(
  web3d.includes("setPlyInflightSync") &&
    web3d.includes('setAttribute("data-dama-ply-inflight"') &&
    web3d.includes("markPlyInflight(true)") &&
    web3d.includes("Gate remounts from the holdSync rise") &&
    web2d.includes("markPlyInflight(true)") &&
    web2d.includes('setAttribute("data-dama-ply-inflight"') &&
    web2d.includes("Gate remounts from the holdSync rise") &&
    web2d.includes("DOM-only ply gate") &&
    web3d.includes("Attribute is DOM-only"),
  "web 2D/3D sync data-dama-ply-inflight on holdSync rise (DOM-only, same-turn)",
);
assert(
  web2d.includes("land-sync + gate clear in layout") &&
    web3d.includes("land-sync + gate clear in layout"),
  "web 2D/3D unmount forceRecover runs in useLayoutEffect (before remount gates)",
);
assert(
  /holdSyncRef\.current = false;\s*(?:holdSyncSinceRef\.current = null;\s*)?markPlyInflight\(false\);/.test(
    web2d,
  ) &&
    /holdSyncRef\.current = false;\s*(?:holdSyncSinceRef\.current = null;\s*)?markPlyInflight\(false\);/.test(
      web3d,
    ),
  "web 2D/3D empty-history holdSync clear also clears ply-inflight gate",
);
assert(
  fl2d.includes("_syncPlyFlightGate") &&
    fl3d.includes("_syncPlyFlightGate") &&
    fl2d.includes("Gate remounts from holdSync rise") &&
    fl3d.includes("Gate remounts from holdSync rise") &&
    fl2d.includes("_plyGateHeld") &&
    fl3d.includes("_plyGateHeld"),
  "flutter 2D/3D BoardPlyFlight enters on holdSync rise (not only active bind)",
);
assert(
  matchPage.includes("_plyLandEpoch") &&
    spectatePage.includes("_plyLandEpoch") &&
    matchPage.includes("BoardPlyFlight.waitUntilIdle") &&
    spectatePage.includes("ValueKey(connectedId)") &&
    matchPage.includes("ValueKey(_gameId"),
  "flutter match+spectate ply-land epoch + keyed remount on id swap",
);
assert(
  liveHub.includes("suppressPlyLandRef") &&
    spectateHub.includes("suppressPlyLandRef") &&
    liveHub.includes("key={game.id}") &&
    spectateHub.includes("key={game.id}"),
  "web live+spectate suppress stale land on game-id swap (keyed remount)",
);
assert(
  web2d.includes("forceRecoverStallRef.current()") &&
    web3d.includes("forceRecoverStallRef.current()") &&
    web2d.includes("Portal/2D↔3D/shell remount mid pick") &&
    web3d.includes("Portal/2D↔3D/shell remount mid pick"),
  "web 2D/3D unmount forceRecover land-sync (no freeze after remount)",
);
assert(
  fl2d.includes("Remount (2D↔3D / shell) mid pick") &&
    fl3d.includes("Remount (2D↔3D / shell) mid pick") &&
    fl2d.includes("onPlyAnimated?.call(after)") &&
    fl3d.includes("onPlyAnimated?.call(after)"),
  "flutter 2D/3D dispose land-syncs parent (no freeze after remount)",
);
{
  const smartHost = read("apps/web/src/components/play/SmartBoardHost.tsx");
  assert(
    smartHost.includes("data-dama-ply-inflight") &&
      smartHost.includes("Never toggle mid pick") &&
      smartHost.includes("wantsTopped") &&
      smartHost.includes("applyWhenIdle") &&
      smartHost.includes("Defer BOTH open and close") &&
      smartHost.includes("Stuck ply attr must not defer portal forever") &&
      smartHost.includes("PLY_IDLE_FAIL_OPEN_MS"),
    "SmartBoardHost defers portal open+close while ply inflight (chain-safe fail-open)",
  );
}
{
  const boardView = read("apps/web/src/lib/board-view.ts");
  assert(
    boardView.includes("data-dama-ply-inflight") &&
      boardView.includes("Never apply mid pick") &&
      boardView.includes("plyInflight") &&
      boardView.includes("Stuck ply attr must not defer 2D↔3D forever") &&
      boardView.includes("PLY_IDLE_FAIL_OPEN_MS = 5500"),
    "useBoardViewMode defers cross-tab 2D↔3D sync mid pick→put (chain-safe fail-open)",
  );
}
{
  const flight = read("apps/mobile/lib/features/game/board_ply_flight.dart");
  const shell = read("apps/mobile/lib/features/game/smart_board_shell.dart");
  assert(
    flight.includes("idleTimeout") &&
      flight.includes("milliseconds: 5500") &&
      !flight.includes("if (isActive) clear()") &&
      flight.includes("never clears the attr") &&
      shell.includes("BoardPlyFlight.idleTimeout") &&
      shell.includes("_syncPortal(force: force)") &&
      shell.includes("if (BoardPlyFlight.isActive) BoardPlyFlight.clear()") &&
      shell.includes("addPostFrameCallback") &&
      shell.includes("Immediate clear() raced dispose leave()") &&
      shell.indexOf("_syncPortal(force: force)") <
        shell.indexOf("if (BoardPlyFlight.isActive) BoardPlyFlight.clear()") &&
      matchPage.includes("BoardPlyFlight.clear()") &&
      spectatePage.includes("BoardPlyFlight.clear()"),
    "flutter ply gate fail-open wait + portal clear after remount + enter clear",
  );
}
assert(
  web2d.includes("holdSyncSinceRef") &&
    web3d.includes("holdSyncSinceRef") &&
    web2d.includes("performance.now() - since > 64") &&
    web3d.includes("performance.now() - since > 64"),
  "web 2D/3D holdSync-only stall recover has startup grace (no pre-startNext snap)",
);
assert(
  read("apps/web/src/components/ads/InMatchAdOverlay.tsx").includes("runWhenPlyIdle") &&
    read("apps/web/src/components/ads/InMatchAdOverlay.tsx").includes("in-match-ad") &&
    read("apps/mobile/lib/features/ads/in_match_ad_overlay.dart").includes(
      "BoardPlyFlight.waitUntilIdle",
    ),
  "in-match ads defer open until pick→put lands (no mid-flight overlay freeze)",
);
assert(
  liveHub.includes('setBoardView("2d")') &&
    spectateHub.includes('setBoardView("3d")') &&
    liveHub.includes("runWhenPlyIdle") &&
    spectateHub.includes("runWhenPlyIdle"),
  "web live+spectate defer flip/replay/2D↔3D mid pick→put (runWhenPlyIdle)",
);
{
  const boardView = read("apps/web/src/lib/board-view.ts");
  assert(
    boardView.includes("export function runWhenPlyIdle") &&
      boardView.includes("timeoutMs = PLY_IDLE_FAIL_OPEN_MS") &&
      boardView.includes("plyIdlePending") &&
      boardView.includes("latest fn wins") &&
      boardView.includes("Never hard-drop the click mid pick"),
    "runWhenPlyIdle coalesces by key + useBoardViewMode defers writes (chain-safe fail-open)",
  );
}
assert(
  liveHub.includes('"live-flip"') &&
    liveHub.includes('"live-replay"') &&
    spectateHub.includes('"spectate-flip"') &&
    spectateHub.includes('"spectate-replay"') &&
    matchPage.includes("_manualFlipWhenIdle") &&
    spectatePage.includes("_manualFlipWhenIdle") &&
    matchPage.includes("_selectReplayWhenIdle") &&
    spectatePage.includes("_selectReplayWhenIdle"),
  "web+flutter coalesce flip/replay deferred taps (no stacked post-land fire)",
);
assert(
  liveHub.includes("flip remaps screen coords mid-flight") &&
    spectateHub.includes("flip remaps screen coords mid-flight") &&
    liveHub.includes("Sticky orientation") &&
    liveHub.includes("Stuck ply attr must not defer flip forever") &&
    liveHub.includes("PLY_IDLE_FAIL_OPEN_MS") &&
    matchPage.includes("flip remaps screen coords mid-flight") &&
    spectatePage.includes("flip remaps screen coords mid-flight") &&
    matchPage.includes("_flushFlipWhenIdle") &&
    matchPage.includes("BoardPlyFlight.isActive") &&
    matchPage.includes("BoardPlyFlight.waitUntilIdle"),
  "web+flutter gate flipBoard mid pick→put (sticky seatFlip + chain-safe fail-open)",
);
assert(
  web2d.includes("Orphaned data-dama-ply-inflight") &&
    web3d.includes("Orphaned data-dama-ply-inflight") &&
    web2d.includes("markPlyInflight(false)") &&
    web3d.includes("markPlyInflight(false)"),
  "web 2D/3D stall interval clears orphaned ply-inflight attr when idle",
);
assert(
  matchPage.includes("_setBoardView") &&
    spectatePage.includes("_setBoardView") &&
    matchPage.includes("BoardPlyFlight.waitUntilIdle") &&
    spectatePage.includes("BoardPlyFlight.waitUntilIdle") &&
    matchPage.includes("Stuck gate must not drop the tap forever") &&
    spectatePage.includes("Stuck gate must not drop the tap forever") &&
    matchPage.includes("Prefs hydrate remounts") &&
    spectatePage.includes("Prefs hydrate remounts"),
  "flutter match+spectate defer 2D↔3D/flip/replay + prefs hydrate (fail-open)",
);
{
  const shell = read("apps/mobile/lib/features/game/smart_board_shell.dart");
  assert(
    shell.includes("_toggleWhenIdle") &&
      shell.includes("Stuck gate must not drop the tap forever") &&
      shell.includes("BoardPlyFlight.waitUntilIdle"),
    "flutter SmartBoardShell FAB toggle defers mid pick→put (fail-open)",
  );
}
assert(
  matchPage.includes("_latchTerminalReplayWhenIdle") &&
    matchPage.includes("Defer replay latch until pick") &&
    matchPage.includes("await BoardPlyFlight.waitUntilIdle()") &&
    matchPage.includes("Stuck BoardPlyFlight must not") &&
    matchPage.includes("poll forever") &&
    liveHub.includes("runWhenPlyIdle(() => setReplayIndex") &&
    (spectateHub.includes("runWhenPlyIdle(() => setReplayIndex") ||
      spectateHub.includes("() => setReplayIndex(idx)")),
  "flutter terminal replay fail-open + web history scrub gated mid pick→put",
);
{
  const shell = read("apps/mobile/lib/features/game/smart_board_shell.dart");
  const flight = read("apps/mobile/lib/features/game/board_ply_flight.dart");
  assert(
    shell.includes("EdgeInsets.zero") &&
      shell.includes("Always keep Padding in the tree") &&
      shell.includes("return _boardColumn(expanded: false)"),
    "flutter SmartBoardShell stable Padding + same tree desktop/compact",
  );
  assert(
    flight.includes("class BoardPlyFlight") &&
      flight.includes("waitUntilIdle") &&
      shell.includes("BoardPlyFlight.isActive") &&
      shell.includes("_deferPortalUntilPlyIdle") &&
      shell.includes("Opening overlay remounts inline→portal") &&
      shell.includes("holdOverlayForPly") &&
      fl2d.includes("_bindFlightActive") &&
      fl3d.includes("_bindFlightActive"),
    "flutter ply-flight defers overlay open/close + compact leave mid pick→put",
  );
}

await liveApiCheck();
console.log("E2E_BOARD_PLY_FREEZE_FLICKER_OK");
