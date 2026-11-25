import { adPlaybackQueryKey } from "@/hooks/query/useAdPlaybackQuery";
import { adsChromeErrorMessage, throwAdsFetchError } from "@/lib/ads-chrome-error";
import { apiRestUrl } from "@/lib/env";
import { invalidateAdPublisher } from "@/lib/invalidate";
import type { AdPlayback } from "@/types/ad-playback";
import { isViewportCreativesChromeReady } from "@/types/ad-playback";
import type { ViewportCreativeSlot } from "@/types/ads";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type UploadResult = {
  error?: string;
  error_key?: string;
};

export function useUploadViewportVideoMutation(token: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string;
      slot: ViewportCreativeSlot;
      file: File;
      title: string;
    }) => {
      if (!token) throw new Error("");
      const chrome = qc.getQueryData<AdPlayback>(adPlaybackQueryKey())?.schedule_chrome;
      const media = isViewportCreativesChromeReady(chrome) ? chrome : undefined;
      if (!media) throw new Error((chrome?.playback_unavailable || "").trim());
      const title = vars.title.trim();
      if (!title) throw new Error((chrome?.playback_unavailable || "").trim());
      const body = new FormData();
      body.append("file", vars.file);
      body.append("title", title);
      body.append("async", "true");
      const res = await fetch(
        `${apiRestUrl()}/ads/campaigns/${vars.id}/creatives/${vars.slot}/video`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body,
        },
      );
      const json = (await res.json().catch(() => ({}))) as UploadResult;
      if (!res.ok) {
        if (json.error_key) throwAdsFetchError(res.status, json);
        throw new Error((media.media_upload_failed || "").trim());
      }
      return json;
    },
    onSuccess: () => {
      const chrome = qc.getQueryData<AdPlayback>(adPlaybackQueryKey())?.schedule_chrome;
      void invalidateAdPublisher(qc, token);
      if (chrome?.toast_viewport_video_queued) {
        toast.success(chrome.toast_viewport_video_queued);
      }
    },
    onError: (err) => {
      const chrome = qc.getQueryData<AdPlayback>(adPlaybackQueryKey())?.schedule_chrome;
      const media = isViewportCreativesChromeReady(chrome) ? chrome : undefined;
      const msg = adsChromeErrorMessage(err, chrome, (media?.media_upload_failed || "").trim());
      if (msg) toast.error(msg);
    },
  });
}
