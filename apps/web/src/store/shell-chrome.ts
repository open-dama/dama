"use client";

import { create } from "zustand";

/**
 * Ephemeral shell chrome (not persisted).
 * Immersive chat / rail compose sheet hide the fixed mobile bottom nav so typing
 * surfaces can sit flush above the soft keyboard.
 */
type ShellChromeState = {
  /** When true, BottomNavBar is hidden and --dama-bottom-nav-height is forced to 0. */
  immersiveChat: boolean;
  setImmersiveChat: (value: boolean) => void;
  /**
   * max-lg play rail expanded over the board after character text focus
   * (username / opponent search). Explicit dismiss only - not on field blur.
   */
  railComposeSheet: boolean;
  setRailComposeSheet: (value: boolean) => void;
  /** performance.now() when compose last opened - ghost-click guards for in-rail links. */
  railComposeOpenedAt: number;
  /**
   * Tuck SmartBoardHost pop (e.g. tournaments FAB play-rail Sheet open)
   * so the rail is not trapped under the maximized board (z-60).
   */
  suppressSmartBoardPop: boolean;
  setSuppressSmartBoardPop: (value: boolean) => void;
};

export const useShellChromeStore = create<ShellChromeState>((set, get) => ({
  immersiveChat: false,
  setImmersiveChat: (immersiveChat) => {
    if (get().immersiveChat === immersiveChat) return;
    set({ immersiveChat });
  },
  railComposeSheet: false,
  railComposeOpenedAt: 0,
  setRailComposeSheet: (railComposeSheet) => {
    if (get().railComposeSheet === railComposeSheet) return;
    set({
      railComposeSheet,
      railComposeOpenedAt: railComposeSheet
        ? typeof performance !== "undefined"
          ? performance.now()
          : Date.now()
        : 0,
    });
  },
  suppressSmartBoardPop: false,
  setSuppressSmartBoardPop: (suppressSmartBoardPop) => {
    if (get().suppressSmartBoardPop === suppressSmartBoardPop) return;
    set({ suppressSmartBoardPop });
  },
}));
