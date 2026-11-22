import { isApiClientError } from "@/lib/api-client-error";
import { cashGateChromeMessage, cashGateErrorKey } from "@/lib/cash-gate-error";
import { softCommunityJoinStatusMessage } from "@/lib/community-player-chrome-soft";
import type { CashRmgChrome } from "@/types/cash-rmg";

function chromeOnly(raw: string | undefined): string {
  const s = (raw || "").trim();
  if (!s) return "";
  // Never surface transport / API JSON blobs as toast copy.
  if (
    s.includes('"error_key"') ||
    s.includes("'error_key'") ||
    ((s.startsWith("{") || s.startsWith("[")) && (s.includes('"error"') || s.includes("'error'")))
  ) {
    return "";
  }
  return s;
}

const ENROLL_CASH_GATE_KEYS = new Set([
  "age_required",
  "phone_kyc",
  "jurisdiction",
  "cash_disabled",
  "unavailable",
  "country_required",
  "locate_required",
  "locate_stale",
]);

/** Map enroll failure to payment-modal / cash chrome (never toast API / transport JSON). */
export function tournamentEnrollErrorChrome(
  err: unknown,
  chrome: { already_enrolled?: string; enroll_failed?: string },
  cashChrome?: CashRmgChrome,
): string {
  const status = isApiClientError(err) ? err.status : undefined;
  const key = cashGateErrorKey(err);
  const rawMsg = isApiClientError(err)
    ? err.message || ""
    : err instanceof Error
      ? err.message || ""
      : typeof err === "string"
        ? err
        : "";
  const msg = rawMsg.trim().toLowerCase();
  const already = status === 409 || key === "already_enrolled" || msg.includes("already enrolled");
  if (already) {
    return (
      softCommunityJoinStatusMessage(chromeOnly(chrome.already_enrolled)) ||
      softCommunityJoinStatusMessage(chromeOnly(chrome.enroll_failed)) ||
      ""
    );
  }
  // Paid cash gates (age / phone / locate / jurisdiction) → cash chrome only.
  // Never fall through to enroll_failed for known cash keys (that looked like
  // "Enrollment failed" + raw API JSON when chrome was still loading).
  // Age opens DOB gate in-modal - stay silent here (no age_required_error toast).
  if (key === "age_required" || msg.includes("age verification") || msg.includes("age_required")) {
    return "";
  }
  if (ENROLL_CASH_GATE_KEYS.has(key)) {
    return cashGateChromeMessage(err, cashChrome, "");
  }
  const cashMsg = cashGateChromeMessage(err, cashChrome, "");
  if (cashMsg) return cashMsg;
  return softCommunityJoinStatusMessage(chromeOnly(chrome.enroll_failed));
}

export function isAlreadyEnrolledError(err: unknown): boolean {
  if (!isApiClientError(err)) return false;
  const key = (err.errorKey || "").trim();
  const msg = (err.message || "").trim().toLowerCase();
  return err.status === 409 || key === "already_enrolled" || msg.includes("already enrolled");
}

/** Casual play shell (board / matchmaking). Not the cup lobby. */
export function casualPlayHref(): string {
  return "/";
}

/**
 * After tournament enroll / seated Join: open cup lobby (DB notif parity).
 * Fail closed: without id, stay on tournaments browse (never invent a fake cup).
 */
export function tournamentLobbyHref(tournamentId?: string | null): string {
  const id = (tournamentId || "").trim();
  if (!id) return "/?view=tournaments";
  return `/?view=tournaments&id=${encodeURIComponent(id)}`;
}

/**
 * After community tournament join / seated Join: open lobby under unified Tournaments.
 * Fail closed: without id, stay on Community browse.
 */
export function eventLobbyHref(eventId?: string | null): string {
  const id = (eventId || "").trim();
  if (!id) return "/?view=tournaments&source=community";
  return `/?view=tournaments&source=community&id=${encodeURIComponent(id)}`;
}

/** @deprecated Prefer tournamentLobbyHref(id). Kept for call-site migration. */
export function freeJoinPlayHref(tournamentId?: string | null): string {
  return tournamentLobbyHref(tournamentId);
}

/** @deprecated Prefer eventLobbyHref(id). Kept for call-site migration. */
export function eventJoinPlayHref(eventId?: string | null): string {
  return eventLobbyHref(eventId);
}
