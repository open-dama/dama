import { restClient } from "@/lib/api";
import { QueryStale } from "@/lib/query-policy";
import type { AdServeGeoQuery, ServedAd } from "@/types/ads";
import { useQuery } from "@tanstack/react-query";

export type { AdServeGeoQuery, ServedAd } from "@/types/ads";

export function serveAdsQueryKey(geo: AdServeGeoQuery | null, viewerKey = "", sessionKey = "") {
  return [
    "ads-serve",
    geo?.country ?? "",
    geo?.region ?? "",
    geo?.district ?? "",
    geo?.lat ?? null,
    geo?.lng ?? null,
    viewerKey,
    sessionKey,
  ] as const;
}

type ServeAdsOptions = {
  enabled?: boolean;
  viewerKey?: string;
  sessionKey?: string;
  /** When > 0, refetch lobby serve on this interval (Phase A tile rotation). */
  refetchIntervalMs?: number | false;
};

/** Server resolves match country from IP/GPS; optional lat/lng only for radius match. */
export function useServeAdsQuery(
  geo: AdServeGeoQuery | null,
  options: boolean | ServeAdsOptions = true,
) {
  const opts: ServeAdsOptions =
    typeof options === "boolean" ? { enabled: options } : (options ?? {});
  const enabled = opts.enabled !== false;
  const viewerKey = (opts.viewerKey ?? "").trim();
  const sessionKey = (opts.sessionKey ?? "").trim();
  const refetchIntervalMs = opts.refetchIntervalMs;
  const ready = Boolean(geo && (geo.country || geo.lat != null));
  // Ship-gate: never fetch lobby serve without both keys (API returns empty anyway;
  // keep the hook fail-closed so callers cannot omit GeoAdSlot-style gating).
  const keysReady = Boolean(viewerKey) && Boolean(sessionKey);
  return useQuery({
    /** Ad rotation / serve payloads should refetch on remount after impressions. */
    staleTime: QueryStale.live,
    queryKey: serveAdsQueryKey(geo, viewerKey, sessionKey),
    enabled: enabled && ready && keysReady,
    refetchInterval:
      typeof refetchIntervalMs === "number" && refetchIntervalMs > 0 ? refetchIntervalMs : false,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<ServedAd[]> => {
      if (!geo || !viewerKey || !sessionKey) return [];
      const params = new URLSearchParams();
      // Lat/lng optional for GPS reverse + radius; country query ignored by API.
      if (geo.lat != null) params.set("lat", String(geo.lat));
      if (geo.lng != null) params.set("lng", String(geo.lng));
      params.set("viewer_key", viewerKey);
      params.set("session_key", sessionKey);
      const qs = params.toString();
      const { data } = await restClient.get<{ campaigns: ServedAd[] }>(`/ads/serve?${qs}`, {
        headers: { "X-Device-Id": viewerKey },
      });
      return data.campaigns ?? [];
    },
  });
}
