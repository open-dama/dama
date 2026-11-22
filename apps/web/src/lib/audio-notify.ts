type NotifyEvent =
  | "match_found"
  | "game_start"
  | "your_turn"
  | "capture"
  | "win"
  | "loss"
  | "error"
  | "info"
  | "move"
  | "promote";

/** Chess.com-style land SFX ([default theme](https://www.youtube.com/watch?v=7skwR49UhqA)). */
export type PieceLandKind = "move" | "capture" | "promote";

const LAND_SRC: Record<PieceLandKind, string> = {
  move: "/sounds/move.mp3",
  capture: "/sounds/capture.mp3",
  promote: "/sounds/promote.mp3",
};

const LAND_KINDS = Object.keys(LAND_SRC) as PieceLandKind[];

const GAME_START_SRC = "/sounds/game-start.mp3";
/** Soft ClickUp-like delivery ping - recipient-only (original Dama asset). */
const MESSAGE_SRC = "/sounds/message.wav";

let lastMessageNotifyAt = 0;

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

/** Decoded land buffers (Lichess / Chess.com pattern) - zero HTMLAudio race on put-down. */
const landBuffers = new Map<PieceLandKind, AudioBuffer>();
let buffersWarm: Promise<void> | null = null;

/** Pool fallback when WebAudio decode is unavailable. */
const LAND_POOL = 4;
const landPools: Partial<Record<PieceLandKind, HTMLAudioElement[]>> = {};
const landPoolIdx: Partial<Record<PieceLandKind, number>> = {};
let gameStartPlayer: HTMLAudioElement | null = null;
let messagePlayer: HTMLAudioElement | null = null;

let visibilityHooked = false;
let ctxStateHooked = false;
let audioUnlocked = false;
/** Serialize resume/unlock so tab-visible + ad-close cannot race and leave ctx suspended. */
let resumeInFlight: Promise<void> | null = null;
let gestureArmHooked = false;

function makeAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    return new AC({ latencyHint: "interactive" });
  } catch {
    try {
      return new AC();
    } catch {
      return null;
    }
  }
}

function hookCtxState(audio: AudioContext): void {
  if (ctxStateHooked) return;
  ctxStateHooked = true;
  audio.addEventListener("statechange", () => {
    // YouTube / in-match video can suspend or interrupt mid-game (Chrome + iOS).
    if (audio.state === "suspended" || (audio.state as string) === "interrupted") {
      audioUnlocked = false;
      armAudioGestureResume();
    }
  });
}

function dropAudioContext(): void {
  const prev = ctx;
  ctx = null;
  masterGain = null;
  landBuffers.clear();
  buffersWarm = null;
  ctxStateHooked = false;
  audioUnlocked = false;
  if (prev && prev.state !== "closed") {
    try {
      void prev.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Lichess `resumeWithTest`: recreate interrupted/closed contexts, race resume()
 * with a timeout (resume can hang forever after iframe media), then require running.
 */
async function resumeWithTest(): Promise<AudioContext | null> {
  let audio = getCtx();
  if (!audio) return null;
  const state = audio.state as string;
  if (state !== "running" && state !== "suspended") {
    // iOS reports `interrupted`; closed contexts cannot resume.
    dropAudioContext();
    audio = getCtx();
    if (!audio) return null;
  }
  if (audio.state === "suspended") {
    try {
      await Promise.race([
        audio.resume(),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 400);
        }),
      ]);
    } catch {
      /* autoplay / policy */
    }
  }
  return audio.state === "running" ? audio : null;
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = makeAudioContext();
  if (!ctx) return null;
  if (!masterGain) {
    masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
  }
  hookCtxState(ctx);
  // Tab/background + post-video ads suspend AudioContext → land SFX go silent until resumed.
  if (!visibilityHooked) {
    visibilityHooked = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void resumeGameAudio();
      }
    });
    // iOS Safari bfcache / iframe focus: visibility alone is not enough.
    window.addEventListener("pageshow", () => {
      void resumeGameAudio();
    });
    window.addEventListener("focus", () => {
      const audio = ctx;
      if (audio?.state === "suspended" || (audio?.state as string) === "interrupted") {
        void resumeGameAudio();
      }
    });
  }
  return ctx;
}

async function ensureCtx(): Promise<AudioContext | null> {
  return resumeWithTest();
}

/**
 * Warm decoded buffers. Retries when a prior warm finished with missing clips
 * (first unlock often races Autoplay / suspended ctx on production).
 */
async function warmLandBuffers(force = false): Promise<void> {
  if (!force && landBuffers.size >= LAND_KINDS.length) return;
  if (buffersWarm) {
    await buffersWarm;
    if (!force && landBuffers.size >= LAND_KINDS.length) return;
  }
  const run = (async () => {
    const audio = await ensureCtx();
    if (!audio || audio.state !== "running") return;
    await Promise.all(
      LAND_KINDS.map(async (kind) => {
        if (!force && landBuffers.has(kind)) return;
        try {
          const res = await fetch(LAND_SRC[kind]);
          if (!res.ok) return;
          const raw = await res.arrayBuffer();
          // copy: some browsers detach the buffer on decode
          const buf = await audio.decodeAudioData(raw.slice(0));
          landBuffers.set(kind, buf);
        } catch {
          /* HTMLAudio pool remains the fallback */
        }
      }),
    );
  })();
  buffersWarm = run;
  try {
    await run;
  } finally {
    // Allow retry if warm left gaps (suspended ctx / network blip).
    if (landBuffers.size < LAND_KINDS.length) {
      buffersWarm = null;
    }
  }
}

/**
 * Sync buffer play. Returns false when ctx is not running so callers can
 * await resume - never report success for a silent suspended start.
 */
function playLandFromBuffer(kind: PieceLandKind, volume: number): boolean {
  const audio = getCtx();
  const buf = landBuffers.get(kind);
  if (!audio || !buf || !masterGain) return false;
  if (audio.state !== "running") return false;
  try {
    const now = audio.currentTime;
    masterGain.gain.setValueAtTime(volume, now);
    const src = audio.createBufferSource();
    src.buffer = buf;
    src.connect(masterGain);
    src.start(0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Call on first board pointer/tap so Autoplay policies unlock HTMLAudio + AudioContext
 * before the first land SFX (avoids intermittent silence).
 */
export async function unlockGameAudio(): Promise<void> {
  if (typeof window === "undefined") return;
  if (audioUnlocked && landBuffers.size >= LAND_KINDS.length) {
    const audio = getCtx();
    if (audio?.state === "running") return;
  }
  try {
    const audio = await ensureCtx();
    // Never claim unlocked while suspended - that left production put-downs silent.
    if (!audio || audio.state !== "running") {
      audioUnlocked = false;
      return;
    }
    await warmLandBuffers();
    for (const kind of LAND_KINDS) {
      const el = nextLandPlayer(kind);
      el.volume = 0.001;
      try {
        el.currentTime = 0;
        await el.play();
        el.pause();
        el.currentTime = 0;
      } catch {
        /* unlock best-effort */
      }
      el.volume = 0.8;
    }
    audioUnlocked = landBuffers.size > 0 || Boolean(landPools.move?.length);
  } catch {
    audioUnlocked = false;
  }
}

/**
 * After YouTube/in-match ads, browsers often refuse resume() until the next user
 * gesture. Arm a one-shot capture listener (Lichess pattern) so the next tap/key
 * re-warms buffers before the following put-down.
 */
export function armAudioGestureResume(): void {
  if (typeof window === "undefined" || gestureArmHooked) return;
  gestureArmHooked = true;
  const once = () => {
    gestureArmHooked = false;
    document.removeEventListener("pointerdown", once, true);
    document.removeEventListener("keydown", once, true);
    void resumeGameAudio();
  };
  document.addEventListener("pointerdown", once, true);
  document.addEventListener("keydown", once, true);
}

/**
 * After in-match video ads / tab return: browsers often suspend AudioContext and
 * revoke HTMLAudio autoplay. Re-warm so put-down SFX never stay swallowed.
 */
export async function resumeGameAudio(): Promise<void> {
  if (typeof window === "undefined") return;
  if (resumeInFlight) return resumeInFlight;
  resumeInFlight = (async () => {
    try {
      const audio = await resumeWithTest();
      if (!audio) {
        armAudioGestureResume();
        return;
      }
      await warmLandBuffers(true);
      audioUnlocked = false;
      await unlockGameAudio();
      if (!audioUnlocked) armAudioGestureResume();
    } catch {
      armAudioGestureResume();
    } finally {
      resumeInFlight = null;
    }
  })();
  return resumeInFlight;
}

function beep(
  audio: AudioContext,
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  gainPeak = 0.08,
) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.connect(gain);
  gain.connect(audio.destination);
  const now = audio.currentTime;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

function nextLandPlayer(kind: PieceLandKind): HTMLAudioElement {
  let pool = landPools[kind];
  if (!pool) {
    pool = Array.from({ length: LAND_POOL }, () => {
      const el = new Audio(LAND_SRC[kind]);
      el.preload = "auto";
      return el;
    });
    landPools[kind] = pool;
    landPoolIdx[kind] = 0;
  }
  const idx = landPoolIdx[kind] ?? 0;
  landPoolIdx[kind] = (idx + 1) % pool.length;
  const player = pool[idx];
  if (!player) {
    throw new Error(`land audio pool empty for ${kind}`);
  }
  return player;
}

/**
 * Put-down only: move / capture / promote (king) - Chess.com default samples.
 * Priority when calling: promote > capture > move.
 */
export async function playPieceLandSound(kind: PieceLandKind): Promise<void> {
  if (typeof window === "undefined") return;
  // No global time debounce: multi-jump lands are often <18ms apart and were going silent.
  // Overlap is handled by BufferSource / element pool; per-animation boards gate with soundPlayed.
  const volume = kind === "capture" ? 0.9 : kind === "promote" ? 0.85 : 0.8;

  // Hot path: if buffers + running ctx are ready, start sync (no await on land tick).
  if (playLandFromBuffer(kind, volume)) return;
  void warmLandBuffers();

  const softBeep = async () => {
    const audio = await ensureCtx();
    if (!audio || audio.state !== "running") return;
    if (kind === "promote") {
      beep(audio, 520, 0.07, "triangle", 0.06);
      window.setTimeout(() => beep(audio, 780, 0.1, "triangle", 0.05), 55);
      return;
    }
    if (kind === "capture") {
      beep(audio, 220, 0.06, "square", 0.05);
      window.setTimeout(() => beep(audio, 140, 0.08, "sine", 0.07), 30);
      return;
    }
    beep(audio, 180, 0.05, "sine", 0.05);
  };

  try {
    // Lichess pattern: resume + ensure buffers before BufferSource.start.
    await ensureCtx();
    if (!landBuffers.has(kind)) {
      await Promise.race([
        warmLandBuffers(),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 80);
        }),
      ]);
    }
    if (playLandFromBuffer(kind, volume)) return;

    const el = nextLandPlayer(kind);
    el.volume = volume;
    try {
      el.currentTime = 0;
    } catch {
      /* ignore seek race on some browsers */
    }
    // Cap wait: suspended HTMLAudio after ads used to hang the land path.
    await Promise.race([
      el.play(),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("land-sfx-timeout")), 120);
      }),
    ]);
  } catch {
    await softBeep();
  }
}

/** @deprecated Prefer playPieceLandSound with explicit kind. */
export async function playPiecePlaceSound(captured = false, promoted = false): Promise<void> {
  if (promoted) return playPieceLandSound("promote");
  if (captured) return playPieceLandSound("capture");
  return playPieceLandSound("move");
}

export function pieceLandKind(opts: {
  isCapture?: boolean;
  isPromotion?: boolean;
}): PieceLandKind {
  if (opts.isPromotion) return "promote";
  if (opts.isCapture) return "capture";
  return "move";
}

/**
 * Play when another user’s chat message is delivered to this client
 * (DM / game chat). Debounced; never for own outbound.
 */
export async function playMessageDeliveredSound(): Promise<void> {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastMessageNotifyAt < 350) return;
  lastMessageNotifyAt = now;
  try {
    await ensureCtx();
    if (!messagePlayer) {
      messagePlayer = new Audio(MESSAGE_SRC);
      messagePlayer.preload = "auto";
    }
    messagePlayer.volume = 0.62;
    messagePlayer.currentTime = 0;
    await messagePlayer.play();
  } catch {
    // Fail closed: no synthetic beep invent when asset/autoplay unavailable.
  }
}

/** Match events + land SFX (move/capture/promote map to Chess.com samples). */
export async function playGameNotify(event: NotifyEvent): Promise<void> {
  if (event === "move") return playPieceLandSound("move");
  if (event === "capture") return playPieceLandSound("capture");
  if (event === "promote") return playPieceLandSound("promote");
  if (event === "game_start" || event === "match_found") {
    if (typeof window !== "undefined") {
      try {
        await ensureCtx();
        if (!gameStartPlayer) {
          gameStartPlayer = new Audio(GAME_START_SRC);
          gameStartPlayer.preload = "auto";
        }
        gameStartPlayer.volume = 0.85;
        gameStartPlayer.currentTime = 0;
        await gameStartPlayer.play();
        return;
      } catch {
        /* fall through to tone */
      }
    }
  }

  const audio = await ensureCtx();
  if (!audio) return;
  const now = audio.currentTime;

  if (event === "win") {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      window.setTimeout(() => beep(audio, f, 0.14, "triangle", 0.07), i * 90);
    });
    return;
  }
  if (event === "loss") {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.frequency.setValueAtTime(330, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.4);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    osc.start(now);
    osc.stop(now + 0.45);
    return;
  }

  const map: Record<string, { freq: number; dur: number }> = {
    match_found: { freq: 660, dur: 0.18 },
    your_turn: { freq: 520, dur: 0.12 },
    error: { freq: 180, dur: 0.2 },
    info: { freq: 400, dur: 0.08 },
  };
  const tone = map[event] ?? { freq: 400, dur: 0.08 };
  beep(audio, tone.freq, tone.dur);
}
