"use client";

import {
  BoardStackLayoutContext,
  type BoardStackLayoutMode,
} from "@/components/play/board-stack-layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useShellChromeStore } from "@/store/shell-chrome";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

/** Tailwind `lg` - below this, phone / tablet. */
const MAX_LG_MQ = "(max-width: 1023px)";
const DBL_MS = 320;
const DBL_PX = 28;
const TOGGLE_LOCK_MS = 900;
/** Keep play-rail character fields tappable under a popped board (Flutter railH parity). */
const PLAY_RAIL_MIN_PX = 220;

function subscribeMaxLg(onStoreChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const mq = window.matchMedia(MAX_LG_MQ);
  mq.addEventListener("change", onStoreChange);
  window.addEventListener("resize", onStoreChange);
  // Same as hooks/useMaxLg: SSR false must not stick on a real max-lg viewport.
  onStoreChange();
  const raf = window.requestAnimationFrame(() => onStoreChange());
  return () => {
    window.cancelAnimationFrame(raf);
    mq.removeEventListener("change", onStoreChange);
    window.removeEventListener("resize", onStoreChange);
  };
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

function isOnBoardPlane(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("[data-dama-board-plane]"));
}

function isOutsideBoardToggleTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (isOnBoardPlane(target)) return false;
  if (target.closest('[aria-label="Maximize board"], [aria-label="Minimize board"]')) {
    return false;
  }
  if (target.closest("[data-dama-board-chrome]")) return true;
  if (target.closest("[data-dama-smart-frame], [data-smart-board]")) {
    return !target.closest("button, a, input, textarea, select, label, [role='button']");
  }
  return false;
}

type Props = {
  active: boolean;
  /**
   * Rising edge while `active` forces maximize (match/spectate start).
   * Needed because home idle already sets `active` - without this, starting a
   * game while minimized stays hug and the top rank clips under Safari chrome.
   */
  popSignal?: boolean;
  className?: string;
  children: ReactNode;
};

const FAB_SIZE = 40;
const FAB_GAP = 4;

/**
 * Glassy floating maximize control - same end-to-end floating logic as the
 * tournaments Play-lobby FAB (fixed + pointer-events shell), but anchored to
 * the BOTTOM-RIGHT of the board section (not bottom-nav). Portaled to body so
 * the play grid’s overflow:hidden / rail isolate cannot crop or bury it.
 */
function MaximizeFabPortal({
  expanded,
  onToggle,
  anchorRef,
}: {
  expanded: boolean;
  onToggle: () => void;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    let ro: ResizeObserver | null = null;
    let observed: Element | null = null;
    const sync = () => {
      const host = anchorRef.current;
      if (!host) return;
      // Anchor to seats+square stack (not the full fixed overlay shell height).
      const el = host.querySelector<HTMLElement>("[data-smart-board-stack]") ?? host;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const vv = window.visualViewport;
      const viewW = Math.round(vv?.width ?? window.innerWidth);
      const viewH = Math.round(vv?.height ?? window.innerHeight);
      // Keep FAB on-screen above bottom nav / home indicator.
      const bottomSafe = 56;
      const top = Math.min(
        Math.round(r.bottom + FAB_GAP),
        Math.max(8, viewH - FAB_SIZE - bottomSafe),
      );
      const left = Math.min(
        Math.max(8, Math.round(r.right - FAB_SIZE - 4)),
        Math.max(8, viewW - FAB_SIZE - 8),
      );
      setPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
      if (typeof ResizeObserver !== "undefined" && observed !== el) {
        ro?.disconnect();
        ro = new ResizeObserver(() => sync());
        ro.observe(el);
        observed = el;
      }
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    // One short settle burst after mount only - perpetual 200ms layout polls
    // contested the main thread during piece flight on production devices.
    const settle = window.setInterval(sync, 100);
    const stopSettle = window.setTimeout(() => window.clearInterval(settle), 800);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
      window.clearInterval(settle);
      window.clearTimeout(stopSettle);
    };
  }, [anchorRef]);

  if (!pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[80]"
      style={{ top: pos.top, left: pos.left, width: FAB_SIZE, height: FAB_SIZE }}
      data-dama-smart-fab=""
    >
      <Button
        type="button"
        variant="ghost"
        aria-label={expanded ? "Minimize board" : "Maximize board"}
        title={expanded ? "Minimize board" : "Maximize board"}
        className={cn(
          "pointer-events-auto h-10 w-10 shrink-0 rounded-full p-0",
          "border border-[var(--dama-border)]/70 text-[var(--dama-text)] shadow-lg",
          "bg-[var(--dama-card)]/70 backdrop-blur-xl",
          "supports-[backdrop-filter]:bg-[var(--dama-card)]/45",
          "hover:bg-[var(--dama-card)]/85",
        )}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
      >
        <span className="sr-only">{expanded ? "Minimize" : "Maximize"}</span>
        <svg
          viewBox="0 0 16 16"
          width="16"
          height="16"
          className="opacity-95"
          aria-hidden="true"
          focusable="false"
        >
          <title>{expanded ? "Minimize" : "Maximize"}</title>
          {expanded ? (
            <path fill="currentColor" d="M4 9h3v3h1.5V7.5H4V9zm4.5-5.5V7H12V5.5H9.5V3.5H8z" />
          ) : (
            <path
              fill="currentColor"
              d="M3 3h4.5v1.5H4.5V7H3V3zm9 0v4h-1.5V4.5H7.5V3H12zM3 9h1.5v2.5H7V13H3V9zm6.5 4v-1.5H12V9h1.5v4H9.5z"
            />
          )}
        </svg>
      </Button>
    </div>,
    document.body,
  );
}

/**
 * Phone/tablet smart board.
 * - Idle: fill parent 52svh so PlayBoardColumn cannot shrink-loop / vanish.
 * - Live hug: content height (seats + square) - no 52svh letterbox under seat.
 * - Expanded: portaled fixed overlay hugging content; shell pointer-events-none
 *   so the Live rail scrolls like the pre-game lobby.
 * - FAB: floating on the bottom edge of the board section (lobby FAB language).
 */
export function SmartBoardHost({ active, popSignal = false, className, children }: Props) {
  const maxLg = useMaxLg();
  const railComposeSheet = useShellChromeStore((s) => s.railComposeSheet);
  const suppressSmartBoardPop = useShellChromeStore((s) => s.suppressSmartBoardPop);
  const tuckBoard = railComposeSheet || suppressSmartBoardPop;
  const [expanded, setExpanded] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [spacerPx, setSpacerPx] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const prevActiveRef = useRef(false);
  const prevPopRef = useRef(false);
  const toggleLockUntilRef = useRef(0);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const ignoreNextClickRef = useRef(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  // Compose sheet / FAB play-rail sheet own the viewport - tuck the popped board
  // so character fields are not trapped under the z-60 board overlay.
  useEffect(() => {
    if (!tuckBoard) return;
    setExpanded(false);
    lastTapRef.current = null;
  }, [tuckBoard]);

  // Board gestures / wheel must not rubber-band or scroll the shell / sticky header.
  // Always armed on phone/tablet (maxLg) - including idle shimmer / inactive hosts.
  // Do NOT mutate documentElement overscroll/touchAction here: clearing them on
  // pointerup was wiping the locked marketing shell and re-enabling header scroll.
  useEffect(() => {
    if (!maxLg && !active) return;
    const isBoardTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      return Boolean(
        target.closest("[data-dama-board-plane]") ||
          target.closest("[data-smart-board]") ||
          target.closest("[data-dama-board-chrome]") ||
          target.closest("[data-smart-board-stack]") ||
          target.closest("[data-dama-smart-frame]") ||
          target.closest("[data-smart-board-wrap]") ||
          target.closest("canvas"),
      );
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!isBoardTarget(event.target)) return;
      if (event.cancelable) event.preventDefault();
    };
    const onWheel = (event: WheelEvent) => {
      if (!isBoardTarget(event.target)) return;
      if (event.cancelable) event.preventDefault();
    };
    window.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener("touchmove", onTouchMove, true);
      window.removeEventListener("wheel", onWheel, true);
    };
  }, [active, maxLg]);

  useEffect(() => {
    if (active && !prevActiveRef.current) {
      // Do not pop over an open compose / FAB play-rail sheet.
      if (!tuckBoard) {
        setExpanded(true);
        toggleLockUntilRef.current = Date.now() + TOGGLE_LOCK_MS;
      }
    }
    if (!active) {
      setExpanded(false);
      lastTapRef.current = null;
      toggleLockUntilRef.current = 0;
      setSpacerPx(0);
      prevPopRef.current = false;
    }
    prevActiveRef.current = active;
  }, [active, tuckBoard]);

  // Match/spectate start: pop maximized even if the idle board was already active+minimized.
  useEffect(() => {
    if (!active) {
      prevPopRef.current = false;
      return;
    }
    if (popSignal && !prevPopRef.current) {
      if (!tuckBoard) {
        setExpanded(true);
        toggleLockUntilRef.current = Date.now() + TOGGLE_LOCK_MS;
      }
    }
    prevPopRef.current = popSignal;
  }, [active, popSignal, tuckBoard]);

  const live = Boolean(maxLg && active);
  // Tuck on the same render as compose/FAB open (do not wait for useEffect
  // setExpanded) so the z-60 portal drops before the sheet paints - avoids a
  // layout thrash that stole first-tap focus from the text field.
  const topped = Boolean(live && expanded && !tuckBoard);
  // Live min + expanded: ALWAYS width-square hug. Never budget-measure host height
  // into side (that feedback is the infinite zoom / postage-stamp collapse).
  const layoutMode: BoardStackLayoutMode = live ? "hug" : "budget";

  // Spacer = painted board card bottom (not FAB overhang) so rail sits flush
  // under seats; FAB floats half into the grid gap / rail top.
  useLayoutEffect(() => {
    if (!topped) {
      setSpacerPx(0);
      return;
    }
    let ro: ResizeObserver | null = null;
    let observed: Element | null = null;
    const sync = () => {
      const host = hostRef.current;
      const wrap = wrapRef.current;
      if (!host || !wrap) return;
      const stack = host.querySelector<HTMLElement>("[data-smart-board-stack]") ?? host;
      if (typeof ResizeObserver !== "undefined" && observed !== stack) {
        ro?.disconnect();
        ro = new ResizeObserver(() => sync());
        ro.observe(stack);
        observed = stack;
      }
      // Document spacer = stack bottom − wrap top (not raw stackH). Fixed pop
      // starts above the wrap (covers header); stackH alone leaves a gap under
      // the seat that shows as a green/empty band before the rail.
      // Cap spacer so the sibling play rail keeps PLAY_RAIL_MIN_PX - otherwise a
      // full-height pop clips the rail and character fields cannot open compose.
      const stackBottom = Math.round(stack.getBoundingClientRect().bottom);
      const wrapTop = Math.max(0, Math.round(wrap.getBoundingClientRect().top));
      let next = Math.max(0, stackBottom - wrapTop);
      const col = wrap.parentElement;
      if (col) {
        const colH = Math.round(col.getBoundingClientRect().height);
        const maxSpacer = Math.max(0, colH - PLAY_RAIL_MIN_PX);
        next = Math.min(next, maxSpacer);
      }
      if (next < 1) return;
      setSpacerPx((prev) => (Math.abs(prev - next) <= 2 ? prev : next));
    };
    sync();
    const raf1 = window.requestAnimationFrame(() => {
      sync();
      window.requestAnimationFrame(sync);
    });
    const poll = window.setInterval(sync, 50);
    const stopPoll = window.setTimeout(() => window.clearInterval(poll), 1200);
    window.addEventListener("resize", sync);
    return () => {
      window.cancelAnimationFrame(raf1);
      window.clearInterval(poll);
      window.clearTimeout(stopPoll);
      window.removeEventListener("resize", sync);
      ro?.disconnect();
      observed = null;
    };
  }, [topped]);

  const toggle = useCallback(() => {
    if (!live) return;
    if (Date.now() < toggleLockUntilRef.current) return;
    // Compose / FAB sheet owns the viewport - keep board tucked.
    if (tuckBoard) {
      setExpanded(false);
      return;
    }
    setExpanded((v) => !v);
  }, [live, tuckBoard]);

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!live) return;
      if (!isOutsideBoardToggleTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    },
    [live, toggle],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!live) return;
      if (e.pointerType === "mouse") return;
      if (!isOutsideBoardToggleTarget(e.target)) {
        lastTapRef.current = null;
        return;
      }
      const now = Date.now();
      const prev = lastTapRef.current;
      if (
        prev &&
        now - prev.t < DBL_MS &&
        Math.abs(e.clientX - prev.x) <= DBL_PX &&
        Math.abs(e.clientY - prev.y) <= DBL_PX
      ) {
        lastTapRef.current = null;
        ignoreNextClickRef.current = true;
        e.preventDefault();
        e.stopPropagation();
        toggle();
        return;
      }
      lastTapRef.current = { t: now, x: e.clientX, y: e.clientY };
    },
    [live, toggle],
  );

  useEffect(() => {
    if (!topped) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (Date.now() < toggleLockUntilRef.current) return;
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [topped]);

  const boardFrame = (
    <BoardStackLayoutContext.Provider value={layoutMode}>
      <div
        ref={hostRef}
        className={cn(
          "relative flex min-h-0 w-full min-w-0 flex-col overscroll-none max-lg:box-border max-lg:[touch-action:none]",
          // Inline/hug: full section width. Pop only: regular side inset (not edge-to-edge).
          !topped && "max-lg:px-0",
          topped
            ? // Pop covers sticky header (z-50). Leave room for the play rail so
              // character fields stay tappable (compose) under the popped board.
              "pointer-events-none fixed inset-x-0 top-0 z-[60] w-full max-w-none overflow-hidden bg-transparent pb-0 h-auto max-h-[calc(100svh-var(--dama-bottom-nav-height,0px)-var(--dama-play-rail-min,13.75rem))] pt-[env(safe-area-inset-top,0px)] max-lg:px-3"
            : live
              ? "h-auto overflow-hidden"
              : "h-full overflow-hidden",
        )}
        data-smart-board={topped ? "expanded" : live ? "hug" : "inline"}
        data-dama-smart-frame=""
        data-skip-hide-on-scroll=""
        onDoubleClickCapture={onDoubleClick}
        onPointerUp={onPointerUp}
        onClickCapture={(e) => {
          if (!ignoreNextClickRef.current) return;
          ignoreNextClickRef.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div
          className={cn(
            "relative z-10 flex min-h-0 w-full min-w-0 flex-col",
            topped
              ? // Opaque card only around seats+square so the pop covers the header cleanly.
                "pointer-events-auto mx-auto h-auto min-h-0 w-full max-w-full overflow-hidden bg-[var(--dama-card)]"
              : live
                ? "h-auto overflow-hidden"
                : "h-full flex-1 overflow-hidden",
          )}
        >
          {children}
        </div>
      </div>
    </BoardStackLayoutContext.Provider>
  );

  return (
    <div
      ref={wrapRef}
      className={cn(
        className,
        // Never force overflow-visible here - MaximizeFab portals to body; visible overflow
        // let board pan/orbit rubber-band the sticky/fixed top header on iOS.
        // touch-none (not touch-pan-x): pan-x left vertical gestures free to rubber-band
        // the sticky/fixed top header on iOS while orbiting / dragging the board.
        "overflow-hidden overscroll-none max-lg:touch-none",
        // Kill parent 52svh max-height when smart is live (idle letterbox source).
        // Minimized: !h-auto hug. Expanded: spacer via CSS var (!important-safe).
        // Idle/shimmer (not live): keep caller height (full-column shimmer must stick).
        live && !topped && "max-lg:!h-auto max-lg:!max-h-none max-lg:!min-h-0 max-lg:shrink-0",
        topped &&
          "max-lg:!h-[var(--dama-smart-spacer,auto)] max-lg:!max-h-[var(--dama-smart-spacer,none)] max-lg:!min-h-0 max-lg:shrink-0",
      )}
      style={
        topped
          ? ({
              // !h-[var] above wins over parent 52svh; var tracks stack height.
              ["--dama-smart-spacer" as string]: spacerPx > 0 ? `${spacerPx}px` : "auto",
              minHeight: 0,
            } as CSSProperties)
          : undefined
      }
      data-smart-board-wrap={topped ? "expanded" : live ? "hug" : "idle"}
    >
      {topped && portalReady ? (
        <>
          <div className="h-auto w-full" aria-hidden />
          {createPortal(boardFrame, document.body)}
        </>
      ) : (
        boardFrame
      )}
      {/* Body portal: never cropped by grid overflow / never under the rail. */}
      {live && portalReady ? (
        <MaximizeFabPortal expanded={topped} onToggle={toggle} anchorRef={hostRef} />
      ) : null}
    </div>
  );
}
