import { adPlaybackQueryKey } from "@/hooks/query/useAdPlaybackQuery";
import { consoleAdCampaignsQueryKey } from "@/hooks/query/useConsoleAdCampaignsQuery";
import { adsChromeErrorMessage, throwAdsFetchError } from "@/lib/ads-chrome-error";
import { getConsoleAdCampaignsChrome } from "@/lib/console-ad-campaigns-cache";
import { apiRestUrl } from "@/lib/env";
import type { AdPlaybackConsolePayload, AdRuntimeChrome } from "@/types/ad-runtime";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type UploadResult = {
  error?: string;
  error_key?: string;
};

function runtimeChrome(qc: ReturnType<typeof useQueryClient>, token: string | null | undefined) {
  return (
    getConsoleAdCampaignsChrome(qc, token) ??
    qc.getQueryData<AdPlaybackConsolePayload>(adPlaybackQueryKey(token))?.chrome
  );
}

export function useClearCampaignLegacyVideoMutation(token: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string }) => {
      if (!token) throw new Error("");
      const chrome = runtimeChrome(qc, token);
      const res = await fetch(`${apiRestUrl()}/console/ads/campaigns/${vars.id}/video`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as UploadResult;
      if (!res.ok) {
        if (json.error_key) throwAdsFetchError(res.status, json);
        throw new Error((chrome?.media_upload_failed || "").trim());
      }
      return json;
    },
    onSuccess: () => {
      const chrome = runtimeChrome(qc, token) as AdRuntimeChrome | undefined;
      void qc.invalidateQueries({ queryKey: consoleAdCampaignsQueryKey(token) });
      if (chrome?.toast_legacy_video_cleared) toast.success(chrome.toast_legacy_video_cleared);
    },
    onError: (err) => {
      const chrome = runtimeChrome(qc, token);
      const msg = adsChromeErrorMessage(err, chrome, chrome?.media_upload_failed || "");
      if (msg) toast.error(msg);
    },
  });
}
