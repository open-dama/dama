"use client";

import { useEffect, useState } from "react";

export type DraughtsPerformanceTier = "high" | "low";

/**
 * High quality by default (product bar). Only drop to low on truly weak devices
 * or prefers-reduced-motion - never treat all touch/coarse pointers as low
 * (that made every phone board look soft / non-AA).
 */
export function useDraughtsPerformanceTier(): DraughtsPerformanceTier {
  const [tier, setTier] = useState<DraughtsPerformanceTier>("high");

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Product bar: high quality always unless the user asks for reduced motion.
    // Never demote phones via coarse pointer / speculative deviceMemory (soft boards).
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTier(reduceMotion ? "low" : "high");
  }, []);

  return tier;
}
