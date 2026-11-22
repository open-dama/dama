/**
 * Absolute wallet URL for gateway return/success redirects (Chapa return_url /
 * Paddle successUrl). Webhook still credits; this is UX only.
 */
export function checkoutReturnUrl(moneyBasePath = ""): string {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin.replace(/\/$/, "");
  if (!origin) return "";
  const base = (moneyBasePath || "").trim().replace(/\/$/, "");
  const path = base ? `${base}/wallet` : "/wallet";
  return `${origin}${path}?checkout=success`;
}

/** Infer portal money base from the current path when callers omit moneyBasePath. */
export function checkoutReturnUrlFromLocation(): string {
  if (typeof window === "undefined") return "";
  const path = window.location.pathname || "";
  let base = "";
  if (path === "/events" || path.startsWith("/events/")) base = "/events";
  else if (path === "/ads" || path.startsWith("/ads/")) base = "/ads";
  return checkoutReturnUrl(base);
}

/** True when the user landed back after gateway checkout (Chapa/Paddle). */
export function isCheckoutSuccessSearch(search: URLSearchParams | null | undefined): boolean {
  if (!search) return false;
  const checkout = (search.get("checkout") || "").trim().toLowerCase();
  if (checkout === "success") return true;
  // Chapa may append status=success on return_url.
  const status = (search.get("status") || "").trim().toLowerCase();
  return status === "success" || status === "successful";
}
