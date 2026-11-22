import { ApiClientError, isApiClientError } from "@/lib/api-client-error";
import type { CashRmgChrome } from "@/types/cash-rmg";
import { isAxiosError } from "axios";

function errorKeyFromJsonish(raw: string): string {
  const t = raw.trim();
  if (!t.includes("error_key")) return "";
  // Full JSON body or chrome+JSON hybrid - pull error_key if present.
  const m = t.match(/"error_key"\s*:\s*"([^"]+)"/) || t.match(/'error_key'\s*:\s*'([^']+)'/);
  return (m?.[1] || "").trim();
}

/** Read cash/RMG `error_key` from ApiClientError or Axios response body. */
export function cashGateErrorKey(err: unknown): string {
  if (isApiClientError(err)) {
    const k = (err.errorKey || "").trim();
    if (k) return k;
    return errorKeyFromJsonish(err.message || "");
  }
  // Duck-read errorKey when the ApiClientError class identity was lost.
  if (err && typeof err === "object" && "errorKey" in err) {
    const k = String((err as { errorKey?: unknown }).errorKey || "").trim();
    if (k) return k;
  }
  if (isAxiosError(err)) {
    const data = err.response?.data;
    if (data && typeof data === "object") {
      return String((data as { error_key?: string }).error_key || "").trim();
    }
    if (typeof data === "string") {
      const fromBody = errorKeyFromJsonish(data);
      if (fromBody) return fromBody;
    }
  }
  if (err instanceof Error) return errorKeyFromJsonish(err.message || "");
  if (typeof err === "string") return errorKeyFromJsonish(err);
  return "";
}

const CASH_GATE_KEYS = new Set([
  "age_required",
  "cash_disabled",
  "jurisdiction",
  "country_required",
  "locate_required",
  "locate_stale",
  "phone_kyc",
  "checkout_unavailable",
  "payment_route_unavailable",
  "invalid_top_up_amount",
  "location_currency_unresolved",
  "country_required_checkout",
]);

/** Map cash gate `error_key` to DB chrome (never surface raw API English / JSON bodies). */
export function cashGateChromeMessage(
  err: unknown,
  cashChrome: CashRmgChrome | undefined,
  fallback: string,
): string {
  const fb = (fallback || "").trim();
  const key = cashGateErrorKey(err);
  if (!key) return fb;
  // Known cash gate without chrome yet: empty (never enroll_failed / API JSON stand-in).
  if (!cashChrome) return CASH_GATE_KEYS.has(key) ? "" : fb;
  // Age / phone gates own in-app forms - never toast required_error (same English as API).
  if (key === "age_required" || key === "phone_kyc") return "";
  const map: Record<string, string | undefined> = {
    cash_disabled: cashChrome.cash_disabled_error,
    jurisdiction: cashChrome.jurisdiction_blocked_error,
    country_required: cashChrome.country_required_error,
    locate_required: cashChrome.locate_required_error,
    locate_stale: cashChrome.locate_stale_error,
  };
  const fromChrome = (map[key] || "").trim();
  if (fromChrome) return fromChrome;
  // Known cash gate with empty chrome string: keep caller fallback only for non-gate keys.
  if (CASH_GATE_KEYS.has(key)) return "";
  return fb;
}

export function isAgeRequiredError(err: unknown): boolean {
  if (cashGateErrorKey(err) === "age_required") return true;
  // Legacy / unparsed bodies that only carry English age copy.
  // Also duck-read errorKey when instanceof was lost across bundles.
  if (err && typeof err === "object") {
    const k = String((err as { errorKey?: unknown }).errorKey || "").trim();
    if (k === "age_required") return true;
  }
  const msg = isApiClientError(err)
    ? (err.message || "").toLowerCase()
    : err instanceof Error
      ? (err.message || "").toLowerCase()
      : typeof err === "string"
        ? err.toLowerCase()
        : "";
  return msg.includes("age verification") || msg.includes("age_required");
}

export function isPhoneKycRequiredError(err: unknown): boolean {
  if (cashGateErrorKey(err) === "phone_kyc") return true;
  if (err && typeof err === "object") {
    const k = String((err as { errorKey?: unknown }).errorKey || "").trim();
    if (k === "phone_kyc") return true;
  }
  const msg = isApiClientError(err)
    ? (err.message || "").toLowerCase()
    : err instanceof Error
      ? (err.message || "").toLowerCase()
      : typeof err === "string"
        ? err.toLowerCase()
        : "";
  return (
    msg.includes("phone_kyc") ||
    msg.includes("verify your phone") ||
    (msg.includes("phone number") && msg.includes("cash wallet"))
  );
}

export function cashGateErrorFromBody(
  body: unknown,
  cashChrome: CashRmgChrome | undefined,
  fallback: string,
): string {
  if (!body || typeof body !== "object") return (fallback || "").trim();
  const key = String((body as { error_key?: string }).error_key || "").trim();
  return cashGateChromeMessage(new ApiClientError("", { errorKey: key }), cashChrome, fallback);
}
