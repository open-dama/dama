"use client";

import { PlayRailAside } from "@/components/play-rail/PlayRailAside";
import { PlayRailScrollPort } from "@/components/play-rail/PlayRailScrollPort";
import { PlayBoardColumn } from "@/components/play/PlayBoardColumn";
import { BoardStackLayoutContext } from "@/components/play/board-stack-layout";
import { mobilePlayBoardShimmerHeightClass, playRailStickyMainClass } from "@/lib/player-shell-ui";
import { cn } from "@/lib/utils";
import type { CSSProperties, ReactNode } from "react";

function ShimmerBlock({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={cn("dama-shimmer", className)} style={style} aria-hidden />;
}

/**
 * Live dama board is 10×10 - shimmer plane matches that grid.
 * Card shell + `.dama-shimmer` track only - never `--dama-board-dark` / board palette.
 */
const BOARD_SKELETON_SIZE = 10;

const BOARD_SKELETON_CELLS: { row: number; col: number }[] = (() => {
  const cells: { row: number; col: number }[] = [];
  for (let row = 0; row < BOARD_SKELETON_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SKELETON_SIZE; col += 1) {
      cells.push({ row, col });
    }
  }
  return cells;
})();

export function BoardAreaSkeleton() {
  return (
    <div
      className="h-full w-full min-h-0 overflow-hidden rounded-sm border border-[var(--dama-border)] bg-[var(--dama-card)] p-1"
      aria-hidden
    >
      <div
        className="grid h-full w-full gap-0.5"
        style={{ gridTemplateColumns: `repeat(${BOARD_SKELETON_SIZE}, 1fr)` }}
      >
        {BOARD_SKELETON_CELLS.map((cell) => (
          <ShimmerBlock
            key={`${cell.row}-${cell.col}`}
            className={cn(
              "h-full w-full min-h-0 rounded-[1px]",
              (cell.row + cell.col) % 2 === 1 ? "opacity-90" : "opacity-55",
            )}
            style={{ borderRadius: 1 }}
          />
        ))}
      </div>
    </div>
  );
}

/** Chess.com seat bar: square avatar · name · rating · flag | optional trailing · timer. */
export function BoardSeatBarSkeleton({
  showTrailing = false,
  clockActive = false,
}: {
  showTrailing?: boolean;
  clockActive?: boolean;
}) {
  return (
    <div className="flex w-full min-w-0 items-center gap-2" aria-hidden>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <ShimmerBlock className="h-8 w-8 shrink-0 rounded-sm sm:h-9 sm:w-9" />
        <ShimmerBlock className="h-3.5 w-[4.5rem] max-w-[40%] sm:w-24" />
        <ShimmerBlock className="h-3 w-10 shrink-0" />
        <ShimmerBlock className="h-3 w-4 shrink-0 rounded-[1px]" />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {showTrailing ? <ShimmerBlock className="h-8 w-[4.5rem] rounded-md sm:w-28" /> : null}
        <ShimmerBlock
          className={cn(
            "h-8 min-w-[4.75rem] rounded-sm sm:h-9 sm:min-w-[5.25rem]",
            clockActive ? "opacity-95" : "opacity-70",
          )}
        />
      </div>
    </div>
  );
}

/**
 * @deprecated Always the checker plane - never a solid block (caused old→new skeleton flash).
 * Kept as alias so dynamic() imports stay stable.
 */
export function BoardPlaneLoading() {
  return <BoardAreaSkeleton />;
}

/**
 * Chess.com board column shimmer: top seat + square board + bottom seat.
 * Hosts that show this MUST use mobilePlayBoardShimmerHeightClass (not 52svh).
 * This wrapper is h-full only - absolute viewport height on the child was clipped
 * by overflow:hidden parents into a board-only stamp.
 */
export function BoardColumnSkeleton({
  showTopTrailing = true,
  bottomClockActive = true,
}: {
  showTopTrailing?: boolean;
  bottomClockActive?: boolean;
}) {
  return (
    <BoardStackLayoutContext.Provider value="budget">
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
        <PlayBoardColumn
          header={<BoardSeatBarSkeleton showTrailing={showTopTrailing} clockActive={false} />}
          footer={<BoardSeatBarSkeleton clockActive={bottomClockActive} />}
          board={<BoardAreaSkeleton />}
        />
      </div>
    </BoardStackLayoutContext.Provider>
  );
}

function PlayHubRailSkeleton() {
  return (
    <PlayRailAside>
      <div className={cn(playRailStickyMainClass, "grid grid-cols-3")} data-dama-rail-main="">
        <ShimmerBlock className="m-1 h-12 rounded-md" />
        <ShimmerBlock className="m-1 h-12 rounded-md" />
        <ShimmerBlock className="m-1 h-12 rounded-md" />
      </div>
      <PlayRailScrollPort>
        <div className="space-y-3 p-4">
          <ShimmerBlock className="h-3 w-24" />
          <ShimmerBlock className="h-10 w-full rounded-md" />
          <ShimmerBlock className="h-11 w-full rounded-md" />
          <ShimmerBlock className="h-9 w-full rounded-md" />
          <div className="flex gap-2 pt-2">
            <ShimmerBlock className="h-8 w-8 rounded-md" />
            <ShimmerBlock className="h-8 w-8 rounded-full" />
          </div>
        </div>
      </PlayRailScrollPort>
    </PlayRailAside>
  );
}

/** Home / live / spectate hub: full column (seats + board) + scrollable rail. */
export function PlayHubSkeleton() {
  return (
    <div
      className="grid h-full min-h-0 max-h-full w-full flex-1 items-stretch gap-3 max-lg:flex max-lg:h-full max-lg:min-h-0 max-lg:flex-col max-lg:overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)] lg:gap-4"
      aria-hidden
    >
      <div
        className={cn(
          "order-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden max-lg:w-full max-lg:justify-start lg:h-full lg:justify-center lg:order-none",
          mobilePlayBoardShimmerHeightClass,
          "lg:!h-full lg:!max-h-none lg:min-h-0",
        )}
      >
        <BoardColumnSkeleton showTopTrailing bottomClockActive />
      </div>
      <PlayHubRailSkeleton />
    </div>
  );
}

/**
 * `/?view=tournaments` loading: tournament list column (filters + cards) + rail -
 * never the play board shimmer.
 */
export function TournamentsPlayHubSkeleton({
  center,
}: {
  center: ReactNode;
}) {
  return (
    <div
      className="grid h-full min-h-0 max-h-full w-full flex-1 items-stretch gap-3 max-lg:flex max-lg:h-full max-lg:min-h-0 max-lg:flex-col max-lg:overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)] lg:gap-4"
      aria-hidden
    >
      <div className="order-1 flex min-h-0 min-w-0 flex-col overflow-hidden justify-start pt-1 lg:order-none">
        {center}
      </div>
      <PlayHubRailSkeleton />
    </div>
  );
}
