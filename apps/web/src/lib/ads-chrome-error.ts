import { ApiClientError, isApiClientError } from "@/lib/api-client-error";
import type { AdScheduleChrome } from "@/types/ad-playback";

/** Map ads API error_key → schedule_chrome (fail closed; never invent copy). */
export function adsChromeErrorMessage(
  err: unknown,
  chrome: AdScheduleChrome | undefined,
  fallback: string,
): string {
  let msg = "";
  if (isApiClientError(err) && err.errorKey) {
    const v = (chrome as Record<string, unknown> | undefined)?.[err.errorKey];
    if (typeof v === "string" && v.trim()) {
      msg = v.trim();
    }
  }
  if (!msg && err instanceof Error && err.message.trim() && !isApiClientError(err)) {
    msg = err.message.trim();
  }
  if (!msg) {
    msg = (fallback || "").trim();
  }
  return msg;
}

/** Throw key-only ApiClientError from a fetch ads JSON body (no English in Error.message). */
export function throwAdsFetchError(
  status: number,
  body: { error_key?: string } | null | undefined,
): never {
  const errorKey =
    typeof body?.error_key === "string" && body.error_key.trim()
      ? body.error_key.trim()
      : `http_${status}`;
  throw new ApiClientError("", { status, errorKey });
}
