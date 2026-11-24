import { ApiClientError } from "../src/lib/api-client-error";
import { isCashGateApiEnglish, isRawApiJsonEnvelope } from "../src/lib/api-toast-message";
import {
  cashGateChromeMessage,
  cashGateErrorKey,
  isPhoneKycRequiredError,
} from "../src/lib/cash-gate-error";
import { cupLobbyPlayerErrMsg } from "../src/lib/cup-lobby-player-err";
import { eventJoinErrorChrome } from "../src/lib/event-join-error";
import { tournamentEnrollErrorChrome } from "../src/lib/tournament-free-join";
import type { CashRmgChrome } from "../src/types/cash-rmg";

const hybrid =
  'Verify your phone number to use cash wallet features\n{"error":"Verify your phone number to use cash wallet features","error_key":"phone_kyc"}';

const chrome = {
  phone_kyc_required_error: "Verify your phone number to use cash wallet features",
  phone_kyc_blurb: "Add and verify a phone number",
  age_required_error: "age err",
} as CashRmgChrome;

const err = new ApiClientError("", { errorKey: "phone_kyc", status: 403 });

const exactApiBody = {
  error: "Verify your phone number to use cash wallet features",
  error_key: "phone_kyc",
};
const exactHybrid = `${exactApiBody.error}\n${JSON.stringify(exactApiBody, null, 4)}`;
/** Exact paste users see in broken toasts (pretty JSON with leading spaces). */
const userPasteHybrid = `Verify your phone number to use cash wallet features

{
    "error": "Verify your phone number to use cash wallet features",
    "error_key": "phone_kyc"
}`;

const checks: [string, boolean][] = [
  ["detect", isPhoneKycRequiredError(err)],
  ["detectUserPaste", isPhoneKycRequiredError(userPasteHybrid)],
  ["keyFromHybrid", cashGateErrorKey(hybrid) === "phone_kyc"],
  ["keyFromExactHybrid", cashGateErrorKey(exactHybrid) === "phone_kyc"],
  ["keyFromUserPaste", cashGateErrorKey(userPasteHybrid) === "phone_kyc"],
  ["rawHybrid", isRawApiJsonEnvelope(hybrid)],
  ["rawExactHybrid", isRawApiJsonEnvelope(exactHybrid)],
  ["rawUserPaste", isRawApiJsonEnvelope(userPasteHybrid)],
  [
    "englishAloneBlocked",
    isCashGateApiEnglish("Verify your phone number to use cash wallet features"),
  ],
  ["englishUserPasteBlocked", isCashGateApiEnglish(userPasteHybrid)],
  ["toastSilent", cashGateChromeMessage(err, chrome, "fallback") === ""],
  [
    "toastSilentExact",
    cashGateChromeMessage(
      new ApiClientError(exactHybrid, { errorKey: "phone_kyc" }),
      chrome,
      "Enrollment failed",
    ) === "",
  ],
  [
    "toastSilentUserPaste",
    cashGateChromeMessage(
      new ApiClientError(userPasteHybrid, { errorKey: "phone_kyc" }),
      chrome,
      "Enrollment failed",
    ) === "",
  ],
  [
    "enrollSilent",
    tournamentEnrollErrorChrome(err, { enroll_failed: "Enrollment failed" }, chrome) === "",
  ],
  [
    "enrollSilentUserPaste",
    tournamentEnrollErrorChrome(
      new ApiClientError(userPasteHybrid),
      { enroll_failed: "Enrollment failed" },
      chrome,
    ) === "",
  ],
  [
    "enrollSilentNoEnrollFailed",
    tournamentEnrollErrorChrome(
      new ApiClientError("", { errorKey: "phone_kyc" }),
      { enroll_failed: "Enrollment failed" },
      chrome,
    ) !== "Enrollment failed",
  ],
  ["joinSilent", eventJoinErrorChrome(err, { load_failed: "Load failed" }, chrome) === ""],
  [
    "joinSilentUserPaste",
    eventJoinErrorChrome(
      new ApiClientError(userPasteHybrid),
      { load_failed: "Load failed" },
      chrome,
    ) === "",
  ],
  ["cupLobbySilent", cupLobbyPlayerErrMsg({ load_failed: "Load failed" }, err) === ""],
  [
    "cupLobbySilentUserPaste",
    cupLobbyPlayerErrMsg(
      { load_failed: "Load failed" },
      new ApiClientError(userPasteHybrid, { errorKey: "phone_kyc" }),
    ) === "",
  ],
];

for (const [name, ok] of checks) {
  console.log(`${name}:${ok ? "PASS" : "FAIL"}`);
}
const all = checks.every(([, ok]) => ok);
console.log(`ALL:${all ? "PASS" : "FAIL"}`);
process.exit(all ? 0 : 1);
