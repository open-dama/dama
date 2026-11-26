import { restClient } from "@/lib/api";
import { invalidateAdPublisherStats } from "@/lib/invalidate";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useAdClickMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campaignId: string) => {
      await restClient.post(`/ads/campaigns/${campaignId}/click`);
    },
    onSuccess: () => {
      // Player click must not refresh lobby serve (rotate owns re-rank timing).
      void invalidateAdPublisherStats(qc);
    },
  });
}
