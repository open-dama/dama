"use client";

import {
  type BoardStackLayoutMode,
  useBoardStackLayoutMode,
} from "@/components/play/board-stack-layout";
import { cn } from "@/lib/utils";
import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

type Props = {
  /** Seat / controls above the board (all breakpoints). */
  header?: ReactNode;
  /** Seat below the board (all breakpoints). */
  footer?: ReactNode;
  /** @deprecated Use `header`. */
  desktopHeader?: ReactNode;
  /** @deprecated Use `footer`. */
  desktopFooter?: ReactNode;
  board: ReactNode;
  /** Match intro / result: covers the square board plane only (not seats / letterbox). */
  coverOverlay?: ReactNode;
  className?: string;
};

const SEAT_GAP_PX = 2;
/** Tailwind `lg` - below this, phone / tablet stack. */
const MAX_LG_MQ = "(max-width: 1023px)";

function subscribeMaxLg(onStoreChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const mq = window.matchMedia(MAX_LG_MQ);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getMaxLgSnapshot() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(MAX_LG_MQ).matches;
}

function getMaxLgServerSnapshot() {
  return false;
}

function useMaxLg() {
  return useSyncExternalStore(subscribeMaxLg, getMaxLgSnapshot, getMaxLgServerSnapshot);
}

/**
 * Chess.com stack: header + square board + footer share one width (= board side).
 * When the host has a definite height (locked play shell), side = min(width, availHeight)
 * so BOTH seats stay visible. Unconstrained hosts still maximize width.
 */
function useChessBoardStack(
  hasHead: boolean,
  hasFoot: boolean,
  maxLg: boolean,
  layoutMode: BoardStackLayoutMode,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const footRef = useRef<HTMLDivElement | null>(null);
  const [side, setSide] = useState(0);
  const [fitHost, setFitHost] = useState(false);

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    // Never size past the host - L/R clip on real phones was side > visible width.
    // Also clamp to visualViewport width: iOS Safari layout width can exceed the
    // visible screen, which crops the outer files/ranks.
    const rectW = Math.floor(host.getBoundingClientRect().width);
    const clientW = Math.floor(host.clientWidth);
    const vvW =
      typeof window !== "undefined" && window.visualViewport
        ? Math.floor(window.visualViewport.width)
        : Number.POSITIVE_INFINITY;
    const w = Math.max(
      0,
      Math.min(clientW, rectW || Number.POSITIVE_INFINITY, vvW || Number.POSITIVE_INFINITY),
    );
    if (w < 1) return;

    const h = Math.floor(host.clientHeight);
    const headH = headRef.current?.offsetHeight ?? 0;
    const footH = footRef.current?.offsetHeight ?? 0;
    const gaps = (hasHead ? SEAT_GAP_PX : 0) + (hasFoot ? SEAT_GAP_PX : 0);
    const headReserve = hasHead ? Math.max(headH, 36) : 0;
    const footReserve = hasFoot ? Math.max(footH, 36) : 0;

    const commitSide = (next: number, fit: boolean) => {
      // Avoid re-render thrash when RO fires but geometry is unchanged.
      setFitHost((prev) => (prev === fit ? prev : fit));
      // 2px epsilon: subpixel + iOS chrome jitter must not flip the square size.
      setSide((prev) => (Math.abs(prev - next) <= 2 ? prev : next));
    };

    // Smart minimized: width square only. Reading host height here re-feeds side
    // → host height → side (infinite zoom on real mobile browsers).
    if (layoutMode === "hug" && maxLg) {
      commitSide(w, false);
      return;
    }

    // Height-budgeted host (stable 52svh idle / expanded max-height / desktop).
    if (h >= 48) {
      const availH = h - headReserve - footReserve - gaps;
      const heightFit = Math.max(0, Math.floor(Math.min(w, Math.max(0, availH))));
      commitSide(heightFit, true);
      return;
    }

    // Unconstrained (document flow): full width square; height follows content.
    if (maxLg) {
      commitSide(w, false);
      return;
    }

    setFitHost(false);
  }, [hasHead, hasFoot, maxLg, layoutMode]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;

    let lastVvW =
      typeof window !== "undefined" && window.visualViewport
        ? Math.floor(window.visualViewport.width)
        : 0;

    measure();
    const ro = new ResizeObserver(() => {
      measure();
    });
    ro.observe(host);
    // Hug: host width only - observing seats re-entrantly fought width-square sizing.
    if (layoutMode !== "hug") {
      const head = headRef.current;
      const foot = footRef.current;
      if (head) ro.observe(head);
      if (foot) ro.observe(foot);
    }

    // iOS URL-bar: ignore pure height churn; only remeasure when visible WIDTH changes.
    const onVv = () => {
      const nextW =
        typeof window !== "undefined" && window.visualViewport
          ? Math.floor(window.visualViewport.width)
          : lastVvW;
      if (Math.abs(nextW - lastVvW) <= 2) return;
      lastVvW = nextW;
      measure();
    };
    window.visualViewport?.addEventListener("resize", onVv);
    window.addEventListener("orientationchange", measure);

    return () => {
      ro.disconnect();
      window.visualViewport?.removeEventListener("resize", onVv);
      window.removeEventListener("orientationchange", measure);
    };
  }, [measure, layoutMode]);

  return { hostRef, headRef, footRef, side, fitHost };
}

/**
 * Play / spectate board column (phone / tablet / desktop):
 * Chess.com column - top seat, board, bottom seat, equal L/R alignment.
 */
export function PlayBoardColumn({
  header,
  footer,
  desktopHeader,
  desktopFooter,
  board,
  coverOverlay,
  className,
}: Props) {
  const top = header ?? desktopHeader;
  const bottom = footer ?? desktopFooter;
  const hasHead = Boolean(top);
  const hasFoot = Boolean(bottom);
  const maxLg = useMaxLg();
  const layoutMode = useBoardStackLayoutMode();
  const { hostRef, headRef, footRef, side, fitHost } = useChessBoardStack(
    hasHead,
    hasFoot,
    maxLg,
    layoutMode,
  );
  const ready = side > 0;

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col overflow-hidden", className)}>
      <div
        ref={hostRef}
        className={cn(
          "flex w-full min-w-0 flex-col overflow-hidden",
          // Phone/tablet: top-align stack (lobby parity). Desktop: center in the column.
          fitHost || !maxLg
            ? cn("min-h-0 flex-1 items-center", maxLg ? "justify-start" : "justify-center")
            : "items-stretch",
        )}
      >
        <div
          data-smart-board-stack=""
          className="flex max-h-full w-full max-w-full flex-col overflow-hidden bg-[var(--dama-card)]"
          style={
            ready
              ? fitHost || !maxLg
                ? { width: side, maxWidth: "100%" }
                : { width: "100%", maxWidth: "100%" }
              : // Keep a visible square while measuring - visibility:hidden looked like
                // the board “minimized and vanished” on remount / game start.
                { width: "100%", maxWidth: "100%" }
          }
          aria-hidden={!ready}
        >
          {top ? (
            <div
              ref={headRef}
              data-dama-board-chrome=""
              className="w-full min-w-0 shrink-0 overflow-hidden"
              style={{ marginBottom: SEAT_GAP_PX }}
            >
              {top}
            </div>
          ) : (
            <div ref={headRef} className="hidden" />
          )}
          {/* Playing surface only - smart-board toggle must NOT bind here. */}
          <div
            data-dama-board-plane=""
            className="relative w-full max-w-full shrink-0 overflow-hidden"
            style={
              ready
                ? fitHost || !maxLg
                  ? { width: side, height: side, maxWidth: "100%" }
                  : { width: "100%", maxWidth: "100%", aspectRatio: "1" }
                : { width: "100%", maxWidth: "100%", aspectRatio: "1" }
            }
          >
            <div className="h-full w-full">{board}</div>
            {coverOverlay ? (
              <div className="absolute inset-0 z-50 overflow-hidden">{coverOverlay}</div>
            ) : null}
          </div>
          {bottom ? (
            <div
              ref={footRef}
              data-dama-board-chrome=""
              className="w-full min-w-0 shrink-0 overflow-hidden"
              style={{ marginTop: SEAT_GAP_PX }}
            >
              {bottom}
            </div>
          ) : (
            <div ref={footRef} className="hidden" />
          )}
        </div>
      </div>
    </div>
  );
}

/** Horizontal 2D/3D (and optional extras) for the match header. */
export function BoardViewToggleRow({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("inline-flex shrink-0 items-center gap-1", className)}>{children}</div>;
}
