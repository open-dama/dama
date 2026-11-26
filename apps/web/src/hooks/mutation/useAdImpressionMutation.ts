import { restClient } from "@/lib/api";
import { invalidateAdPublisherStats } from "@/lib/invalidate";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useAdImpressionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      campaignId: string;
      viewerKey: string;
      sessionKey?: string;
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
      const sessionKey = (vars.sessionKey || "").trim();
      if (sessionKey) {
        body.session_key = sessionKey;
      }
      const viewport = (vars.viewport || "").trim();
      if (viewport) {
        body.viewport = viewport;
      }
      await restClient.post(`/ads/campaigns/${vars.campaignId}/impression`, body, {
        headers: { "X-Device-Id": vars.viewerKey },
      });
    },
    onSuccess: () => {
      // Do not invalidate ads-serve: that re-ranks immediately, hits min-gap,
      // and blanks the lobby tile until the next rotate interval.
      void invalidateAdPublisherStats(qc);
    },
  });
}
