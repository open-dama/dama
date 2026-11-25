import { consoleAdCampaignsQueryKey } from "@/hooks/query/useConsoleAdCampaignsQuery";
import { adsChromeErrorMessage, throwAdsFetchError } from "@/lib/ads-chrome-error";
import { getConsoleAdCampaignsChrome } from "@/lib/console-ad-campaigns-cache";
import { apiRestUrl } from "@/lib/env";
import type { AdRuntimeChrome } from "@/types/ad-runtime";
import { isAdMediaChromeReady } from "@/types/ad-runtime";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type UploadResult = {
  thumbnail_url?: string;
  error?: string;
  error_key?: string;
};

export function useUploadCampaignThumbnailMutation(token: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; file: File }) => {
      if (!token) throw new Error("");
      const chrome = getConsoleAdCampaignsChrome(qc, token);
      const media = isAdMediaChromeReady(chrome) ? chrome : undefined;
      const body = new FormData();
      body.append("file", vars.file);
      const res = await fetch(`${apiRestUrl()}/console/ads/campaigns/${vars.id}/thumbnail`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const json = (await res.json().catch(() => ({}))) as UploadResult;
      if (!res.ok) {
        if (json.error_key) throwAdsFetchError(res.status, json);
        throw new Error((media?.media_upload_failed || "").trim());
      }
      return json;
    },
    onSuccess: () => {
      const chrome = getConsoleAdCampaignsChrome(qc, token) as AdRuntimeChrome | undefined;
      void qc.invalidateQueries({ queryKey: consoleAdCampaignsQueryKey(token) });
      if (chrome?.toast_thumbnail_saved) toast.success(chrome.toast_thumbnail_saved);
    },
    onError: (err) => {
      const chrome = getConsoleAdCampaignsChrome(qc, token);
      const msg = adsChromeErrorMessage(err, chrome, chrome?.media_upload_failed || "");
      if (msg) toast.error(msg);
    },
  });
}
