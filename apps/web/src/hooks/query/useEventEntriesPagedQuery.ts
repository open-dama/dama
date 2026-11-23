import type { SkipPaginationMeta } from "@/components/ui/skip-pagination";
import { restClient } from "@/lib/api";
import { QueryStale } from "@/lib/query-policy";
import { requireApiSkipMeta } from "@/lib/skip-pagination";
import { useAuthHydrated } from "@/store/auth";
import type { HostedEventEntry } from "@/types/events";
import { useQuery } from "@tanstack/react-query";

export type EventEntriesPagedResponse = {
  entries: HostedEventEntry[];
  meta: SkipPaginationMeta;
  /** Present only for organizer Manage responses. */
  entry_fees_gross?: number;
  entry_fees_commission?: number;
  entry_fees_organizer_net?: number;
  entry_fees_paid_count?: number;
  entry_fees_currency?: string;
};

export type EventEntriesRosterFilters = {
  status?: string;
  checkedIn?: string;
  placed?: boolean;
};

export type EventEntriesPagedOptions = {
  /**
   * Organizer Manage Players/Payments - fail closed when fee rollups missing.
   * Lobby must leave this false (player/guest responses omit fees).
   */
  requireFeeTotals?: boolean;
};

export function eventEntriesPagedQueryKey(
  token: string | null | undefined,
  eventId: string | null | undefined,
  skip: number,
  limit: number,
  filters: EventEntriesRosterFilters = {},
  requireFeeTotals = false,
) {
  return [
    "event-entries-paged",
    token ?? "",
    eventId,
    skip,
    limit,
    filters.status ?? "",
    filters.checkedIn ?? "",
    filters.placed === true ? "1" : "",
    requireFeeTotals ? "fees" : "nofees",
  ] as const;
}

/** Skip/limit roster page - lobby (optional auth) or organizer Manage (auth + fee totals). */
export function useEventEntriesPagedQuery(
  token: string | null | undefined,
  eventId: string | null | undefined,
  skip: number,
  limit: number,
  filters: EventEntriesRosterFilters = {},
  enabled = true,
  options: EventEntriesPagedOptions = {},
) {
  const hydrated = useAuthHydrated();
  const auth = (token || "").trim();
  const status = (filters.status || "").trim();
  const checkedIn = (filters.checkedIn || "").trim();
  const placed = filters.placed === true;
  const requireFeeTotals = options.requireFeeTotals === true;
  return useQuery({
    staleTime: QueryStale.session,
    queryKey: eventEntriesPagedQueryKey(
      auth || null,
      eventId,
      skip,
      limit,
      { status, checkedIn, placed },
      requireFeeTotals,
    ),
    // Guest lobby: auth optional (parity with useEventEntriesQuery). Manage passes auth via enabled.
    enabled:
      hydrated &&
      enabled &&
      Boolean(eventId) &&
      limit > 0 &&
      skip >= 0 &&
      (!requireFeeTotals || Boolean(auth)),
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<EventEntriesPagedResponse> => {
      const params: Record<string, string | number> = { skip, limit };
      if (status) params.status = status;
      if (checkedIn === "1" || checkedIn === "0") params.checked_in = checkedIn;
      if (placed) params.placed = "1";
      const { data } = await restClient.get<EventEntriesPagedResponse>(
        `/events/${eventId}/entries`,
        {
          ...(auth ? { headers: { Authorization: `Bearer ${auth}` } } : {}),
          params,
        },
      );
      requireApiSkipMeta(data?.meta, "event entries meta");
      if (!Array.isArray(data.entries)) {
        throw new Error("event entries unavailable");
      }
      if (requireFeeTotals) {
        if (
          typeof data.entry_fees_gross !== "number" ||
          typeof data.entry_fees_commission !== "number" ||
          typeof data.entry_fees_organizer_net !== "number" ||
          typeof data.entry_fees_paid_count !== "number" ||
          typeof data.entry_fees_currency !== "string"
        ) {
          throw new Error("event entry fee totals unavailable");
        }
      }
      return {
        entries: data.entries,
        meta: data.meta,
        entry_fees_gross: data.entry_fees_gross,
        entry_fees_commission: data.entry_fees_commission,
        entry_fees_organizer_net: data.entry_fees_organizer_net,
        entry_fees_paid_count: data.entry_fees_paid_count,
        entry_fees_currency: data.entry_fees_currency,
      };
    },
  });
}
