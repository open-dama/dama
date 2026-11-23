"use client";

import { bindTextInputKeyboardScroll } from "@/lib/text-input-keyboard-scroll";
import { useEffect, useSyncExternalStore } from "react";

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

function useMaxLg(): boolean {
  return useSyncExternalStore(subscribeMaxLg, getMaxLgSnapshot, () => false);
}

/** Phone/tablet: keep focused character text fields above the soft keyboard. */
export function useTextInputKeyboardScroll(root: HTMLElement | null, enabled = true): void {
  const maxLg = useMaxLg();

  useEffect(() => {
    if (!enabled || !maxLg || !root) return;
    return bindTextInputKeyboardScroll({ root });
  }, [enabled, maxLg, root]);
}
