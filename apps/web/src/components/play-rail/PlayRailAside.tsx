"use client";

import { releaseBodyPointerEvents } from "@/hooks/use-deferred-dialog-selection";
import { useMaxLg } from "@/hooks/useMaxLg";
import { useTextInputKeyboardScroll } from "@/hooks/useTextInputKeyboardScroll";
import {
  playRailAsideClass,
  playRailComposeBackdropClass,
  playRailComposeInDialogBackdropClass,
  playRailComposeInDialogClass,
  playRailComposeSheetClass,
} from "@/lib/player-shell-ui";
import { isCharacterTextField } from "@/lib/text-input-keyboard-scroll";
import { cn } from "@/lib/utils";
import { useShellChromeStore } from "@/store/shell-chrome";
import { X } from "lucide-react";
import {
  type FocusEvent as ReactFocusEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

type Props = {
  children: ReactNode;
  className?: string;
  /** Forwarded to the aside (e.g. aria-label). */
  "aria-label"?: string;
};

const DRAG_DISMISS_PX = 88;
const ENTER_MS = 300;
const MAX_LG_MQ = "(max-width: 1023px)";

/** Resolve input/textarea from the event target (icon / padding clicks included). */
function resolveCharacterField(
  target: EventTarget | null,
  root: HTMLElement,
): HTMLInputElement | HTMLTextAreaElement | null {
  if (isCharacterTextField(target) && root.contains(target)) return target;
  if (!(target instanceof Element) || !root.contains(target)) return null;
  const el = target.closest("input, textarea");
  return isCharacterTextField(el) ? el : null;
}

function isCompactViewport(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(MAX_LG_MQ).matches
  );
}

/**
 * Play right-rail shell.
 * max-lg: always owns `[data-dama-rail-scroll]` (tabs + lists + chat/DM scroll together).
 * lg+: column shell; body PlayRailScrollPort owns the scroll attribute.
 * Immersive chat only hides the mobile bottom nav - it must not freeze aside overflow on
 * phone/tablet (that made Friends/DMs/Players lists unscrollable).
 * Phone/tablet: character text fields scroll above the soft keyboard (shared helper).
 * Character-field focus expands the same rail into a compose sheet over the board
 * (Colors-style front layer); dismiss via X / backdrop / drag-down only - not blur.
 * Works over SmartBoardHost pop (z above board) and inside tournaments FAB Sheet.
 */
export function PlayRailAside({ children, className, "aria-label": ariaLabel }: Props) {
  const maxLg = useMaxLg();
  const immersiveChat = useShellChromeStore((s) => s.immersiveChat);
  const storeCompose = useShellChromeStore((s) => s.railComposeSheet);
  const setStoreCompose = useShellChromeStore((s) => s.setRailComposeSheet);
  /**
   * Local sheet flag so flushSync can commit fixed layout before focus.
   * Zustand alone is not flushed by flushSync (store updates schedule later),
   * which left the field focused on a still-relative rail and dropped keyboards.
   */
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetOpenRef = useRef(false);
  sheetOpenRef.current = sheetOpen;
  const compose = sheetOpen || storeCompose;
  const railRootRef = useRef<HTMLElement | null>(null);
  const [railRoot, setRailRoot] = useState<HTMLElement | null>(null);
  // sheetOpen means a live max-lg open already succeeded - don't wait on SSR-stuck maxLg.
  useTextInputKeyboardScroll(railRoot, maxLg || sheetOpen);

  const dragStartY = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  /** Keep the field that opened compose focused after layout/animation. */
  const pendingFocusRef = useRef<HTMLElement | null>(null);
  const inDialog =
    typeof document !== "undefined" && !!railRoot?.closest("[data-radix-dialog-content]");

  const setAsideRef = useCallback((node: HTMLElement | null) => {
    railRootRef.current = node;
    setRailRoot(node);
  }, []);

  const closeCompose = useCallback(() => {
    pendingFocusRef.current = null;
    setSheetOpen(false);
    setStoreCompose(false);
    setDragOffset(0);
    dragStartY.current = null;
    releaseBodyPointerEvents();
    const ae = document.activeElement;
    if (ae instanceof HTMLElement && isCharacterTextField(ae)) {
      ae.blur();
    }
  }, [setStoreCompose]);

  const restorePendingFocus = useCallback(() => {
    const field = pendingFocusRef.current;
    const root = railRootRef.current;
    if (!field || !root?.contains(field)) return;
    if (document.activeElement === field) return;
    try {
      field.focus({ preventScroll: true });
    } catch {
      field.focus();
    }
  }, []);

  /**
   * Open compose from React capture handlers (not useEffect DOM listeners).
   * Live matchMedia gate so SSR-stuck useMaxLg=false cannot block phone compose
   * (including under popped boards).
   */
  const tryOpenCompose = useCallback(
    (target: EventTarget | null) => {
      if (!isCompactViewport()) return;
      const root = railRootRef.current;
      if (!root) return;
      const field = resolveCharacterField(target, root);
      if (!field) return;
      pendingFocusRef.current = field;
      const alreadyOpen = sheetOpenRef.current || useShellChromeStore.getState().railComposeSheet;
      // Open once. Do not set pointer-events:none or document click-swallow here -
      // those froze the sheet / ate typeahead picks. Matchmaking uses shouldBlockMatchmakingNav.
      if (!alreadyOpen) {
        flushSync(() => {
          setSheetOpen(true);
          setStoreCompose(true);
        });
      }
      try {
        field.focus({ preventScroll: true });
      } catch {
        field.focus();
      }
      queueMicrotask(() => restorePendingFocus());
    },
    [setStoreCompose, restorePendingFocus],
  );

  const onRailPointerDownCapture = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      tryOpenCompose(e.target);
    },
    [tryOpenCompose],
  );

  // React onFocus uses focusin under the hood and supports Capture.
  const onRailFocusCapture = useCallback(
    (e: ReactFocusEvent<HTMLElement>) => {
      tryOpenCompose(e.target);
    },
    [tryOpenCompose],
  );

  // Document capture backup: does not depend on useState(ref) timing, and still
  // receives native EventTarget dispatches (React synthetic handlers may not).
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = railRootRef.current;
      if (!el || !(e.target instanceof Node) || !el.contains(e.target)) return;
      tryOpenCompose(e.target);
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = railRootRef.current;
      if (!el || !(e.target instanceof Node) || !el.contains(e.target)) return;
      tryOpenCompose(e.target);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [tryOpenCompose]);

  // Escape restores the rail.
  useEffect(() => {
    if (!compose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCompose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compose, closeCompose]);

  // Close only when the live viewport is desktop - never because SSR maxLg stuck false.
  // `maxLg` is listed so useMaxLg subscription re-runs this check; gate uses live mq.
  useEffect(() => {
    void maxLg;
    if (!isCompactViewport() && compose) closeCompose();
  }, [maxLg, compose, closeCompose]);

  useEffect(() => {
    return () => {
      setStoreCompose(false);
    };
  }, [setStoreCompose]);

  // Prefer maxLg; if SSR hook is stuck false, sheetOpen alone still shows the sheet.
  const composeActive = Boolean(compose && (maxLg || sheetOpen));

  // Reclaim focus after board tuck.
  useLayoutEffect(() => {
    if (!composeActive) return;
    restorePendingFocus();
    const t1 = window.setTimeout(restorePendingFocus, 48);
    const t2 = window.setTimeout(restorePendingFocus, ENTER_MS + 16);
    const t3 = window.setTimeout(restorePendingFocus, ENTER_MS + 120);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [composeActive, restorePendingFocus]);

  // While compose is open, clear any leftover body pointer-events lock (typeahead/popover teardown).
  useEffect(() => {
    if (!composeActive) return;
    releaseBodyPointerEvents();
    const root = railRootRef.current;
    const onPtr = () => releaseBodyPointerEvents();
    root?.addEventListener("pointerdown", onPtr, true);
    const id = window.setInterval(releaseBodyPointerEvents, 500);
    return () => {
      root?.removeEventListener("pointerdown", onPtr, true);
      window.clearInterval(id);
      releaseBodyPointerEvents();
    };
  }, [composeActive]);

  const onHandlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!compose) return;
    dragStartY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHandlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartY.current == null) return;
    const dy = Math.max(0, e.clientY - dragStartY.current);
    setDragOffset(dy);
  };

  const onHandlePointerUp = () => {
    if (dragStartY.current == null) return;
    const dy = dragOffset;
    dragStartY.current = null;
    if (dy >= DRAG_DISMISS_PX) {
      closeCompose();
      return;
    }
    setDragOffset(0);
  };

  // Drag dismiss only - open uses final layout in flushSync (smooth via backdrop fade).
  const sheetTransform =
    composeActive && dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined;

  return (
    <>
      {/* Always mount backdrop first so `<aside>` keeps a stable React sibling index
          (inserting it only when compose opens remounted the rail and dropped focus). */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close play panel"
        aria-hidden={!composeActive}
        disabled={!composeActive}
        className={
          composeActive
            ? inDialog
              ? playRailComposeInDialogBackdropClass
              : playRailComposeBackdropClass
            : "hidden pointer-events-none"
        }
        onMouseDown={(e) => {
          // Keep the text field focused; dismiss on click only.
          e.preventDefault();
        }}
        onClick={closeCompose}
        style={composeActive && !inDialog ? { transitionDuration: `${ENTER_MS}ms` } : undefined}
      />
      <aside
        ref={setAsideRef}
        className={cn(
          playRailAsideClass,
          composeActive && (inDialog ? playRailComposeInDialogClass : playRailComposeSheetClass),
          className,
        )}
        aria-label={ariaLabel}
        data-dama-immersive-chat={immersiveChat ? "" : undefined}
        data-dama-rail-compose={composeActive ? "" : undefined}
        data-skip-hide-on-scroll=""
        onPointerDownCapture={onRailPointerDownCapture}
        onFocusCapture={onRailFocusCapture}
        style={
          composeActive && !inDialog
            ? {
                // Inset-only full bleed (no explicit height - 100dvh+bottom can fight and leave gaps).
                position: "fixed",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                zIndex: 100,
                width: "100%",
                height: "auto",
                maxHeight: "none",
                minHeight: 0,
                borderRadius: 0,
                ...(sheetTransform ? { transform: sheetTransform, transitionDuration: "0ms" } : {}),
              }
            : sheetTransform
              ? {
                  transform: sheetTransform,
                  transitionDuration: "0ms",
                }
              : undefined
        }
        {...(maxLg || sheetOpen ? { "data-dama-rail-scroll": "" } : {})}
      >
        {/* Always mount + keep layout size (invisible, not display:none) so opening
            compose does not push the focused field and drop the mobile keyboard. */}
        <div
          className={cn(
            "sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-[var(--dama-border)] bg-[var(--dama-panel)] px-2 pb-2 pt-1",
            !composeActive && "invisible pointer-events-none border-transparent",
          )}
          data-dama-rail-compose-chrome={composeActive ? "" : undefined}
          aria-hidden={!composeActive}
        >
          <div
            role="presentation"
            className="flex flex-1 cursor-grab touch-none flex-col items-center justify-center py-1 active:cursor-grabbing"
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerUp}
          >
            <span className="h-1 w-10 rounded-full bg-[var(--dama-border)]" aria-hidden />
            <span className="sr-only">Drag down to close</span>
          </div>
          <button
            type="button"
            tabIndex={-1}
            className="rounded-md p-1.5 text-[var(--dama-muted)] transition-colors hover:bg-[var(--dama-hover)] hover:text-[var(--dama-text)]"
            aria-label="Close play panel"
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={closeCompose}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
