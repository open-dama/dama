/**
 * Pure proof: stale lower-ply /state must not rewind a newer local board tip.
 * Mirrors LivePlayHub hardResyncGameState rewindGhost guards.
 */
function plyCount(g) {
  return g?.move_count ?? g?.move_history?.length ?? 0;
}

function boardsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeRemoteBoardState(previous, incoming) {
  if (!previous) return incoming;
  const previousPly = plyCount(previous);
  const incomingPly = plyCount(incoming);
  if (incomingPly < previousPly) {
    return previous; // keep forward tip
  }
  if (incomingPly === previousPly || incomingPly > previousPly) {
    return { ...incoming, board: previous.board };
  }
  return incoming;
}

/** Mirrors LivePlayHub hardResync drop policy (rewindGhost = failed submit only). */
function hardResyncDrop(localPlyBefore, livePly, incomingPly, inflight, force, rewindGhost) {
  const tip = Math.max(localPlyBefore, livePly);
  if (incomingPly < tip && !rewindGhost) return "drop_stale";
  if (incomingPly <= livePly && inflight && !rewindGhost) return "drop_inflight";
  return "apply";
}

const forwardBoard = [
  [{ p: 1 }, null],
  [null, { p: 2 }],
];
const olderBoard = [
  [{ p: 1 }, null],
  [null, null],
];

const local = {
  id: "g1",
  move_count: 4,
  board: forwardBoard,
  move_history: [{}, {}, {}, { board_after: forwardBoard }],
};
const stale = {
  id: "g1",
  move_count: 3,
  board: olderBoard,
  move_history: [{}, {}, {}],
};

let failed = 0;
function assert(cond, name) {
  if (!cond) {
    console.error("FAIL", name);
    failed += 1;
  } else {
    console.log("PASS", name);
  }
}

const merged = mergeRemoteBoardState(local, stale);
assert(plyCount(merged) === 4, "stale lower ply keeps local ply count");
assert(boardsEqual(merged.board, forwardBoard), "stale lower ply keeps forward board");
assert(
  hardResyncDrop(4, 4, 3, false, false, false) === "drop_stale",
  "hardResync drops stale poll",
);
assert(
  hardResyncDrop(4, 4, 4, true, false, false) === "drop_inflight",
  "hardResync drops same-ply mid-flight",
);
assert(hardResyncDrop(4, 4, 5, false, false, false) === "apply", "hardResync applies higher ply");
assert(
  hardResyncDrop(4, 4, 3, false, true, true) === "apply",
  "failed-submit rewindGhost allows shorter tip",
);
assert(
  hardResyncDrop(4, 4, 3, false, true, false) === "drop_stale",
  "force reconnect without rewindGhost still drops stale tip",
);
assert(
  hardResyncDrop(4, 4, 4, true, true, false) === "drop_inflight",
  "force reconnect mid-flight without rewindGhost drops",
);
assert(
  hardResyncDrop(4, 4, 3, false, true, false) === "drop_stale",
  "in-flight submit lock must NOT rewind on reconnect (mid-move snap-back)",
);

const grew = mergeRemoteBoardState(local, {
  ...local,
  move_count: 5,
  board: [
    [null, null],
    [null, { p: 2 }],
  ],
  move_history: [
    ...local.move_history,
    {
      board_after: [
        [null, null],
        [null, { p: 2 }],
      ],
    },
  ],
});
assert(boardsEqual(grew.board, forwardBoard), "history grow freezes previous.board for animation");

if (failed) {
  console.error(`SNAPBACK_PROOF_FAIL count=${failed}`);
  process.exit(1);
}
console.log("SNAPBACK_PROOF_OK");
