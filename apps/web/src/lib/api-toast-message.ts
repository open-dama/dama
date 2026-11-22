import { toast } from "sonner";

/** Fail-closed: user-facing toasts use DB chrome only (never Error.message / transport invent). */
export function apiToastMessage(_err: unknown, chromeFallback: string): string {
  return (chromeFallback || "").trim();
}

/** True when a string looks like a raw API JSON envelope (never show in toasts). */
export function isRawApiJsonEnvelope(msg: string): boolean {
  const t = (msg || "").trim();
  if (!t) return false;
  // Full JSON body OR chrome text that accidentally appended a JSON blob.
  if (
    t.includes('"error_key"') ||
    t.includes("'error_key'") ||
    ((t.startsWith("{") || t.startsWith("[")) && (t.includes('"error"') || t.includes("'error'")))
  ) {
    return true;
  }
  return false;
}

/** Age / phone gate API English (forms own UX) - never toast alone. */
export function isCashGateApiEnglish(msg: string): boolean {
  const lower = (msg || "").trim().toLowerCase();
  if (!lower) return false;
  return (
    lower.includes("verify your phone") ||
    (lower.includes("phone number") && lower.includes("cash wallet")) ||
    lower.includes("age verification required")
  );
}

/**
 * Industry-standard toast: DB chrome string only.
 * Refuses JSON envelopes, age/phone API English, and empty copy.
 * Stable id dedupes double-fires (Strict Mode / overlapping mutation handlers).
 */
export function chromeOnlyToastError(msg: string | null | undefined, opts?: { id?: string }): void {
  const t = (msg || "").trim();
  if (!t || isRawApiJsonEnvelope(t) || isCashGateApiEnglish(t)) return;
  if (opts?.id) {
    toast.error(t, { id: opts.id });
    return;
  }
  toast.error(t);
}
