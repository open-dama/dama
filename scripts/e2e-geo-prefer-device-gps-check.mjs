/**
 * E2E: Prefer device GPS flag (default ON).
 * ON: foreign GPS coords win over private-IP invent.
 * OFF: /geo/locate and /ads/pricing ignore lat/lng (IP / private invent).
 * Also checks GraphQL field + admin chrome IP-only warn (no em dash).
 * Restores flag to ON after the check.
 *
 * Usage: node scripts/e2e-geo-prefer-device-gps-check.mjs [API_BASE]
 * Default API_BASE http://127.0.0.1:18080/api/v1
 */
import { execSync } from "node:child_process";

const base = (process.argv[2] || "http://127.0.0.1:18080/api/v1").replace(/\/$/, "");
const origin = base.replace(/\/api\/v1\/?$/, "");
// Midtown Manhattan (must not reverse-geocode to ET).
const usPin = { latitude: 40.758, longitude: -73.9855 };

async function locate(body) {
  const res = await fetch(`${base}/geo/locate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function pricing(lat, lng) {
  const qs = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  });
  const res = await fetch(`${base}/ads/pricing?${qs}`);
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

function setFlagLocal(enabled) {
  const sql = `UPDATE feature_flags SET enabled = ${enabled ? "TRUE" : "FALSE"}, updated_at = NOW() WHERE key = 'geo_prefer_device_gps'`;
  execSync(`docker exec dama_postgres psql -U dama -d dama -c "${sql}"`, {
    stdio: "pipe",
  });
}

function flagEnabledLocal() {
  const out = execSync(
    `docker exec dama_postgres psql -U dama -d dama -tAc "SELECT enabled FROM feature_flags WHERE key = 'geo_prefer_device_gps'"`,
    { encoding: "utf8" },
  ).trim();
  return out === "t" || out === "true";
}

function assert(cond, msg, detail) {
  if (!cond) {
    console.error("E2E_FAIL", msg, detail ?? "");
    process.exit(1);
  }
}

const flagsRes = await fetch(`${base}/feature-flags`);
const flags = await flagsRes.json().catch(() => ({}));
assert(flagsRes.ok, "feature-flags status", flagsRes.status);
assert(flags.geo_prefer_device_gps === true, "default prefer GPS ON", flags);

const gqlRes = await fetch(`${origin}/graphql`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: "query { featureFlags { geoPreferDeviceGps } }",
  }),
});
const gql = await gqlRes.json().catch(() => ({}));
assert(gqlRes.ok, "graphql status", gqlRes.status);
assert(gql?.data?.featureFlags?.geoPreferDeviceGps === true, "graphql geoPreferDeviceGps ON", gql);

const chromeRes = await fetch(`${base}/public/admin-console-chrome`);
const chrome = await chromeRes.json().catch(() => ({}));
assert(chromeRes.ok, "admin-console-chrome status", chromeRes.status);
const warn = String(chrome?.feature_flags?.geo_ip_only_mode_warn || "");
assert(warn.length > 0, "geo_ip_only_mode_warn present", chrome?.feature_flags);
assert(!/[-–]/.test(warn), "warn must not use em/en dash", warn);

const onLocate = await locate(usPin);
assert(onLocate.res.ok, "locate ON status", onLocate.res.status);
const onCC = String(onLocate.json?.location?.country_code || "").toUpperCase();
assert(onCC === "US", "ON: foreign GPS should resolve US", onLocate.json);

const onPrice = await pricing(usPin.latitude, usPin.longitude);
assert(onPrice.res.ok, "pricing ON status", onPrice.res.status);
assert(
  String(onPrice.json?.country_code || "").toUpperCase() === "US",
  "ON: pricing pin US",
  onPrice.json,
);

setFlagLocal(false);
assert(flagEnabledLocal() === false, "DB flag OFF after update");

const offLocate = await locate(usPin);
assert(offLocate.res.ok, "locate OFF status", offLocate.res.status);
const offCC = String(offLocate.json?.location?.country_code || "").toUpperCase();
assert(offCC !== "US", "OFF: must ignore US GPS (IP/invent)", offLocate.json);
assert(offCC.length === 2, "OFF: still returns a country", offLocate.json);

const offEmpty = await locate({});
assert(offEmpty.res.ok, "locate OFF empty body", offEmpty.res.status);
const emptyCC = String(offEmpty.json?.location?.country_code || "").toUpperCase();
assert(emptyCC === offCC, "OFF: GPS body and empty body match", {
  emptyCC,
  offCC,
});

const offPrice = await pricing(usPin.latitude, usPin.longitude);
assert(offPrice.res.ok, "pricing OFF status", offPrice.res.status);
assert(
  String(offPrice.json?.country_code || "").toUpperCase() !== "US",
  "OFF: pricing must ignore US pin",
  offPrice.json,
);
assert(
  String(offPrice.json?.country_code || "").toUpperCase() === offCC,
  "OFF: pricing country matches locate",
  { price: offPrice.json, locate: offCC },
);

const offFlags = await (await fetch(`${base}/feature-flags`)).json();
assert(offFlags.geo_prefer_device_gps === false, "REST flag OFF", offFlags);

setFlagLocal(true);
assert(flagEnabledLocal() === true, "restore DB flag ON");

const restored = await locate(usPin);
assert(restored.res.ok, "locate restored status", restored.res.status);
const restoredCC = String(restored.json?.location?.country_code || "").toUpperCase();
assert(restoredCC === "US", "ON again: foreign GPS US", restored.json);

console.log("E2E_PASS geo prefer device gps", {
  on: onCC,
  off: offCC,
  pricingOff: String(offPrice.json?.country_code || "").toUpperCase(),
  restored: restoredCC,
  warn,
});
