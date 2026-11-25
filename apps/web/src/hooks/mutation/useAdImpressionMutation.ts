import { restClient } from "@/lib/api";
import { invalidateAdPublisher } from "@/lib/invalidate";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useAdImpressionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      campaignId: string;
      viewerKey: string;
      placement: string;
      viewport?: string;
    }) => {
      if (!vars.placement.trim()) {
        throw new Error("placement required");
      }
      const body: Record<string, string> = {
        viewer_key: vars.viewerKey,
        placement: vars.placement,
      };
      const viewport = (vars.viewport || "").trim();
      if (viewport) {
        body.viewport = viewport;
      }
      await restClient.post(`/ads/campaigns/${vars.campaignId}/impression`, body, {
        headers: { "X-Device-Id": vars.viewerKey },
      });
    },
    onSuccess: () => {
      void invalidateAdPublisher(qc);
    },
  });
}
