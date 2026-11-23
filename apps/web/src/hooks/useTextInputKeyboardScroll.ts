"use client";

import { useMaxLg } from "@/hooks/useMaxLg";
import { bindTextInputKeyboardScroll } from "@/lib/text-input-keyboard-scroll";
import { useEffect } from "react";

/**
 * Phone/tablet: keep focused character text fields above the soft keyboard
 * inside `root` (play rail / marked scrollports). Desktop (lg+) no-ops.
 * Pass the element from a callback ref / useState so bind runs after mount.
 */
export function useTextInputKeyboardScroll(root: HTMLElement | null, enabled = true): void {
  const maxLg = useMaxLg();

  useEffect(() => {
    if (!enabled || !maxLg || !root) return;
    return bindTextInputKeyboardScroll({ root });
  }, [enabled, maxLg, root]);
}
