/** Stable device viewer id (survives reloads). */
export function adViewerKey(): string {
  if (typeof window === "undefined") return "";
  const key = "dama_ad_viewer";
  let v = window.localStorage.getItem(key);
  if (!v) {
    v = crypto.randomUUID();
    window.localStorage.setItem(key, v);
  }
  return v;
}

/** Browser-tab session id for per-session frequency caps (sessionStorage). */
export function adSessionKey(): string {
  if (typeof window === "undefined") return "";
  const key = "dama_ad_session";
  let v = window.sessionStorage.getItem(key);
  if (!v) {
    v = crypto.randomUUID();
    window.sessionStorage.setItem(key, v);
  }
  return v;
}
