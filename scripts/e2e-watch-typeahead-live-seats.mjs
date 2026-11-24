/**
 * Games → Watch typeahead must suggest seats from /games/live only,
 * not the global GET /players directory. History keeps /players.
 * Admin has no Watch rail (N/A).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exit(1);
  }
  console.log("PASS", msg);
}

const games = read("apps/web/src/components/play-rail/GamesPanel.tsx");
const typeahead = read("apps/web/src/components/play-rail/PlayerSearchTypeahead.tsx");
const players = read("apps/web/src/components/play-rail/PlayersPanel.tsx");
const challenge = read("apps/web/src/components/play-rail/CreateChallengeForm.tsx");
const flutter = read("apps/mobile/lib/features/home/play_rail_panel.dart");

// --- Web Watch ---
assert(games.includes("watchTypeaheadLocal"), "web Watch builds local typeahead from live seats");
assert(
  games.includes('serverSearch={sub !== "watch"}'),
  "web Watch disables GET /players typeahead",
);
assert(
  games.includes('localSuggestions={sub === "watch" ? watchTypeaheadLocal : null}'),
  "web Watch passes live seat suggestions",
);
assert(games.includes("seatPlayers(g)"), "web Watch suggestions use seatPlayers from live rows");
assert(games.includes("useLiveGamesInfinite"), "web Watch list still uses GET /games/live");
assert(
  !/\bserverSearch\b(?!\=\{sub !== \"watch\"\})/.test(
    games.replace(/serverSearch=\{sub !== \"watch\"\}/g, ""),
  ),
  "web GamesPanel has no unconditional serverSearch",
);
assert(
  games.includes("void liveQuery.fetchNextPage()"),
  "web Watch drains live pages while searching",
);

// PlayerSearchTypeahead local mode never hits /players
assert(
  typeahead.includes("const useLocal = localSuggestions != null"),
  "typeahead local mode gated on localSuggestions",
);
assert(
  typeahead.includes("enabled && !disabled && !useLocal && serverSearch && open && q.length > 0"),
  "typeahead server GET /players disabled when localSuggestions set",
);

// --- Untouched flows ---
assert(
  players.includes('serverSearch={sub === "all"}'),
  "Players All still uses serverSearch (untouched)",
);
assert(challenge.includes("serverSearch"), "Challenge still uses serverSearch (untouched)");

// --- Flutter Watch ---
assert(flutter.includes("_liveSeatPlayers()"), "flutter Watch builds seat players from live games");
assert(
  flutter.includes("_rankUsernameMatches(_liveSeatPlayers(), q)"),
  "flutter Watch typeahead ranks live seats",
);
assert(
  flutter.includes("Watch: list + typeahead share GET /games/live?q= seats (not GET /players)."),
  "flutter Watch search documents live-seats typeahead (no /players)",
);
assert(
  /void _onGamesSearchChanged[\s\S]*?if \(_gamesSub == 0\) \{[\s\S]*?unawaited\(_loadLiveGames\(\)\);[\s\S]*?\} else \{[\s\S]*?unawaited\(_loadRailPlayerSuggest\(v\)\);/.test(
    flutter,
  ),
  "flutter Watch debounce loads live games only; History still loads /players suggest",
);
assert(
  flutter.includes("Drain every /games/live?q= page so Watch typeahead is not first-page-only"),
  "flutter Watch drains live pages while q active",
);
assert(
  flutter.includes("Uri.parse('$_rest/games/live')"),
  "flutter live list still hits /games/live",
);

// Players All on flutter still uses /players suggest path
assert(
  /if \(_playersSub == 2\) unawaited\(_loadRailPlayerSuggest\(v\)\)/.test(flutter),
  "flutter Players All still loads /players suggest (untouched)",
);

// --- Admin ---
assert(
  !existsSync(join(root, "apps/admin/src/components/play-rail/GamesPanel.tsx")),
  "admin has no Games Watch panel (N/A)",
);

console.log("E2E_WATCH_TYPEAHEAD_LIVE_SEATS_OK");
