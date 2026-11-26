"use client";

import { ViewportAdCreative } from "@/components/ads/ViewportAdCreative";
import { GeoAdSlotSkeleton } from "@/components/ui/shimmer-skeletons";
import {
  useAdClickMutation,
  useAdImpressionMutation,
  useAdVideoCompleteMutation,
} from "@/hooks/mutation";
import { useAdPlaybackQuery } from "@/hooks/query/useAdPlaybackQuery";
import { usePlayerGeoQuery } from "@/hooks/query/usePlayerGeoQuery";
import { useServeAdsQuery } from "@/hooks/query/useServeAdsQuery";
import { adSessionKey, adViewerKey } from "@/lib/ad-viewer-session";
import {
  parseViewportBreakpoints,
  pickCampaignCreative,
  resolveViewportSlot,
} from "@/lib/resolve-viewport-creative";
import { useEffect, useRef, useState } from "react";

type GeoAdSlotProps = {
  /** When true, render nothing until a real creative is ready (no skeleton band under the board). */
  hideUntilReady?: boolean;
};

/** Player-facing geo ad slot: serves from API, records impression once, click on creative. */
export function GeoAdSlot({ hideUntilReady = false }: GeoAdSlotProps) {
  const geoQuery = usePlayerGeoQuery();
  const geo = geoQuery.data ?? null;
  const geoReady = geoQuery.isFetched && !geoQuery.isLoading;
  const playbackQuery = useAdPlaybackQuery(true);
  const impressed = useRef<string | null>(null);
  const videoCompletedRef = useRef<string | null>(null);
  const [viewer, setViewer] = useState("");
  const [session, setSession] = useState("");
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    setViewer(adViewerKey());
    setSession(adSessionKey());
  }, []);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => setTabVisible(!document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  const lobbyRotateEnabled = playbackQuery.data?.lobby_rotate_enabled === true;
  const lobbyRotateSec = Number(playbackQuery.data?.lobby_rotate_interval_seconds ?? 0);
  const rotateMs =
    lobbyRotateEnabled && tabVisible && Number.isFinite(lobbyRotateSec) && lobbyRotateSec >= 1
      ? lobbyRotateSec * 1000
      : false;
  const serveQuery = useServeAdsQuery(geo, {
    // Wait for viewer+session so first serve/rank applies freq + session caps.
    enabled: geoReady && Boolean(viewer) && Boolean(session),
    viewerKey: viewer,
    sessionKey: session,
    refetchIntervalMs: rotateMs,
  });
  const impression = useAdImpressionMutation();
  const click = useAdClickMutation();
  const videoComplete = useAdVideoCompleteMutation();
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const lobbyPlacement = playbackQuery.data?.player_chrome.placement_lobby;
  const breakpoints = playbackQuery.data?.schedule_chrome
    ? parseViewportBreakpoints(playbackQuery.data.schedule_chrome)
    : null;
  const slot = breakpoints && width > 0 ? resolveViewportSlot(width, breakpoints) : null;
  const ad =
    slot && serveQuery.data
      ? (serveQuery.data.find((c) => {
          if (!(c.title || "").trim()) return false;
          const picked = pickCampaignCreative(c, slot);
          return Boolean(picked.imageUrl || picked.videoId);
        }) ?? null)
      : null;

  const recordImpression = impression.mutate;

  useEffect(() => {
    // Match serve gate: both keys required so session caps land on every show.
    if (!ad?.id || !lobbyPlacement || !viewer || !session) return;
    // One impression per serve refresh (including rotate re-shows of same campaign).
    const showKey = `${ad.id}:${serveQuery.dataUpdatedAt}`;
    if (impressed.current === showKey) return;
    impressed.current = showKey;
    recordImpression({
      campaignId: ad.id,
      viewerKey: viewer,
      sessionKey: session,
      placement: lobbyPlacement,
      viewport: slot || undefined,
    });
  }, [ad, lobbyPlacement, recordImpression, slot, viewer, session, serveQuery.dataUpdatedAt]);

  if (!geoReady || serveQuery.isLoading) {
    return hideUntilReady ? null : <GeoAdSlotSkeleton />;
  }

  if (!ad?.title || !breakpoints || !slot) {
    return null;
  }

  return (
    <aside className="rounded-xl border border-[var(--dama-border)] bg-[var(--dama-card)] p-4">
      <button type="button" className="block w-full text-left" onClick={() => click.mutate(ad.id)}>
        <ViewportAdCreative
          campaign={ad}
          scheduleChrome={playbackQuery.data?.schedule_chrome}
          onVideoEnded={() => {
            if (videoCompletedRef.current === ad.id) return;
            videoCompletedRef.current = ad.id;
            videoComplete.mutate(ad.id);
          }}
        />
      </button>
      <p className="mt-2 text-sm">{ad.title}</p>
    </aside>
  );
}
