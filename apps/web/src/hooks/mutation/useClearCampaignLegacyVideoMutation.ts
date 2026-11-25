import { adPlaybackQueryKey } from "@/hooks/query/useAdPlaybackQuery";
import { adsChromeErrorMessage, throwAdsFetchError } from "@/lib/ads-chrome-error";
import { apiRestUrl } from "@/lib/env";
import { invalidateAdPublisher } from "@/lib/invalidate";
import type { AdPlayback } from "@/types/ad-playback";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type UploadResult = {
  error?: string;
  error_key?: string;
};

export function useClearCampaignLegacyVideoMutation(token: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string }) => {
      if (!token) throw new Error("");
      const chrome = qc.getQueryData<AdPlayback>(adPlaybackQueryKey())?.schedule_chrome;
      const res = await fetch(`${apiRestUrl()}/ads/campaigns/${vars.id}/video`, {
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
      const chrome = qc.getQueryData<AdPlayback>(adPlaybackQueryKey())?.schedule_chrome;
      void invalidateAdPublisher(qc, token);
      if (chrome?.toast_legacy_video_cleared) {
        toast.success(chrome.toast_legacy_video_cleared);
      }
    },
    onError: (err) => {
      const chrome = qc.getQueryData<AdPlayback>(adPlaybackQueryKey())?.schedule_chrome;
      const msg = adsChromeErrorMessage(err, chrome, (chrome?.media_upload_failed || "").trim());
      if (msg) toast.error(msg);
    },
  });
}
