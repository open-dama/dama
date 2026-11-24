/**
 * Idle home 2D must be the same surface as live DraughtsBoard2D (web + Flutter).
 * Admin has no draughts 2D board renderer.
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

const preview = read("apps/web/src/components/home/HomePreviewBoard.tsx");
const live2d = read("apps/web/src/components/game/DraughtsBoard2D.tsx");
const hub = read("apps/web/src/components/home/HomePlayHub.tsx");
const spectate = read("apps/web/src/components/spectate/SpectateHub.tsx");
const flutterHome = read("apps/mobile/lib/features/home/home_page.dart");
const flutter2d = read("apps/mobile/lib/features/game/draughts_board_2d.dart");

assert(
  preview.includes('import DraughtsBoard2D from "@/components/game/DraughtsBoard2D"'),
  "web preview imports live DraughtsBoard2D",
);
assert(preview.includes("buildInitialBoard"), "web preview uses FMJD buildInitialBoard");
assert(preview.includes("<DraughtsBoard2D"), "web preview renders <DraughtsBoard2D");
assert(preview.includes("interactive={false}"), "web preview board is non-interactive");
assert(
  preview.includes('className="relative h-full w-full overflow-hidden"'),
  "web preview host matches LivePlayHub plane wrapper",
);
assert(
  !preview.includes("bg-[var(--dama-board-dark)]"),
  "web preview must not flat-fill squares itself",
);
assert(!preview.includes("hover:scale-105"), "web preview must not hover-scale pieces");
assert(!preview.includes("drop-shadow-sm"), "web preview must not use marketing drop-shadow-sm");

assert(live2d.includes("linear-gradient(160deg"), "live web 2D has quietShade 160deg gradients");
assert(live2d.includes("inset 0 1px 0"), "live web 2D has inset quiet rims");
assert(
  live2d.includes('backgroundColor: "var(--dama-board-dark)"'),
  "live web 2D has dark underplane",
);
assert(live2d.includes("h-[78%] w-[78%]"), "live web 2D uses 78% piece wrapper");
assert(live2d.includes("PalacePieceMark"), "live web 2D uses Neo PalacePieceMark");

assert(hub.includes("<HomePreviewBoard"), "home hub mounts HomePreviewBoard for idle 2D");
assert(spectate.includes("<HomePreviewBoard"), "spectate idle 2D uses HomePreviewBoard");

assert(
  /class _HomePreviewBoard[\s\S]*DraughtsBoard2D\(/.test(flutterHome),
  "flutter home idle uses DraughtsBoard2D",
);
assert(
  !/class _HomePreviewBoard[\s\S]*BoxShape\.circle/.test(flutterHome),
  "flutter home idle has no flat circle discs",
);
assert(flutter2d.includes("quietGradient"), "flutter live 2D has quietGradient");
assert(flutter2d.includes("widthFactor: 0.78"), "flutter live 2D piece scale 0.78 (web parity)");
assert(flutter2d.includes("Alignment(-0.34, -1.0)"), "flutter quietShade axis ≈ web 160deg");

assert(
  !existsSync(join(root, "apps/admin/src/components/game/DraughtsBoard2D.tsx")),
  "admin has no DraughtsBoard2D (N/A)",
);

console.log("E2E_2D_BOARD_PARITY_OK");
