"use client";

import { PlayerUserMenu } from "@/components/auth/PlayerUserMenu";
import { PlayerMobileMenu } from "@/components/nav/PlayerMobileMenu";
import { SurfaceHomeLink } from "@/components/nav/SurfaceHomeLink";
import { CompetitionPointsToast } from "@/components/notifications/CompetitionPointsToast";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { usePublishHeightCssVar } from "@/hooks/usePublishHeightCssVar";
import {
  DAMA_MOBILE_HEADER_HEIGHT_VAR,
  playerHeaderInnerClass,
  playerStickyHeaderClass,
} from "@/lib/player-shell-ui";
import { cn } from "@/lib/utils";
import { useAuthHydrated, useAuthStore } from "@/store/auth";
import { useShellChromeStore } from "@/store/shell-chrome";
import { useRef } from "react";

/**
 * Persistent marketing shell chrome (Trim-style always-on bell).
 * Mobile: hamburger + brand + actions. Desktop: actions only (rail owns brand).
 * Second row hosts live board match seats (portal) when a board surface is active.
 *
 * When `lockToViewport`, phone/tablet header is position:fixed only (never sticky)
 * so board gestures cannot rubber-band / scroll it away.
 */
export function PlayerMobileChrome({ lockToViewport = false }: { lockToViewport?: boolean }) {
  const headerRef = useRef<HTMLElement>(null);
  usePublishHeightCssVar(headerRef, DAMA_MOBILE_HEADER_HEIGHT_VAR, true);
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);
  // Play-rail compose is full-bleed; hide chrome + spacer so no header band remains above.
  const railComposeSheet = useShellChromeStore((s) => s.railComposeSheet);

  return (
    <>
      {lockToViewport && !railComposeSheet ? (
        // Spacer matches max-lg:fixed so content does not slide under the chrome.
        <div
          className="shrink-0 max-lg:block lg:hidden"
          style={{ height: `var(${DAMA_MOBILE_HEADER_HEIGHT_VAR}, 3.5rem)` }}
          aria-hidden
        />
      ) : null}
      <header
        ref={headerRef}
        className={cn(
          "shrink-0 border-b border-[var(--dama-border)]/60 bg-[var(--dama-card)]/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--dama-card)]/90 overscroll-none",
          lockToViewport
            ? // Fixed on phone/tablet only - never sticky there (sticky+scroll fights on iOS).
              "max-lg:!fixed max-lg:inset-x-0 max-lg:top-0 max-lg:z-[50] max-lg:bg-[var(--dama-card)] max-lg:[touch-action:none] max-lg:[overscroll-behavior:none] max-lg:[transform:translate3d(0,0,0)] lg:sticky lg:top-0 lg:z-50"
            : playerStickyHeaderClass,
          railComposeSheet && "max-lg:!hidden",
        )}
        data-dama-shell-header=""
        data-skip-hide-on-scroll=""
        aria-hidden={railComposeSheet || undefined}
      >
        <div className={playerHeaderInnerClass}>
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <PlayerMobileMenu />
            <SurfaceHomeLink surface="player" className="font-display text-lg font-bold" />
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {hydrated && token ? (
              <>
                <CompetitionPointsToast accessToken={token} />
                <NotificationBell accessToken={token} />
              </>
            ) : null}
            <ThemeToggle />
            <PlayerUserMenu />
          </div>
        </div>
        {/* Live match seats / 2D·3D - filled by BoardMatchHeaderPortal when a board is active. */}
        <div
          data-board-match-header=""
          className="hidden w-full max-w-none items-center justify-center gap-2 border-t border-[var(--dama-border)]/40 px-3 py-1.5 data-[active]:flex sm:gap-3 sm:px-6 lg:px-8"
        />
      </header>
    </>
  );
}
