#!/usr/bin/env node
/**
 * Start / VS-intro SFX contract: no game-start / match_found thud on MatchIntro,
 * board arm, or matchmaking→board handoff. In-game land SFX on 2D/3D stay wired.
 * Admin has no board audio surface.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const fail = [];
function ok(cond, msg) {
  if (!cond) fail.push(msg);
  else console.log(`OK  ${msg}`);
}
function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

const live = read("apps/web/src/components/play/LivePlayHub.tsx");
ok(
  !/playGameNotify\(\s*["']game_start["']\s*\)/.test(live),
  "web LivePlayHub has no game_start on MatchIntro",
);
ok(live.includes("MatchIntroOverlay"), "web still mounts MatchIntroOverlay");

const intro = read("apps/web/src/components/chat/MatchIntroOverlay.tsx");
ok(intro.includes("onShowFiredRef"), "web MatchIntro onShow once-per-active");

const board = read("apps/mobile/lib/features/game/match_board_page.dart");
ok(!/GameNotify\.play\(\s*['"]game_start['"]\s*\)/.test(board), "flutter board has no game_start");
ok(
  !/GameNotify\.play\(\s*['"]match_found['"]\s*\)/.test(board),
  "flutter board has no match_found on arm/join",
);
ok(board.includes("_armMatchIntroFailOpen"), "flutter MatchIntro fail-open still armed");

const flIntro = read("apps/mobile/lib/features/chat/match_intro_overlay.dart");
ok(
  flIntro.includes("_onShowFired") || flIntro.includes("_fireOnShowOnce"),
  "flutter MatchIntro onShow once",
);

const b2d = read("apps/web/src/components/game/DraughtsBoard2D.tsx");
const b3d = read("apps/web/src/components/game/DraughtsScene3D.tsx");
ok(b2d.includes("playPieceLandSound"), "web 2D land SFX still wired");
ok(b3d.includes("playPieceLandSound"), "web 3D land SFX still wired");
ok(b2d.includes("!replayModeRef.current"), "web 2D land gated by replayMode");
ok(b3d.includes("!replayModeRef.current"), "web 3D land gated by replayMode");

const f2d = read("apps/mobile/lib/features/game/draughts_board_2d.dart");
const f3d = read("apps/mobile/lib/features/game/draughts_board_3d.dart");
ok(f2d.includes("playPiecePlace"), "flutter 2D land SFX still wired");
ok(f3d.includes("playPiecePlace"), "flutter 3D land SFX still wired");
ok(f2d.includes("!widget.replayMode"), "flutter 2D land gated by replayMode");
ok(f3d.includes("!widget.replayMode"), "flutter 3D land gated by replayMode");

ok(Boolean(read("apps/admin/package.json")), "admin package present (no board SFX expected)");

const mmWeb = read("apps/web/src/components/matchmaking/MatchmakingRealtimeProvider.tsx");
ok(
  !/playGameNotify\(\s*["']match_found["']\s*\)/.test(mmWeb),
  "web matchmaking does not play match_found into board/VS intro",
);
ok(!/playGameNotify\(\s*["']game_start["']\s*\)/.test(mmWeb), "web matchmaking has no game_start");
ok(mmWeb.includes("toast_match_found"), "web matchmaking still toasts match_found");

const mmPage = read("apps/mobile/lib/features/game/matchmaking_page.dart");
const mmRt = read("apps/mobile/lib/features/game/matchmaking_realtime.dart");
ok(
  !/GameNotify\.play\(\s*['"]match_found['"]\s*\)/.test(mmPage),
  "flutter matchmaking_page has no match_found SFX",
);
ok(
  !/GameNotify\.play\(\s*['"]match_found['"]\s*\)/.test(mmRt),
  "flutter matchmaking_realtime has no match_found SFX",
);
ok(
  !/GameNotify\.play\(\s*['"]game_start['"]\s*\)/.test(mmPage + mmRt),
  "flutter matchmaking has no game_start SFX",
);

const audioWeb = read("apps/web/src/lib/audio-notify.ts");
ok(
  audioWeb.includes("GAME_START_COALESCE_MS"),
  "web coalesces match_found/game_start (safety net)",
);
ok(audioWeb.includes("playPieceLandSound"), "web land API intact");
const audioFlutter = read("apps/mobile/lib/core/audio/game_notify.dart");
ok(
  audioFlutter.includes("_gameStartCoalesceMs"),
  "flutter coalesces match_found/game_start (safety net)",
);
ok(audioFlutter.includes("playPieceLand"), "flutter land API intact");

if (fail.length) {
  console.error("\nFAIL:");
  for (const f of fail) console.error(` - ${f}`);
  process.exit(1);
}
console.log("\nALL PASS");
