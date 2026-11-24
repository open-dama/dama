/**
 * Multi-ply live land-sync simulation: client freezes board until onPlyAnimated.
 * Usage: node scripts/e2e-live-board-ply-sync-sim.mjs [API_BASE]
 */
const apiBase = (process.argv[2] || process.env.DAMA_API_BASE_URL || "http://127.0.0.1:18080")
  .replace(/\/$/, "")
  .replace(/\/api\/v1$/, "");

function boardsMatch(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let r = 0; r < a.length; r++) {
    const ar = a[r];
    const br = b[r];
    if (!ar || !br || ar.length !== br.length) return false;
    for (let c = 0; c < ar.length; c++) {
      const x = ar[c];
      const y = br[c];
      if (!x && !y) continue;
      if (!x || !y || x.p !== y.p || Boolean(x.k) !== Boolean(y.k)) return false;
    }
  }
  return true;
}

function isSynced(board, hist) {
  if (!hist?.length) return true;
  const after = hist[hist.length - 1]?.board_after;
  if (!after?.length) return true;
  return boardsMatch(board, after);
}

function fail(msg) {
  console.error("FAIL", msg);
  process.exit(1);
}

const guestRes = await fetch(`${apiBase}/api/v1/auth/guest`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
const guest = await guestRes.json().catch(() => ({}));
if (!guestRes.ok || !guest.access_token) fail(`guest auth ${guestRes.status}`);

const flags = await (await fetch(`${apiBase}/api/v1/feature-flags`)).json().catch(() => ({}));
const depth = Array.isArray(flags.ai_depths) && flags.ai_depths.length ? flags.ai_depths[0] : 2;

let game = await (
  await fetch(`${apiBase}/api/v1/games/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${guest.access_token}`,
    },
    body: JSON.stringify({
      mode: "ai",
      ai_search_depth: depth,
      time_control_seconds: 180,
    }),
  })
).json();
if (!game?.id) fail(`AI start ${JSON.stringify(game).slice(0, 200)}`);

let clientBoard = JSON.parse(JSON.stringify(game.board));
let ply = 0;
const yourPlayer = game.your_player || 1;

async function refreshGame() {
  const snapRes = await fetch(`${apiBase}/api/v1/games/${encodeURIComponent(game.id)}`, {
    headers: { Authorization: `Bearer ${guest.access_token}` },
  });
  const snap = await snapRes.json().catch(() => null);
  if (snap?.id) game = snap;
  return game;
}

function applyLandSync(histBeforeLen) {
  const hist = game.move_history || [];
  if (hist.length <= histBeforeLen) return;
  // Mid-flight: frozen client board behind new history → unsynced.
  if (isSynced(clientBoard, hist)) fail(`expected unsynced mid-flight at ply ${hist.length}`);
  const last = hist[hist.length - 1];
  if (!Array.isArray(last?.board_after) || !last.board_after.length) {
    fail(`missing board_after at ply ${hist.length}`);
  }
  clientBoard = JSON.parse(JSON.stringify(last.board_after));
  if (!isSynced(clientBoard, hist)) fail(`land sync failed at ply ${hist.length}`);
  ply = hist.length;
  console.log("PASS ply", ply, "land sync ok");
}

for (let i = 0; i < 8; i++) {
  if (ply >= 6) break;
  await refreshGame();
  if (game.outcome != null || game.draw) break;

  // Drain AI plies that arrived while waiting.
  const beforeDrain = (game.move_history || []).length;
  // If history grew vs client, land-sync those first.
  if (beforeDrain > ply) applyLandSync(ply);

  await refreshGame();
  if (game.outcome != null || game.draw) break;
  if (game.turn !== yourPlayer) {
    await new Promise((r) => setTimeout(r, 600));
    await refreshGame();
    if ((game.move_history || []).length > ply) applyLandSync(ply);
    continue;
  }

  let legal = game.legal_moves || [];
  const must = game.must_continue;
  if (must && Array.isArray(must) && must.length >= 2) {
    legal = legal.filter((m) => m?.from?.[0] === must[0] && m?.from?.[1] === must[1]);
  }
  if (!legal.length) {
    if (ply >= 2) break;
    fail("no legal moves while still needing multi-ply");
  }
  const mv = legal[0];
  const histBefore = (game.move_history || []).length;
  const res = await fetch(`${apiBase}/api/v1/games/${encodeURIComponent(game.id)}/move`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${guest.access_token}`,
    },
    body: JSON.stringify({ from: mv.from, to: mv.to }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Refresh once - AI may have moved / must_continue changed under us.
    await refreshGame();
    if ((game.move_history || []).length > ply) applyLandSync(ply);
    let retryLegal = game.legal_moves || [];
    const retryMust = game.must_continue;
    if (retryMust && Array.isArray(retryMust) && retryMust.length >= 2) {
      retryLegal = retryLegal.filter(
        (m) => m?.from?.[0] === retryMust[0] && m?.from?.[1] === retryMust[1],
      );
    }
    if (game.turn === yourPlayer && retryLegal.length > 0) {
      const retry = retryLegal[0];
      const histRetry = (game.move_history || []).length;
      const res2 = await fetch(`${apiBase}/api/v1/games/${encodeURIComponent(game.id)}/move`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${guest.access_token}`,
        },
        body: JSON.stringify({ from: retry.from, to: retry.to }),
      });
      const body2 = await res2.json().catch(() => ({}));
      if (!res2.ok) {
        // Multi-ply land-sync already proven at ply>=2; stop cleanly.
        if (ply >= 2) {
          console.log("PASS stop after", ply, "plies (move race)");
          break;
        }
        fail(`move ${res2.status} ${JSON.stringify(body2).slice(0, 200)}`);
      }
      game = body2;
      applyLandSync(histRetry);
    } else if (ply >= 2) {
      console.log("PASS stop after", ply, "plies (turn/legal race)");
      break;
    } else {
      fail(`move ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
    }
  } else {
    game = body;
    applyLandSync(histBefore);
  }

  // Wait for AI reply and land-sync.
  for (let w = 0; w < 10; w++) {
    await new Promise((r) => setTimeout(r, 400));
    await refreshGame();
    if ((game.move_history || []).length > ply) {
      applyLandSync(ply);
      break;
    }
    if (game.outcome != null || game.draw) break;
    if (game.turn === yourPlayer) break;
  }
}

if (ply < 2) fail(`need >=2 plies for multi-ply sim, got ${ply}`);
console.log(`LIVE_BOARD_PLY_SYNC_SIM_OK plies=${ply}`);
