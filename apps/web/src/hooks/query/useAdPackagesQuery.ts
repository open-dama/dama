import { restClient } from "@/lib/api";
import { QueryStale } from "@/lib/query-policy";
import type { AdPackage } from "@/types/ads";
import { useQuery } from "@tanstack/react-query";

export type AdPackagesResponse = {
  packages: AdPackage[];
  advertiser_tier_code?: string;
};

export function adPackagesQueryKey(token: string | null | undefined) {
  return ["ad-packages", token] as const;
}

export function useAdPackagesQuery(token: string | null | undefined, enabled: boolean) {
  return useQuery({
    staleTime: QueryStale.platform,
    queryKey: adPackagesQueryKey(token),
    enabled: Boolean(token) && enabled,
    queryFn: async () => {
      const { data } = await restClient.get<AdPackagesResponse>("/ads/packages", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!data || !Array.isArray(data.packages)) {
        throw new Error("");
      }
      return data;
    },
  });
}
