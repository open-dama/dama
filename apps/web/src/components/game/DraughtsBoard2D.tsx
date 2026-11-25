"use client";

/**
 * Flat Chess.com-style draughts board (default view).
 * Same interaction + move_history animation contract as DraughtsScene3D
 * (pick→hold→travel→land, legal/select/must cues, last-ply highlights).
 */

import { BoardSquareCoords } from "@/components/game/BoardSquareCoords";
import { PalacePieceMark } from "@/components/game/PalacePieceMark";
import { BoardAreaSkeleton } from "@/components/ui/BoardColumnSkeleton";
import { pieceLandKind, playPieceLandSound, unlockGameAudio } from "@/lib/audio-notify";
import { cn } from "@/lib/utils";
import type { BoardCell, LegalMove, MoveHistoryEntry } from "@/types/game";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

type BoardGrid = BoardCell[][];

export type DraughtsBoard2DProps = {
  board: BoardGrid;
  legalMoves: LegalMove[];
  selected: [number, number] | null;
  onSelectSquare: (row: number, col: number) => void;
  interactive?: boolean;
  mustContinue?: [number, number] | null;
  flipBoard?: boolean;
  moveHistory?: MoveHistoryEntry[];
  yourPlayer?: 1 | 2 | null;
  replayMode?: boolean;
  illegalShakeKey?: number;
  /** Called when a ply animation lands on board_after (same as 3D). */
  onPlyAnimated?: (boardAfter: BoardGrid) => void;
  className?: string;
};

const HOLD_PHASE_END = 0.34;
const LAND_PHASE_START = 0.72;
/** Snappy product timing (3D parity) - same for own + opponent plies. */
const MOVE_DURATION_MIN = 0.34;
const CAPTURE_DURATION_MIN = 0.44;
const DURATION_PER_SQUARE = 0.09;
const MOVE_DURATION_MAX = 0.82;

type ActiveAnimation = {
  from: [number, number];
  to: [number, number];
  captures: [number, number][];
  player: 1 | 2;
  isKing: boolean;
  /** Man became king this ply (Chess.com promote SFX). */
  isPromotion: boolean;
  progress: number;
  isCapture: boolean;
  duration: number;
  boardAfter?: BoardGrid;
  boardApplied?: boolean;
  /** One land SFX per animation (land phase + finish must not double). */
  soundPlayed?: boolean;
  /** Prevent double finishAndAdvance in one rAF turn. */
  finishQueued?: boolean;
  /** performance.now() when finish was queued - stall recovery gate. */
  finishQueuedAt?: number;
};

function isDark(row: number, col: number) {
  return (row + col) % 2 === 1;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function moveDurationSeconds(
  from: [number, number],
  to: [number, number],
  isCapture: boolean,
): number {
  const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const base = isCapture ? CAPTURE_DURATION_MIN : MOVE_DURATION_MIN;
  return Math.min(MOVE_DURATION_MAX, base + dist * DURATION_PER_SQUARE);
}

/** Content equality (Flutter `_boardsEqual` parity). Strict `k`/`p` identity used to
 *  fail keep-landed / remount-sync and rewind pieces mid put-down. */
function boardsEqual(left: BoardGrid | undefined, right: BoardGrid | undefined): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  for (let row = 0; row < left.length; row++) {
    const lr = left[row];
    const rr = right[row];
    if (!lr || !rr || lr.length !== rr.length) return false;
    for (let col = 0; col < lr.length; col++) {
      const a = lr[col];
      const b = rr[col];
      if (!a && !b) continue;
      if (!a || !b || Number(a.p) !== Number(b.p) || Boolean(a.k) !== Boolean(b.k)) {
        return false;
      }
    }
  }
  return true;
}

function animationFromHistoryEntry(
  entry: MoveHistoryEntry,
  yourPlayer: number | null | undefined,
  prevBoard?: BoardGrid | null,
): ActiveAnimation | null {
  if (!entry?.from || !entry?.to) return null;
  const from = entry.from;
  const to = entry.to;
  const captures = (entry.captures ?? []) as [number, number][];
  const dest = entry.board_after?.[to[0]]?.[to[1]];
  const player = (entry.player === 2 || dest?.p === 2 ? 2 : 1) as 1 | 2;
  const isCapture = captures.length > 0;
  const wasKing = Boolean(prevBoard?.[from[0]]?.[from[1]]?.k);
  const isPromotion = Boolean(dest?.k) && !wasKing;
  return {
    from,
    to,
    captures,
    player,
    isKing: Boolean(dest?.k),
    isPromotion,
    progress: 0,
    isCapture,
    duration: moveDurationSeconds(from, to, isCapture),
    boardAfter: entry.board_after,
  };
}

function animationFromBoardDiff(
  prev: BoardGrid,
  next: BoardGrid,
  legalHint?: LegalMove[],
): ActiveAnimation | null {
  if (!prev.length || !next.length || prev.length !== next.length) return null;
  const size = prev.length;
  const emptied: [number, number][] = [];
  const filled: [number, number][] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const a = prev[r]?.[c] ?? null;
      const b = next[r]?.[c] ?? null;
      if (a && !b) emptied.push([r, c]);
      if (!a && b) filled.push([r, c]);
      if (a && b && (Number(a.p) !== Number(b.p) || Boolean(a.k) !== Boolean(b.k))) {
        emptied.push([r, c]);
        filled.push([r, c]);
      }
    }
  }
  if (filled.length !== 1) return null;
  const to = filled[0];
  if (!to) return null;
  const dest = next[to[0]]?.[to[1]];
  if (!dest) return null;
  let from: [number, number] | null = null;
  const captures: [number, number][] = [];
  for (const sq of emptied) {
    const was = prev[sq[0]]?.[sq[1]];
    if (!was) continue;
    if (was.p === dest.p) from = sq;
    else captures.push(sq);
  }
  if (!from && legalHint?.length) {
    const match = legalHint.find((m) => m.to[0] === to[0] && m.to[1] === to[1] && m.from);
    if (match) {
      from = match.from;
      if (match.captures?.length) captures.push(...match.captures);
    }
  }
  if (!from) return null;
  const isCapture = captures.length > 0;
  const wasKing = Boolean(prev[from[0]]?.[from[1]]?.k);
  const isPromotion = Boolean(dest.k) && !wasKing;
  return {
    from,
    to,
    captures,
    player: (dest.p === 2 ? 2 : 1) as 1 | 2,
    isKing: Boolean(dest.k),
    isPromotion,
    progress: 0,
    isCapture,
    duration: moveDurationSeconds(from, to, isCapture),
    boardAfter: next,
  };
}

/** Visual travel progress 0→1 across the board (after pick/hold). */
function travelT(progress: number): number {
  if (progress < HOLD_PHASE_END) return 0;
  if (progress >= LAND_PHASE_START) return 1;
  return easeInOutCubic((progress - HOLD_PHASE_END) / (LAND_PHASE_START - HOLD_PHASE_END));
}

function PieceDisc({
  player,
  isKing,
  className,
  style,
}: {
  player: 1 | 2;
  isKing: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  // Neo-pattern silhouette fills the square (not a stamped disc).
  return (
    <span
      className={cn(
        "relative z-[1] block h-[98%] w-[98%] drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]",
        className,
      )}
      style={style}
      aria-hidden
    >
      <PalacePieceMark player={player} isKing={isKing} className="inset-0" />
    </span>
  );
}

export default function DraughtsBoard2D({
  board,
  legalMoves,
  selected,
  onSelectSquare,
  interactive = true,
  mustContinue = null,
  flipBoard = false,
  moveHistory = [],
  yourPlayer = null,
  replayMode = false,
  illegalShakeKey = 0,
  onPlyAnimated,
  className,
}: DraughtsBoard2DProps) {
  const size = board.length;
  const [shake, setShake] = useState(false);
  const [renderBoard, setRenderBoard] = useState<BoardGrid>(board);
  const [activeFly, setActiveFly] = useState<ActiveAnimation | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const animationRef = useRef<ActiveAnimation | null>(null);
  const queueRef = useRef<ActiveAnimation[]>([]);
  const prevHistoryLen = useRef(moveHistory.length);
  const holdSyncRef = useRef(false);
  /** performance.now() when holdSync rose - stall recover needs a short grace. */
  const holdSyncSinceRef = useRef<number | null>(null);

  /**
   * DOM-only ply gate (never React-controlled). A JSX attr tied to state can be
   * wiped on an unrelated re-render before setState flushes → remount mid-fly.
   */
  const markPlyInflight = useCallback((active: boolean) => {
    const el = hostRef.current;
    if (!el) return;
    if (active) el.setAttribute("data-dama-ply-inflight", "");
    else el.removeAttribute("data-dama-ply-inflight");
  }, []);
  const legalHintRef = useRef(legalMoves);
  const onPlyAnimatedRef = useRef(onPlyAnimated);
  const replayModeRef = useRef(replayMode);
  const moveHistoryRef = useRef(moveHistory);
  const rafRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  /** Last RAF tick that advanced the flight (dead-RAF stall detect). */
  const lastFrameAtRef = useRef<number | null>(null);
  const loopRunningRef = useRef(false);
  const ensureAnimLoopRef = useRef<() => void>(() => {});
  const flyElRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef(size);
  const flipRef = useRef(flipBoard);
  /** Cached plane side (px) - remeasure only on resize so pick→put never jitters. */
  const planeSideRef = useRef(0);
  /** Latest forceRecoverStall - wired after commitBoardAfter exists. */
  const forceRecoverStallRef = useRef<() => void>(() => {});
  sizeRef.current = size;
  flipRef.current = flipBoard;
  const historyPresent = moveHistory.length > 0;

  useEffect(() => {
    legalHintRef.current = legalMoves;
  }, [legalMoves]);

  useEffect(() => {
    onPlyAnimatedRef.current = onPlyAnimated;
  }, [onPlyAnimated]);

  useEffect(() => {
    replayModeRef.current = replayMode;
  }, [replayMode]);

  useEffect(() => {
    moveHistoryRef.current = moveHistory;
  }, [moveHistory]);

  useEffect(() => {
    if (!illegalShakeKey) return;
    setShake(true);
    const t = window.setTimeout(() => setShake(false), 320);
    return () => window.clearTimeout(t);
  }, [illegalShakeKey]);

  const measurePlaneSide = useCallback(() => {
    const el = flyElRef.current;
    const plane = el?.parentElement;
    if (!plane) return;
    const rect = plane.getBoundingClientRect();
    const side = Math.min(rect.width, rect.height);
    if (side >= 1) planeSideRef.current = side;
  }, []);

  useLayoutEffect(() => {
    measurePlaneSide();
    const plane = flyElRef.current?.parentElement;
    if (!plane || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measurePlaneSide());
    ro.observe(plane);
    return () => ro.disconnect();
  }, [measurePlaneSide]);

  /** Drive fly piece via DOM (3D-stable px math) - never setState every frame. */
  const applyFlyDom = useCallback(
    (anim: ActiveAnimation, progress: number) => {
      const el = flyElRef.current;
      const sz = sizeRef.current;
      if (!el || sz <= 0) return;
      let side = planeSideRef.current;
      if (side < 1) {
        measurePlaneSide();
        side = planeSideRef.current;
      }
      if (side < 1) return;
      const t = travelT(progress);
      const flip = flipRef.current;
      const fromR = flip ? sz - 1 - anim.from[0] : anim.from[0];
      const fromC = flip ? sz - 1 - anim.from[1] : anim.from[1];
      const toR = flip ? sz - 1 - anim.to[0] : anim.to[0];
      const toC = flip ? sz - 1 - anim.to[1] : anim.to[1];
      const vr = fromR + (toR - fromR) * t;
      const vc = fromC + (toC - fromC) * t;
      const cell = side / sz;
      // Resting piece sits in an h/w-[78%] cell wrapper - fly box must match that
      // (extra 0.98 made pick→put jump smaller than the resting disc).
      const piece = cell * 0.78;
      el.style.left = `${vc * cell + cell / 2}px`;
      el.style.top = `${vr * cell + cell / 2}px`;
      el.style.width = `${piece}px`;
      el.style.height = `${piece}px`;
      // Constant 1. A 1→1.035→1 pulse re-rasterizes drop-shadow and flickers on pick and put.
      // translate only - identity scale() still promoted a layer that flickered on put.
      el.style.transform = "translate3d(-50%, -50%, 0)";
    },
    [measurePlaneSide],
  );

  const commitBoardAfter = useCallback((anim: ActiveAnimation) => {
    const after = anim.boardAfter;
    if (!after?.length) return;
    if (!anim.boardApplied) {
      anim.boardApplied = true;
      setRenderBoard((current) => (boardsEqual(current, after) ? current : after));
      onPlyAnimatedRef.current?.(after);
    }
    // Put-down only once per ply - Chess.com move / capture / promote samples.
    if (!anim.soundPlayed && !replayModeRef.current) {
      anim.soundPlayed = true;
      void playPieceLandSound(
        pieceLandKind({ isCapture: anim.isCapture, isPromotion: anim.isPromotion }),
      );
    }
  }, []);

  /**
   * Stall / hitch recovery: clear fly state BUT always sync parent to board_after
   * first. Clearing holdSync alone left game.board behind history → boardPlySynced
   * stuck false and the board looked frozen mid-game.
   */
  const forceRecoverStall = useCallback(() => {
    const anim = animationRef.current;
    if (anim?.boardAfter?.length) {
      // If land already applied locally, commitBoardAfter skips parent notify.
      // Stall clear must still sync parent (missed callback → freeze until 2.5s).
      // Parent boardsEqual no-ops when already synced (no pick→put churn).
      const alreadyApplied = anim.boardApplied;
      commitBoardAfter(anim);
      if (alreadyApplied) {
        onPlyAnimatedRef.current?.(anim.boardAfter);
      }
    } else {
      const last = moveHistoryRef.current.at(-1);
      const snap = last?.board_after;
      if (snap?.length) {
        // Skip identity churn when already landed (avoids resting remount flicker).
        setRenderBoard((current) => (boardsEqual(current, snap) ? current : snap));
        onPlyAnimatedRef.current?.(snap);
      }
    }
    animationRef.current = null;
    holdSyncRef.current = false;
    holdSyncSinceRef.current = null;
    queueRef.current = [];
    // No flushSync here - forceRecover also runs from unmount layout cleanup.
    setActiveFly(null);
    markPlyInflight(false);
    loopRunningRef.current = false;
    lastTsRef.current = null;
    lastFrameAtRef.current = null;
  }, [commitBoardAfter, markPlyInflight]);

  forceRecoverStallRef.current = forceRecoverStall;

  // Mid-game stall recovery: holdSync with no active fly must not freeze the board.
  // 3D parity: never holdSync-recover while animationRef/queue/activeFly/loop are busy
  // (stale activeFly alone used to remount resting pieces → pick→put flicker).
  useEffect(() => {
    const id = window.setInterval(() => {
      // Dead RAF while a fly is active (tab discard / WebView dropped the callback).
      // Restart first; if still dead after another 2s, land-sync like 3D forceRecover
      // so boardPlySynced cannot stick false while RAF never revives.
      if (
        holdSyncRef.current &&
        animationRef.current &&
        typeof document !== "undefined" &&
        !document.hidden
      ) {
        const last = lastFrameAtRef.current;
        if (last != null && performance.now() - last > 2000) {
          if (performance.now() - last > 4000) {
            forceRecoverStallRef.current();
            return;
          }
          window.cancelAnimationFrame(rafRef.current);
          loopRunningRef.current = false;
          lastTsRef.current = null;
          ensureAnimLoopRef.current();
          return;
        }
      }
      if (animationRef.current || queueRef.current.length > 0 || loopRunningRef.current) {
        return;
      }
      // holdSync rise + startNext are same-turn; grace so the 250ms tick cannot
      // forceRecover before animationRef binds (pick→put snap flicker).
      if (holdSyncRef.current) {
        const since = holdSyncSinceRef.current;
        if (since == null || performance.now() - since > 64) {
          forceRecoverStallRef.current();
        }
        return;
      }
      // Orphaned data-dama-ply-inflight (missed clear) freezes portal/flip/2D↔3D.
      markPlyInflight(false);
    }, 250);
    return () => window.clearInterval(id);
  }, [markPlyInflight]);

  const ensureAnimLoop = useCallback(() => {
    if (loopRunningRef.current) return;
    loopRunningRef.current = true;
    const tick = (ts: number) => {
      const anim = animationRef.current;
      if (!anim) {
        loopRunningRef.current = false;
        lastTsRef.current = null;
        lastFrameAtRef.current = null;
        return;
      }
      // Tab/ad blur: freeze progress (Chess.com-style) so return does not fast-forward.
      // Keep stall clock alive - otherwise last ages while hidden and tab-return
      // false-triggers forceRecover (mid pick→put snap/flicker).
      if (typeof document !== "undefined" && document.hidden) {
        lastTsRef.current = null;
        lastFrameAtRef.current = performance.now();
        rafRef.current = window.requestAnimationFrame(tick);
        return;
      }
      lastFrameAtRef.current = performance.now();
      const prevTs = lastTsRef.current ?? ts;
      const delta = Math.min(0.05, (ts - prevTs) / 1000);
      lastTsRef.current = ts;
      const prev = anim.progress;
      anim.progress = Math.min(1, anim.progress + delta / anim.duration);
      applyFlyDom(anim, anim.progress);
      if (prev < LAND_PHASE_START && anim.progress >= LAND_PHASE_START) {
        commitBoardAfter(anim);
      }
      if (anim.progress >= 1) {
        if (!anim.finishQueued) {
          anim.finishQueued = true;
          anim.finishQueuedAt = performance.now();
          try {
            finishAndAdvanceRef.current();
          } catch {
            // Never leave the board stuck with finishQueued + active fly (prod hitch path).
            forceRecoverStallRef.current();
            return;
          }
        } else if (
          animationRef.current === anim &&
          performance.now() - (anim.finishQueuedAt ?? 0) > 500
        ) {
          // finishQueued but still active after grace - force recover (mid-game stall).
          forceRecoverStallRef.current();
          return;
        }
      }
      if (animationRef.current) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        loopRunningRef.current = false;
        lastTsRef.current = null;
      }
    };
    rafRef.current = window.requestAnimationFrame(tick);
  }, [applyFlyDom, commitBoardAfter]);

  ensureAnimLoopRef.current = ensureAnimLoop;

  const finishAndAdvanceRef = useRef<() => void>(() => {});

  const startNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      // Never clear holdSync without a parent land sync (freeze root).
      const dangling = animationRef.current;
      // If LAND_PHASE already applied locally, commitBoardAfter skips parent notify.
      // Empty clear must still re-notify (missed callback → boardPlySynced freeze).
      // Parent boardsEqual no-ops when synced (no pick→put remount flicker).
      // History fallback only when boardAfter was missing on the fly.
      if (dangling?.boardAfter?.length) {
        const alreadyApplied = dangling.boardApplied;
        commitBoardAfter(dangling);
        if (alreadyApplied) {
          onPlyAnimatedRef.current?.(dangling.boardAfter);
        }
      } else {
        const last = moveHistoryRef.current.at(-1);
        const snap = last?.board_after;
        if (snap?.length) {
          setRenderBoard((current) => (boardsEqual(current, snap) ? current : snap));
          onPlyAnimatedRef.current?.(snap);
        }
      }
      animationRef.current = null;
      holdSyncRef.current = false;
      holdSyncSinceRef.current = null;
      setActiveFly(null);
      markPlyInflight(false);
      lastTsRef.current = null;
      lastFrameAtRef.current = null;
      return;
    }
    animationRef.current = next;
    // Seed stall clock (Flutter _lastAnimAdvanceMs). If RAF never ticks after
    // ply start, last stayed null and Dead-RAF recover never armed → mid-air freeze.
    lastFrameAtRef.current = performance.now();
    markPlyInflight(true);
    // Flutter _bindFlightActive parity: hide origins + seed fly DOM before paint.
    // RAF finish→startNext is outside useLayoutEffect; without flushSync the next
    // paint kept stale hiddenKeys for one frame (resting + fly double = flicker).
    flushSync(() => {
      setActiveFly(next);
    });
    applyFlyDom(next, 0);
    lastTsRef.current = null;
    ensureAnimLoop();
  }, [applyFlyDom, commitBoardAfter, ensureAnimLoop, markPlyInflight]);

  const finishAndAdvance = useCallback(() => {
    const finished = animationRef.current;
    if (finished) commitBoardAfter(finished);
    // Always route through startNext (empty path owns holdSync clear + parent sync).
    // Bare holdSync=false here skipped history fallback when boardAfter was missing.
    startNext();
  }, [commitBoardAfter, startNext]);

  finishAndAdvanceRef.current = finishAndAdvance;

  // Portal/2D↔3D/shell remount mid pick→put: land-sync + gate clear in layout
  // (before paint). useEffect ran after layout gates saw idle → remount flicker.
  useLayoutEffect(() => {
    return () => {
      loopRunningRef.current = false;
      window.cancelAnimationFrame(rafRef.current);
      forceRecoverStallRef.current();
    };
  }, []);

  // Tab discard / long background can drop the pending RAF while loopRunningRef
  // stays true - ensureAnimLoop then no-ops and the piece freezes mid pick→put.
  useEffect(() => {
    const onVis = () => {
      if (typeof document === "undefined" || document.hidden) return;
      if (!animationRef.current) return;
      window.cancelAnimationFrame(rafRef.current);
      loopRunningRef.current = false;
      lastTsRef.current = null;
      // Re-arm stall clock on return (hide may have aged last without a dead loop).
      lastFrameAtRef.current = performance.now();
      ensureAnimLoop();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [ensureAnimLoop]);

  useLayoutEffect(() => {
    if (activeFly) applyFlyDom(activeFly, activeFly.progress);
  }, [activeFly, applyFlyDom]);

  useLayoutEffect(() => {
    if (!size) return;

    if (replayMode) {
      // Rising into replay mid pick→put: land-sync parent before clearing fly
      // (bare clear snapped put-down and left boardPlySynced false).
      if (animationRef.current || holdSyncRef.current || queueRef.current.length > 0) {
        forceRecoverStallRef.current();
      }
      setRenderBoard((current) => (boardsEqual(current, board) ? current : board));
      return;
    }

    const len = moveHistory.length;
    if (len === 0) {
      prevHistoryLen.current = 0;
      // 3D isAnimating parity: activeFly/loop lag animationRef clear by a frame.
      if (
        !animationRef.current &&
        queueRef.current.length === 0 &&
        !activeFly &&
        !loopRunningRef.current
      ) {
        holdSyncRef.current = false;
        holdSyncSinceRef.current = null;
        markPlyInflight(false);
        // Parent may pass a new board ref each render (clock/WS) - skip remount.
        setRenderBoard((current) => (boardsEqual(current, board) ? current : board));
      }
      return;
    }

    if (len < prevHistoryLen.current) {
      // History shrink (scrub / reset) mid-fly: same land-sync-before-clear as replay.
      if (animationRef.current || holdSyncRef.current || queueRef.current.length > 0) {
        forceRecoverStallRef.current();
      }
      prevHistoryLen.current = len;
      setRenderBoard((current) => (boardsEqual(current, board) ? current : board));
      return;
    }

    if (len > prevHistoryLen.current) {
      const start = prevHistoryLen.current;
      const newEntries = moveHistory.slice(start);
      prevHistoryLen.current = len;
      holdSyncRef.current = true;
      holdSyncSinceRef.current = performance.now();
      // Gate remounts from the holdSync rise - startNext may still be a frame away.
      markPlyInflight(true);
      for (let i = 0; i < newEntries.length; i++) {
        const entry = newEntries[i];
        if (!entry) continue;
        const prevBoard =
          i === 0
            ? start > 0
              ? moveHistory[start - 1]?.board_after
              : undefined
            : newEntries[i - 1]?.board_after;
        const anim = animationFromHistoryEntry(entry, yourPlayer, prevBoard);
        if (anim) queueRef.current.push(anim);
      }
      if (!animationRef.current) {
        // History grew but nothing to fly (bad/missing from-to): sync immediately
        // so boardPlySynced cannot stick false and freeze input.
        if (queueRef.current.length === 0) {
          const last = moveHistory.at(-1);
          const snap = last?.board_after;
          if (snap?.length) {
            setRenderBoard((current) => (boardsEqual(current, snap) ? current : snap));
            onPlyAnimatedRef.current?.(snap);
          }
          holdSyncRef.current = false;
          holdSyncSinceRef.current = null;
          markPlyInflight(false);
        } else {
          startNext();
        }
      }
    }
  }, [activeFly, board, size, moveHistory, replayMode, yourPlayer, startNext, markPlyInflight]);

  useLayoutEffect(() => {
    if (!size || replayMode) return;
    // 3D `isAnimating` parity: do not rewrite renderBoard while the fly layer is
    // still painted (animationRef can clear a frame before activeFly flushes).
    if (
      holdSyncRef.current ||
      activeFly ||
      animationRef.current ||
      queueRef.current.length > 0 ||
      loopRunningRef.current
    ) {
      return;
    }
    if (historyPresent) {
      const last = moveHistory.at(-1);
      const completed = last?.board_after;
      // Remount mid pick→put (e.g. 2D↔3D): history already at tip so no ply queues.
      // Sync parent immediately - otherwise boardPlySynced freezes until 2.5s safety.
      if (completed?.length && !boardsEqual(board, completed)) {
        setRenderBoard((current) => (boardsEqual(current, completed) ? current : completed));
        onPlyAnimatedRef.current?.(completed);
        return;
      }
      setRenderBoard((current) => {
        if (boardsEqual(current, board)) return current;
        if (completed && boardsEqual(current, completed) && !boardsEqual(board, completed)) {
          return current;
        }
        return board;
      });
      return;
    }
    // History-grow parity: enqueue + startNext outside the updater so the first
    // paint already has activeFly/hiddenKeys (startNext-inside-updater left one
    // frame of resting+fly = pick→put flicker).
    let shouldStart = false;
    setRenderBoard((current) => {
      if (boardsEqual(current, board)) return current;
      const anim = animationFromBoardDiff(current, board, legalHintRef.current);
      if (!anim) return board;
      holdSyncRef.current = true;
      holdSyncSinceRef.current = performance.now();
      markPlyInflight(true);
      queueRef.current.push(anim);
      if (!animationRef.current) shouldStart = true;
      return current;
    });
    if (shouldStart) startNext();
  }, [activeFly, board, size, moveHistory, historyPresent, replayMode, startNext, markPlyInflight]);

  // Suppress select/legal/must while the ply fly is up. Parent flips boardPlySynced
  // at LAND_PHASE (~0.72) so cues would otherwise flash mid put-down.
  const cueSelected = activeFly ? null : selected;
  const cueLegalMoves = activeFly ? ([] as LegalMove[]) : legalMoves;
  const cueMustContinue = activeFly ? null : mustContinue;

  const legalTargets = useMemo(() => {
    const set = new Set<string>();
    for (const m of cueLegalMoves) {
      if (cueSelected) {
        if (m.from[0] === cueSelected[0] && m.from[1] === cueSelected[1]) {
          set.add(`${m.to[0]},${m.to[1]}`);
        }
      }
    }
    return set;
  }, [cueLegalMoves, cueSelected]);

  /** Same as 3D `legalFromSquares` - used for square fill + under-piece ring. */
  const legalOrigins = useMemo(() => {
    const set = new Set<string>();
    if (cueSelected) return set;
    for (const m of cueLegalMoves) {
      set.add(`${m.from[0]},${m.from[1]}`);
    }
    return set;
  }, [cueLegalMoves, cueSelected]);

  const hiddenKeys = useMemo(() => {
    const anim = activeFly;
    // Hide for the whole flight; progress is DOM-driven so do not depend on per-frame state.
    if (!anim) return new Set<string>();
    const set = new Set<string>([`${anim.from[0]},${anim.from[1]}`, `${anim.to[0]},${anim.to[1]}`]);
    for (const c of anim.captures) set.add(`${c[0]},${c[1]}`);
    return set;
  }, [activeFly]);

  const [lastMoveToken, setLastMoveToken] = useState("");
  useEffect(() => {
    const sync = () => {
      setLastMoveToken(
        getComputedStyle(document.documentElement).getPropertyValue("--dama-last-move").trim(),
      );
    };
    sync();
    window.addEventListener("dama-board-palette", sync);
    return () => window.removeEventListener("dama-board-palette", sync);
  }, []);

  const lastMoveKeys = useMemo(() => {
    // Fail-closed: same gate as DraughtsScene3D - no invent highlight without theme token.
    if (!lastMoveToken || replayMode || activeFly || moveHistory.length === 0) return null;
    const last = moveHistory.at(-1);
    if (!last?.from || !last?.to) return null;
    return {
      from: `${last.from[0]},${last.from[1]}`,
      to: `${last.to[0]},${last.to[1]}`,
    };
  }, [activeFly, lastMoveToken, moveHistory, replayMode]);

  if (size <= 0) {
    return <BoardAreaSkeleton />;
  }

  const cells: { row: number; col: number }[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const row = flipBoard ? size - 1 - r : r;
      const col = flipBoard ? size - 1 - c : c;
      cells.push({ row, col });
    }
  }

  const display = renderBoard.length ? renderBoard : board;
  // 3D parity: only lock own piece while still in the air; unlock at land commit.
  const ownAirLocked = Boolean(
    activeFly && yourPlayer != null && activeFly.player === yourPlayer && !activeFly.boardApplied,
  );

  return (
    <div
      ref={hostRef}
      className={cn(
        "relative aspect-square w-full overflow-hidden touch-none overscroll-none",
        // Opacity pulse flickered every piece on reject; match 3D translate-only shake.
        shake && "dama-board-reject",
        className,
      )}
      style={{ touchAction: "none" }}
      data-dama-board-plane=""
      // biome-ignore lint/a11y/useSemanticElements: interactive board uses grid ARIA on div layout
      role="grid"
      aria-rowcount={size}
      aria-colcount={size}
      onPointerDown={() => {
        // Unlock on pick (not only on put) so land SFX works after ads / first gesture.
        void unlockGameAudio();
      }}
    >
      {/* Opaque board plane under cells - same continuous surface idea as 3D mesh. */}
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          backgroundColor: "var(--dama-board-dark)",
        }}
      >
        {cells.map(({ row, col }) => {
          const cell = display[row]?.[col] ?? null;
          const dark = isDark(row, col);
          const key = `${row},${col}`;
          const isSelected = cueSelected?.[0] === row && cueSelected?.[1] === col;
          const isMust = cueMustContinue?.[0] === row && cueMustContinue?.[1] === col;
          const isLegalTarget = legalTargets.has(key);
          const isLastFrom = lastMoveKeys?.from === key;
          const isLastTo = lastMoveKeys?.to === key;
          const isLastMove = isLastFrom || isLastTo;
          // Select / dest / must / movable-from use brand highlight; last ply uses Chess yellow.
          const squareHighlighted =
            isSelected || isLegalTarget || isMust || (!cueSelected && legalOrigins.has(key));
          const hidePiece = hiddenKeys.has(key);
          const canClick = Boolean(interactive && dark && !ownAirLocked);
          // Always opaque fill (3D meshStandardMaterial parity). The old quiet-square
          // `background:` shorthand cleared background-color to transparent, so
          // subpixel seams between lime highlights and neighbors composited against
          // the near-black card and read as black borders around cues.
          const squareFill = squareHighlighted
            ? "var(--dama-board-highlight)"
            : isLastMove
              ? "var(--dama-last-move)"
              : dark
                ? "var(--dama-board-dark)"
                : "var(--dama-board-light)";
          const quietShade = !squareHighlighted && !isLastMove;

          return (
            <button
              key={key}
              type="button"
              // biome-ignore lint/a11y/useSemanticElements: square buttons act as grid cells
              role="gridcell"
              aria-selected={isSelected || undefined}
              disabled={!canClick}
              className={cn(
                // Explicit square cells - no UA/global button border or radius.
                // Quiet squares use 3D-parity lighting (meshStandardMaterial soft shade).
                "relative flex appearance-none items-center justify-center rounded-none border-0 outline-none focus-visible:outline-none",
                canClick && "cursor-pointer",
                !canClick && "cursor-default",
              )}
              style={{
                backgroundColor: squareFill,
                ...(quietShade
                  ? {
                      backgroundImage: dark
                        ? "linear-gradient(160deg, color-mix(in srgb, var(--dama-board-dark) 82%, white) 0%, var(--dama-board-dark) 42%, color-mix(in srgb, var(--dama-board-dark) 88%, black) 100%)"
                        : "linear-gradient(160deg, color-mix(in srgb, var(--dama-board-light) 72%, white) 0%, var(--dama-board-light) 48%, color-mix(in srgb, var(--dama-board-light) 90%, #9a9a7a) 100%)",
                      boxShadow: dark
                        ? "inset 0 1px 0 color-mix(in srgb, white 10%, transparent)"
                        : "inset 0 1px 0 color-mix(in srgb, white 35%, transparent)",
                    }
                  : {
                      // Flat select/last-move fill like 3D SquareMesh (no inset rim).
                      backgroundImage: "none",
                      boxShadow: "none",
                    }),
              }}
              onClick={() => {
                if (!canClick) return;
                onSelectSquare(row, col);
              }}
            >
              <BoardSquareCoords
                row={row}
                col={col}
                boardSize={size}
                flipBoard={flipBoard}
                isDark={dark}
              />
              {/* 3D destination disc; lighten so it reads on the same highlight fill. */}
              {isLegalTarget ? (
                <span
                  className="absolute inset-[28%] z-[1] rounded-full border-0 opacity-95 shadow-[0_0_12px_var(--dama-board-highlight)]"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--dama-board-highlight) 55%, white)",
                  }}
                  aria-hidden
                />
              ) : null}
              {cell && !hidePiece ? (
                <span className="relative z-[2] flex h-[78%] w-[78%] items-center justify-center">
                  {/* Square fill is the movable cue (same as 3D) - no under-piece ring.
                      No CSS scale/transition - 3D uses mesh scale only in the fly loop. */}
                  <PieceDisc
                    player={(cell.p === 2 ? 2 : 1) as 1 | 2}
                    isKing={Boolean(cell.k)}
                    className={cn(
                      "h-full w-full",
                      (isSelected || isMust) && "shadow-[0_0_12px_2px_var(--dama-board-highlight)]",
                    )}
                  />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Keep fly layer mounted - remounting mid-pick caused 2D piece glitches. */}
      <div
        className="pointer-events-none absolute inset-0 z-[2]"
        aria-hidden
        style={{ visibility: activeFly ? "visible" : "hidden" }}
      >
        <div ref={flyElRef} className="absolute flex items-center justify-center">
          {activeFly ? (
            <PieceDisc
              player={activeFly.player}
              isKing={activeFly.isKing}
              // Same drop-shadow as resting PieceDisc - shadow-lg caused pick/put pop.
              className="h-full w-full"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
