import { gameStateQueryKey } from "@/hooks/query/useGameStateQuery";
import { mergeRemoteBoardState } from "@/lib/gameBoardStateMerge";
import { postGameResume } from "@/lib/pause-active-game";
import type { GamePayload } from "@/types/game";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useResumeGameMutation(token: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (gameId: string): Promise<GamePayload> => {
      return postGameResume(token || "", gameId);
    },
    onSuccess: (game) => {
      if (game?.id) {
        // Merge so resume mid pick→put cannot seed board_after into RQ cache.
        qc.setQueryData(gameStateQueryKey(game.id), (prev: GamePayload | undefined) =>
          !prev || prev.id !== game.id ? game : mergeRemoteBoardState(prev, game),
        );
      }
    },
  });
}
