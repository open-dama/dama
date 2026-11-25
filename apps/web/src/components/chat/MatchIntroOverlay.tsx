"use client";

import { HostTrustBadge } from "@/components/trust/HostTrustBadge";
import { DamaUserAvatar } from "@/components/ui/DamaUserAvatar";
import { CountryFlag } from "@/lib/country-flag";
import { formatPlayerNameDisplay } from "@/lib/play-rail-display";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

export type MatchIntroPlayer = {
  username: string;
  avatarUrl?: string | null;
  countryCode?: string | null;
  /** API chrome-resolved host trust label (optional). */
  hostTrustBadge?: string | null;
  /** API host_trust_tier code (optional). */
  hostTrustTier?: string | null;
};

type Props = {
  vsLabel: string;
  ariaLabel: string;
  /** Optional esports eyebrow (e.g. "Game starting"). */
  startingLabel?: string;
  durationMs: number;
  /**
   * When true, stay mounted until `active` becomes false (pause cover).
   * Ignores duration auto-dismiss; durationMs may be 0.
   */
  persistent?: boolean;
  top: MatchIntroPlayer;
  bottom: MatchIntroPlayer;
  nameMaxChars?: string;
  nameSuffix?: string;
  /**
   * Extra bottom inset so nested pause meta (banner / countdown) does not
   * cover the bottom seat name on phone/tablet boards.
   */
  reserveBottom?: boolean;
  active: boolean;
  onDone?: () => void;
  onShow?: () => void;
};

function Seat({
  player,
  nameMaxChars,
  nameSuffix,
  align,
}: {
  player: MatchIntroPlayer;
  nameMaxChars?: string;
  nameSuffix?: string;
  align: "top" | "bottom";
}) {
  const displayName = formatPlayerNameDisplay(
    player.username,
    nameMaxChars ?? "",
    nameSuffix ?? "",
  );

  return (
    <div
      className={cn(
        // Full width so names can truncate against the board edge safely.
        // Always slide (pop-up / pop-down) - not only at wide containers.
        "relative flex w-full max-w-full flex-col items-center gap-1 @[340px]/intro:gap-1.5 @[420px]/intro:gap-2.5",
        align === "top"
          ? "animate-in fade-in slide-in-from-top-4 duration-700 @[420px]/intro:slide-in-from-top-6"
          : "animate-in fade-in slide-in-from-bottom-4 duration-700 @[420px]/intro:slide-in-from-bottom-6",
      )}
    >
      <span
        className="pointer-events-none absolute -inset-2 rounded-full opacity-60 blur-lg @[420px]/intro:-inset-4 @[420px]/intro:opacity-70 @[420px]/intro:blur-xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--dama-brand) 55%, transparent), transparent 70%)",
        }}
        aria-hidden
      />
      <DamaUserAvatar
        src={player.avatarUrl}
        className="relative h-12 w-12 rounded-lg border-2 border-[var(--dama-brand)] shadow-[0_0_20px_color-mix(in_srgb,var(--dama-brand)_40%,transparent)] ring-2 ring-[color-mix(in_srgb,var(--dama-brand)_30%,transparent)] @[340px]/intro:h-16 @[340px]/intro:w-16 @[340px]/intro:rounded-xl @[420px]/intro:h-20 @[420px]/intro:w-20 @[420px]/intro:shadow-[0_0_28px_color-mix(in_srgb,var(--dama-brand)_45%,transparent)] @[520px]/intro:h-24 @[520px]/intro:w-24"
      />
      <p
        className="relative flex w-full max-w-[min(100%,18rem)] items-center justify-center gap-1.5 px-1 text-sm font-bold tracking-tight text-white dark:text-[var(--dama-text)] @[340px]/intro:gap-2 @[340px]/intro:text-base @[420px]/intro:text-lg @[520px]/intro:text-xl"
        title={displayName}
      >
        <CountryFlag
          code={player.countryCode}
          className="h-3.5 w-5 shrink-0 @[420px]/intro:h-4 @[420px]/intro:w-6"
        />
        <span className="min-w-0 truncate">{displayName}</span>
      </p>
      <HostTrustBadge
        label={player.hostTrustBadge}
        tier={player.hostTrustTier}
        onMedia
        className="relative max-w-full truncate text-[8px] @[420px]/intro:text-[9px]"
      />
    </div>
  );
}

/** Full-board esports VS intro: top vs bottom, then dismisses. */
export function MatchIntroOverlay({
  vsLabel,
  ariaLabel,
  startingLabel,
  durationMs,
  persistent = false,
  top,
  bottom,
  nameMaxChars,
  nameSuffix,
  reserveBottom = false,
  active,
  onDone,
  onShow,
}: Props) {
  const [visible, setVisible] = useState(false);
  const onDoneRef = useRef(onDone);
  const onShowRef = useRef(onShow);
  onDoneRef.current = onDone;
  onShowRef.current = onShow;

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    if (persistent) {
      setVisible(true);
      onShowRef.current?.();
      return;
    }
    // Fail closed: duration must come from DB chrome (no invented default).
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      setVisible(false);
      onDoneRef.current?.();
      return;
    }
    setVisible(true);
    onShowRef.current?.();
    const tDone = window.setTimeout(() => {
      setVisible(false);
      onDoneRef.current?.();
    }, durationMs);
    return () => window.clearTimeout(tDone);
  }, [active, durationMs, persistent]);

  if (!visible) return null;

  const starting = (startingLabel || "").trim();

  return (
    <output
      className={cn(
        // overflow-hidden so pop-up / pop-down seats animate within the plane.
        // Full cinematic look (roster-parity /90 blur). Timed intro stays
        // pointer-events-none so the design cannot steal board taps / freeze play.
        // Persistent pause cover still captures input under official/player pause.
        "@container/intro absolute inset-0 z-40 flex h-full min-h-full w-full min-w-full flex-col items-center justify-center overflow-hidden bg-[var(--dama-bg)]/90 px-3 py-2 backdrop-blur-md @[420px]/intro:px-4 @[420px]/intro:py-3",
        persistent ? "pointer-events-auto" : "pointer-events-none",
        reserveBottom && "pb-24 @[420px]/intro:pb-28",
      )}
      aria-label={ariaLabel}
    >
      <span
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 45%, color-mix(in srgb, var(--dama-brand) 35%, transparent), transparent 70%)",
        }}
        aria-hidden
      />
      <span
        className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 opacity-60"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--dama-brand) 80%, white), transparent)",
          boxShadow: "0 0 18px color-mix(in srgb, var(--dama-brand) 70%, transparent)",
        }}
        aria-hidden
      />

      {starting ? (
        <p className="relative mb-2 max-w-full truncate px-1 text-center text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--dama-brand)] animate-in fade-in zoom-in-95 duration-500 dark:text-[var(--dama-text)] @[340px]/intro:mb-3 @[340px]/intro:text-[10px] @[340px]/intro:tracking-[0.32em] @[420px]/intro:mb-4 @[420px]/intro:text-xs @[420px]/intro:tracking-[0.35em]">
          <span className="inline-block animate-pulse drop-shadow-[0_0_12px_color-mix(in_srgb,var(--dama-brand)_80%,transparent)] dark:drop-shadow-[0_0_12px_color-mix(in_srgb,var(--dama-text)_45%,transparent)]">
            {starting}
          </span>
        </p>
      ) : null}

      <Seat player={top} nameMaxChars={nameMaxChars} nameSuffix={nameSuffix} align="top" />

      <div className="relative my-1.5 flex shrink-0 items-center justify-center @[340px]/intro:my-2.5 @[420px]/intro:my-3.5">
        <span
          className="absolute h-10 w-10 animate-ping rounded-full bg-[var(--dama-brand)]/25 @[340px]/intro:h-14 @[340px]/intro:w-14 @[420px]/intro:h-16 @[420px]/intro:w-16 @[520px]/intro:h-20 @[520px]/intro:w-20"
          aria-hidden
        />
        <span
          className="absolute h-8 w-8 rounded-full bg-[var(--dama-brand)]/20 blur-md @[340px]/intro:h-10 @[340px]/intro:w-10 @[420px]/intro:h-12 @[420px]/intro:w-12 @[520px]/intro:h-14 @[520px]/intro:w-14"
          aria-hidden
        />
        <p
          className="relative text-2xl font-black uppercase tracking-[0.22em] text-[var(--dama-brand)] drop-shadow-[0_0_18px_color-mix(in_srgb,var(--dama-brand)_70%,transparent)] @[340px]/intro:text-3xl @[340px]/intro:tracking-[0.26em] @[520px]/intro:text-4xl @[520px]/intro:tracking-[0.28em]"
          style={{
            // Theme token (not hard white) so dark/light pause+intro covers stay readable.
            WebkitTextStroke: "5px var(--dama-card)",
            paintOrder: "stroke fill",
          }}
        >
          {vsLabel}
        </p>
      </div>

      <Seat player={bottom} nameMaxChars={nameMaxChars} nameSuffix={nameSuffix} align="bottom" />
    </output>
  );
}
