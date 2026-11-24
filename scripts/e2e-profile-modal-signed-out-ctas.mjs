/**
 * Click profile modal / Flutter inspect+card: signed-out shows Add Friend + Challenge
 * disabled (Message hidden); signed-in keeps full CTAs. Mirrors PlayerHoverCard.
 * Admin has no play-rail profile inspect UI (N/A).
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
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

const modal = read("apps/web/src/components/player/PlayerProfileModal.tsx");
const hover = read("apps/web/src/components/play-rail/PlayerHoverCard.tsx");
const flutterCard = read("apps/mobile/lib/features/home/play_rail_panel.dart");
const flutterInspect = read("apps/mobile/lib/features/player/player_inspect_sheet.dart");

assert(
  !modal.includes("token && view.id !== myId"),
  "web modal must not hard-hide CTAs behind token",
);
assert(modal.includes("view.id !== myId"), "web modal still hides CTAs for self");
assert(modal.includes("disabled={!token}"), "web modal Challenge disabled when signed out");
assert(modal.includes("{!token ? ("), "web modal shows disabled Add Friend when signed out");
assert(modal.includes("{token ? ("), "web modal Message only when signed in");
assert(
  hover.includes("disabled={!signedIn || friendBusy}"),
  "web hover Add Friend disable pattern intact",
);
assert(
  hover.includes("disabled={!signedIn || challengeBusy || !onChallenge}"),
  "web hover Challenge disable pattern intact",
);
assert(
  hover.includes("const showMessage = Boolean(signedIn && onMessage)"),
  "web hover Message still signed-in only",
);

assert(
  flutterCard.includes("Web PlayerHoverCard parity: show CTAs always"),
  "flutter card documents signed-out CTA parity",
);
assert(
  flutterCard.includes("onPressed: null"),
  "flutter card disables friend and/or challenge when signed out",
);
assert(flutterCard.includes("onPressed: signedIn"), "flutter card Challenge gated on signedIn");
assert(
  flutterCard.includes("if (signedIn && c.messageAction.isNotEmpty)"),
  "flutter card Message only when signed in",
);

assert(
  flutterInspect.includes("even when signed out"),
  "flutter inspect documents signed-out CTA parity",
);
assert(
  !flutterInspect.includes(
    "context.read<AuthCubit>().state.isAuthenticated &&\n                    context.read<AuthCubit>().state.userId != p.id",
  ),
  "flutter inspect must not hard-hide CTAs behind isAuthenticated",
);
assert(
  flutterInspect.includes("onPressed: signedIn"),
  "flutter inspect Challenge disabled when signed out",
);
assert(
  flutterInspect.includes("if (signedIn && rail.messageAction.isNotEmpty)"),
  "flutter inspect Message only when signed in",
);
assert(
  flutterInspect.includes("show disabled Add Friend when signed out"),
  "flutter inspect shows disabled Add Friend when signed out",
);
assert(
  /if \(!signedIn &&[\s\S]*?rail\.sendFriendRequestAction\.isNotEmpty\)[\s\S]*?onPressed: null/.test(
    flutterInspect,
  ),
  "flutter inspect Add Friend onPressed null when signed out",
);

assert(
  !existsSync(join(root, "apps/admin/src/components/player/PlayerProfileModal.tsx")),
  "admin has no PlayerProfileModal (N/A)",
);

console.log("E2E_PROFILE_MODAL_SIGNED_OUT_CTAS_OK");
