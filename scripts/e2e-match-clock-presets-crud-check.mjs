#!/usr/bin/env node
/**
 * Match-clock preset admin CRUD contract + live play gates.
 * Static: migration/API/admin wiring. Live: public enabled-only, 5 min present,
 * reject disabled/unknown TC on VS-AI start when API is reachable.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const base = (
  process.env.DAMA_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:18080"
)
  .replace(/\/$/, "")
  .replace(/\/api\/v1$/i, "");

const failures = [];
function ok(cond, msg) {
  if (!cond) failures.push(msg);
  else console.log(`OK  ${msg}`);
}
function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function staticChecks() {
  const mig550 = read("apps/api/migrations/550_match_clock_presets_admin_crud.sql");
  const mig551 = read("apps/api/migrations/551_match_clock_preset_5_min.sql");
  ok(mig550.includes('"seconds": 300') && mig550.includes("5 min"), "550 seed includes 5 min");
  ok(
    mig550.includes("enabled") && mig550.includes("sort_order"),
    "550 soft fields enabled+sort_order",
  );
  ok(mig550.includes("tc_preset_add_action"), "550 admin chrome for preset CRUD");
  ok(mig551.includes("300") && mig551.includes("5 min"), "551 adds 5 min once if missing");
  ok(mig551.includes("IF has_5 THEN"), "551 idempotent skip when 5 min exists");

  const settings = read("apps/api/internal/store/settings.go");
  ok(settings.includes("EnabledMatchClockPresets"), "store EnabledMatchClockPresets");
  ok(settings.includes("normalizeAndValidateMatchClockPresets"), "store validate presets");
  ok(settings.includes("must match an enabled preset"), "default must be enabled preset");
  ok(settings.includes("unique seconds"), "unique seconds validation");

  const prog = read("apps/api/internal/rest/progression_handlers.go");
  ok(prog.includes("includeDisabledPresets"), "public vs console preset filter");
  ok(prog.includes("progression.put"), "audit progression.put");
  ok(prog.includes("Presets *[]store.MatchClockPreset"), "ConsolePut accepts presets");

  const handlers = read("apps/api/internal/rest/handlers.go");
  ok(handlers.includes("EnabledMatchClockPresets"), "VS-AI start uses enabled presets");
  const invites = read("apps/api/internal/rest/invite_handlers.go");
  ok(invites.includes("EnabledMatchClockPresets"), "invite create uses enabled presets");
  const stamp = read("apps/api/internal/rest/match_clock.go");
  ok(stamp.includes("EnabledMatchClockPresets"), "stampMatchClock uses enabled presets");
  const queue = read("apps/api/internal/matchmaking/queue.go");
  ok(queue.includes("EnabledMatchClockPresets"), "matchmaking arm uses enabled presets");

  const page = read("apps/admin/src/app/(console)/progression/page.tsx");
  ok(page.includes("tcDialog") && page.includes("saveTcPreset"), "admin preset CRUD dialogs");
  ok(page.includes("err_tc_preset_disable_last"), "admin blocks disabling last enabled");
  ok(page.includes("presets: sortTcPresets(presets)"), "admin save sends presets");

  const chromeTs = read("apps/admin/src/types/admin-console-chrome.ts");
  ok(chromeTs.includes("tc_preset_add_action"), "admin SECTION_KEYS require tc preset chrome");
  const chromeGo = read("apps/api/internal/rest/chrome_handlers.go");
  ok(chromeGo.includes("tc_preset_add_action"), "API chrome fail-closed includes tc preset keys");

  ok(
    !page.includes("Free-form") && page.includes("presetSeconds"),
    "admin uses discrete preset seconds (not free-form-only UX)",
  );
}

async function api(path, { method = "GET", token, body } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body != null) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function tokenFromObj(j) {
  if (!j || typeof j !== "object") return "";
  return String(
    j.access_token ||
      j.token ||
      j.accessToken ||
      j.state?.access_token ||
      j.state?.token ||
      j.state?.accessToken ||
      "",
  ).trim();
}

function loadToken() {
  const env = (process.env.DAMA_E2E_TOKEN || "").trim();
  if (env) return env;
  const p = resolve(root, ".tmp-admin-auth.json");
  if (!existsSync(p)) return "";
  const raw = readFileSync(p, "utf8").replace(/^\uFEFF/, "");
  return tokenFromObj(JSON.parse(raw));
}

async function mintToken(role) {
  const stamp = Date.now();
  const body = {
    username: `tc_crud_${role || "player"}_${stamp}`,
    email: `tc_crud_${role || "player"}_${stamp}@e2e.test`,
  };
  if (role) body.role = role;
  const sess = await api("/api/v1/auth/e2e/session", { method: "POST", body });
  if ((sess.status === 200 || sess.status === 201) && tokenFromObj(sess.json)) {
    return tokenFromObj(sess.json);
  }
  if (!role) {
    const guest = await api("/api/v1/auth/guest", { method: "POST", body: {} });
    if ((guest.status === 200 || guest.status === 201) && tokenFromObj(guest.json)) {
      return tokenFromObj(guest.json);
    }
    return loadToken();
  }
  return "";
}

async function liveChecks() {
  console.log(`\nAPI base: ${base}`);
  let prog;
  try {
    prog = await api("/api/v1/progression");
  } catch (e) {
    failures.push(`API unreachable at ${base}: ${e instanceof Error ? e.message : e}`);
    return;
  }
  ok(prog.status === 200, `GET /progression → ${prog.status}`);
  const clock = prog.json?.match_clock;
  ok(clock && typeof clock === "object", "match_clock present");
  const presets = Array.isArray(clock?.presets) ? clock.presets : [];
  ok(presets.length > 0, `public presets length=${presets.length}`);
  ok(
    presets.every(
      (p) => typeof p.seconds === "number" && p.seconds > 0 && String(p.label || "").trim(),
    ),
    "public presets have seconds+label",
  );
  ok(
    presets.every((p) => p.enabled === undefined),
    "public payload omits enabled (play clients enabled-only list)",
  );
  ok(
    presets.some((p) => p.seconds === 300),
    "public presets include 5 min (300s)",
  );
  ok(
    presets.some((p) => p.seconds === clock.initial_seconds),
    "initial_seconds is in public (enabled) presets",
  );

  const secs = new Set(presets.map((p) => p.seconds));
  ok(secs.size === presets.length, "public preset seconds unique");

  const token = await mintToken();
  if (!token) {
    failures.push("no auth token for VS-AI start gate (e2e session / guest / DAMA_E2E_TOKEN)");
    return;
  }
  ok(Boolean(token), "auth token for play gates");
  const adminTok = (await mintToken("admin")) || (await mintToken("superadmin")) || loadToken();

  const flags = await api("/api/v1/feature-flags");
  const depths = Array.isArray(flags.json?.ai_depths) ? flags.json.ai_depths : [];
  const depth = depths.find((d) => Number(d) > 0) || 1;

  const badTc = 999999;
  const reject = await api("/api/v1/games/start", {
    method: "POST",
    token,
    body: {
      mode: "ai",
      ai_search_depth: depth,
      time_control_seconds: badTc,
    },
  });
  ok(
    reject.status === 400 &&
      String(reject.json?.error || "").includes(
        "time_control_seconds must match match_clock.presets",
      ),
    `reject unknown TC ${badTc} → ${reject.status}`,
  );

  const five = await api("/api/v1/games/start", {
    method: "POST",
    token,
    body: {
      mode: "ai",
      ai_search_depth: depth,
      time_control_seconds: 300,
    },
  });
  ok(
    (five.status === 200 || five.status === 201) && five.json?.id,
    `VS-AI start with 5 min (300s) → ${five.status}`,
  );

  // Soft-disable round-trip (non-default TC): hide from public, reject start, restore.
  if (adminTok) {
    const chrome = await api("/api/v1/public/admin-console-chrome");
    if (chrome.status === 200) {
      const p = chrome.json?.progression || {};
      ok(String(p.tc_preset_add_action || "").trim(), "admin chrome tc_preset_add_action");
      ok(String(p.err_tc_presets_empty || "").trim(), "admin chrome err_tc_presets_empty");
    } else {
      console.log(`SKIP admin chrome (status ${chrome.status})`);
    }

    const cons = await api("/api/v1/console/progression", { token: adminTok });
    if (cons.status === 200 && Array.isArray(cons.json?.match_clock?.presets)) {
      const full = cons.json.match_clock.presets.map((row) => ({
        seconds: Number(row.seconds),
        label: String(row.label || ""),
        enabled: row.enabled !== false,
        sort_order: Number(row.sort_order ?? 0),
      }));
      ok(
        full.every((row) => typeof row.enabled === "boolean"),
        "console presets include enabled",
      );
      const initial = Number(cons.json.match_clock.initial_seconds);
      // Prefer a long non-default TC so we never touch the platform default.
      const victim =
        full.find((row) => row.enabled && row.seconds !== initial && row.seconds === 1800) ||
        full.find((row) => row.enabled && row.seconds !== initial && row.seconds !== 300) ||
        full.find((row) => row.enabled && row.seconds !== initial);
      if (victim) {
        const disabled = full.map((row) =>
          row.seconds === victim.seconds ? { ...row, enabled: false } : row,
        );
        const putOff = await api("/api/v1/console/progression", {
          method: "PUT",
          token: adminTok,
          body: {
            match_clock: {
              enabled: cons.json.match_clock.enabled,
              initial_seconds: cons.json.match_clock.initial_seconds,
              increment_seconds: cons.json.match_clock.increment_seconds,
              invite_ttl_seconds: cons.json.match_clock.invite_ttl_seconds,
              pause_enabled: cons.json.match_clock.pause_enabled,
              pause_duration_seconds: cons.json.match_clock.pause_duration_seconds,
              presets: disabled,
            },
          },
        });
        ok(
          putOff.status === 200,
          `soft-disable ${victim.seconds}s via console PUT → ${putOff.status}`,
        );
        await new Promise((r) => setTimeout(r, 5500));
        const pubOff = await api("/api/v1/progression");
        ok(
          !(pubOff.json?.match_clock?.presets || []).some((x) => x.seconds === victim.seconds),
          `public omits soft-disabled ${victim.seconds}s`,
        );
        const startOff = await api("/api/v1/games/start", {
          method: "POST",
          token,
          body: {
            mode: "ai",
            ai_search_depth: depth,
            time_control_seconds: victim.seconds,
          },
        });
        ok(
          startOff.status === 400,
          `VS-AI rejects soft-disabled ${victim.seconds}s → ${startOff.status}`,
        );
        const putOn = await api("/api/v1/console/progression", {
          method: "PUT",
          token: adminTok,
          body: {
            match_clock: {
              enabled: cons.json.match_clock.enabled,
              initial_seconds: cons.json.match_clock.initial_seconds,
              increment_seconds: cons.json.match_clock.increment_seconds,
              invite_ttl_seconds: cons.json.match_clock.invite_ttl_seconds,
              pause_enabled: cons.json.match_clock.pause_enabled,
              pause_duration_seconds: cons.json.match_clock.pause_duration_seconds,
              presets: full,
            },
          },
        });
        ok(putOn.status === 200, `restore ${victim.seconds}s enabled → ${putOn.status}`);
        await new Promise((r) => setTimeout(r, 5500));
        const pubOn = await api("/api/v1/progression");
        ok(
          (pubOn.json?.match_clock?.presets || []).some((x) => x.seconds === victim.seconds),
          `public restores ${victim.seconds}s after re-enable`,
        );
      } else {
        console.log("SKIP soft-disable round-trip (no non-default enabled victim)");
      }
    } else {
      console.log(`SKIP console progression (status ${cons.status})`);
    }
  } else {
    console.log("SKIP console chrome / soft-disable (no admin token)");
  }
}

async function main() {
  console.log("=== static contract ===");
  staticChecks();
  console.log("\n=== live API ===");
  await liveChecks();
  if (failures.length) {
    console.error("\nFAIL:");
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log("\nALL PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
