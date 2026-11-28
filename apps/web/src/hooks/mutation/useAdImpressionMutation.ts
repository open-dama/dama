import { restClient } from "@/lib/api";
import { invalidateAdPublisherStats } from "@/lib/invalidate";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useAdImpressionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      campaignId: string;
      viewerKey: string;
      // Ship-gate: session caps require session_key on every impress (API fail-closed too).
      sessionKey: string;
      placement: string;
      viewport?: string;
    }) => {
      if (!vars.placement.trim()) {
        throw new Error("placement required");
      }
      const viewerKey = vars.viewerKey.trim();
      const sessionKey = vars.sessionKey.trim();
      if (!viewerKey || !sessionKey) {
        throw new Error("viewer_key and session_key required");
      }
      const body: Record<string, string> = {
        viewer_key: viewerKey,
        session_key: sessionKey,
        placement: vars.placement,
      };
      const viewport = (vars.viewport || "").trim();
      if (viewport) {
        body.viewport = viewport;
      }
      await restClient.post(`/ads/campaigns/${vars.campaignId}/impression`, body, {
        headers: { "X-Device-Id": viewerKey },
      });
    },
    onSuccess: () => {
      // Do not invalidate ads-serve: that re-ranks immediately, hits min-gap,
      // and blanks the lobby tile until the next rotate interval.
      void invalidateAdPublisherStats(qc);
    },
  });
}
