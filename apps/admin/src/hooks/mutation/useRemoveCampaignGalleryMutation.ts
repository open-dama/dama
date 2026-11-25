import { consoleAdCampaignsQueryKey } from "@/hooks/query/useConsoleAdCampaignsQuery";
import { adsChromeErrorMessage, throwAdsFetchError } from "@/lib/ads-chrome-error";
import { getConsoleAdCampaignsChrome } from "@/lib/console-ad-campaigns-cache";
import { apiRestUrl } from "@/lib/env";
import type { AdRuntimeChrome } from "@/types/ad-runtime";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type UploadResult = {
  gallery?: string[];
  error?: string;
  error_key?: string;
};

export function useRemoveCampaignGalleryMutation(token: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; index: number }) => {
      if (!token) throw new Error("");
      const chrome = getConsoleAdCampaignsChrome(qc, token);
      const res = await fetch(
        `${apiRestUrl()}/console/ads/campaigns/${vars.id}/gallery/${vars.index}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const json = (await res.json().catch(() => ({}))) as UploadResult;
      if (!res.ok) {
        if (json.error_key) throwAdsFetchError(res.status, json);
        throw new Error((chrome?.media_upload_failed || "").trim());
      }
      return json;
    },
    onSuccess: () => {
      const chrome = getConsoleAdCampaignsChrome(qc, token) as AdRuntimeChrome | undefined;
      void qc.invalidateQueries({ queryKey: consoleAdCampaignsQueryKey(token) });
      if (chrome?.toast_gallery_saved) toast.success(chrome.toast_gallery_saved);
    },
    onError: (err) => {
      const chrome = getConsoleAdCampaignsChrome(qc, token);
      const msg = adsChromeErrorMessage(err, chrome, chrome?.media_upload_failed || "");
      if (msg) toast.error(msg);
    },
  });
}
