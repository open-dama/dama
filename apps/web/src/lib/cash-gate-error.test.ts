import { describe, expect, it } from "vitest";
import { ApiClientError } from "./api-client-error";
import {
  cashGateChromeMessage,
  cashGateErrorKey,
  isAgeRequiredError,
  isPhoneKycRequiredError,
} from "./cash-gate-error";
import { isRawApiJsonEnvelope } from "./api-toast-message";
import { eventJoinErrorChrome } from "./event-join-error";
import { tournamentEnrollErrorChrome } from "./tournament-free-join";
import type { CashRmgChrome } from "../types/cash-rmg";

const cashChrome = {
  age_required_error: "Verify your age to use cash wallet features",
  age_gate_blurb: "Confirm your date of birth",
  phone_kyc_required_error: "Verify your phone number to use cash wallet features",
  phone_kyc_blurb: "Add and verify a phone number",
  phone_kyc_title: "Verify phone",
  cash_disabled_error: "Cash is unavailable",
  jurisdiction_blocked_error: "Not available in your region",
  country_required_error: "Country required",
  locate_required_error: "Location required",
  locate_stale_error: "Location expired",
} as CashRmgChrome;

describe("phone_kyc / age_required gate UX", () => {
  it("detects phone_kyc from errorKey and hybrid JSON bodies", () => {
    expect(isPhoneKycRequiredError(new ApiClientError("", { errorKey: "phone_kyc" }))).toBe(true);
    expect(
      cashGateErrorKey(
        'Verify your phone number to use cash wallet features\n{"error":"Verify your phone number to use cash wallet features","error_key":"phone_kyc"}',
      ),
    ).toBe("phone_kyc");
    expect(
      isRawApiJsonEnvelope(
        'Verify your phone number to use cash wallet features\n{"error":"Verify your phone number to use cash wallet features","error_key":"phone_kyc"}',
      ),
    ).toBe(true);
  });

  it("never maps phone_kyc / age_required to toast chrome (forms own UX)", () => {
    const phoneErr = new ApiClientError("", { errorKey: "phone_kyc" });
    const ageErr = new ApiClientError("", { errorKey: "age_required" });
    expect(cashGateChromeMessage(phoneErr, cashChrome, "fallback")).toBe("");
    expect(cashGateChromeMessage(ageErr, cashChrome, "fallback")).toBe("");
    expect(isAgeRequiredError(ageErr)).toBe(true);
  });

  it("tournament enroll stays silent for phone_kyc (no enroll_failed / JSON)", () => {
    const err = new ApiClientError("", { errorKey: "phone_kyc", status: 403 });
    expect(
      tournamentEnrollErrorChrome(
        err,
        { enroll_failed: "Enrollment failed", already_enrolled: "Already enrolled" },
        cashChrome,
      ),
    ).toBe("");
  });

  it("event join stays silent for phone_kyc (no load_failed / JSON)", () => {
    const err = new ApiClientError("", { errorKey: "phone_kyc", status: 403 });
    expect(
      eventJoinErrorChrome(
        err,
        {
          already_joined: "Already joined",
          load_failed: "Load failed",
          approved_blurb: "Joined",
        },
        cashChrome,
      ),
    ).toBe("");
  });
});
