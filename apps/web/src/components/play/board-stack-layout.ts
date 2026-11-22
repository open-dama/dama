"use client";

import { createContext, useContext } from "react";

/**
 * How PlayBoardColumn sizes the square:
 * - budget: height-fit into a locked host (52svh / expanded max-height)
 * - hug: width square only - never feed host height back into side (kills zoom loops)
 */
export type BoardStackLayoutMode = "budget" | "hug";

export const BoardStackLayoutContext = createContext<BoardStackLayoutMode>("budget");

export function useBoardStackLayoutMode(): BoardStackLayoutMode {
  return useContext(BoardStackLayoutContext);
}
