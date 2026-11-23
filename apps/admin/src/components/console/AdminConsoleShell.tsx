"use client";

import { AdminUserMenu } from "@/components/auth/AdminUserMenu";
import { ConsoleHomeLink } from "@/components/console/ConsoleHomeLink";
import { AdminNotificationBell } from "@/components/notifications/AdminNotificationBell";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Button } from "@/components/ui/button";
import { FetchProgressBar } from "@/components/ui/fetch-progress";
import { NavLinksSkeleton } from "@/components/ui/shimmer-skeletons";
import { useConsoleNavQuery } from "@/hooks/query";
import { useTextInputKeyboardScroll } from "@/hooks/useTextInputKeyboardScroll";
import { adminNavIconForHref } from "@/lib/admin-nav-icons";
import { cn } from "@/lib/utils";
import { useAuthHydrated, useAuthStore } from "@/store/auth";
import type { ConsoleNavItem, ConsoleNavSection } from "@/types/console";
import { ChevronRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

function navItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href !== "/" && pathname.startsWith(`${href}/`)) return true;
  return false;
}

function findActiveSectionId(pathname: string, sections: ConsoleNavSection[]): string {
  for (const section of sections) {
    for (const item of section.items ?? []) {
      const href = (item.href || "").trim();
      if (href && navItemActive(pathname, href)) return section.id;
    }
  }
  return (sections[0]?.id || "").trim();
}

function NavAccordion({
  sections,
  pathname,
  onNavigate,
}: {
  sections: ConsoleNavSection[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const activeSection = useMemo(
    () => findActiveSectionId(pathname, sections),
    [pathname, sections],
  );
  const [openId, setOpenId] = useState(activeSection);

  useEffect(() => {
    setOpenId(activeSection);
  }, [activeSection]);

  return (
    <nav
      className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overscroll-contain p-2 pb-8 [-webkit-overflow-scrolling:touch]"
      aria-label="Console"
    >
      {sections.map((section) => {
        const id = (section.id || "").trim();
        const label = (section.label || "").trim();
        const items = (section.items ?? []).filter((item) => {
          const href = (item.href || "").trim();
          const itemLabel = (item.label || "").trim();
          return Boolean(href && itemLabel);
        });
        if (!id || !label || items.length === 0) return null;

        // Trim: single-item sections render as one top-level link (section label).
        if (items.length === 1) {
          const only = items[0];
          if (!only) return null;
          const href = (only.href || "").trim();
          if (!href) return null;
          const Icon = adminNavIconForHref(href);
          const active = navItemActive(pathname, href);
          return (
            <div key={id} className="border-b border-[var(--dama-border)]/80">
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-[var(--dama-surface)] text-[var(--dama-text)]"
                    : "text-[var(--dama-muted)] hover:bg-[var(--dama-surface)] hover:text-[var(--dama-text)]",
                )}
              >
                {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden /> : null}
                <span className="truncate">{label}</span>
              </Link>
            </div>
          );
        }

        const open = openId === id;
        return (
          <div key={id} className="border-b border-[var(--dama-border)]/80">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId((current) => (current === id ? "" : id))}
              className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm font-medium text-[var(--dama-text)] transition-colors hover:bg-[var(--dama-surface)]"
            >
              <span className="truncate">{label}</span>
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-[var(--dama-muted)] transition-transform duration-200 ease-out",
                  open && "rotate-90",
                )}
              />
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out",
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="min-h-0 overflow-hidden">
                <ul className="space-y-0.5 pb-2 pl-1">
                  {items.map((item: ConsoleNavItem) => {
                    const href = (item.href || "").trim();
                    const itemLabel = (item.label || "").trim();
                    const Icon = adminNavIconForHref(href);
                    const active = navItemActive(pathname, href);
                    return (
                      <li key={item.id || href}>
                        <Link
                          href={href}
                          onClick={() => {
                            setOpenId(id);
                            onNavigate?.();
                          }}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                            active
                              ? "bg-[var(--dama-surface)] font-medium text-[var(--dama-text)]"
                              : "text-[var(--dama-muted)] hover:bg-[var(--dama-surface)] hover:text-[var(--dama-text)]",
                          )}
                        >
                          {Icon ? (
                            <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                          ) : null}
                          <span className="min-w-0 truncate">{itemLabel}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function FlatNav({
  modules,
  pathname,
  onNavigate,
}: {
  modules: { title: string; href: string }[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav
      className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-2 pb-8 [-webkit-overflow-scrolling:touch]"
      aria-label="Console"
    >
      {modules.map((item) => {
        if (!item.href) return null;
        const active = navItemActive(pathname, item.href);
        const Icon = adminNavIconForHref(item.href);
        return (
          <Link
            key={`${item.href}-${item.title}`}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-[var(--dama-surface)] text-[var(--dama-text)]"
                : "text-[var(--dama-muted)] hover:bg-[var(--dama-surface)] hover:text-[var(--dama-text)]",
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden /> : null}
            <span className="truncate">{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}

type MobileNavChip = { href: string; label: string };

function flattenConsoleNavChips(
  sections: ConsoleNavSection[],
  modules: { title: string; href: string }[],
): MobileNavChip[] {
  const out: MobileNavChip[] = [];
  const seen = new Set<string>();
  const push = (href: string, label: string) => {
    const h = href.trim();
    const l = label.trim();
    if (!h || !l || seen.has(h)) return;
    seen.add(h);
    out.push({ href: h, label: l });
  };
  if (sections.length > 0) {
    for (const section of sections) {
      const items = section.items ?? [];
      if (items.length === 1) {
        const only = items[0];
        if (!only) continue;
        push(only.href || "", (section.label || only.label || "").trim());
        continue;
      }
      for (const item of items) {
        push(item.href || "", item.label || "");
      }
    }
    return out;
  }
  for (const mod of modules) {
    push(mod.href, mod.title);
  }
  return out;
}

/** Trim-style console shell: sticky left nav + header (DB console_nav modules/sections). */
export function AdminConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const navQuery = useConsoleNavQuery(true);
  const modules = navQuery.data?.modules ?? [];
  const sections = (navQuery.data?.sections ?? []).filter(
    (s) => (s.id || "").trim() && (s.label || "").trim() && (s.items?.length ?? 0) > 0,
  );
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const fabShellRef = useRef<HTMLDivElement>(null);
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);
  const mobileChips = useMemo(() => flattenConsoleNavChips(sections, modules), [sections, modules]);
  const [shellRoot, setShellRoot] = useState<HTMLElement | null>(null);
  // Phone/tablet: character text fields scroll above the soft keyboard (web play-rail parity).
  // Character text keyboard scroll (shared with web). Play-rail compose / board-pop
  // tuck are N/A here - admin has no board+rail play surface; console main scrolls.
  useTextInputKeyboardScroll(shellRoot);

  // biome-ignore lint/correctness/useExhaustiveDependencies: collapse tray on route change
  useEffect(() => {
    setMobileExpanded(false);
  }, [pathname]);

  // Outside tap collapses the L → R tray (web BottomNavBar parity).
  useEffect(() => {
    if (!mobileExpanded) return;
    const onPointer = (event: PointerEvent) => {
      const root = fabShellRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      setMobileExpanded(false);
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [mobileExpanded]);

  function renderNav(onNavigate?: () => void) {
    if (navQuery.isLoading) {
      return (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <NavLinksSkeleton count={8} />
        </div>
      );
    }
    if (sections.length > 0) {
      return <NavAccordion sections={sections} pathname={pathname} onNavigate={onNavigate} />;
    }
    return <FlatNav modules={modules} pathname={pathname} onNavigate={onNavigate} />;
  }

  return (
    <div
      ref={setShellRoot}
      className="min-h-screen bg-[var(--dama-bg)] text-[var(--dama-text)] md:flex"
    >
      {/* Desktop / tablet: flex column + min-h-0 so nav scrolls to last leaf */}
      <aside className="sticky top-0 z-30 hidden h-dvh max-h-dvh w-60 shrink-0 flex-col self-start overflow-hidden border-r border-[var(--dama-border)] bg-[var(--dama-card)] md:flex">
        <div className="flex h-14 shrink-0 items-center border-b border-[var(--dama-border)] px-4">
          <ConsoleHomeLink />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{renderNav()}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-[var(--dama-border)] bg-[var(--dama-card)]/90 backdrop-blur overscroll-none">
          <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-2 md:hidden">
              <ConsoleHomeLink className="min-w-0" />
            </div>
            <div className="ml-auto flex items-center gap-3">
              {hydrated && token ? <AdminNotificationBell token={token} /> : null}
              <ThemeToggle className="shrink-0" />
              <AdminUserMenu />
            </div>
          </div>
          <FetchProgressBar active={navQuery.isFetching && !navQuery.isLoading} />
        </header>
        <main
          className="w-full flex-1 p-3 pb-24 sm:p-4 md:p-6 md:pb-6 lg:px-8"
          data-dama-kb-scroll=""
        >
          {children}
        </main>
      </div>

      {/* Mobile: collapsed brand FAB → menus expand left → right (web BottomNavBar parity). */}
      <div
        ref={fabShellRef}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <nav
          className="pointer-events-auto flex w-full items-end gap-2 px-3 pb-1 pt-1"
          aria-label="Console"
        >
          <Button
            type="button"
            variant="play"
            size="icon"
            className="h-12 w-12 shrink-0 rounded-full shadow-lg"
            aria-label={mobileExpanded ? "Close menu" : "Open menu"}
            aria-expanded={mobileExpanded}
            aria-controls="dama-admin-bottom-nav-tray"
            onClick={() => setMobileExpanded((v) => !v)}
          >
            {mobileExpanded ? (
              <X className="h-5 w-5" aria-hidden />
            ) : (
              <Menu className="h-5 w-5" aria-hidden />
            )}
          </Button>

          <div
            id="dama-admin-bottom-nav-tray"
            className={cn(
              "min-w-0 overflow-hidden transition-[max-width,opacity] duration-300 ease-out",
              mobileExpanded ? "max-w-[calc(100vw-4.5rem)] opacity-100" : "max-w-0 opacity-0",
            )}
            aria-hidden={!mobileExpanded}
          >
            <div
              className={cn(
                "flex min-h-12 items-stretch gap-0.5 rounded-full border border-[var(--dama-border)]/50 bg-[var(--dama-card)]/80 px-1.5 py-1 shadow-[0_8px_28px_rgba(0,0,0,0.12)] backdrop-blur-2xl supports-[backdrop-filter]:bg-[var(--dama-card)]/60",
                "overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              )}
            >
              {navQuery.isLoading || mobileChips.length === 0
                ? (["ad-sk-0", "ad-sk-1", "ad-sk-2", "ad-sk-3"] as const).map((id) => (
                    <div
                      key={id}
                      className="flex w-auto shrink-0 flex-col items-center justify-center gap-1 px-2.5 py-1"
                    >
                      <div className="dama-shimmer h-5 w-5 rounded-md" aria-hidden />
                      <div className="dama-shimmer h-2 w-8 rounded" aria-hidden />
                    </div>
                  ))
                : mobileChips.map((item) => {
                    const Icon = adminNavIconForHref(item.href);
                    const active = navItemActive(pathname, item.href);
                    return (
                      <Link
                        key={`${item.href}-${item.label}`}
                        href={item.href}
                        onClick={() => setMobileExpanded(false)}
                        className={cn(
                          "relative flex w-auto shrink-0 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium leading-tight tracking-wide transition-colors sm:text-[11px]",
                          active
                            ? "bg-[var(--dama-brand)]/15 text-[var(--dama-text)]"
                            : "text-[var(--dama-muted)] hover:text-[var(--dama-text)]",
                        )}
                        aria-label={item.label}
                        aria-current={active ? "page" : undefined}
                      >
                        {Icon ? (
                          <Icon
                            className="h-5 w-5 shrink-0"
                            strokeWidth={active ? 2.25 : 1.75}
                            aria-hidden
                          />
                        ) : (
                          <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
                        )}
                        <span className="max-w-[4.5rem] truncate px-0.5">{item.label}</span>
                      </Link>
                    );
                  })}
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}
