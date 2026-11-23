"use client";

import { useMaxLg } from "@/hooks/useMaxLg";
import { useTextInputKeyboardScroll } from "@/hooks/useTextInputKeyboardScroll";
import {
  playRailAsideClass,
  playRailComposeBackdropClass,
  playRailComposeSheetClass,
} from "@/lib/player-shell-ui";
import { isCharacterTextField } from "@/lib/text-input-keyboard-scroll";
import { cn } from "@/lib/utils";
import { useShellChromeStore } from "@/store/shell-chrome";
import { X } from "lucide-react";
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Forwarded to the aside (e.g. aria-label). */
  "aria-label"?: string;
};

const DRAG_DISMISS_PX = 88;

/**
 * Play right-rail shell.
 * max-lg: always owns `[data-dama-rail-scroll]` (tabs + lists + chat/DM scroll together).
 * lg+: column shell; body PlayRailScrollPort owns the scroll attribute.
 * Immersive chat only hides the mobile bottom nav - it must not freeze aside overflow on
 * phone/tablet (that made Friends/DMs/Players lists unscrollable).
 * Phone/tablet: character text fields scroll above the soft keyboard (shared helper).
 * Character-field focus expands the same rail into a compose sheet over the board
 * (Colors-style front layer); dismiss via X / backdrop / drag-down only - not blur.
 */
export function PlayRailAside({ children, className, "aria-label": ariaLabel }: Props) {
  const maxLg = useMaxLg();
  const immersiveChat = useShellChromeStore((s) => s.immersiveChat);
  const compose = useShellChromeStore((s) => s.railComposeSheet);
  const setCompose = useShellChromeStore((s) => s.setRailComposeSheet);
  const [railRoot, setRailRoot] = useState<HTMLElement | null>(null);
  useTextInputKeyboardScroll(railRoot, maxLg);

  const dragStartY = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  const closeCompose = useCallback(() => {
    setCompose(false);
    setDragOffset(0);
    dragStartY.current = null;
    const ae = document.activeElement;
    if (ae instanceof HTMLElement && isCharacterTextField(ae)) {
      ae.blur();
    }
  }, [setCompose]);

  // Open compose sheet on character text focus inside this rail (max-lg only).
  // pointerdown backup: some WebViews / automation focus without firing focusin.
  useEffect(() => {
    if (!maxLg || !railRoot) {
      setCompose(false);
      return;
    }
    const tryOpenCompose = (target: EventTarget | null) => {
      if (!isCharacterTextField(target)) return;
      if (!(target instanceof HTMLElement) || !railRoot.contains(target)) return;
      // Already inside a Radix sheet (e.g. compact tournaments rail) - full height already.
      if (target.closest("[data-radix-dialog-content]")) return;
      setCompose(true);
    };
    const onFocusIn = (e: FocusEvent) => {
      tryOpenCompose(e.target);
    };
    const onPointerDown = (e: PointerEvent) => {
      tryOpenCompose(e.target);
    };
    railRoot.addEventListener("focusin", onFocusIn);
    railRoot.addEventListener("pointerdown", onPointerDown);
    return () => {
      railRoot.removeEventListener("focusin", onFocusIn);
      railRoot.removeEventListener("pointerdown", onPointerDown);
    };
  }, [maxLg, railRoot, setCompose]);

  // Escape + leave max-lg restores the rail.
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

  useEffect(() => {
    if (!maxLg && compose) setCompose(false);
  }, [maxLg, compose, setCompose]);

  useEffect(() => {
    return () => setCompose(false);
  }, [setCompose]);

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

  return (
    <>
      {compose && maxLg ? (
        <button
          type="button"
          aria-label="Close play panel"
          className={playRailComposeBackdropClass}
          onClick={closeCompose}
        />
      ) : null}
      <aside
        ref={setRailRoot}
        className={cn(playRailAsideClass, compose && maxLg && playRailComposeSheetClass, className)}
        aria-label={ariaLabel}
        data-dama-immersive-chat={immersiveChat ? "" : undefined}
        data-dama-rail-compose={compose && maxLg ? "" : undefined}
        data-skip-hide-on-scroll=""
        style={
          compose && maxLg && dragOffset > 0
            ? { transform: `translateY(${dragOffset}px)` }
            : undefined
        }
        {...(maxLg ? { "data-dama-rail-scroll": "" } : {})}
      >
        {compose && maxLg ? (
          <div
            className="sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-[var(--dama-border)] bg-[var(--dama-panel)] px-2 pb-2 pt-1"
            data-dama-rail-compose-chrome=""
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
              className="rounded-md p-1.5 text-[var(--dama-muted)] transition-colors hover:bg-[var(--dama-hover)] hover:text-[var(--dama-text)]"
              aria-label="Close play panel"
              onClick={closeCompose}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}
        {children}
      </aside>
    </>
  );
}
