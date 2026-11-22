"use client";

import { BottomNavBar } from "@/components/nav/BottomNavBar";
import { FloatingResumeFab } from "@/components/nav/FloatingResumeFab";
import { LeaveBoardPauseHost } from "@/components/nav/LeaveBoardPauseHost";
import { PlayerDesktopRail } from "@/components/nav/PlayerDesktopRail";
import { PlayerMobileChrome } from "@/components/nav/PlayerMobileChrome";
import { useClientNavFullQuery } from "@/hooks/query/useClientNavFullQuery";
import { useLegalChromeQuery } from "@/hooks/query/useLegalChromeQuery";
import { softTournamentsPageTitle } from "@/lib/community-player-chrome-soft";
import { isHomeViewportLocked } from "@/lib/home-shell";
import { resolvePlayerNavHref } from "@/lib/player-nav";
import { homePlayMainPadClass } from "@/lib/player-shell-ui";
import { cn } from "@/lib/utils";
import { isLegalChromeReady } from "@/types/legal-chrome";
import { isMarketingChromeReady } from "@/types/platform";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense, useEffect } from "react";

function footerActive(pathname: string, href: string): boolean {
  const pathOnly = href.split("?")[0] || href;
  if (pathname === pathOnly) return true;
  if (pathOnly !== "/" && pathname.startsWith(`${pathOnly}/`)) return true;
  return false;
}

function MarketingShell({
  children,
  lockHomeViewport,
}: {
  children: ReactNode;
  lockHomeViewport: boolean;
}) {
  const pathname = usePathname() || "";
  const navQuery = useClientNavFullQuery();
  const legalQuery = useLegalChromeQuery(true);
  const nav = isMarketingChromeReady(navQuery.data) ? navQuery.data : undefined;
  const legal = isLegalChromeReady(legalQuery.data) ? legalQuery.data : undefined;
  const footer = (nav?.marketing_footer_text || "").trim();
  // Fail-open: remap legacy Event browse hrefs + soft Event-sport titles (mig 408 client half).
  const marketingLinks = (nav?.marketing ?? [])
    .filter((l) => Boolean(l.href?.trim()) && Boolean(l.title?.trim()))
    .map((l) => ({
      ...l,
      href: resolvePlayerNavHref(l),
      title: softTournamentsPageTitle(l.title),
    }))
    .filter((l) => Boolean(l.href?.trim()) && Boolean(l.title?.trim()));

  const privacyLabel = (legal?.privacy_nav_label || "").trim();
  const termsLabel = (legal?.terms_nav_label || "").trim();
  const refundsLabel = (legal?.refunds_nav_label || "").trim();

  const linkClass = (href: string) =>
    cn(
      "hover:text-[var(--dama-text)]",
      footerActive(pathname, href) && "font-medium text-[var(--dama-text)]",
    );

  const isHome = pathname === "/";
  const lockViewport = isHome && lockHomeViewport;

  // Locked play: kill document rubber-band so board gestures cannot pull the header.
  useEffect(() => {
    if (!lockViewport) return;
    const root = document.documentElement;
    const prevRoot = root.style.overscrollBehaviorY;
    const prevBody = document.body.style.overscrollBehaviorY;
    const prevRootOverflow = root.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevRootTouch = root.style.touchAction;
    root.style.overscrollBehaviorY = "none";
    document.body.style.overscrollBehaviorY = "none";
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    // manipulation: allow rail pan-y; board/header blocked via preventDefault below.
    root.style.touchAction = "manipulation";
    const onTouchMove = (event: TouchEvent) => {
      const t = event.target;
      if (!(t instanceof Element)) return;
      // Only intentional scrollports may scroll. Everything else (board, header, main)
      // must not rubber-band the locked shell / fixed top nav.
      if (
        t.closest(
          "[data-dama-rail-scroll], [data-dama-rail-aside], [role='dialog'], [data-radix-scroll-area-viewport], [data-radix-select-content]",
        )
      ) {
        return;
      }
      if (event.cancelable) event.preventDefault();
    };
    window.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    return () => {
      root.style.overscrollBehaviorY = prevRoot;
      document.body.style.overscrollBehaviorY = prevBody;
      root.style.overflow = prevRootOverflow;
      document.body.style.overflow = prevBodyOverflow;
      root.style.touchAction = prevRootTouch;
      window.removeEventListener("touchmove", onTouchMove, true);
    };
  }, [lockViewport]);

  return (
    <div
      className={cn(
        "bg-[var(--dama-bg)] text-[var(--dama-text)]",
        // Locked play: flex + h-svh (not dvh) so iOS Safari URL-bar show/hide cannot
        // resize the board host in a measure loop. Rail still scrolls inside.
        // Unlocked embeds (leaderboard/match): page scroll; md+ row with left rail.
        lockViewport
          ? "flex h-svh max-h-svh overflow-hidden overscroll-none"
          : "min-h-screen md:flex",
      )}
    >
      <Suspense fallback={<aside className="hidden h-screen w-[15.5rem] shrink-0 md:block" />}>
        <PlayerDesktopRail />
      </Suspense>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          lockViewport ? "h-full min-h-0 overflow-hidden" : "min-h-screen",
        )}
      >
        <Suspense fallback={null}>
          <PlayerMobileChrome lockToViewport={lockViewport} />
        </Suspense>
        <main
          className={cn(
            "w-full max-w-none flex-1",
            isHome
              ? cn(
                  // Use pt/px only - never py-* here; it overrides bottom-nav pb calc.
                  "px-2 pt-2 sm:px-3 lg:px-4",
                  lockViewport
                    ? // No main pb on locked play - it left a blank band above the bottom nav.
                      // Rail scrollport clears the nav instead (see playRailAsideScrollClass).
                      // overscroll-none: board gestures must not pull the sticky header.
                      "flex min-h-0 flex-col overflow-hidden overscroll-none"
                    : // Unlocked embeds: document scroll + bottom-nav clearance.
                      cn("overflow-visible", homePlayMainPadClass),
                )
              : cn("px-4 pt-6 sm:px-6 lg:px-8", homePlayMainPadClass),
          )}
        >
          {children}
        </main>
        {!isHome ? (
          <footer className="border-t border-[var(--dama-border)]/40 py-6 text-center text-sm text-[var(--dama-muted-foreground)] pb-[calc(var(--dama-bottom-nav-height,5.5rem)+var(--dama-bottom-pad-extra,1.25rem)+env(safe-area-inset-bottom,0px))] md:pb-6">
            {footer ? <p>{footer}</p> : null}
            {marketingLinks.length > 0 || privacyLabel || termsLabel || refundsLabel ? (
              <nav
                className="mt-3 flex flex-wrap items-center justify-center gap-4"
                aria-label="Site"
              >
                {marketingLinks.map((item) => {
                  const href = (item.href || "").trim();
                  const title = (item.title || "").trim();
                  if (!href || !title) return null;
                  return (
                    <Link key={`${item.route_key}-${href}`} href={href} className={linkClass(href)}>
                      {title}
                    </Link>
                  );
                })}
                {privacyLabel ? (
                  <Link href="/privacy" className={linkClass("/privacy")}>
                    {privacyLabel}
                  </Link>
                ) : null}
                {termsLabel ? (
                  <Link href="/terms" className={linkClass("/terms")}>
                    {termsLabel}
                  </Link>
                ) : null}
                {refundsLabel ? (
                  <Link href="/refunds" className={linkClass("/refunds")}>
                    {refundsLabel}
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </footer>
        ) : null}
        <Suspense fallback={null}>
          <BottomNavBar surface="player" />
          <LeaveBoardPauseHost />
          <FloatingResumeFab />
        </Suspense>
      </div>
    </div>
  );
}

function MarketingShellWithSearch({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  return (
    <MarketingShell lockHomeViewport={isHomeViewportLocked(searchParams)}>
      {children}
    </MarketingShell>
  );
}

/** Chess.com-style shell: mobile chrome + bottom nav; desktop left rail. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<MarketingShell lockHomeViewport>{children}</MarketingShell>}>
      <MarketingShellWithSearch>{children}</MarketingShellWithSearch>
    </Suspense>
  );
}
