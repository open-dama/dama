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
  return useQuery({
    /** Ad rotation / serve payloads should refetch on remount after impressions. */
    staleTime: QueryStale.live,
    queryKey: serveAdsQueryKey(geo, viewerKey, sessionKey),
    enabled: enabled && ready,
    refetchInterval:
      typeof refetchIntervalMs === "number" && refetchIntervalMs > 0 ? refetchIntervalMs : false,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<ServedAd[]> => {
      if (!geo) return [];
      const params = new URLSearchParams();
      // Lat/lng optional for GPS reverse + radius; country query ignored by API.
      if (geo.lat != null) params.set("lat", String(geo.lat));
      if (geo.lng != null) params.set("lng", String(geo.lng));
      if (viewerKey) params.set("viewer_key", viewerKey);
      if (sessionKey) params.set("session_key", sessionKey);
      const qs = params.toString();
      const { data } = await restClient.get<{ campaigns: ServedAd[] }>(
        qs ? `/ads/serve?${qs}` : "/ads/serve",
        viewerKey ? { headers: { "X-Device-Id": viewerKey } } : undefined,
      );
      return data.campaigns ?? [];
    },
  });
}
