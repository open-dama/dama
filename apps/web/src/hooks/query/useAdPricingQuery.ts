import { restClient } from "@/lib/api";
import { QueryStale } from "@/lib/query-policy";
import type { AdPricing } from "@/types/ads";
import { useQuery } from "@tanstack/react-query";

export type { AdPricing } from "@/types/ads";

export const adPricingQueryKey = ["ad-pricing"] as const;

function pinPricingKey(lat: number | null | undefined, lng: number | null | undefined) {
  if (
    lat == null ||
    lng == null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    (lat === 0 && lng === 0)
  ) {
    return { hasPin: false as const, lat: null, lng: null };
  }
  return { hasPin: true as const, lat, lng };
}

/** Geo-resolved create fee. Pass agencyManaged so fee matches Create debit (percent stays server-side). */
export function useAdPricingQuery(
  lat?: number | null,
  lng?: number | null,
  agencyManaged?: boolean,
) {
  const pin = pinPricingKey(lat, lng);
  const agency = Boolean(agencyManaged);
  return useQuery({
    staleTime: QueryStale.platform,
    queryKey: [
      ...adPricingQueryKey,
      pin.hasPin ? pin.lat : null,
      pin.hasPin ? pin.lng : null,
      agency,
    ],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = {};
      if (pin.hasPin) {
        params.lat = pin.lat as number;
        params.lng = pin.lng as number;
      }
      if (agency) {
        params.agency_managed = "1";
      }
      const { data } = await restClient.get<AdPricing>(
        "/ads/pricing",
        Object.keys(params).length ? { params } : undefined,
      );
      if (
        !data ||
        !(data.impression_unit_cost > 0) ||
        // 0 create fee is valid when an advertiser tier waives it (enterprise-style).
        !(typeof data.campaign_create_fee_amount === "number") ||
        !(data.campaign_create_fee_amount >= 0) ||
        !(data.campaign_create_fee_currency || "").trim()
      ) {
        // Fail closed empty; UI surfaces publisher_pricing_unavailable from schedule chrome.
        throw new Error("");
      }
      return data;
    },
  });
}
