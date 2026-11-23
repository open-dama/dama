import type { SkipPaginationMeta } from "@/components/ui/skip-pagination";
import { restClient } from "@/lib/api";
import { QueryStale } from "@/lib/query-policy";
import { requireApiSkipMeta } from "@/lib/skip-pagination";
import type { TournamentRosterEntry } from "@/types/tournament";
import { useQuery } from "@tanstack/react-query";

export type TournamentEntriesPagedResponse = {
  entries: TournamentRosterEntry[];
  meta: SkipPaginationMeta;
};

export type TournamentEntriesRosterFilters = {
  /** Exact entry status; empty = all. */
  status?: string;
  /** "1" | "0" | "" - backend checked_in filter. */
  checkedIn?: string;
  /** When true, only rows with placement set (KO results). */
  placed?: boolean;
};

export function tournamentEntriesPagedQueryKey(
  tournamentId: string | null | undefined,
  skip: number,
  limit: number,
  filters: TournamentEntriesRosterFilters = {},
) {
  return [
    "tournament-entries-paged",
    tournamentId,
    skip,
    limit,
    filters.status ?? "",
    filters.checkedIn ?? "",
    filters.placed === true ? "1" : "",
  ] as const;
}

/** Player/admin-shared skip/limit roster page - requires real skip/limit (DB chrome page size). */
export function useTournamentEntriesPagedQuery(
  tournamentId: string | null | undefined,
  skip: number,
  limit: number,
  filters: TournamentEntriesRosterFilters = {},
  enabled = true,
) {
  const id = (tournamentId || "").trim();
  const status = (filters.status || "").trim();
  const checkedIn = (filters.checkedIn || "").trim();
  const placed = filters.placed === true;
  return useQuery({
    staleTime: QueryStale.session,
    queryKey: tournamentEntriesPagedQueryKey(id, skip, limit, {
      status,
      checkedIn,
      placed,
    }),
    enabled: enabled && Boolean(id) && limit > 0 && skip >= 0,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<TournamentEntriesPagedResponse> => {
      const params: Record<string, string | number> = { skip, limit };
      if (status) params.status = status;
      if (checkedIn === "1" || checkedIn === "0") params.checked_in = checkedIn;
      if (placed) params.placed = "1";
      const { data } = await restClient.get<TournamentEntriesPagedResponse>(
        `/tournaments/${id}/entries`,
        { params },
      );
      requireApiSkipMeta(data?.meta, "tournament entries meta");
      if (!Array.isArray(data.entries)) {
        throw new Error("tournament entries unavailable");
      }
      return { entries: data.entries, meta: data.meta };
    },
  });
}
