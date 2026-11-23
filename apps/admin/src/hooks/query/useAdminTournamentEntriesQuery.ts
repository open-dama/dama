import type { SkipPaginationMeta } from "@/components/ui/skip-pagination";
import { authHeaders, restClient } from "@/lib/api";
import { QueryStale } from "@/lib/query-policy";
import { requireApiSkipMeta } from "@/lib/skip-pagination";
import { useAuthHydrated } from "@/store/auth";
import { useQuery } from "@tanstack/react-query";

export type AdminTournamentEntry = {
  user_id: string;
  username?: string;
  status?: string;
  checked_in_at?: string | null;
  joined_at?: string;
  placement?: number | null;
};

export type AdminTournamentEntriesResponse = {
  entries: AdminTournamentEntry[];
  meta: SkipPaginationMeta;
};

export type AdminTournamentEntriesFilters = {
  status?: string;
  checkedIn?: string;
};

export function adminTournamentEntriesQueryKey(
  token: string | null | undefined,
  tournamentId: string,
  skip: number,
  limit: number,
  filters: AdminTournamentEntriesFilters = {},
) {
  return [
    "admin-tournament-entries",
    token,
    tournamentId,
    skip,
    limit,
    filters.status ?? "",
    filters.checkedIn ?? "",
  ] as const;
}

export function useAdminTournamentEntriesQuery(
  token: string | null | undefined,
  tournamentId: string,
  skip: number,
  limit: number,
  enabled: boolean,
  filters: AdminTournamentEntriesFilters = {},
) {
  const hydrated = useAuthHydrated();
  const id = (tournamentId || "").trim();
  const status = (filters.status || "").trim();
  const checkedIn = (filters.checkedIn || "").trim();
  return useQuery({
    staleTime: QueryStale.session,
    queryKey: adminTournamentEntriesQueryKey(token, id, skip, limit, { status, checkedIn }),
    enabled: hydrated && Boolean(token) && enabled && Boolean(id) && limit > 0 && skip >= 0,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<AdminTournamentEntriesResponse> => {
      if (!token || !id) throw new Error("");
      const params: Record<string, string | number> = { skip, limit };
      if (status) params.status = status;
      if (checkedIn === "1" || checkedIn === "0") params.checked_in = checkedIn;
      const { data } = await restClient.get<AdminTournamentEntriesResponse>(
        `/console/tournaments/${encodeURIComponent(id)}/entries`,
        {
          headers: authHeaders(token),
          params,
        },
      );
      requireApiSkipMeta(data?.meta, "admin tournament entries meta");
      if (!Array.isArray(data.entries)) {
        throw new Error("admin tournament entries unavailable");
      }
      return { entries: data.entries, meta: data.meta };
    },
  });
}
