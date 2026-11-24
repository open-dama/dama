"use client";

import DraughtsBoard2D from "@/components/game/DraughtsBoard2D";
import { PalacePieceMark } from "@/components/game/PalacePieceMark";
import { buildInitialBoard } from "@/lib/initial-board";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

function SeatRow({
  label,
  clock,
  tone,
  pieceSide = "light",
}: {
  label: string;
  clock?: string;
  tone: "muted" | "strong";
  pieceSide?: "light" | "dark";
}) {
  const mark = label.trim().slice(0, 1).toUpperCase();
  const clockText = (clock || "").trim();
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden"
          aria-hidden
        >
          <PalacePieceMark
            player={pieceSide === "light" ? 1 : 2}
            isKing={false}
            className="inset-0"
          />
          <span className="sr-only">{mark}</span>
        </span>
        <p
          className={cn(
            "truncate text-sm font-medium",
            tone === "strong" ? "text-[var(--dama-text)]" : "text-[var(--dama-muted-foreground)]",
          )}
        >
          {label}
        </p>
      </div>
      {clockText ? (
        <span
          className={cn(
            "shrink-0 rounded-md px-2.5 py-1 font-mono text-sm tabular-nums",
            tone === "strong"
              ? "bg-[var(--dama-surface)] text-[var(--dama-text)]"
              : "bg-[var(--dama-card)] text-[var(--dama-muted-foreground)]",
          )}
        >
          {clockText}
        </span>
      ) : null}
    </div>
  );
}

type HomePreviewBoardProps = {
  opponentLabel?: string;
  playerLabel?: string;
  clockLabel?: string;
  className?: string;
  /** FMJD size (default 10). */
  boardSize?: number;
  /** Setup rows per side (default 4). */
  setupRows?: number;
};

/**
 * Idle / marketing 2D board - same surface as live DraughtsBoard2D
 * (quietShade gradients, underplane, Neo pieces, 78% scale). Non-interactive.
 */
export function HomePreviewBoard({
  opponentLabel,
  playerLabel,
  clockLabel,
  className,
  boardSize = 10,
  setupRows = 4,
}: HomePreviewBoardProps) {
  const top = (opponentLabel || "").trim();
  const bottom = (playerLabel || "").trim();
  const clock = (clockLabel || "").trim();
  const board = useMemo(() => buildInitialBoard(boardSize, setupRows), [boardSize, setupRows]);

  const plane =
    board.length > 0 ? (
      // Identical host + props shape to LivePlayHub idle/spectate 2D (no className overrides).
      <div
        className="relative h-full w-full overflow-hidden"
        role="img"
        aria-label={bottom || top || "board"}
      >
        <DraughtsBoard2D
          board={board}
          legalMoves={[]}
          selected={null}
          onSelectSquare={() => {}}
          interactive={false}
          mustContinue={null}
          flipBoard={false}
          moveHistory={[]}
          yourPlayer={1}
          replayMode
        />
      </div>
    ) : null;

  if (!top && !bottom) {
    return <div className={cn("h-full min-h-0 w-full", className)}>{plane}</div>;
  }

  return (
    <div className={cn("mx-auto flex h-full min-h-0 w-full max-w-full flex-col", className)}>
      {top ? (
        <div className="mb-2.5 shrink-0">
          <SeatRow label={top} clock={clock || undefined} tone="muted" pieceSide="dark" />
        </div>
      ) : null}
      <div className="min-h-0 flex-1">{plane}</div>
      {bottom ? (
        <div className="mt-2.5 shrink-0">
          <SeatRow label={bottom} clock={clock || undefined} tone="strong" pieceSide="light" />
        </div>
      ) : null}
    </div>
  );
}
