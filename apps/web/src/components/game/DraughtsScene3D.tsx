"use client";

/**
 * 3D draughts board - visual/interaction mirror of smart-menu DraughtsScene3D.
 * Square/piece colors come from CSS board + piece palettes (`--dama-board-*` / `--dama-piece-*`).
 */

import { BoardAreaSkeleton } from "@/components/ui/BoardColumnSkeleton";
import { useDraughtsPerformanceTier } from "@/hooks/useDraughtsPerformanceTier";
import { pieceLandKind, playPieceLandSound, unlockGameAudio } from "@/lib/audio-notify";
import {
  boardCoordUsesLightInk,
  boardFileLetter,
  boardRankNumber,
  isVisualBottomRank,
  isVisualLeftFile,
} from "@/lib/board-square";
import { palacePieceRole } from "@/lib/palace-piece";
import type { BoardCell, LegalMove, MoveHistoryEntry } from "@/types/game";
import { OrbitControls, Text } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  type Group,
  PCFSoftShadowMap,
  SRGBColorSpace,
} from "three";

const PIECE_REST_Y = 0.12;
const PICK_HEIGHT = 0.5;
const CAPTURE_PICK_HEIGHT = 0.52;
const PICK_PHASE_END = 0.24;
const HOLD_PHASE_END = 0.34;
const LAND_PHASE_START = 0.72;
/** Snappy product timing - identical for own + opponent (2D parity). */
const MOVE_DURATION_MIN = 0.34;
const CAPTURE_DURATION_MIN = 0.44;
const DURATION_PER_SQUARE = 0.09;
const MOVE_DURATION_MAX = 0.82;

/** Fallbacks = Forest + White & black (product defaults). */
const SQ_LIGHT = "#eeeed2";
const SQ_DARK = "#769656";
const SQ_FRAME = "#4a6741";
/** Fallback only - live cues use `--dama-board-highlight` (same as 2D). */
const HIGHLIGHT = "#baca44";
const PIECE_P1 = "#ffffff";
const PIECE_P2 = "#141414";
const PIECE_P1_EMISSIVE = "#a1a1aa";
const PIECE_P2_EMISSIVE = "#3f3f46";
/** Fallback court metals - live values come from palette CSS vars. */
const KING_ACCENT = "#c9a227";
const QUEEN_ACCENT = "#b76e79";
const HEIR_ACCENT = "#9ca3af";

type CssBoardColors = {
  light: string;
  dark: string;
  frame: string;
  highlight: string;
  /** Chess.com-style yellow last-ply squares (`--dama-last-move`). */
  lastMove: string;
  pieceLight: string;
  pieceDark: string;
  /** When true, dark-side pieces use light|dark hemispheres (White & half). */
  pieceDarkSplit: boolean;
  pieceMark: string;
  pieceKing: string;
  pieceQueen: string;
  pieceHeir: string;
};

function readCssBoardColors(): CssBoardColors {
  if (typeof document === "undefined") {
    return {
      light: SQ_LIGHT,
      dark: SQ_DARK,
      frame: SQ_FRAME,
      highlight: HIGHLIGHT,
      lastMove: "",
      pieceLight: PIECE_P1,
      pieceDark: PIECE_P2,
      pieceDarkSplit: true,
      pieceMark: "#A31D38",
      pieceKing: KING_ACCENT,
      pieceQueen: QUEEN_ACCENT,
      pieceHeir: HEIR_ACCENT,
    };
  }
  const s = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => {
    const v = s.getPropertyValue(name).trim();
    return v || fallback;
  };
  return {
    light: pick("--dama-board-light", SQ_LIGHT),
    dark: pick("--dama-board-dark", SQ_DARK),
    frame: pick("--dama-board-frame", SQ_FRAME),
    highlight: pick("--dama-board-highlight", HIGHLIGHT),
    // Theme token only - no invented Chess yellow hex.
    lastMove: s.getPropertyValue("--dama-last-move").trim(),
    pieceLight: pick("--dama-piece-light", PIECE_P1),
    pieceDark: pick("--dama-piece-dark", PIECE_P2),
    pieceDarkSplit: s.getPropertyValue("--dama-piece-dark-split").trim() === "1",
    pieceMark: pick("--dama-piece-mark", "#A31D38"),
    pieceKing: pick("--dama-piece-king", KING_ACCENT),
    pieceQueen: pick("--dama-piece-queen", QUEEN_ACCENT),
    pieceHeir: pick("--dama-piece-heir", HEIR_ACCENT),
  };
}

function useCssBoardColors(): CssBoardColors {
  const [colors, setColors] = useState(readCssBoardColors);
  useEffect(() => {
    const sync = () => setColors(readCssBoardColors());
    sync();
    window.addEventListener("dama-board-palette", sync);
    return () => window.removeEventListener("dama-board-palette", sync);
  }, []);
  return colors;
}

/** Mix highlight toward white (2D `color-mix(... 55%, white)` / Flutter Color.lerp 0.45). */
function lightenBoardHighlight(hex: string, towardWhite: number): string {
  const raw = hex.trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(raw);
  const hexBody = m?.[1];
  if (!hexBody) return hex;
  const n = Number.parseInt(hexBody, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const t = Math.min(1, Math.max(0, towardWhite));
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  const to = (c: number) => mix(c).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function parseHexRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const body = m?.[1];
  if (!body) return null;
  const n = Number.parseInt(body, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(hex: string, other: string, amountOfOther: number): string {
  const a = parseHexRgb(hex);
  const b = parseHexRgb(other);
  if (!a || !b) return hex;
  const t = Math.min(1, Math.max(0, amountOfOther));
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t);
  const to = (c: number) => c.toString(16).padStart(2, "0");
  return `#${to(ch(a[0], b[0]))}${to(ch(a[1], b[1]))}${to(ch(a[2], b[2]))}`;
}

/**
 * 2D quietShade parity (DraughtsBoard2D CSS linear-gradient + color-mix stops).
 * Cached per palette hex so square meshes stay cheap.
 */
const quietSquareTexCache = new Map<string, CanvasTexture>();

function quietSquareTexture(kind: "dark" | "light", baseHex: string): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const base = baseHex.trim().toLowerCase();
  if (!parseHexRgb(base)) return null;
  const key = `${kind}:${base}`;
  const hit = quietSquareTexCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // 160deg-equivalent diagonal; stops match 2D color-mix amounts.
  const g = ctx.createLinearGradient(8, 0, 40, 64);
  if (kind === "dark") {
    g.addColorStop(0, mixHex(base, "#ffffff", 0.18));
    g.addColorStop(0.42, base);
    g.addColorStop(1, mixHex(base, "#000000", 0.12));
  } else {
    g.addColorStop(0, mixHex(base, "#ffffff", 0.28));
    g.addColorStop(0.48, base);
    g.addColorStop(1, mixHex(base, "#9a9a7a", 0.1));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  quietSquareTexCache.set(key, tex);
  return tex;
}

type BoardGrid = BoardCell[][];

type ActiveAnimation = {
  from: [number, number];
  to: [number, number];
  captures: [number, number][];
  player: 1 | 2;
  isKing: boolean;
  /** Man became king this ply (Chess.com promote SFX). */
  isPromotion: boolean;
  progress: number;
  isCapture: boolean;
  duration: number;
  boardAfter?: BoardGrid;
  boardApplied?: boolean;
  /** One land SFX per animation (land phase + finish must not double). */
  soundPlayed?: boolean;
  /** Defer React commits out of R3F useFrame (avoids mid-frame setState stalls). */
  landQueued?: boolean;
  finishQueued?: boolean;
  /** performance.now() when finish was queued - stall recovery gate. */
  finishQueuedAt?: number;
};

type AnimationMask = Pick<ActiveAnimation, "from" | "to" | "captures">;

function isDarkSquare(row: number, col: number) {
  return (row + col) % 2 === 1;
}

function boardToWorld(row: number, col: number, size: number) {
  return {
    x: col - size / 2 + 0.5,
    z: row - size / 2 + 0.5,
  };
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function easeInOutQuad(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function moveDurationSeconds(
  from: [number, number],
  to: [number, number],
  isCapture: boolean,
): number {
  const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const base = isCapture ? CAPTURE_DURATION_MIN : MOVE_DURATION_MIN;
  return Math.min(MOVE_DURATION_MAX, base + dist * DURATION_PER_SQUARE);
}

function computePieceTransform(
  progress: number,
  from: { x: number; z: number },
  to: { x: number; z: number },
  isCapture: boolean,
) {
  const carryHeight = isCapture ? CAPTURE_PICK_HEIGHT : PICK_HEIGHT;
  if (progress < PICK_PHASE_END) {
    const t = easeInOutQuad(progress / PICK_PHASE_END);
    return {
      x: from.x,
      z: from.z,
      y: PIECE_REST_Y + t * (carryHeight - PIECE_REST_Y),
      // Height lift only. XY scale pulse flickered the mesh on pick and put.
      scale: 1,
    };
  }
  if (progress < HOLD_PHASE_END) {
    return { x: from.x, z: from.z, y: carryHeight, scale: 1 };
  }
  if (progress < LAND_PHASE_START) {
    const t = easeInOutCubic((progress - HOLD_PHASE_END) / (LAND_PHASE_START - HOLD_PHASE_END));
    return {
      x: from.x + (to.x - from.x) * t,
      z: from.z + (to.z - from.z) * t,
      y: carryHeight,
      scale: 1,
    };
  }
  const t = easeInOutQuad((progress - LAND_PHASE_START) / (1 - LAND_PHASE_START));
  return {
    x: to.x,
    z: to.z,
    y: carryHeight - t * (carryHeight - PIECE_REST_Y),
    scale: 1,
  };
}

function interactiveProps(onActivate: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      onActivate();
    },
    onKeyDown: (event: {
      key: string;
      preventDefault: () => void;
      stopPropagation: () => void;
    }) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        onActivate();
      }
    },
  };
}

/** Content equality (Flutter `_boardsEqual` parity). Strict `k`/`p` identity used to
 *  fail keep-landed / remount-sync and rewind pieces mid put-down. */
function boardsEqual(left: BoardGrid | undefined, right: BoardGrid | undefined): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  for (let row = 0; row < left.length; row++) {
    const lr = left[row];
    const rr = right[row];
    if (!lr || !rr || lr.length !== rr.length) return false;
    for (let col = 0; col < lr.length; col++) {
      const a = lr[col];
      const b = rr[col];
      if (!a && !b) continue;
      if (!a || !b || Number(a.p) !== Number(b.p) || Boolean(a.k) !== Boolean(b.k)) {
        return false;
      }
    }
  }
  return true;
}

/** Fallback when API has not yet shipped move_history (or board_after). */
function animationFromBoardDiff(
  prev: BoardGrid,
  next: BoardGrid,
  legalHint?: LegalMove[],
): ActiveAnimation | null {
  if (!prev.length || !next.length || prev.length !== next.length) return null;
  const size = prev.length;
  const emptied: [number, number][] = [];
  const filled: [number, number][] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const a = prev[r]?.[c] ?? null;
      const b = next[r]?.[c] ?? null;
      if (a && !b) emptied.push([r, c]);
      if (!a && b) filled.push([r, c]);
      if (a && b && (Number(a.p) !== Number(b.p) || Boolean(a.k) !== Boolean(b.k))) {
        emptied.push([r, c]);
        filled.push([r, c]);
      }
    }
  }
  if (filled.length !== 1) return null;
  const to = filled[0];
  if (!to) return null;
  const dest = next[to[0]]?.[to[1]];
  if (!dest) return null;

  let from: [number, number] | null = null;
  const captures: [number, number][] = [];
  for (const sq of emptied) {
    const was = prev[sq[0]]?.[sq[1]];
    if (!was) continue;
    if (was.p === dest.p) from = sq;
    else captures.push(sq);
  }
  if (!from && legalHint?.length) {
    const match = legalHint.find((m) => m.to[0] === to[0] && m.to[1] === to[1] && m.from);
    if (match) {
      from = match.from;
      if (match.captures?.length) captures.push(...match.captures);
    }
  }
  if (!from) return null;
  const isCapture = captures.length > 0;
  const wasKing = Boolean(prev[from[0]]?.[from[1]]?.k);
  const isPromotion = Boolean(dest.k) && !wasKing;
  return {
    from,
    to,
    captures,
    player: (dest.p === 2 ? 2 : 1) as 1 | 2,
    isKing: Boolean(dest.k),
    isPromotion,
    progress: 0,
    isCapture,
    duration: moveDurationSeconds(from, to, isCapture),
    boardAfter: next,
  };
}

/** Half-revolution cylinder (left or right) for Neo hard shade. */
function ShadeCyl({
  args,
  mat,
}: {
  args: [number, number, number, number, number, boolean, number, number];
  mat: {
    color: string;
    emissive: string;
    emissiveIntensity: number;
    metalness: number;
    roughness: number;
  };
}) {
  return (
    <mesh castShadow receiveShadow>
      <cylinderGeometry args={args} />
      <meshStandardMaterial {...mat} />
    </mesh>
  );
}

function PieceMesh({
  player,
  isKing,
  selected,
  movable,
  y = PIECE_REST_Y,
  scale = 1,
}: {
  player: 1 | 2;
  isKing: boolean;
  selected?: boolean;
  /** Quiet-turn cue: this piece has at least one legal move. */
  movable?: boolean;
  y?: number;
  scale?: number;
}) {
  const colors = useCssBoardColors();
  const role = palacePieceRole(player, isKing);
  const crowned = role === "king";
  const ringColor = player === 1 ? PIECE_P1_EMISSIVE : PIECE_P2_EMISSIVE;
  // White & half: dark seat uses light|dark hemispheres (same 50/50 as 2D).
  const splitDark = player === 2 && colors.pieceDarkSplit;
  const bodyColor = player === 1 ? colors.pieceLight : colors.pieceDark;
  const shadeColor = splitDark
    ? colors.pieceLight
    : player === 1
      ? mixHexRough(colors.pieceLight, "#8A8A8A", 0.55)
      : mixHexRough(colors.pieceDark, "#0A0A0A", 0.4);
  const leftColor = splitDark ? colors.pieceLight : bodyColor;
  const rightColor = splitDark ? colors.pieceDark : shadeColor;
  const selectAccent = colors.pieceKing;
  const emissive = selected ? selectAccent : movable ? colors.highlight : ringColor;
  const emissiveIntensity = selected ? 0.4 : movable ? 0.4 : 0.05;
  const matL = {
    color: leftColor,
    emissive,
    emissiveIntensity,
    metalness: 0.1,
    roughness: 0.46,
  } as const;
  const matR = {
    color: rightColor,
    emissive,
    emissiveIntensity: emissiveIntensity * 0.65,
    metalness: 0.1,
    roughness: 0.52,
  } as const;
  // High-quality radial tessellation (product bar - not low-poly phone stubs).
  const segs = 72;
  // Neo physical Staunton: flared base → stem → collar → head (+ cross for king).
  const baseH = 0.09;
  const stemH = crowned ? 0.32 : 0.22;
  const stemTopR = crowned ? 0.1 : 0.115;
  const stemBotR = 0.2;
  const stemY = baseH / 2 + stemH / 2;
  const collarY = baseH / 2 + stemH + 0.035;
  const headR = crowned ? 0.135 : 0.125;
  const headY = collarY + 0.085 + headR * 0.5;
  return (
    <group position={[0, y, 0]} scale={scale} castShadow>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} receiveShadow>
        <circleGeometry args={[0.3, 64]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.32} depthWrite={false} />
      </mesh>

      {/* Flared pedestal */}
      <group position={[0, baseH / 2, 0]}>
        <ShadeCyl args={[0.25, 0.32, baseH, segs, 1, false, 0, Math.PI]} mat={matL} />
        <ShadeCyl args={[0.25, 0.32, baseH, segs, 1, false, Math.PI, Math.PI]} mat={matR} />
      </group>

      {/* Tapered stem */}
      <group position={[0, stemY, 0]}>
        <ShadeCyl args={[stemTopR, stemBotR, stemH, segs, 1, false, 0, Math.PI]} mat={matL} />
        <ShadeCyl args={[stemTopR, stemBotR, stemH, segs, 1, false, Math.PI, Math.PI]} mat={matR} />
      </group>

      {/* Collar disc (horizontal ring under the head) */}
      <group position={[0, collarY, 0]}>
        <ShadeCyl args={[0.17, 0.17, 0.055, segs, 1, false, 0, Math.PI]} mat={matL} />
        <ShadeCyl args={[0.17, 0.17, 0.055, segs, 1, false, Math.PI, Math.PI]} mat={matR} />
      </group>

      {/* Head */}
      <group position={[0, headY, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[headR, 64, 48, 0, Math.PI]} />
          <meshStandardMaterial {...matL} />
        </mesh>
        <mesh castShadow>
          <sphereGeometry args={[headR, 64, 48, Math.PI, Math.PI]} />
          <meshStandardMaterial {...matR} />
        </mesh>
      </group>

      {crowned ? (
        <>
          {/* Crown bowl under the cross */}
          <group position={[0, headY + headR * 0.62, 0]}>
            <ShadeCyl args={[0.1, 0.155, 0.075, segs, 1, false, 0, Math.PI]} mat={matL} />
            <ShadeCyl args={[0.1, 0.155, 0.075, segs, 1, false, Math.PI, Math.PI]} mat={matR} />
          </group>
          {/* Neo king cross */}
          <group position={[0, headY + headR + 0.13, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.034, 0.15, 0.034]} />
              <meshStandardMaterial {...matL} />
            </mesh>
            <mesh position={[0, 0.025, 0]} castShadow>
              <boxGeometry args={[0.11, 0.034, 0.034]} />
              <meshStandardMaterial {...matL} />
            </mesh>
            <mesh position={[0.045, 0.025, 0]} castShadow>
              <boxGeometry args={[0.03, 0.034, 0.034]} />
              <meshStandardMaterial {...matR} />
            </mesh>
          </group>
        </>
      ) : null}
    </group>
  );
}

function mixHexRough(hex: string, toward: string, t: number): string {
  const parse = (h: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
    if (!m?.[1]) return null;
    const n = Number.parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  const a = parse(hex);
  const b = parse(toward);
  if (!a || !b) return hex;
  const k = Math.min(1, Math.max(0, t));
  const mix = (x: number, y: number) => Math.round(x + (y - x) * k);
  const to = (n: number) => n.toString(16).padStart(2, "0");
  return `#${to(mix(a.r, b.r))}${to(mix(a.g, b.g))}${to(mix(a.b, b.b))}`;
}

function SquareMesh({
  row,
  col,
  size,
  flipBoard,
  highlightKind,
  onSelect,
}: {
  row: number;
  col: number;
  size: number;
  flipBoard: boolean;
  /** select = brand cue; lastMove = Chess yellow; none = square palette. */
  highlightKind: "none" | "select" | "lastMove";
  onSelect: () => void;
}) {
  const colors = useCssBoardColors();
  const { x, z } = boardToWorld(row, col, size);
  const dark = isDarkSquare(row, col);
  const playable = dark;
  const fill =
    highlightKind === "select"
      ? colors.highlight
      : highlightKind === "lastMove"
        ? colors.lastMove
        : dark
          ? colors.dark
          : colors.light;
  const isCue = highlightKind !== "none";
  // Quiet only: 2D quietShade gradient. Cue squares stay flat CSS hex (2D highlight/last-move).
  const quietMap = !isCue ? quietSquareTexture(dark ? "dark" : "light", fill) : null;
  const quietEmissive = dark ? colors.frame : colors.light;
  const showRank = isVisualLeftFile(col, size, flipBoard);
  const showFile = isVisualBottomRank(row, size, flipBoard);
  // After group Y=π flip, local NW becomes SE on screen - invert corner offsets.
  const corner = flipBoard ? 0.38 : -0.38;
  const fileCorner = flipBoard ? -0.38 : 0.38;
  const ink = boardCoordUsesLightInk(dark) ? colors.light : colors.dark;
  const fontSize = size >= 10 ? 0.2 : 0.24;
  const textRotY = flipBoard ? Math.PI : 0;
  const commonMesh = {
    position: [x, playable ? 0.004 : 0.002, z] as [number, number, number],
    rotation: [-Math.PI / 2, 0, 0] as [number, number, number],
    receiveShadow: true as const,
    ...(playable ? interactiveProps(onSelect) : {}),
  };
  return (
    <group>
      {/*
        Original 3D lit+shadow path (meshStandard + receiveShadow + emissive/roughness).
        toneMapped=false keeps 2D gradient / cue hex; split meshes avoid stale quiet maps on cues.
      */}
      {isCue ? (
        <mesh key={`cue-${highlightKind}`} {...commonMesh}>
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial
            color={fill}
            emissive={fill}
            emissiveIntensity={0.08}
            roughness={0.92}
            metalness={0}
            toneMapped={false}
          />
        </mesh>
      ) : (
        <mesh key="quiet" {...commonMesh}>
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial
            color={quietMap ? "#ffffff" : fill}
            map={quietMap ?? undefined}
            emissive={quietEmissive}
            emissiveIntensity={dark ? 0.04 : 0.02}
            roughness={0.78}
            metalness={0}
            toneMapped={false}
          />
        </mesh>
      )}
      {showRank ? (
        <Text
          position={[x + corner, 0.02, z + corner]}
          rotation={[-Math.PI / 2, textRotY, 0]}
          fontSize={fontSize}
          color={ink}
          anchorX={flipBoard ? "right" : "left"}
          anchorY={flipBoard ? "bottom" : "top"}
          renderOrder={2}
        >
          {String(boardRankNumber(row, size))}
        </Text>
      ) : null}
      {showFile ? (
        <Text
          position={[x + fileCorner, 0.02, z + fileCorner]}
          rotation={[-Math.PI / 2, textRotY, 0]}
          fontSize={fontSize}
          color={ink}
          anchorX={flipBoard ? "left" : "right"}
          anchorY={flipBoard ? "top" : "bottom"}
          renderOrder={2}
        >
          {boardFileLetter(col)}
        </Text>
      ) : null}
    </group>
  );
}

function StaticPiece({
  row,
  col,
  size,
  player,
  isKing,
  selected,
  hidden,
  onSelect,
}: {
  row: number;
  col: number;
  size: number;
  player: 1 | 2;
  isKing: boolean;
  selected: boolean;
  hidden: boolean;
  onSelect: () => void;
}) {
  if (hidden) return null;
  const { x, z } = boardToWorld(row, col, size);
  // Match 2D: square fill is the only movable cue - no under-piece ring / glow.
  // Do not lift selected resting pieces: clearing selection on put dropped the
  // mesh before the fly overlay picked up, which flickered on every pick→put.
  return (
    <group position={[x, PIECE_REST_Y, z]} {...interactiveProps(onSelect)}>
      <PieceMesh player={player} isKing={isKing} selected={selected} movable={false} y={0} />
    </group>
  );
}

function AnimatedOverlay({
  animation,
  size,
}: {
  animation: ActiveAnimation;
  size: number;
}) {
  const groupRef = useRef<Group>(null);
  // Seed world pose on mount - default group [0,0,0] flashed at board center for one
  // frame before useFrame (pick→put flicker). Match 2D useLayoutEffect applyFlyDom.
  const from0 = boardToWorld(animation.from[0], animation.from[1], size);
  const to0 = boardToWorld(animation.to[0], animation.to[1], size);
  const seed = computePieceTransform(animation.progress, from0, to0, animation.isCapture);
  useFrame(() => {
    const from = boardToWorld(animation.from[0], animation.from[1], size);
    const to = boardToWorld(animation.to[0], animation.to[1], size);
    const transform = computePieceTransform(animation.progress, from, to, animation.isCapture);
    if (groupRef.current) {
      groupRef.current.position.set(transform.x, transform.y, transform.z);
      groupRef.current.rotation.y = 0;
      groupRef.current.scale.setScalar(transform.scale);
    }
  });
  return (
    <group ref={groupRef} position={[seed.x, seed.y, seed.z]} scale={seed.scale}>
      <PieceMesh player={animation.player} isKing={animation.isKing} y={0} />
    </group>
  );
}

function CaptureBursts({
  animationRef,
  size,
}: {
  animationRef: React.RefObject<ActiveAnimation | null>;
  size: number;
}) {
  const groupRef = useRef<Group>(null);
  useFrame(() => {
    const animation = animationRef.current;
    if (!groupRef.current || !animation) return;
    const travelStart = HOLD_PHASE_END;
    const travelSpan = LAND_PHASE_START - HOLD_PHASE_END;
    const captureProgress =
      animation.progress <= travelStart
        ? 0
        : Math.min(1, (animation.progress - travelStart) / travelSpan);
    groupRef.current.children.forEach((child, index) => {
      const cap = animation.captures[index];
      if (!cap) return;
      const { x, z } = boardToWorld(cap[0], cap[1], size);
      const t = easeOutCubic(captureProgress);
      child.position.set(x, PIECE_REST_Y + t * 0.35, z);
      child.scale.setScalar(Math.max(0.01, 1 - t * 0.9));
    });
  });
  const animation = animationRef.current;
  if (!animation?.captures.length) return null;
  return (
    <group ref={groupRef}>
      {animation.captures.map(([r, c]) => (
        <mesh key={`${r}-${c}`}>
          <sphereGeometry args={[0.14, 20, 16]} />
          <meshStandardMaterial color={KING_ACCENT} emissive={HIGHLIGHT} emissiveIntensity={0.6} />
        </mesh>
      ))}
    </group>
  );
}

type Props = {
  board: BoardCell[][];
  legalMoves: LegalMove[];
  selected: [number, number] | null;
  onSelectSquare: (row: number, col: number) => void;
  interactive: boolean;
  /** When true, board faces player 2 (smart-menu flip). */
  flipBoard?: boolean;
  /** Forced multi-jump square from game.must_continue. */
  mustContinue?: [number, number] | null;
  /** Server move history (drives pick/hold/travel/land queue when present). */
  moveHistory?: MoveHistoryEntry[];
  /** Seat for duration + input-block rules (1/2). AI practice defaults to 1. */
  yourPlayer?: number | null;
  /** Scrubbing history: freeze animation and show static board. */
  replayMode?: boolean;
  /** Called when a ply animation lands on board_after. */
  onPlyAnimated?: (boardAfter: BoardGrid) => void;
  /**
   * Increment to trigger a short horizontal reject shake (illegal destination).
   * Captures must NOT shake/tilt the board.
   */
  illegalShakeKey?: number;
  /** Hub sizing: true after first WebGL paint (idle full-column shimmer gate). */
  onPaintReady?: (ready: boolean) => void;
};

function animationFromHistoryEntry(
  entry: MoveHistoryEntry,
  _yourPlayer: number | null | undefined,
  prevBoard?: BoardGrid | null,
): ActiveAnimation | null {
  if (!entry?.from || !entry?.to) return null;
  const from = entry.from;
  const to = entry.to;
  const captures = (entry.captures ?? []) as [number, number][];
  const dest = entry.board_after?.[to[0]]?.[to[1]];
  const player = (entry.player === 2 || dest?.p === 2 ? 2 : 1) as 1 | 2;
  const isCapture = captures.length > 0;
  const wasKing = Boolean(prevBoard?.[from[0]]?.[from[1]]?.k);
  const isPromotion = Boolean(dest?.k) && !wasKing;
  return {
    from,
    to,
    captures,
    player,
    isKing: Boolean(dest?.k),
    isPromotion,
    progress: 0,
    isCapture,
    duration: moveDurationSeconds(from, to, isCapture),
    boardAfter: entry.board_after,
  };
}

function BoardScene({
  board,
  legalMoves,
  selected,
  onSelectSquare,
  interactive,
  flipBoard,
  mustContinue,
  moveHistory = [],
  yourPlayer = null,
  replayMode = false,
  onPlyAnimated,
  onPlyInflightChange,
}: Props & { onPlyInflightChange?: (active: boolean) => void }) {
  const size = board.length > 0 ? board.length : 0;
  const [renderBoard, setRenderBoard] = useState<BoardGrid>(board);
  const animationRef = useRef<ActiveAnimation | null>(null);
  const queueRef = useRef<ActiveAnimation[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animMask, setAnimMask] = useState<AnimationMask | null>(null);
  /** Seed to current length so resume / 2D↔3D toggle does not replay all plies. */
  const prevHistoryLen = useRef(moveHistory.length);
  const holdSyncRef = useRef(false);
  /** performance.now() when holdSync rose - stall recover needs a short grace. */
  const holdSyncSinceRef = useRef<number | null>(null);
  const legalHintRef = useRef(legalMoves);
  const onPlyAnimatedRef = useRef(onPlyAnimated);
  const replayModeRef = useRef(replayMode);
  const moveHistoryRef = useRef(moveHistory);
  const forceRecoverStallRef = useRef<() => void>(() => {});
  /** Last useFrame tick while a fly was advancing (2D lastFrameAtRef parity). */
  const lastFrameAtRef = useRef<number | null>(null);
  const onPlyInflightChangeRef = useRef(onPlyInflightChange);
  onPlyInflightChangeRef.current = onPlyInflightChange;
  const historyPresent = moveHistory.length > 0;

  /** Sync DOM attribute immediately (R3F→host React state can lag a turn). */
  const markPlyInflight = useCallback((active: boolean) => {
    onPlyInflightChangeRef.current?.(active);
  }, []);

  useEffect(() => {
    legalHintRef.current = legalMoves;
  }, [legalMoves]);

  useEffect(() => {
    onPlyAnimatedRef.current = onPlyAnimated;
  }, [onPlyAnimated]);

  // One-way mirror: isAnimating may only RAISE the gate. Clearing is owned by
  // markPlyInflight(false) / unmount forceRecover - a false mirror wiped
  // holdSync-rise gates and let SmartBoardHost remount mid pick→put.
  useLayoutEffect(() => {
    if (isAnimating) onPlyInflightChange?.(true);
  }, [isAnimating, onPlyInflightChange]);

  useEffect(() => {
    replayModeRef.current = replayMode;
  }, [replayMode]);

  useEffect(() => {
    moveHistoryRef.current = moveHistory;
  }, [moveHistory]);

  const commitBoardAfter = useCallback((anim: ActiveAnimation) => {
    const after = anim.boardAfter;
    if (!after?.length) return;
    if (!anim.boardApplied) {
      anim.boardApplied = true;
      setRenderBoard((current) => (boardsEqual(current, after) ? current : after));
      onPlyAnimatedRef.current?.(after);
    }
    // Put-down only once per ply - Chess.com move / capture / promote samples.
    if (!anim.soundPlayed && !replayModeRef.current) {
      anim.soundPlayed = true;
      void playPieceLandSound(
        pieceLandKind({ isCapture: anim.isCapture, isPromotion: anim.isPromotion }),
      );
    }
  }, []);

  /**
   * Stall / hitch recovery: clear fly state BUT always sync parent to board_after
   * first. Clearing holdSync alone left game.board behind history → boardPlySynced
   * stuck false and the board looked frozen mid-game.
   */
  const forceRecoverStall = useCallback(() => {
    const anim = animationRef.current;
    if (anim?.boardAfter?.length) {
      // If land already applied locally, commitBoardAfter skips parent notify.
      // Stall clear must still sync parent (missed callback → freeze until 2.5s).
      // Parent boardsEqual no-ops when already synced (no pick→put churn).
      const alreadyApplied = anim.boardApplied;
      commitBoardAfter(anim);
      if (alreadyApplied) {
        onPlyAnimatedRef.current?.(anim.boardAfter);
      }
    } else {
      const last = moveHistoryRef.current.at(-1);
      const snap = last?.board_after;
      if (snap?.length) {
        // Skip identity churn when already landed (avoids StaticPiece remount flicker).
        setRenderBoard((current) => (boardsEqual(current, snap) ? current : snap));
        onPlyAnimatedRef.current?.(snap);
      }
    }
    animationRef.current = null;
    holdSyncRef.current = false;
    holdSyncSinceRef.current = null;
    queueRef.current = [];
    setAnimMask(null);
    setIsAnimating(false);
    markPlyInflight(false);
    lastFrameAtRef.current = null;
  }, [commitBoardAfter, markPlyInflight]);

  forceRecoverStallRef.current = forceRecoverStall;

  const startNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      // Never clear holdSync without a parent land sync (freeze root).
      const dangling = animationRef.current;
      // If LAND_PHASE already applied locally, commitBoardAfter skips parent notify.
      // Empty clear must still re-notify (missed callback → boardPlySynced freeze).
      // Parent boardsEqual no-ops when synced (no pick→put remount flicker).
      // History fallback only when boardAfter was missing on the fly.
      if (dangling?.boardAfter?.length) {
        const alreadyApplied = dangling.boardApplied;
        commitBoardAfter(dangling);
        if (alreadyApplied) {
          onPlyAnimatedRef.current?.(dangling.boardAfter);
        }
      } else {
        const last = moveHistoryRef.current.at(-1);
        const snap = last?.board_after;
        if (snap?.length) {
          setRenderBoard((current) => (boardsEqual(current, snap) ? current : snap));
          onPlyAnimatedRef.current?.(snap);
        }
      }
      animationRef.current = null;
      holdSyncRef.current = false;
      holdSyncSinceRef.current = null;
      setAnimMask(null);
      setIsAnimating(false);
      markPlyInflight(false);
      lastFrameAtRef.current = null;
      return;
    }
    animationRef.current = next;
    // Seed stall clock (Flutter _lastAnimAdvanceMs). If useFrame never ticks after
    // ply start, last stayed null and Dead-useFrame recover never armed → mid-air freeze.
    lastFrameAtRef.current = performance.now();
    // Mark host DOM same-turn (before setState crosses R3F→DOM boundary).
    markPlyInflight(true);
    setAnimMask({ from: next.from, to: next.to, captures: next.captures });
    setIsAnimating(true);
  }, [commitBoardAfter, markPlyInflight]);

  const finishAndAdvance = useCallback(() => {
    const finished = animationRef.current;
    if (finished) commitBoardAfter(finished);
    // Always route through startNext (empty path owns holdSync clear + parent sync).
    // Bare holdSync=false here skipped history fallback when boardAfter was missing.
    startNext();
  }, [commitBoardAfter, startNext]);

  useLayoutEffect(() => {
    if (!size) return;

    if (replayMode) {
      // Rising into replay mid pick→put: land-sync parent before clearing fly
      // (bare clear snapped put-down and left boardPlySynced false).
      if (animationRef.current || holdSyncRef.current || queueRef.current.length > 0) {
        forceRecoverStallRef.current();
      }
      setRenderBoard((current) => (boardsEqual(current, board) ? current : board));
      return;
    }

    const len = moveHistory.length;
    if (len === 0) {
      prevHistoryLen.current = 0;
      if (!animationRef.current && queueRef.current.length === 0) {
        holdSyncRef.current = false;
        holdSyncSinceRef.current = null;
        markPlyInflight(false);
        // Parent may pass a new board ref each render (clock/WS) - skip remount.
        setRenderBoard((current) => (boardsEqual(current, board) ? current : board));
      }
      return;
    }

    if (len < prevHistoryLen.current) {
      // History shrink (scrub / reset) mid-fly: same land-sync-before-clear as replay.
      if (animationRef.current || holdSyncRef.current || queueRef.current.length > 0) {
        forceRecoverStallRef.current();
      }
      prevHistoryLen.current = len;
      setRenderBoard((current) => (boardsEqual(current, board) ? current : board));
      return;
    }

    if (len > prevHistoryLen.current) {
      const start = prevHistoryLen.current;
      const newEntries = moveHistory.slice(start);
      prevHistoryLen.current = len;
      holdSyncRef.current = true;
      holdSyncSinceRef.current = performance.now();
      // Gate remounts from the holdSync rise - startNext may still be a frame away.
      markPlyInflight(true);
      for (let i = 0; i < newEntries.length; i++) {
        const entry = newEntries[i];
        if (!entry) continue;
        const prevBoard =
          i === 0
            ? start > 0
              ? moveHistory[start - 1]?.board_after
              : undefined
            : newEntries[i - 1]?.board_after;
        const anim = animationFromHistoryEntry(entry, yourPlayer, prevBoard);
        if (anim) queueRef.current.push(anim);
      }
      if (!animationRef.current) {
        // History grew but nothing to fly (bad/missing from-to): sync immediately
        // so boardPlySynced cannot stick false and freeze input.
        if (queueRef.current.length === 0) {
          const last = moveHistory.at(-1);
          const snap = last?.board_after;
          if (snap?.length) {
            setRenderBoard((current) => (boardsEqual(current, snap) ? current : snap));
            onPlyAnimatedRef.current?.(snap);
          }
          holdSyncRef.current = false;
          holdSyncSinceRef.current = null;
          setAnimMask(null);
          setIsAnimating(false);
          markPlyInflight(false);
        } else {
          startNext();
        }
      }
      return;
    }
  }, [board, size, moveHistory, replayMode, yourPlayer, startNext, markPlyInflight]);

  useLayoutEffect(() => {
    if (!size || replayMode) return;
    if (holdSyncRef.current || isAnimating || animationRef.current || queueRef.current.length > 0) {
      return;
    }
    if (historyPresent) {
      const last = moveHistory.at(-1);
      const completed = last?.board_after;
      // Remount mid pick→put (e.g. 2D↔3D): history already at tip so no ply queues.
      // Sync parent immediately - otherwise boardPlySynced freezes until 2.5s safety.
      if (completed?.length && !boardsEqual(board, completed)) {
        setRenderBoard((current) => (boardsEqual(current, completed) ? current : completed));
        onPlyAnimatedRef.current?.(completed);
        return;
      }
      setRenderBoard((current) => {
        if (boardsEqual(current, board)) return current;
        if (completed && boardsEqual(current, completed) && !boardsEqual(board, completed)) {
          return current;
        }
        return board;
      });
      return;
    }
    // No history yet: infer a single ply from board diffs (legacy API).
    // 2D parity: enqueue + startNext outside the updater so the first paint
    // already has animMask (startNext-inside-updater = resting+fly flicker).
    let shouldStart = false;
    setRenderBoard((current) => {
      if (boardsEqual(current, board)) return current;
      const anim = animationFromBoardDiff(current, board, legalHintRef.current);
      if (!anim) return board;
      holdSyncRef.current = true;
      holdSyncSinceRef.current = performance.now();
      // Same-turn host gate before startNext (board-diff path).
      markPlyInflight(true);
      queueRef.current.push(anim);
      if (!animationRef.current) shouldStart = true;
      return current;
    });
    if (shouldStart) startNext();
  }, [
    board,
    size,
    moveHistory,
    historyPresent,
    isAnimating,
    replayMode,
    startNext,
    markPlyInflight,
  ]);

  useFrame((_, delta) => {
    const animation = animationRef.current;
    if (!animation) {
      lastFrameAtRef.current = null;
      return;
    }
    // Tab/ad blur: freeze progress so return does not fast-forward/glitch the ply.
    // Keep stall clock alive - otherwise last ages while hidden and tab-return
    // false-triggers forceRecover (mid pick→put snap/flicker).
    if (typeof document !== "undefined" && document.hidden) {
      lastFrameAtRef.current = performance.now();
      return;
    }
    lastFrameAtRef.current = performance.now();
    // Cap hitch deltas (2D parity) so pieces never teleport.
    const step = Math.min(0.05, delta);
    const prev = animation.progress;
    animation.progress = Math.min(1, animation.progress + step / animation.duration);
    // Never call React setState inside useFrame - schedule microtasks (Chess.com/Lichess style).
    if (
      prev < LAND_PHASE_START &&
      animation.progress >= LAND_PHASE_START &&
      !animation.landQueued
    ) {
      animation.landQueued = true;
      queueMicrotask(() => {
        // Same guard as finish path - drop if forceRecover/unmount already cleared this ply.
        if (animationRef.current !== animation) return;
        commitBoardAfter(animation);
      });
    }
    if (animation.progress >= 1) {
      if (!animation.finishQueued) {
        animation.finishQueued = true;
        animation.finishQueuedAt = performance.now();
        // Finish in rAF-adjacent microtask (avoid setState inside useFrame), but
        // do not race a short force-clear that drops the ply before startNext.
        queueMicrotask(() => {
          if (animationRef.current !== animation) return;
          try {
            finishAndAdvance();
          } catch {
            // Never leave finishQueued stuck with a frozen piece mid-board.
            forceRecoverStallRef.current();
          }
        });
      } else if (
        animationRef.current === animation &&
        performance.now() - (animation.finishQueuedAt ?? 0) > 500
      ) {
        // finishQueued but still active after grace - force recover (mid-game stall).
        forceRecoverStallRef.current();
      }
    }
  });

  // Mid-game stall recovery: holdSync with no active fly must clear AND sync parent.
  // Do NOT treat stale isAnimating alone as a stall - startNext clears holdSync
  // sync before React applies setIsAnimating(false); forceRecover there remounted
  // pieces via a fresh renderBoard ref (pick→put flicker).
  useEffect(() => {
    const id = window.setInterval(() => {
      // Dead useFrame while a fly is active (WebGL stall / R3F loop drop).
      // 2D restarts RAF; 3D cannot restart Canvas useFrame - land-sync instead
      // so boardPlySynced cannot stick false mid pick→put.
      if (
        holdSyncRef.current &&
        animationRef.current &&
        typeof document !== "undefined" &&
        !document.hidden
      ) {
        const last = lastFrameAtRef.current;
        if (last != null && performance.now() - last > 2000) {
          forceRecoverStallRef.current();
          return;
        }
      }
      if (animationRef.current || queueRef.current.length > 0) return;
      // holdSync rise + startNext are same-turn; require a short grace so the
      // 250ms tick cannot forceRecover before animationRef is bound (snap flicker).
      if (holdSyncRef.current) {
        const since = holdSyncSinceRef.current;
        if (since == null || performance.now() - since > 64) {
          forceRecoverStallRef.current();
        }
        return;
      }
      // Orphaned data-dama-ply-inflight (missed clear) freezes portal/flip/2D↔3D.
      if (!isAnimating) {
        markPlyInflight(false);
      } else {
        setAnimMask(null);
        setIsAnimating(false);
        markPlyInflight(false);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [isAnimating, markPlyInflight]);

  // Tab return after long hide: finishQueued grace never ran while useFrame was starved.
  // Mid-flight: re-arm stall clock (do not snap just because last aged while hidden);
  // Dead-useFrame interval recovers if the loop stays dead after return.
  useEffect(() => {
    const onVis = () => {
      if (typeof document === "undefined" || document.hidden) return;
      const anim = animationRef.current;
      if (!anim) return;
      if (anim.finishQueued && anim.progress >= 1) {
        if (performance.now() - (anim.finishQueuedAt ?? 0) > 500) {
          forceRecoverStallRef.current();
        }
        return;
      }
      if (holdSyncRef.current) {
        lastFrameAtRef.current = performance.now();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Portal/2D↔3D/shell remount mid pick→put: land-sync + gate clear in layout
  // (before paint). useEffect ran after layout gates saw idle → remount flicker.
  useLayoutEffect(() => {
    return () => {
      forceRecoverStallRef.current();
    };
  }, []);

  // Suppress select/legal/must while the ply fly is up. Parent flips boardPlySynced
  // at LAND_PHASE (~0.72) so cues would otherwise flash mid put-down.
  const moveCuesActive = !animMask;
  const cueSelected = moveCuesActive ? selected : null;
  const cueLegalMoves = moveCuesActive ? legalMoves : ([] as LegalMove[]);
  const cueMustContinue = moveCuesActive ? mustContinue : null;
  const forcedSquare = cueMustContinue ? `${cueMustContinue[0]}:${cueMustContinue[1]}` : null;
  /** All pieces that can move this turn (quiet + capture) - fastest play cue. */
  const legalFromSquares = useMemo(() => {
    const set = new Set<string>();
    for (const m of cueLegalMoves) set.add(`${m.from[0]}:${m.from[1]}`);
    return set;
  }, [cueLegalMoves]);
  const destinationHighlights = useMemo(() => {
    const set = new Set<string>();
    if (!cueSelected) return set;
    for (const m of cueLegalMoves) {
      if (m.from[0] === cueSelected[0] && m.from[1] === cueSelected[1]) {
        set.add(`${m.to[0]}:${m.to[1]}`);
      }
    }
    return set;
  }, [cueLegalMoves, cueSelected]);

  /** Last completed ply from/to (Chess.com-style), when not animating/scrubbing. */
  const lastMoveSquares = useMemo(() => {
    const set = new Set<string>();
    if (replayMode || animMask || moveHistory.length === 0) return set;
    const last = moveHistory.at(-1);
    if (!last?.from || !last?.to) return set;
    set.add(`${last.from[0]}:${last.from[1]}`);
    set.add(`${last.to[0]}:${last.to[1]}`);
    return set;
  }, [animMask, moveHistory, replayMode]);

  const hiddenKeys = useMemo(() => {
    const set = new Set<string>();
    if (!animMask) return set;
    set.add(`${animMask.from[0]}:${animMask.from[1]}`);
    set.add(`${animMask.to[0]}:${animMask.to[1]}`);
    for (const [r, c] of animMask.captures) set.add(`${r}:${c}`);
    return set;
  }, [animMask]);

  // Gate own input only while the piece is still in the air - once put-down
  // starts (board committed), multi-jump / next turn can proceed immediately.
  const blockInputForAnimation =
    isAnimating &&
    animationRef.current != null &&
    yourPlayer != null &&
    animationRef.current.player === yourPlayer &&
    animationRef.current.progress < LAND_PHASE_START;

  const onSquare = useCallback(
    (row: number, col: number) => {
      if (!interactive || blockInputForAnimation) return;
      onSelectSquare(row, col);
    },
    [interactive, blockInputForAnimation, onSelectSquare],
  );

  if (size <= 0) return null;

  const display = renderBoard.length ? renderBoard : board;

  const colors = useCssBoardColors();

  // Board group is rigid - never translate/rotate for captures (that looked like a push-down).
  return (
    <group rotation={flipBoard ? [0, Math.PI, 0] : [0, 0, 0]}>
      <mesh position={[0, -0.21, 0]} receiveShadow>
        <boxGeometry args={[size + 0.4, 0.42, size + 0.4]} />
        <meshStandardMaterial color={colors.frame} roughness={0.82} metalness={0.04} />
      </mesh>
      {Array.from({ length: size * size }, (_, i) => {
        const row = Math.floor(i / size);
        const col = i % size;
        const key = `${row}:${col}`;
        const selectedKey = cueSelected != null ? `${cueSelected[0]}:${cueSelected[1]}` : null;
        const isSelectCue =
          selectedKey === key ||
          destinationHighlights.has(key) ||
          forcedSquare === key ||
          (!cueSelected && legalFromSquares.has(key));
        const highlightKind: "none" | "select" | "lastMove" = isSelectCue
          ? "select"
          : lastMoveSquares.has(key) && Boolean(colors.lastMove)
            ? "lastMove"
            : "none";
        return (
          <SquareMesh
            key={`sq-${row}-${col}`}
            row={row}
            col={col}
            size={size}
            flipBoard={Boolean(flipBoard)}
            highlightKind={highlightKind}
            onSelect={() => onSquare(row, col)}
          />
        );
      })}
      {display.flatMap((rowCells, row) =>
        rowCells.flatMap((cell, col) => {
          if (!cell) return [];
          const player = (cell.p === 2 ? 2 : 1) as 1 | 2;
          const key = `${row}:${col}`;
          return [
            <StaticPiece
              key={`pc-${key}`}
              row={row}
              col={col}
              size={size}
              player={player}
              isKing={Boolean(cell.k)}
              selected={!!cueSelected && cueSelected[0] === row && cueSelected[1] === col}
              hidden={hiddenKeys.has(key)}
              onSelect={() => onSquare(row, col)}
            />,
          ];
        }),
      )}
      {Array.from(destinationHighlights).map((key) => {
        const [rs, cs] = key.split(":");
        const row = Number(rs);
        const col = Number(cs);
        if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
        const { x, z } = boardToWorld(row, col, size);
        // Match 2D disc color; restore original lit indicator material + soft emissive.
        const disc = lightenBoardHighlight(colors.highlight, 0.45);
        return (
          <mesh
            key={`to-${key}`}
            position={[x, 0.06, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            {...interactiveProps(() => onSquare(row, col))}
          >
            <circleGeometry args={[0.22, 48]} />
            <meshStandardMaterial
              color={disc}
              emissive={disc}
              emissiveIntensity={0.18}
              transparent
              opacity={0.95}
              roughness={0.9}
              metalness={0}
              toneMapped={false}
            />
          </mesh>
        );
      })}
      {isAnimating && animationRef.current && animMask ? (
        <>
          {/* Remount per ply - reusing the overlay across queued plies left the
              R3F group at the previous destination for a frame (pick→put flash). */}
          <AnimatedOverlay
            key={`fly-${animMask.from[0]}-${animMask.from[1]}-${animMask.to[0]}-${animMask.to[1]}`}
            animation={animationRef.current}
            size={size}
          />
          <CaptureBursts
            key={`burst-${animMask.from[0]}-${animMask.from[1]}-${animMask.to[0]}-${animMask.to[1]}`}
            animationRef={animationRef}
            size={size}
          />
        </>
      ) : null}
    </group>
  );
}

export default function DraughtsScene3D(props: Props) {
  const size = props.board.length > 0 ? props.board.length : 0;
  const performanceTier = useDraughtsPerformanceTier();
  const [rejectShake, setRejectShake] = useState(false);
  /** Size whose first WebGL frame has painted; mismatch keeps shimmer covering the canvas. */
  const [paintedSize, setPaintedSize] = useState<number | null>(null);
  /**
   * Flight lives in BoardScene (R3F). Attribute is DOM-only (never React-controlled):
   * R3F is a separate root, so JSX `data-dama-ply-inflight={state}` re-renders from
   * the host could wipe a same-turn setAttribute and open remount gates mid-fly.
   */
  const hostRef = useRef<HTMLDivElement | null>(null);
  const glReady = paintedSize === size && size > 0;
  const prevIllegalKey = useRef(0);
  const onPaintReadyRef = useRef(props.onPaintReady);
  onPaintReadyRef.current = props.onPaintReady;

  /** Same-turn DOM write - querySelector gates must not wait for R3F→React flush. */
  const setPlyInflightSync = useCallback((active: boolean) => {
    const el = hostRef.current;
    if (!el) return;
    if (active) el.setAttribute("data-dama-ply-inflight", "");
    else el.removeAttribute("data-dama-ply-inflight");
  }, []);

  useEffect(() => {
    const key = props.illegalShakeKey ?? 0;
    if (!key || key === prevIllegalKey.current) return;
    prevIllegalKey.current = key;
    setRejectShake(true);
    const id = window.setTimeout(() => setRejectShake(false), 420);
    return () => window.clearTimeout(id);
  }, [props.illegalShakeKey]);

  // Latch-friendly: notify current readiness only. Never force `false` on cleanup -
  // that remounted Canvas under SmartBoardHost portals and infinite-looped paint gates.
  useEffect(() => {
    onPaintReadyRef.current?.(glReady);
  }, [glReady]);

  if (size <= 0) {
    return <BoardAreaSkeleton />;
  }

  // No in-canvas BoardAreaSkeleton overlay: parents already own the one shimmer
  // (BoardColumnSkeleton / board-slot skeleton). A second card shell on refresh
  // read as "shimmer twice" vs 2D which paints the plane with no overlay.
  return (
    <div
      ref={hostRef}
      className={`relative aspect-square w-full bg-transparent${rejectShake ? " dama-board-reject" : ""}`}
      style={{ touchAction: "none" }}
      data-dama-board-plane=""
      onPointerDown={() => {
        // Unlock on pick (not only on put) so land SFX works after ads / first gesture.
        void unlockGameAudio();
      }}
      aria-busy={!glReady}
    >
      <Canvas
        key={size}
        // Pulled-back default framing (more margin around the board than the prior 12.8/9.2 @ fov 37).
        camera={{ position: [0, 15.1, 10.85], fov: 38 }}
        // High quality product default; low tier (reduced-motion only) still keeps AA.
        dpr={performanceTier === "low" ? [1, 2] : [1, 3]}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
          stencil: false,
          preserveDrawingBuffer: false,
        }}
        style={{ background: "transparent" }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.12;
          gl.outputColorSpace = SRGBColorSpace;
          gl.shadowMap.enabled = performanceTier !== "low";
          gl.shadowMap.type = PCFSoftShadowMap;
          // Force crisp buffer even when CSS size is large on hi-DPI phones.
          const cap = performanceTier === "low" ? 2 : 3;
          gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
          gl.setClearColor(0x000000, 0);
          const forSize = size;
          // Double rAF: first frame scheduled, second after paint.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => setPaintedSize(forSize));
          });
        }}
      >
        <ambientLight intensity={1.18} />
        <directionalLight
          position={[6, 14, 4]}
          intensity={1.55}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <directionalLight position={[-4, 12, -6]} intensity={0.7} />
        <directionalLight position={[0, 10, 8]} intensity={0.34} />
        <BoardScene {...props} onPlyInflightChange={setPlyInflightSync} />
        <OrbitControls
          makeDefault
          enablePan={false}
          enableRotate
          enableZoom
          enableDamping
          dampingFactor={0.08}
          minPolarAngle={0.12}
          maxPolarAngle={Math.PI / 2.05}
          minDistance={7}
          maxDistance={32}
          target={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
}
