import { adPlaybackQueryKey } from "@/hooks/query/useAdPlaybackQuery";
import { consoleAdCampaignsQueryKey } from "@/hooks/query/useConsoleAdCampaignsQuery";
import { restClient } from "@/lib/api";
import { adsChromeErrorMessage } from "@/lib/ads-chrome-error";
import { getConsoleAdCampaignsChrome } from "@/lib/console-ad-campaigns-cache";
import type { AdPlaybackConsolePayload } from "@/types/ad-runtime";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

function runtimeChrome(qc: ReturnType<typeof useQueryClient>, token: string | null | undefined) {
  return (
    getConsoleAdCampaignsChrome(qc, token) ??
    qc.getQueryData<AdPlaybackConsolePayload>(adPlaybackQueryKey(token))?.chrome
  );
}

export function useSetConsoleCampaignStatusMutation(token: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; status: string }) => {
      const { data } = await restClient.patch(
        `/console/ads/campaigns/${vars.id}/status`,
        { status: vars.status },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return data;
    },
    onSuccess: () => {
      const chrome = runtimeChrome(qc, token);
      void qc.invalidateQueries({ queryKey: consoleAdCampaignsQueryKey(token) });
      if (chrome?.toast_status_updated) toast.success(chrome.toast_status_updated);
    },
    onError: (err) => {
      const chrome = runtimeChrome(qc, token);
      const msg = adsChromeErrorMessage(err, chrome, chrome?.toast_update_failed || "");
      if (msg) toast.error(msg);
    },
  });
}
