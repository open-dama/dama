"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
    const sync = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      setPos({
        top: Math.round(r.bottom + FAB_GAP),
        left: Math.round(r.right - FAB_SIZE - 4),
      });
    };
    sync();
    const el = anchorRef.current;
    if (el && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => sync());
      ro.observe(el);
    }
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    const poll = window.setInterval(sync, 200);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
      window.clearInterval(poll);
    };
    // Expand toggles host size; ResizeObserver + poll re-anchor the FAB.
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
 * - Idle: fill parent 52dvh so PlayBoardColumn cannot shrink-loop / vanish.
 * - Live hug: content height (seats + square) - no 52dvh letterbox under seat.
 * - Expanded: portaled fixed overlay hugging content; shell pointer-events-none
 *   so the Live rail scrolls like the pre-game lobby.
 * - FAB: floating on the bottom edge of the board section (lobby FAB language).
 */
export function SmartBoardHost({ active, className, children }: Props) {
  const maxLg = useMaxLg();
  const [expanded, setExpanded] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [spacerPx, setSpacerPx] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const prevActiveRef = useRef(false);
  const toggleLockUntilRef = useRef(0);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const ignoreNextClickRef = useRef(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (active && !prevActiveRef.current) {
      setExpanded(true);
      toggleLockUntilRef.current = Date.now() + TOGGLE_LOCK_MS;
    }
    if (!active) {
      setExpanded(false);
      lastTapRef.current = null;
      toggleLockUntilRef.current = 0;
      setSpacerPx(0);
    }
    prevActiveRef.current = active;
  }, [active]);

  const live = Boolean(maxLg && active);
  const topped = Boolean(live && expanded);

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
      if (typeof ResizeObserver !== "undefined" && observed !== host) {
        ro?.disconnect();
        ro = new ResizeObserver(() => sync());
        ro.observe(host);
        observed = host;
      }
      const hostBottom = Math.round(host.getBoundingClientRect().bottom);
      const wrapTop = Math.max(0, Math.round(wrap.getBoundingClientRect().top));
      const next = Math.max(0, hostBottom - wrapTop);
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
    setExpanded((v) => !v);
  }, [live]);

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
    <div
      ref={hostRef}
      className={cn(
        "relative flex min-h-0 w-full min-w-0 flex-col",
        topped
          ? "pointer-events-none fixed inset-x-0 top-0 z-[60] h-auto w-full max-w-none overflow-visible bg-[var(--dama-card)] px-2 pb-0 pt-[max(0.25rem,env(safe-area-inset-top))]"
          : live
            ? "h-auto overflow-visible"
            : "h-full overflow-hidden",
      )}
      data-smart-board={topped ? "expanded" : live ? "hug" : "inline"}
      data-dama-smart-frame=""
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
          "relative z-10 flex min-h-0 w-full min-w-0 flex-col overflow-visible",
          topped
            ? "pointer-events-auto mx-auto h-auto max-w-[min(100%,calc(100dvh-1rem))]"
            : live
              ? "h-auto"
              : "h-full flex-1 overflow-hidden",
        )}
      >
        {children}
      </div>
    </div>
  );

  return (
    <div
      ref={wrapRef}
      className={cn(
        className,
        live && "relative max-lg:!overflow-visible",
        live && !topped && "max-lg:!h-auto max-lg:!max-h-none max-lg:!min-h-0 max-lg:shrink-0",
        topped && "max-lg:!max-h-none max-lg:!min-h-0 max-lg:shrink-0",
      )}
      style={
        topped && spacerPx > 0
          ? ({ height: spacerPx, maxHeight: spacerPx, minHeight: 0 } as CSSProperties)
          : undefined
      }
      data-smart-board-wrap={topped ? "expanded" : live ? "hug" : "idle"}
    >
      {topped && portalReady ? (
        <>
          <div className="h-full w-full" aria-hidden />
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
