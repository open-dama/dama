import { adPlaybackQueryKey } from "@/hooks/query/useAdPlaybackQuery";
import { adsChromeErrorMessage, throwAdsFetchError } from "@/lib/ads-chrome-error";
import { apiRestUrl } from "@/lib/env";
import { invalidateAdPublisher } from "@/lib/invalidate";
import type { AdPlayback } from "@/types/ad-playback";
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
      const chrome = qc.getQueryData<AdPlayback>(adPlaybackQueryKey())?.schedule_chrome;
      const res = await fetch(`${apiRestUrl()}/ads/campaigns/${vars.id}/gallery/${vars.index}`, {
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
      if (chrome?.toast_gallery_saved) toast.success(chrome.toast_gallery_saved);
    },
    onError: (err) => {
      const chrome = qc.getQueryData<AdPlayback>(adPlaybackQueryKey())?.schedule_chrome;
      const msg = adsChromeErrorMessage(err, chrome, (chrome?.media_upload_failed || "").trim());
      if (msg) toast.error(msg);
    },
  });
}
