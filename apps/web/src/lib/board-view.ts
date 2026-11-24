"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type BoardViewMode = "2d" | "3d";

const STORAGE_KEY = "dama-board-view";

export function readBoardViewMode(): BoardViewMode {
  if (typeof window === "undefined") return "2d";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "3d" ? "3d" : "2d";
  } catch {
    return "2d";
  }
}

export function writeBoardViewMode(mode: BoardViewMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore quota / private mode */
  }
}

const VIEW_EVENT = "dama-board-view";

/**
 * Fail-open for portal / flip / 2D↔3D / ad defer while pick→put is airborne.
 * Must cover multi-capture chains (MOVE_DURATION_MAX ~0.82s × 5 + slack ≈ 5s+).
 * A 3s cap remounted the board mid-chain → pick→put flicker / land-sync stall.
 */
export const PLY_IDLE_FAIL_OPEN_MS = 5500;

function plyInflight(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector("[data-dama-ply-inflight]"));
}

/** Latest deferred action per key - stacked taps must not all fire after land. */
const plyIdlePending = new Map<string, number>();

/**
 * Run after pick→put lands. Stuck `data-dama-ply-inflight` fail-opens at
 * PLY_IDLE_FAIL_OPEN_MS so flip / 2D↔3D / replay chrome cannot freeze forever
 * mid-match, without remounting mid multi-capture chain.
 * Same `key` coalesces: latest fn wins (double-flip mid-flight must not stack).
 */
export function runWhenPlyIdle(
  fn: () => void,
  timeoutMs = PLY_IDLE_FAIL_OPEN_MS,
  key = "default",
): void {
  if (typeof document === "undefined" || !plyInflight()) {
    const prev = plyIdlePending.get(key);
    if (prev != null) {
      window.clearInterval(prev);
      plyIdlePending.delete(key);
    }
    fn();
    return;
  }
  const prev = plyIdlePending.get(key);
  if (prev != null) window.clearInterval(prev);
  const startedAt = Date.now();
  const id = window.setInterval(() => {
    if (plyInflight() && Date.now() - startedAt < timeoutMs) return;
    window.clearInterval(id);
    plyIdlePending.delete(key);
    fn();
  }, 32);
  plyIdlePending.set(key, id);
}

/** Persist Chess.com-style 2D default with optional 3D (syncs across hub + live board). */
export function useBoardViewMode(): [BoardViewMode, (mode: BoardViewMode) => void] {
  const [mode, setMode] = useState<BoardViewMode>("2d");
  const deferRef = useRef<number | null>(null);

  useEffect(() => {
    setMode(readBoardViewMode());
    const clearDefer = () => {
      if (deferRef.current != null) {
        window.clearInterval(deferRef.current);
        deferRef.current = null;
      }
    };
    const apply = (next: BoardViewMode) => {
      setMode((prev) => (prev === next ? prev : next));
    };
    // Cross-tab / cross-hub sync remounts 2D↔3D. Never apply mid pick→put
    // (plane remount kills RAF/useFrame → flicker/freeze).
    const sync = () => {
      const next = readBoardViewMode();
      if (!plyInflight()) {
        clearDefer();
        apply(next);
        return;
      }
      if (deferRef.current != null) return;
      // Stuck ply attr must not defer 2D↔3D forever (mid-game freeze).
      const startedAt = Date.now();
      deferRef.current = window.setInterval(() => {
        if (plyInflight() && Date.now() - startedAt < PLY_IDLE_FAIL_OPEN_MS) return;
        clearDefer();
        apply(readBoardViewMode());
      }, 32);
    };
    window.addEventListener("storage", sync);
    window.addEventListener(VIEW_EVENT, sync);
    return () => {
      clearDefer();
      window.removeEventListener("storage", sync);
      window.removeEventListener(VIEW_EVENT, sync);
    };
  }, []);

  const update = useCallback((next: BoardViewMode) => {
    // Never hard-drop the click mid pick→put - defer with chain-safe fail-open.
    runWhenPlyIdle(
      () => {
        setMode(next);
        writeBoardViewMode(next);
        window.dispatchEvent(new Event(VIEW_EVENT));
      },
      PLY_IDLE_FAIL_OPEN_MS,
      "board-view",
    );
  }, []);

  return [mode, update];
}
