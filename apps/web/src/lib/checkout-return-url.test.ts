import { describe, expect, it } from "vitest";
import { isCheckoutSuccessSearch } from "./checkout-return-url";

describe("isCheckoutSuccessSearch", () => {
  it("detects checkout=success and Chapa status", () => {
    expect(isCheckoutSuccessSearch(new URLSearchParams("checkout=success"))).toBe(true);
    expect(isCheckoutSuccessSearch(new URLSearchParams("status=success"))).toBe(true);
    expect(isCheckoutSuccessSearch(new URLSearchParams("status=successful"))).toBe(true);
    expect(isCheckoutSuccessSearch(new URLSearchParams("focus=topup"))).toBe(false);
  });
});
