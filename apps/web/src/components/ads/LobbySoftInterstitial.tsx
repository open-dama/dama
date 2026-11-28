"use client";

import { ViewportAdCreative } from "@/components/ads/ViewportAdCreative";
import { useOptionalMatchmakingRealtime } from "@/components/matchmaking/MatchmakingRealtimeProvider";
import { Button } from "@/components/ui/button";
import {
  useAdClickMutation,
  useAdImpressionMutation,
  useAdVideoCompleteMutation,
} from "@/hooks/mutation";
import { useAdPlaybackQuery } from "@/hooks/query/useAdPlaybackQuery";
import { usePlayerGeoQuery } from "@/hooks/query/usePlayerGeoQuery";
import { releaseBodyPointerEvents } from "@/hooks/use-deferred-dialog-selection";
import { armAudioGestureResume, resumeGameAudio } from "@/lib/audio-notify";
import { adSessionKey, adViewerKey } from "@/lib/ad-viewer-session";
import { restClient } from "@/lib/api";
import {
  parseViewportBreakpoints,
  pickCampaignCreative,
  resolveViewportSlot,
} from "@/lib/resolve-viewport-creative";
import { useShellChromeStore } from "@/store/shell-chrome";
import type { ServedAd } from "@/types/ads";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function formatSkip(template: string, seconds: number): string {
  return template.replace("{seconds}", String(seconds));
}

function pickSoftCampaign(rows: ServedAd[], hasMedia: (row: ServedAd) => boolean): ServedAd | null {
  const usable = rows.filter(hasMedia);
  if (!usable.length) return null;
  return usable.find((c) => c.lobby_takeover === true) ?? usable[0] ?? null;
}

type Props = {
  /** When true, never show (queue, invite, live match, wallet/KYC, enroll). */
  blocked: boolean;
};

/**
 * Phase B: soft full-screen lobby ad after idle dwell.
 * Reuses in-match overlay UX. Uses GET /ads/serve (placement lobby) + freq caps.
 * Never during critical flows (caller passes blocked).
 */
export function LobbySoftInterstitial({ blocked }: Props) {
  const geoQuery = usePlayerGeoQuery();
  const playbackQuery = useAdPlaybackQuery(!blocked);
  const impression = useAdImpressionMutation();
  const click = useAdClickMutation();
  const videoComplete = useAdVideoCompleteMutation();
  const mmRealtime = useOptionalMatchmakingRealtime();
  const enteringMatchSyncRef = useRef<() => boolean>(() => false);
  enteringMatchSyncRef.current = mmRealtime?.isEnteringMatchSync ?? (() => false);
  const videoCompletedRef = useRef(false);

  const [viewerKey, setViewerKey] = useState("");
  const [sessionKey, setSessionKey] = useState("");
  const [open, setOpen] = useState(false);
  const [campaign, setCampaign] = useState<ServedAd | null>(null);
  const [nonSkippable, setNonSkippable] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const setLobbySoftOpen = useShellChromeStore((s) => s.setLobbySoftOpen);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const openRef = useRef(false);
  const shownThisIdleRef = useRef(false);
  const showInFlightRef = useRef(false);
  const lastActivityMs = useRef(Date.now());
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  openRef.current = open;

  // Sync tile pause with overlay open. Unmount-only cleanup: do not clear on the
  // false→true open transition (that cleanup would briefly unblock GeoAdSlot
  // impress/rotate while soft is opening after setLobbySoftOpen(true) in tryShow).
  useEffect(() => {
    setLobbySoftOpen(open);
  }, [open, setLobbySoftOpen]);
  useEffect(() => {
    return () => {
      setLobbySoftOpen(false);
    };
  }, [setLobbySoftOpen]);

  useEffect(() => {
    // Sync storage helpers (GeoAdSlot parity). Do not await.
    setViewerKey(adViewerKey());
    setSessionKey(adSessionKey());
  }, []);

  const softEnabled = playbackQuery.data?.lobby_soft_interstitial_enabled === true;
  const idleThreshold = Math.max(
    1,
    Math.floor(playbackQuery.data?.lobby_idle_threshold_seconds ?? 90),
  );
  // Parity with GeoAdSlot / useServeAdsQuery: country OR lat is enough to serve.
  const geo = useMemo(() => {
    const raw = geoQuery.data;
    if (!raw) return null;
    if (!raw.country && raw.lat == null) return null;
    return {
      country: raw.country,
      region: raw.region,
      district: raw.district,
      lat: raw.lat,
      lng: raw.lng,
    };
  }, [geoQuery.data]);

  // Soft must not subscribe to shared ads-serve (same key as GeoAdSlot). Enabling
  // soft would refetch the tile cache and double-bill without a rotate tick.

  const clearIdle = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
  }, []);

  const closeOverlay = useCallback(() => {
    clearCountdown();
    openRef.current = false;
    setOpen(false);
    setCampaign(null);
    setNonSkippable(null);
    setRemaining(null);
    releaseBodyPointerEvents();
    window.setTimeout(releaseBodyPointerEvents, 0);
    void resumeGameAudio();
    armAudioGestureResume();
    lastActivityMs.current = Date.now();
    shownThisIdleRef.current = false;
  }, [clearCountdown]);

  const armIdle = useCallback(() => {
    clearIdle();
    if (blockedRef.current || !softEnabled || openRef.current) return;
    // Never arm while the tab is hidden (closeOverlay + open effect must not restart dwell).
    if (typeof document !== "undefined" && document.hidden) return;
    // Wait for viewer+session so the first idle tick can impress on the freq ledger.
    if (!viewerKey.trim() || !sessionKey.trim()) return;
    idleTimer.current = setTimeout(() => {
      // tryShow is attached below; idle tick always calls the latest via ref.
      tryShowRef.current();
    }, idleThreshold * 1000);
  }, [clearIdle, idleThreshold, softEnabled, sessionKey, viewerKey]);

  const tryShowRef = useRef(() => {});

  const tryShow = useCallback(() => {
    if (
      blockedRef.current ||
      enteringMatchSyncRef.current() ||
      openRef.current ||
      shownThisIdleRef.current ||
      showInFlightRef.current
    ) {
      return;
    }
    const rearmIfIdle = () => {
      // Do not re-arm while the tab is hidden (visibilitychange re-arms on return).
      if (typeof document !== "undefined" && document.hidden) return;
      if (
        !blockedRef.current &&
        !enteringMatchSyncRef.current() &&
        softEnabled &&
        !openRef.current
      ) {
        armIdle();
      }
    };
    // Session/viewer keys required so soft impress lands on the same freq ledger.
    if (!viewerKey.trim() || !sessionKey.trim()) {
      rearmIfIdle();
      return;
    }
    // Hidden tab: fail closed (GeoAdSlot + Flutter lifecycle parity).
    if (typeof document !== "undefined" && document.hidden) {
      return;
    }
    const pb = playbackQuery.data;
    if (!pb || pb.lobby_soft_interstitial_enabled !== true) {
      rearmIfIdle();
      return;
    }
    const breakpoints = pb.schedule_chrome ? parseViewportBreakpoints(pb.schedule_chrome) : null;
    const slot = breakpoints
      ? resolveViewportSlot(
          typeof window !== "undefined" ? window.innerWidth : breakpoints.tabletMax + 1,
          breakpoints,
        )
      : null;
    if (!slot) {
      rearmIfIdle();
      return;
    }
    // Geo required before pausing the tile (Flutter locate gate parity).
    if (!geo || (!geo.country && geo.lat == null)) {
      rearmIfIdle();
      return;
    }
    // Fresh serve before open via out-of-band GET (Flutter soft parity). Do not
    // refetch the shared ads-serve query or tile dataUpdatedAt / unpaid showKeys burn.
    // Pause tile impress first so rotate cannot double-count while soft decides.
    const flightStartedAt = Date.now();
    const abortedByActivity = () => lastActivityMs.current > flightStartedAt;
    showInFlightRef.current = true;
    setLobbySoftOpen(true);
    void (async () => {
      try {
        if (
          blockedRef.current ||
          enteringMatchSyncRef.current() ||
          openRef.current ||
          shownThisIdleRef.current
        ) {
          return;
        }
        if (abortedByActivity()) return;
        if (typeof document !== "undefined" && document.hidden) return;
        let rows: ServedAd[] = [];
        try {
          const params = new URLSearchParams();
          if (geo.lat != null) params.set("lat", String(geo.lat));
          if (geo.lng != null) params.set("lng", String(geo.lng));
          params.set("viewer_key", viewerKey);
          params.set("session_key", sessionKey);
          const qs = params.toString();
          const { data } = await restClient.get<{ campaigns?: ServedAd[] }>(
            qs ? `/ads/serve?${qs}` : "/ads/serve",
            { headers: { "X-Device-Id": viewerKey } },
          );
          if (Array.isArray(data.campaigns)) rows = data.campaigns;
        } catch {
          // Fail closed below if empty.
        }
        if (
          blockedRef.current ||
          enteringMatchSyncRef.current() ||
          openRef.current ||
          shownThisIdleRef.current
        ) {
          return;
        }
        if (abortedByActivity()) return;
        if (typeof document !== "undefined" && document.hidden) return;
        const picked = pickSoftCampaign(rows, (row) => {
          const creative = pickCampaignCreative(row, slot);
          return Boolean(creative.imageUrl || creative.videoId);
        });
        if (!picked?.id) return;
        if (
          blockedRef.current ||
          enteringMatchSyncRef.current() ||
          !viewerKey.trim() ||
          !sessionKey.trim()
        ) {
          return;
        }
        if (abortedByActivity()) return;
        const livePb = playbackQuery.data;
        if (!livePb || livePb.lobby_soft_interstitial_enabled !== true) return;
        if (blockedRef.current || enteringMatchSyncRef.current() || abortedByActivity()) {
          return;
        }
        // Flutter _appVisible parity: never bill or open while the tab is hidden.
        if (typeof document !== "undefined" && document.hidden) return;
        const ns = Math.max(1, Math.floor(livePb.non_skippable_seconds || 5));
        // Bill first: fail closed so uncapped soft cannot loop without a ledger write.
        try {
          await impression.mutateAsync({
            campaignId: picked.id,
            placement: livePb.player_chrome?.placement_lobby || "lobby",
            viewerKey,
            sessionKey,
            viewport: slot || undefined,
          });
        } catch {
          return;
        }
        if (
          blockedRef.current ||
          enteringMatchSyncRef.current() ||
          abortedByActivity() ||
          openRef.current ||
          (typeof document !== "undefined" && document.hidden)
        ) {
          return;
        }
        videoCompletedRef.current = false;
        shownThisIdleRef.current = true;
        openRef.current = true;
        setCampaign(picked);
        setNonSkippable(ns);
        setRemaining(ns);
        setOpen(true);
      } finally {
        showInFlightRef.current = false;
        // If we never opened, release the tile pause and re-arm dwell so empty
        // inventory / failed serve can retry while the player is still idle.
        // Skip re-arm while hidden (parity with Flutter _appVisible gate).
        if (!openRef.current) {
          setLobbySoftOpen(false);
          if (
            !blockedRef.current &&
            softEnabled &&
            !(typeof document !== "undefined" && document.hidden)
          ) {
            armIdle();
          }
        }
      }
    })();
  }, [
    armIdle,
    geo,
    impression,
    playbackQuery.data,
    sessionKey,
    setLobbySoftOpen,
    softEnabled,
    viewerKey,
  ]);

  tryShowRef.current = tryShow;

  const noteActivity = useCallback(() => {
    lastActivityMs.current = Date.now();
    if (openRef.current) return;
    // In-flight soft: stamp activity so tryShow aborts; finally re-arms dwell.
    if (showInFlightRef.current) return;
    shownThisIdleRef.current = false;
    armIdle();
  }, [armIdle]);

  useEffect(() => {
    if (blocked || !softEnabled) {
      clearIdle();
      // Mid-flight hard gate: stamp activity so tryShow aborts (full idle after clear).
      if (showInFlightRef.current) {
        lastActivityMs.current = Date.now();
      }
      if (open) closeOverlay();
      return;
    }
    // Soft close while hidden flips open→false and re-enters this effect; do not
    // restart idle until visibilitychange brings the tab back.
    if (typeof document === "undefined" || !document.hidden) {
      armIdle();
    }
    const onActivity = () => noteActivity();
    const onVisibility = () => {
      if (document.hidden) {
        clearIdle();
        if (openRef.current) closeOverlay();
        return;
      }
      noteActivity();
    };
    // Dwell = linger without meaningful interaction (not raw mousemove).
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "scroll"];
    for (const ev of events) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    window.addEventListener("visibilitychange", onVisibility, { passive: true });
    return () => {
      clearIdle();
      for (const ev of events) {
        window.removeEventListener(ev, onActivity);
      }
      window.removeEventListener("visibilitychange", onVisibility);
    };
  }, [armIdle, blocked, clearIdle, closeOverlay, noteActivity, open, softEnabled]);

  useEffect(() => {
    if (!open || nonSkippable == null) {
      clearCountdown();
      return;
    }
    clearCountdown();
    countdownTimer.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev == null || prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearCountdown();
  }, [open, nonSkippable, clearCountdown]);

  const chrome = playbackQuery.data?.player_chrome;
  const breakpoints = playbackQuery.data?.schedule_chrome
    ? parseViewportBreakpoints(playbackQuery.data.schedule_chrome)
    : null;
  const slot =
    breakpoints && typeof window !== "undefined"
      ? resolveViewportSlot(window.innerWidth, breakpoints)
      : breakpoints
        ? resolveViewportSlot(breakpoints.tabletMax + 1, breakpoints)
        : null;
  const pickedCreative = open && campaign && slot ? pickCampaignCreative(campaign, slot) : null;
  const hasMedia = Boolean(pickedCreative?.imageUrl || pickedCreative?.videoId);

  useEffect(() => {
    if (!open || !campaign || !breakpoints) return;
    if (!hasMedia) closeOverlay();
  }, [open, campaign, breakpoints, hasMedia, closeOverlay]);

  if (!open || !campaign || nonSkippable == null || remaining == null || !chrome) {
    return null;
  }
  if (!breakpoints || !hasMedia) {
    return null;
  }

  const canSkip = remaining <= 0;

  return (
    <dialog
      open
      className="fixed inset-0 z-50 m-0 flex h-full w-full max-w-none items-center justify-center bg-black/80 p-4"
      aria-label={campaign.title}
    >
      <div className="w-full max-w-lg space-y-4 rounded-xl border border-[var(--dama-border)] bg-[var(--dama-card)] p-5">
        <p className="text-xs uppercase tracking-wide text-[var(--dama-muted)]">
          {chrome.sponsored_label}
        </p>
        <button
          type="button"
          className="block w-full text-left"
          onClick={() => click.mutate(campaign.id)}
        >
          <ViewportAdCreative
            campaign={campaign}
            scheduleChrome={playbackQuery.data?.schedule_chrome}
            onVideoEnded={() => {
              if (videoCompletedRef.current) return;
              videoCompletedRef.current = true;
              videoComplete.mutate(campaign.id);
              void resumeGameAudio();
            }}
          />
        </button>
        <p className="text-sm">{campaign.title}</p>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--dama-muted)]">
            {canSkip ? chrome.can_continue_label : formatSkip(chrome.skip_in_template, remaining)}
          </p>
          <Button type="button" disabled={!canSkip} onClick={closeOverlay}>
            {chrome.continue_action}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
