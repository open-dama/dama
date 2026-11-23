/**
 * Mobile/tablet soft-keyboard scroll for character text fields.
 * Keeps the focused input (and a bit of content below) above the keyboard
 * inside a marked scrollport or the nearest overflow scroller / window.
 * Does not touch selects, checkboxes, or other non-character controls.
 */

const MAX_LG_MQ = "(max-width: 1023px)";
const MARGIN_PX = 16;
/** Extra space under the field so CTAs / following rows stay reachable while typing. */
const REVEAL_BELOW_PX = 120;
const PAD_ATTR = "data-dama-kb-pad";

/** VisualViewport height while no text field is focused (keyboard likely closed). */
let idleVisualHeight = 0;

export function isMobileTabletViewport(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(MAX_LG_MQ).matches;
}

/** Text / search / email / password / url / tel / textarea only. */
export function isCharacterTextField(
  el: EventTarget | null,
): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.readOnly || el.disabled) return false;
  const t = (el.getAttribute("type") || "text").toLowerCase();
  return (
    t === "text" ||
    t === "search" ||
    t === "email" ||
    t === "password" ||
    t === "url" ||
    t === "tel"
  );
}

export function captureIdleVisualHeight(): void {
  if (typeof window === "undefined") return;
  const vv = window.visualViewport;
  if (!vv) return;
  if (isCharacterTextField(document.activeElement)) return;
  // Never shrink the idle baseline while the keyboard is open (short visual viewport).
  if (idleVisualHeight > 0 && vv.height < idleVisualHeight * 0.9) return;
  idleVisualHeight = Math.max(idleVisualHeight, vv.height);
}

/**
 * Soft-keyboard overlap in CSS px.
 * Uses layout vs visual viewport, and idle visual height baseline when
 * `innerHeight` shrinks with the keyboard (common on some mobile browsers).
 */
export function keyboardBottomInset(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  const layoutH = Math.max(document.documentElement.clientHeight, window.innerHeight);
  const layoutBased = Math.max(0, Math.round(layoutH - vv.height - vv.offsetTop));
  const idleBased =
    idleVisualHeight > 0 ? Math.max(0, Math.round(idleVisualHeight - vv.height)) : 0;
  return Math.max(layoutBased, idleBased);
}

function findScrollPort(from: HTMLElement): HTMLElement | null {
  const marked = from.closest("[data-dama-rail-scroll]") || from.closest("[data-dama-kb-scroll]");
  if (marked instanceof HTMLElement) return marked;
  let node: HTMLElement | null = from.parentElement;
  while (node && node !== document.documentElement) {
    if (node === document.body) break;
    const style = window.getComputedStyle(node);
    const oy = style.overflowY;
    if (
      (oy === "auto" || oy === "scroll" || oy === "overlay") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function clearKeyboardPad(port: HTMLElement | null): void {
  if (!port?.hasAttribute(PAD_ATTR)) return;
  port.style.removeProperty("padding-bottom");
  port.removeAttribute(PAD_ATTR);
}

function visualViewBounds(): { top: number; bottom: number } {
  const vv = window.visualViewport;
  const top = (vv?.offsetTop ?? 0) + MARGIN_PX;
  const bottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - MARGIN_PX;
  return { top, bottom };
}

/**
 * Scroll `el` into the visible visualViewport and pad the scrollport so content
 * below the field can still be reached without dismissing the keyboard.
 */
export function ensureTextFieldAboveKeyboard(el: HTMLElement): void {
  if (typeof window === "undefined") return;
  if (!isMobileTabletViewport()) return;

  const kb = keyboardBottomInset();
  const { top: viewTop, bottom: viewBottom } = visualViewBounds();
  const port = findScrollPort(el);
  const elRect = el.getBoundingClientRect();
  const targetBottom = elRect.bottom + REVEAL_BELOW_PX;
  const cover = Math.max(0, targetBottom - viewBottom);

  if (port) {
    // Pad even when kb inset reports 0 but the field still needs reveal space.
    // Never clear pad here - a later settle pass can see cover=0 after scroll and
    // would strip padding (trapping CTAs under the keyboard again). Clear on blur only.
    const pad = Math.max(kb, cover);
    if (pad > 0) {
      const next = `${pad + REVEAL_BELOW_PX}px`;
      const prev = Number.parseInt(port.style.paddingBottom || "0", 10) || 0;
      const nextN = Number.parseInt(next, 10) || 0;
      // Keep the larger pad across settle frames (keyboard animation).
      if (nextN >= prev) {
        port.style.paddingBottom = next;
        port.setAttribute(PAD_ATTR, "1");
      }
    }
  }

  // Re-measure after padding so scroll delta matches the new layout.
  const after = el.getBoundingClientRect();
  const afterBottom = after.bottom + REVEAL_BELOW_PX;
  const { top: top2, bottom: bottom2 } = visualViewBounds();
  let delta = 0;
  if (afterBottom > bottom2) {
    delta = afterBottom - bottom2;
  } else if (after.top < top2) {
    delta = after.top - top2;
  }
  if (delta === 0) return;

  // Prefer the scrollport when it actually overflows; otherwise window scroll
  // (admin console main is marked but often not overflow:auto).
  if (port && port.scrollHeight > port.clientHeight + 1) {
    port.scrollTop += delta;
  } else {
    window.scrollBy(0, delta);
  }
}

export type TextInputKeyboardScrollOptions = {
  /** Limit handling to focus events inside this root (required). */
  root: HTMLElement;
  /**
   * Prefer a marked scrollport under root when applying pad
   * (e.g. `[data-dama-rail-scroll]`).
   */
  scrollPortSelector?: string;
};

/**
 * Subscribe to focusin / visualViewport on a root. Returns cleanup.
 * No-ops when viewport is lg+ (desktop).
 */
export function bindTextInputKeyboardScroll(opts: TextInputKeyboardScrollOptions): () => void {
  const { root, scrollPortSelector = "[data-dama-rail-scroll], [data-dama-kb-scroll]" } = opts;
  let focused: HTMLElement | null = null;
  let raf = 0;
  let blurTimer = 0;

  captureIdleVisualHeight();

  const resolvePadPort = (from: HTMLElement | null): HTMLElement | null => {
    if (!from) {
      const marked = root.querySelector(scrollPortSelector);
      return marked instanceof HTMLElement ? marked : null;
    }
    return findScrollPort(from);
  };

  const run = () => {
    raf = 0;
    if (!focused || !isCharacterTextField(focused)) return;
    if (!root.contains(focused)) return;
    ensureTextFieldAboveKeyboard(focused);
  };

  const schedule = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      // Second frame: keyboard / visualViewport often settle after focus.
      raf = requestAnimationFrame(run);
    });
  };

  const armFocusedField = (el: HTMLElement) => {
    if (blurTimer) {
      window.clearTimeout(blurTimer);
      blurTimer = 0;
    }
    if (!focused) captureIdleVisualHeight();
    focused = el;
    ensureTextFieldAboveKeyboard(focused);
    schedule();
    window.setTimeout(schedule, 120);
    window.setTimeout(schedule, 320);
  };

  const onFocusIn = (e: FocusEvent) => {
    if (!isMobileTabletViewport()) return;
    if (!isCharacterTextField(e.target)) return;
    if (!(e.target instanceof HTMLElement) || !root.contains(e.target)) return;
    armFocusedField(e.target);
  };

  /** Backup when focusin is suppressed (some WebViews); pointerdown still lands. */
  const onPointerDown = (e: PointerEvent) => {
    if (!isMobileTabletViewport()) return;
    const t = e.target;
    if (!isCharacterTextField(t) || !(t instanceof HTMLElement) || !root.contains(t)) return;
    requestAnimationFrame(() => {
      if (document.activeElement === t || isCharacterTextField(document.activeElement)) {
        const el =
          document.activeElement instanceof HTMLElement &&
          isCharacterTextField(document.activeElement)
            ? document.activeElement
            : t;
        armFocusedField(el);
      }
    });
  };

  const onFocusOut = (e: FocusEvent) => {
    if (!isMobileTabletViewport()) return;
    const next = e.relatedTarget;
    if (isCharacterTextField(next) && next instanceof HTMLElement && root.contains(next)) {
      focused = next;
      return;
    }
    focused = null;
    if (blurTimer) window.clearTimeout(blurTimer);
    blurTimer = window.setTimeout(() => {
      blurTimer = 0;
      if (focused) return;
      clearKeyboardPad(resolvePadPort(e.target instanceof HTMLElement ? e.target : null));
      for (const node of root.querySelectorAll(`[${PAD_ATTR}]`)) {
        if (node instanceof HTMLElement) clearKeyboardPad(node);
      }
      captureIdleVisualHeight();
    }, 180);
  };

  const onViewport = () => {
    if (!isMobileTabletViewport()) {
      for (const node of root.querySelectorAll(`[${PAD_ATTR}]`)) {
        if (node instanceof HTMLElement) clearKeyboardPad(node);
      }
      return;
    }
    if (!focused) captureIdleVisualHeight();
    if (focused) schedule();
  };

  root.addEventListener("focusin", onFocusIn);
  root.addEventListener("focusout", onFocusOut);
  root.addEventListener("pointerdown", onPointerDown);
  window.visualViewport?.addEventListener("resize", onViewport);
  window.visualViewport?.addEventListener("scroll", onViewport);
  window.addEventListener("resize", onViewport);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    if (blurTimer) window.clearTimeout(blurTimer);
    root.removeEventListener("focusin", onFocusIn);
    root.removeEventListener("focusout", onFocusOut);
    root.removeEventListener("pointerdown", onPointerDown);
    window.visualViewport?.removeEventListener("resize", onViewport);
    window.visualViewport?.removeEventListener("scroll", onViewport);
    window.removeEventListener("resize", onViewport);
    for (const node of root.querySelectorAll(`[${PAD_ATTR}]`)) {
      if (node instanceof HTMLElement) clearKeyboardPad(node);
    }
  };
}
