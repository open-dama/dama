"use client";

import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { SignInLink } from "@/components/auth/SignInLink";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  type OpsColumn,
  OpsDataTable,
  type OpsRowSelectionState,
  selectedRowIds,
} from "@/components/ui/ops-data-table";
import {
  type OpsDataTableRowAction,
  OpsDataTableRowActions,
} from "@/components/ui/ops-data-table-row-actions";
import { PauseDurationField } from "@/components/ui/pause-duration-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ProgressionBoardBodySkeleton,
  ProgressionBodySkeleton,
  ProgressionFormSkeleton,
  ProgressionPlatformBodySkeleton,
  ShimmerBlock,
} from "@/components/ui/shimmer-skeletons";
import { useSaveBoardRulesMutation, useSaveProgressionMutation } from "@/hooks/mutation";
import {
  useAdminConsoleChromeQuery,
  useConsoleGameRulesQuery,
  useConsoleProgressionQuery,
  usePaymentCurrencyQuery,
} from "@/hooks/query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useDeferredDialogValue } from "@/hooks/use-deferred-dialog-selection";
import { useIsConsoleRole } from "@/hooks/useIsConsoleRole";
import { adminConsoleChromeUnavailable } from "@/lib/chrome-unavailable";
import { sanitizeIntegerInput } from "@/lib/sanitize-integer-input";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import type { MatchClockPreset, ProgressionPayload, XPLevel } from "@/types";
import { isAdminConsoleChromeReady } from "@/types/admin-console-chrome";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type XpFormMode =
  | { kind: "create" }
  | { kind: "edit"; index: number }
  | { kind: "view"; index: number };

type TcPresetFormMode =
  | { kind: "create" }
  | { kind: "edit"; index: number }
  | { kind: "view"; index: number };

type XpRow = XPLevel & { id: string };
type TcPresetRow = MatchClockPreset & { id: string };

type AdAdvertiserTier = NonNullable<NonNullable<ProgressionPayload["ad_pricing"]["tiers"]>[number]>;
type AdPackageAdmin = NonNullable<NonNullable<ProgressionPayload["ad_packages"]>[number]>;
type TierEditorRow = AdAdvertiserTier & { rowKey: string };
type PackageEditorRow = AdPackageAdmin & { rowKey: string };

const BUYING_TYPE_OPTIONS = ["legacy", "auction", "reservation"] as const;
const MARKETPLACE_BUYING_TYPE_OPTIONS = ["auction", "reservation"] as const;

type ProgressionTab = "platform" | "board";

function newEditorRowKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyAdvertiserTier(): TierEditorRow {
  return {
    rowKey: newEditorRowKey(),
    code: "",
    label: "",
    blurb: "",
    monthly_spend_min: 0,
    create_fee_multiplier: 1,
    media_daily_min: 0,
    unlock_reservation: false,
    unlock_packages: false,
    list_cpm_multiplier: 1,
  };
}

function emptyAdPackage(sortOrder: number): PackageEditorRow {
  return {
    rowKey: newEditorRowKey(),
    code: "",
    title: "",
    blurb: "",
    buying_type: "auction",
    fixed_cpm: 0,
    flight_fee: 0,
    min_tier: "",
    placement: "",
    enabled: true,
    sort_order: sortOrder,
    exclusive: false,
    exclusive_category: "",
    lobby_takeover: false,
  };
}

function sortTcPresets(rows: MatchClockPreset[]): MatchClockPreset[] {
  return [...rows].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.seconds - b.seconds;
  });
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const l = label.trim();
  if (!l) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--dama-muted)]">{l}</p>
      <p className="text-sm text-[var(--dama-text)]">{value}</p>
    </div>
  );
}

export default function ConsoleProgressionPage() {
  const token = useAuthStore((s) => s.token);
  const { isConsole: isAdmin, isLoading: roleLoading } = useIsConsoleRole();
  const chromeQuery = useAdminConsoleChromeQuery(true);
  const chrome = isAdminConsoleChromeReady(chromeQuery.data)
    ? chromeQuery.data.progression
    : undefined;

  const [levels, setLevels] = useState<XPLevel[]>([]);
  /** String drafts so admins can type "-" for loss rating without the field snapping. */
  const [winXp, setWinXp] = useState<string | null>(null);
  const [drawXp, setDrawXp] = useState<string | null>(null);
  const [lossXp, setLossXp] = useState<string | null>(null);
  const [winRating, setWinRating] = useState<string | null>(null);
  const [drawRating, setDrawRating] = useState<string | null>(null);
  const [lossRating, setLossRating] = useState<string | null>(null);
  const [startingRating, setStartingRating] = useState<string | null>(null);
  const [ratingFloor, setRatingFloor] = useState<string | null>(null);
  const [clockEnabled, setClockEnabled] = useState<boolean | null>(null);
  const [pauseEnabled, setPauseEnabled] = useState<boolean | null>(null);
  const [pauseDurationSeconds, setPauseDurationSeconds] = useState<number | null>(null);
  const [initialSeconds, setInitialSeconds] = useState<number | null>(null);
  const [incrementSeconds, setIncrementSeconds] = useState<number | null>(null);
  const [inviteTtlSeconds, setInviteTtlSeconds] = useState<number | null>(null);
  const [webAppOrigin, setWebAppOrigin] = useState("");
  const [unitCost, setUnitCost] = useState<number | null>(null);
  const [ethiopiaCreateFeeAmount, setEthiopiaCreateFeeAmount] = useState<number | null>(null);
  const [globalCreateFeeAmount, setGlobalCreateFeeAmount] = useState<number | null>(null);
  const [marketplaceEnabled, setMarketplaceEnabled] = useState<boolean | null>(null);
  const [auctionEnabled, setAuctionEnabled] = useState<boolean | null>(null);
  const [reservationEnabled, setReservationEnabled] = useState<boolean | null>(null);
  const [dynamicFloorEnabled, setDynamicFloorEnabled] = useState<boolean | null>(null);
  const [agencyEnabled, setAgencyEnabled] = useState<boolean | null>(null);
  const [impressionWalletSettleEnabled, setImpressionWalletSettleEnabled] = useState<
    boolean | null
  >(null);
  const [defaultBuyingType, setDefaultBuyingType] = useState("");
  const [floorCpm, setFloorCpm] = useState<number | null>(null);
  const [floorCpmEthiopia, setFloorCpmEthiopia] = useState<number | null>(null);
  const [floorCpmGlobal, setFloorCpmGlobal] = useState<number | null>(null);
  const [placementLobbyMultiplier, setPlacementLobbyMultiplier] = useState<number | null>(null);
  const [placementInMatchMultiplier, setPlacementInMatchMultiplier] = useState<number | null>(null);
  const [viewportDesktopMultiplier, setViewportDesktopMultiplier] = useState<number | null>(null);
  const [viewportTabletMultiplier, setViewportTabletMultiplier] = useState<number | null>(null);
  const [viewportMobileMultiplier, setViewportMobileMultiplier] = useState<number | null>(null);
  const [peakHourMultiplier, setPeakHourMultiplier] = useState<number | null>(null);
  const [peakHoursUtcStart, setPeakHoursUtcStart] = useState<number | null>(null);
  const [peakHoursUtcEnd, setPeakHoursUtcEnd] = useState<number | null>(null);
  const [dynamicFloorFillPct, setDynamicFloorFillPct] = useState<number | null>(null);
  const [dynamicFloorBoost, setDynamicFloorBoost] = useState<number | null>(null);
  const [agencySpendPercent, setAgencySpendPercent] = useState<number | null>(null);
  const [audienceHighRatingMin, setAudienceHighRatingMin] = useState<number | null>(null);
  const [audienceHighRatingMultiplier, setAudienceHighRatingMultiplier] = useState<number | null>(
    null,
  );
  const [tiers, setTiers] = useState<TierEditorRow[]>([]);
  const [adPackages, setAdPackages] = useState<PackageEditorRow[]>([]);
  const [marketplaceHydrated, setMarketplaceHydrated] = useState(false);
  const [boardSize, setBoardSize] = useState<number | null>(null);
  const [piecesPerSide, setPiecesPerSide] = useState<number | null>(null);
  const [setupRows, setSetupRows] = useState<number | null>(null);
  const [boardVariant, setBoardVariant] = useState("");

  const [levelLabel, setLevelLabel] = useState("");
  const [levelMinXp, setLevelMinXp] = useState("");
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [xpSearch, setXpSearch] = useState("");
  const debouncedXpSearch = useDebouncedValue(xpSearch.trim().toLowerCase(), 250);
  const [rowSelection, setRowSelection] = useState<OpsRowSelectionState>({});

  const [presets, setPresets] = useState<MatchClockPreset[]>([]);
  const [presetLabel, setPresetLabel] = useState("");
  const [presetSeconds, setPresetSeconds] = useState("");
  const [presetEnabled, setPresetEnabled] = useState(true);
  const [presetSortOrder, setPresetSortOrder] = useState("");
  const [disablePresetIndex, setDisablePresetIndex] = useState<number | null>(null);
  const [tcSearch, setTcSearch] = useState("");
  const debouncedTcSearch = useDebouncedValue(tcSearch.trim().toLowerCase(), 250);

  const xpDialog = useDeferredDialogValue<XpFormMode>();
  const tcDialog = useDeferredDialogValue<TcPresetFormMode>();
  const [tab, setTab] = useState<ProgressionTab>("platform");

  const { data, isLoading, error } = useConsoleProgressionQuery(token, isAdmin);
  const boardQuery = useConsoleGameRulesQuery(token, isAdmin);
  const currencyQuery = usePaymentCurrencyQuery();
  const save = useSaveProgressionMutation(token);
  const saveBoard = useSaveBoardRulesMutation(token);

  useEffect(() => {
    if (!data) return;
    setLevels(Array.isArray(data.xp_levels) ? data.xp_levels.map((l) => ({ ...l })) : []);
    const rewards = data.match_rewards;
    setWinXp(typeof rewards?.win_xp === "number" ? String(rewards.win_xp) : null);
    setDrawXp(typeof rewards?.draw_xp === "number" ? String(rewards.draw_xp) : null);
    setLossXp(typeof rewards?.loss_xp === "number" ? String(rewards.loss_xp) : null);
    setWinRating(typeof rewards?.win_rating === "number" ? String(rewards.win_rating) : null);
    setDrawRating(typeof rewards?.draw_rating === "number" ? String(rewards.draw_rating) : null);
    setLossRating(typeof rewards?.loss_rating === "number" ? String(rewards.loss_rating) : null);
    setStartingRating(
      typeof rewards?.starting_rating === "number" ? String(rewards.starting_rating) : null,
    );
    setRatingFloor(typeof rewards?.rating_floor === "number" ? String(rewards.rating_floor) : null);
    setClockEnabled(data.match_clock.enabled);
    setPauseEnabled(data.match_clock.pause_enabled === true);
    setPauseDurationSeconds(
      typeof data.match_clock.pause_duration_seconds === "number"
        ? data.match_clock.pause_duration_seconds
        : 0,
    );
    setInitialSeconds(data.match_clock.initial_seconds);
    setIncrementSeconds(data.match_clock.increment_seconds);
    setInviteTtlSeconds(data.match_clock.invite_ttl_seconds);
    setPresets(
      sortTcPresets(
        (data.match_clock.presets ?? []).map((p, i) => ({
          seconds: p.seconds,
          label: p.label,
          enabled: p.enabled !== false,
          sort_order: typeof p.sort_order === "number" ? p.sort_order : i,
        })),
      ),
    );
    setWebAppOrigin((data.web_app_origin || "").trim());
    setUnitCost(data.ad_pricing.impression_unit_cost);
    setEthiopiaCreateFeeAmount(data.ad_pricing.campaign_create_fee_ethiopia_amount);
    setGlobalCreateFeeAmount(data.ad_pricing.campaign_create_fee_global_amount);
    const ap = data.ad_pricing;
    setMarketplaceEnabled(ap.marketplace_enabled === true);
    setAuctionEnabled(ap.auction_enabled === true);
    setReservationEnabled(ap.reservation_enabled === true);
    setDynamicFloorEnabled(ap.dynamic_floor_enabled === true);
    setAgencyEnabled(ap.agency_enabled === true);
    setImpressionWalletSettleEnabled(ap.impression_wallet_settle_enabled === true);
    {
      let raw = (ap.default_buying_type || "").trim();
      if (ap.marketplace_enabled === true) {
        if (raw === "legacy" || !raw) {
          raw =
            ap.auction_enabled === true
              ? "auction"
              : ap.reservation_enabled === true
                ? "reservation"
                : "";
        } else if (raw === "auction" && ap.auction_enabled !== true) {
          raw = ap.reservation_enabled === true ? "reservation" : "";
        } else if (raw === "reservation" && ap.reservation_enabled !== true) {
          raw = ap.auction_enabled === true ? "auction" : "";
        }
        setDefaultBuyingType(raw);
      } else {
        setDefaultBuyingType(raw || "auction");
      }
    }
    setFloorCpm(typeof ap.floor_cpm === "number" ? ap.floor_cpm : null);
    setFloorCpmEthiopia(
      typeof ap.floor_cpm_ethiopia === "number"
        ? ap.floor_cpm_ethiopia
        : typeof ap.floor_cpm === "number"
          ? ap.floor_cpm
          : null,
    );
    setFloorCpmGlobal(
      typeof ap.floor_cpm_global === "number"
        ? ap.floor_cpm_global
        : typeof ap.floor_cpm === "number"
          ? ap.floor_cpm
          : null,
    );
    setPlacementLobbyMultiplier(
      typeof ap.placement_lobby_multiplier === "number" ? ap.placement_lobby_multiplier : null,
    );
    setPlacementInMatchMultiplier(
      typeof ap.placement_in_match_multiplier === "number"
        ? ap.placement_in_match_multiplier
        : null,
    );
    setViewportDesktopMultiplier(
      typeof ap.viewport_desktop_multiplier === "number" ? ap.viewport_desktop_multiplier : null,
    );
    setViewportTabletMultiplier(
      typeof ap.viewport_tablet_multiplier === "number" ? ap.viewport_tablet_multiplier : null,
    );
    setViewportMobileMultiplier(
      typeof ap.viewport_mobile_multiplier === "number" ? ap.viewport_mobile_multiplier : null,
    );
    setPeakHourMultiplier(
      typeof ap.peak_hour_multiplier === "number" ? ap.peak_hour_multiplier : null,
    );
    setPeakHoursUtcStart(
      typeof ap.peak_hours_utc_start === "number" ? ap.peak_hours_utc_start : null,
    );
    setPeakHoursUtcEnd(typeof ap.peak_hours_utc_end === "number" ? ap.peak_hours_utc_end : null);
    setDynamicFloorFillPct(
      typeof ap.dynamic_floor_fill_pct === "number" ? ap.dynamic_floor_fill_pct : null,
    );
    setDynamicFloorBoost(
      typeof ap.dynamic_floor_boost === "number" ? ap.dynamic_floor_boost : null,
    );
    setAgencySpendPercent(
      typeof ap.agency_spend_percent === "number" ? ap.agency_spend_percent : null,
    );
    setAudienceHighRatingMin(
      typeof ap.audience_high_rating_min === "number" ? ap.audience_high_rating_min : 1600,
    );
    setAudienceHighRatingMultiplier(
      typeof ap.audience_high_rating_multiplier === "number"
        ? ap.audience_high_rating_multiplier
        : 1.15,
    );
    setTiers(
      Array.isArray(ap.tiers)
        ? ap.tiers.map((t) => ({
            rowKey: newEditorRowKey(),
            code: t.code || "",
            label: t.label || "",
            blurb: t.blurb || "",
            monthly_spend_min: t.monthly_spend_min ?? 0,
            create_fee_multiplier: t.create_fee_multiplier ?? 1,
            media_daily_min: t.media_daily_min ?? 0,
            unlock_reservation: t.unlock_reservation === true,
            unlock_packages: t.unlock_packages === true,
            list_cpm_multiplier: t.list_cpm_multiplier ?? 1,
          }))
        : [],
    );
    setAdPackages(
      Array.isArray(data.ad_packages)
        ? data.ad_packages.map((p, i) => {
            const code = (p.code || "").trim();
            const takeover = p.lobby_takeover === true || code.toLowerCase() === "lobby_takeover";
            // Phase C: do not invent buying_type for takeover SKUs on hydrate.
            const buyRaw = (p.buying_type || "").trim();
            return {
              rowKey: newEditorRowKey(),
              code,
              title: p.title || "",
              blurb: p.blurb || "",
              buying_type: takeover ? buyRaw : buyRaw || "auction",
              fixed_cpm: p.fixed_cpm ?? 0,
              flight_fee: p.flight_fee ?? 0,
              min_tier: p.min_tier || "",
              placement: p.placement || "",
              enabled: p.enabled !== false,
              sort_order: typeof p.sort_order === "number" ? p.sort_order : i,
              exclusive: p.exclusive === true,
              exclusive_category: p.exclusive_category || "",
              lobby_takeover: p.lobby_takeover === true,
            };
          })
        : [],
    );
    setMarketplaceHydrated(true);
  }, [data]);

  useEffect(() => {
    if (marketplaceEnabled !== true) return;
    let next = (defaultBuyingType || "").trim();
    if (next === "legacy" || !next) {
      next = auctionEnabled === true ? "auction" : reservationEnabled === true ? "reservation" : "";
    } else if (next === "auction" && auctionEnabled !== true) {
      next = reservationEnabled === true ? "reservation" : "";
    } else if (next === "reservation" && reservationEnabled !== true) {
      next = auctionEnabled === true ? "auction" : "";
    }
    if (next !== defaultBuyingType) setDefaultBuyingType(next);
  }, [marketplaceEnabled, auctionEnabled, reservationEnabled, defaultBuyingType]);

  useEffect(() => {
    if (marketplaceEnabled !== true) return;
    setAdPackages((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        const code = (p.code || "").trim().toLowerCase();
        const takeover = p.lobby_takeover === true || code === "lobby_takeover";
        // Phase C: never invent buying_type for takeover (flag or code).
        if (takeover) return p;
        const buy = (p.buying_type || "").trim();
        if (buy === "legacy" || !buy) {
          changed = true;
          return { ...p, buying_type: "reservation" };
        }
        return p;
      });
      return changed ? next : prev;
    });
  }, [marketplaceEnabled]);

  useEffect(() => {
    if (!boardQuery.data) return;
    setBoardSize(boardQuery.data.size);
    setPiecesPerSide(boardQuery.data.pieces_per_side);
    setSetupRows(boardQuery.data.setup_rows);
    setBoardVariant(boardQuery.data.variant);
  }, [boardQuery.data]);

  useEffect(() => {
    if (!xpDialog.open || !xpDialog.value) return;
    const mode = xpDialog.value;
    if (mode.kind === "create") {
      setLevelLabel("");
      setLevelMinXp("");
      return;
    }
    const row = levels[mode.index];
    if (!row) return;
    setLevelLabel(row.label || "");
    setLevelMinXp(String(row.min_xp ?? ""));
  }, [xpDialog.open, xpDialog.value, levels]);

  useEffect(() => {
    if (!tcDialog.open || !tcDialog.value) return;
    const mode = tcDialog.value;
    if (mode.kind === "create") {
      setPresetLabel("");
      setPresetSeconds("");
      setPresetEnabled(true);
      setPresetSortOrder(String(presets.length));
      return;
    }
    const row = presets[mode.index];
    if (!row) return;
    setPresetLabel(row.label || "");
    setPresetSeconds(String(row.seconds ?? ""));
    setPresetEnabled(row.enabled !== false);
    setPresetSortOrder(String(row.sort_order ?? mode.index));
  }, [tcDialog.open, tcDialog.value, presets]);

  const progressionLoading = isAdmin && isLoading;
  const boardLoading = isAdmin && boardQuery.isLoading;
  const enabledPresets = useMemo(() => presets.filter((p) => p.enabled), [presets]);

  const xpRows: XpRow[] = useMemo(
    () =>
      levels.map((l, i) => ({
        ...l,
        id: `xp-${i}-${l.label}-${l.min_xp}`,
      })),
    [levels],
  );
  const filteredXpRows = useMemo(() => {
    if (!debouncedXpSearch) return xpRows;
    return xpRows.filter((r) => r.label.toLowerCase().includes(debouncedXpSearch));
  }, [debouncedXpSearch, xpRows]);

  const xpColumns = useMemo((): OpsColumn<XpRow>[] => {
    if (!chrome) return [];
    const labelHeader = (chrome.xp_col_label || "").trim();
    const minHeader = (chrome.xp_col_min_xp || "").trim();
    const actionsHeader = (chrome.xp_actions_label || "").trim();
    const viewLabel = (chrome.xp_view_action || "").trim();
    const editLabel = (chrome.xp_edit_action || "").trim();
    const deleteLabel = (chrome.xp_delete_action || "").trim();
    const cols: OpsColumn<XpRow>[] = [
      {
        id: "label",
        header: labelHeader,
        cell: (row: XpRow) => <span className="font-medium">{row.label}</span>,
      },
      {
        id: "min_xp",
        header: minHeader,
        cell: (row: XpRow) => <span className="font-mono tabular-nums">{row.min_xp}</span>,
      },
      {
        id: "actions",
        header: actionsHeader,
        className: "w-12 text-right",
        cell: (row: XpRow) => {
          const index = xpRows.findIndex((r) => r.id === row.id);
          if (index < 0) return null;
          return (
            <OpsDataTableRowActions
              triggerLabel={actionsHeader}
              actions={[
                {
                  id: "view",
                  label: viewLabel,
                  onSelect: () => xpDialog.openWith({ kind: "view", index }),
                },
                {
                  id: "edit",
                  label: editLabel,
                  onSelect: () => xpDialog.openWith({ kind: "edit", index }),
                },
                {
                  id: "delete",
                  label: deleteLabel,
                  destructive: true,
                  onSelect: () => setDeleteIndex(index),
                },
              ]}
            />
          );
        },
      },
    ];
    return cols.filter((c) => c.id === "actions" || Boolean(c.header));
  }, [chrome, xpDialog, xpRows]);

  function saveXpLevel() {
    const mode = xpDialog.value;
    if (!mode || mode.kind === "view") return;
    const label = levelLabel.trim();
    const minRaw = levelMinXp.trim();
    const minXp = Number.parseInt(minRaw, 10);
    if (!label || !Number.isFinite(minXp) || minXp < 0) return;
    const next = { label, min_xp: minXp };
    setLevels((prev) => {
      if (mode.kind === "create") return [...prev, next];
      return prev.map((row, i) => (i === mode.index ? next : row));
    });
    xpDialog.close();
  }

  const tcRows: TcPresetRow[] = useMemo(
    () =>
      presets.map((p, i) => ({
        ...p,
        id: `tc-${p.seconds}-${i}`,
      })),
    [presets],
  );
  const filteredTcRows = useMemo(() => {
    if (!debouncedTcSearch) return tcRows;
    return tcRows.filter(
      (r) =>
        r.label.toLowerCase().includes(debouncedTcSearch) ||
        String(r.seconds).includes(debouncedTcSearch),
    );
  }, [debouncedTcSearch, tcRows]);

  const tcColumns = useMemo((): OpsColumn<TcPresetRow>[] => {
    if (!chrome) return [];
    const labelHeader = (chrome.tc_preset_col_label || "").trim();
    const secondsHeader = (chrome.tc_preset_col_seconds || "").trim();
    const enabledHeader = (chrome.tc_preset_col_enabled || "").trim();
    const sortHeader = (chrome.tc_preset_col_sort || "").trim();
    const actionsHeader = (chrome.tc_preset_actions_label || "").trim();
    const viewLabel = (chrome.tc_preset_view_action || "").trim();
    const editLabel = (chrome.tc_preset_edit_action || "").trim();
    const disableLabel = (chrome.tc_preset_disable_action || "").trim();
    const enableLabel = (chrome.tc_preset_enable_action || "").trim();
    const emptyVal = (chrome.empty_value || "").trim();
    const cols: OpsColumn<TcPresetRow>[] = [
      {
        id: "label",
        header: labelHeader,
        cell: (row: TcPresetRow) => <span className="font-medium">{row.label}</span>,
      },
      {
        id: "seconds",
        header: secondsHeader,
        cell: (row: TcPresetRow) => <span className="font-mono tabular-nums">{row.seconds}</span>,
      },
      {
        id: "enabled",
        header: enabledHeader,
        cell: (row: TcPresetRow) => (
          <span className="text-sm text-[var(--dama-muted)]">
            {row.enabled ? enableLabel || "✓" : disableLabel || emptyVal}
          </span>
        ),
      },
      {
        id: "sort_order",
        header: sortHeader,
        cell: (row: TcPresetRow) => (
          <span className="font-mono tabular-nums">{row.sort_order}</span>
        ),
      },
      {
        id: "actions",
        header: actionsHeader,
        className: "w-12 text-right",
        cell: (row: TcPresetRow) => {
          const index = tcRows.findIndex((r) => r.id === row.id);
          if (index < 0) return null;
          const actions: OpsDataTableRowAction[] = [
            {
              id: "view",
              label: viewLabel,
              onSelect: () => tcDialog.openWith({ kind: "view", index }),
            },
            {
              id: "edit",
              label: editLabel,
              onSelect: () => tcDialog.openWith({ kind: "edit", index }),
            },
          ];
          if (row.enabled) {
            actions.push({
              id: "disable",
              label: disableLabel,
              destructive: true,
              onSelect: () => setDisablePresetIndex(index),
            });
          } else {
            actions.push({
              id: "enable",
              label: enableLabel,
              onSelect: () => {
                setPresets((prev) =>
                  sortTcPresets(prev.map((p, i) => (i === index ? { ...p, enabled: true } : p))),
                );
              },
            });
          }
          return <OpsDataTableRowActions triggerLabel={actionsHeader} actions={actions} />;
        },
      },
    ];
    return cols.filter((c) => c.id === "actions" || Boolean(c.header));
  }, [chrome, tcDialog, tcRows]);

  function saveTcPreset() {
    const mode = tcDialog.value;
    if (!mode || mode.kind === "view" || !chrome) return;
    const label = presetLabel.trim();
    const seconds = Number.parseInt(presetSeconds.trim(), 10);
    const sortOrder = Number.parseInt(presetSortOrder.trim(), 10);
    if (!label || !Number.isFinite(seconds) || seconds <= 0) {
      const msg = (chrome.err_tc_preset_values || "").trim();
      if (msg) toast.error(msg);
      return;
    }
    if (!Number.isFinite(sortOrder)) {
      const msg = (chrome.err_tc_preset_values || "").trim();
      if (msg) toast.error(msg);
      return;
    }
    const dup = presets.some(
      (p, i) => p.seconds === seconds && !(mode.kind === "edit" && i === mode.index),
    );
    if (dup) {
      const msg = (chrome.err_tc_preset_duplicate || "").trim();
      if (msg) toast.error(msg);
      return;
    }
    const next: MatchClockPreset = {
      label,
      seconds,
      enabled: presetEnabled,
      sort_order: sortOrder,
    };
    if (mode.kind === "edit" && !next.enabled) {
      const enabledCount = presets.filter((p, i) => i !== mode.index && p.enabled).length;
      if (enabledCount < 1) {
        const msg = (chrome.err_tc_preset_disable_last || "").trim();
        if (msg) toast.error(msg);
        return;
      }
      if (initialSeconds != null && seconds === initialSeconds) {
        const msg = (chrome.err_tc_preset_disable_default || "").trim();
        if (msg) toast.error(msg);
        return;
      }
    }
    setPresets((prev) => {
      const updated =
        mode.kind === "create"
          ? [...prev, next]
          : prev.map((row, i) => (i === mode.index ? next : row));
      return sortTcPresets(updated);
    });
    tcDialog.close();
  }

  if (chromeQuery.isLoading) {
    return (
      <div className="space-y-6">
        <ProgressionFormSkeleton tab={tab} />
      </div>
    );
  }

  if (!chrome) {
    const unavailable = adminConsoleChromeUnavailable(chromeQuery.data, chromeQuery.error);
    return <div className="p-6 text-sm text-[var(--dama-muted)]">{unavailable}</div>;
  }

  const ethiopiaCur = (currencyQuery.data?.ethiopia || "").trim().toUpperCase();
  const globalCur = (currencyQuery.data?.global || "").trim().toUpperCase();
  const emptyChrome = (chrome.empty_value || "").trim();
  const geoBlurb = (chrome.campaign_create_fee_geo_blurb || "")
    .replaceAll("{ethiopia}", ethiopiaCur || emptyChrome)
    .replaceAll("{global}", globalCur || emptyChrome);

  const xpMode = xpDialog.value;
  const xpFormTitle =
    xpMode?.kind === "edit"
      ? chrome.xp_edit_modal_title
      : xpMode?.kind === "view"
        ? chrome.xp_detail_modal_title
        : chrome.xp_create_modal_title;
  const xpViewing = xpMode?.kind === "view";

  const tcMode = tcDialog.value;
  const tcFormTitle =
    tcMode?.kind === "edit"
      ? chrome.tc_preset_edit_modal_title
      : tcMode?.kind === "view"
        ? chrome.tc_preset_detail_modal_title
        : chrome.tc_preset_create_modal_title;
  const tcViewing = tcMode?.kind === "view";

  const tabPlatform = (chrome.page_title || "").trim() || (chrome.xp_levels_label || "").trim();
  const tabBoard = (chrome.board_section_title || "").trim();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{chrome.page_title}</h1>
        <p className="mt-1 text-sm text-[var(--dama-muted)]">{chrome.page_blurb}</p>
      </div>

      {roleLoading ? (
        <ProgressionBodySkeleton tab={tab} />
      ) : !isAdmin ? (
        <p className="rounded-md border border-[var(--dama-border)] p-4 text-sm">
          <SignInLink className="text-[var(--dama-gold)] underline" />
        </p>
      ) : (
        <>
          <div
            role="tablist"
            aria-label={(chrome.page_title || "").trim() || undefined}
            className="flex max-w-full flex-wrap gap-1 rounded-lg border border-[var(--dama-border)] bg-[var(--dama-surface)] p-1"
          >
            {(
              [
                { id: "platform" as const, label: tabPlatform },
                { id: "board" as const, label: tabBoard },
              ] as const
            )
              .filter((t) => Boolean(t.label))
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    tab === t.id
                      ? "bg-[var(--dama-card)] text-[var(--dama-fg)] shadow-sm"
                      : "text-[var(--dama-muted)] hover:text-[var(--dama-fg)]",
                  )}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
          </div>

          {tab === "platform" ? (
            <div className="space-y-4 rounded-xl border border-[var(--dama-border)] bg-[var(--dama-card)] p-5">
              {progressionLoading ? (
                <ProgressionPlatformBodySkeleton />
              ) : error ? (
                <p className="text-sm text-[var(--dama-danger)]">{chrome.load_failed}</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-[var(--dama-text)]">
                      {chrome.xp_levels_label}
                    </h2>
                    <Button
                      type="button"
                      size="sm"
                      variant="gold"
                      disabled={save.isPending}
                      onClick={() => xpDialog.openWith({ kind: "create" })}
                    >
                      {chrome.xp_add_action}
                    </Button>
                  </div>
                  <AdminFilterBar
                    filters={[
                      {
                        kind: "search",
                        id: "admin-xp-search",
                        label: (chrome.xp_search_label || "").trim(),
                        value: xpSearch,
                        onChange: setXpSearch,
                        placeholder: (chrome.xp_search_placeholder || "").trim() || undefined,
                      },
                    ]}
                  />
                  <OpsDataTable
                    columns={xpColumns}
                    data={filteredXpRows}
                    getRowId={(row) => row.id}
                    empty={
                      <p className="py-6 text-center text-sm text-[var(--dama-muted)]">
                        {chrome.xp_empty}
                      </p>
                    }
                    selection={{
                      chrome: {
                        selectAllLabel: (chrome.select_all_label || "").trim(),
                        selectRowLabel: (chrome.select_row_label || "").trim(),
                        selectedCountFmt: (chrome.selected_count_fmt || "").trim(),
                      },
                      rowSelection,
                      onRowSelectionChange: setRowSelection,
                      toolbar: (
                        <div className="flex flex-wrap gap-2">
                          {(chrome.xp_delete_action || "").trim() ? (
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={selectedRowIds(rowSelection).length === 0}
                              onClick={() => setBulkDeleteOpen(true)}
                            >
                              {(chrome.xp_delete_action || "").trim()}
                            </Button>
                          ) : null}
                          <Button size="sm" variant="outline" onClick={() => setRowSelection({})}>
                            {(chrome.clear_selection_action || "").trim()}
                          </Button>
                        </div>
                      ),
                    }}
                  />

                  <div className="space-y-3 border-t border-[var(--dama-border)] pt-4">
                    <div>
                      <h2 className="text-sm font-semibold text-[var(--dama-text)]">
                        {chrome.match_rewards_section_title}
                      </h2>
                      <p className="mt-1 text-sm text-[var(--dama-muted)]">
                        {chrome.match_rewards_blurb}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field id="progression-win-xp" label={chrome.win_xp_label}>
                        {winXp == null ? (
                          <ShimmerBlock className="h-10 w-full rounded-md" />
                        ) : (
                          <Input
                            id="progression-win-xp"
                            inputMode="numeric"
                            value={winXp}
                            onChange={(e) => setWinXp(sanitizeIntegerInput(e.target.value))}
                            disabled={!isAdmin || save.isPending}
                          />
                        )}
                      </Field>
                      <Field id="progression-draw-xp" label={chrome.draw_xp_label}>
                        {drawXp == null ? (
                          <ShimmerBlock className="h-10 w-full rounded-md" />
                        ) : (
                          <Input
                            id="progression-draw-xp"
                            inputMode="numeric"
                            value={drawXp}
                            onChange={(e) => setDrawXp(sanitizeIntegerInput(e.target.value))}
                            disabled={!isAdmin || save.isPending}
                          />
                        )}
                      </Field>
                      <Field id="progression-loss-xp" label={chrome.loss_xp_label}>
                        {lossXp == null ? (
                          <ShimmerBlock className="h-10 w-full rounded-md" />
                        ) : (
                          <Input
                            id="progression-loss-xp"
                            inputMode="numeric"
                            value={lossXp}
                            onChange={(e) => setLossXp(sanitizeIntegerInput(e.target.value))}
                            disabled={!isAdmin || save.isPending}
                          />
                        )}
                      </Field>
                      <Field id="progression-win-rating" label={chrome.win_rating_label}>
                        {winRating == null ? (
                          <ShimmerBlock className="h-10 w-full rounded-md" />
                        ) : (
                          <Input
                            id="progression-win-rating"
                            inputMode="numeric"
                            value={winRating}
                            onChange={(e) =>
                              setWinRating(
                                sanitizeIntegerInput(e.target.value, { allowNegative: true }),
                              )
                            }
                            disabled={!isAdmin || save.isPending}
                          />
                        )}
                      </Field>
                      <Field id="progression-draw-rating" label={chrome.draw_rating_label}>
                        {drawRating == null ? (
                          <ShimmerBlock className="h-10 w-full rounded-md" />
                        ) : (
                          <Input
                            id="progression-draw-rating"
                            inputMode="numeric"
                            value={drawRating}
                            onChange={(e) =>
                              setDrawRating(
                                sanitizeIntegerInput(e.target.value, { allowNegative: true }),
                              )
                            }
                            disabled={!isAdmin || save.isPending}
                          />
                        )}
                      </Field>
                      <Field id="progression-loss-rating" label={chrome.loss_rating_label}>
                        {lossRating == null ? (
                          <ShimmerBlock className="h-10 w-full rounded-md" />
                        ) : (
                          <Input
                            id="progression-loss-rating"
                            inputMode="numeric"
                            value={lossRating}
                            onChange={(e) =>
                              setLossRating(
                                sanitizeIntegerInput(e.target.value, { allowNegative: true }),
                              )
                            }
                            disabled={!isAdmin || save.isPending}
                          />
                        )}
                      </Field>
                      <Field id="progression-rating-floor" label={chrome.rating_floor_label}>
                        {ratingFloor == null ? (
                          <ShimmerBlock className="h-10 w-full rounded-md" />
                        ) : (
                          <Input
                            id="progression-rating-floor"
                            inputMode="numeric"
                            value={ratingFloor}
                            onChange={(e) => setRatingFloor(sanitizeIntegerInput(e.target.value))}
                            disabled={!isAdmin || save.isPending}
                          />
                        )}
                      </Field>
                      <Field id="progression-starting-rating" label={chrome.starting_rating_label}>
                        {startingRating == null ? (
                          <ShimmerBlock className="h-10 w-full rounded-md" />
                        ) : (
                          <Input
                            id="progression-starting-rating"
                            inputMode="numeric"
                            value={startingRating}
                            onChange={(e) =>
                              setStartingRating(sanitizeIntegerInput(e.target.value))
                            }
                            disabled={!isAdmin || save.isPending}
                          />
                        )}
                      </Field>
                    </div>
                  </div>

                  <Field id="progression-clock-enabled" label={chrome.match_clock_enabled_label}>
                    <div className="flex min-h-10 items-center gap-2 pt-1">
                      <Checkbox
                        id="progression-clock-enabled"
                        checked={clockEnabled ?? false}
                        onCheckedChange={(v) => setClockEnabled(v === true)}
                        disabled={!isAdmin || save.isPending || clockEnabled == null}
                      />
                    </div>
                  </Field>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field id="progression-pause-enabled" label={chrome.pause_enabled_label}>
                      <div className="flex min-h-10 items-center gap-2 pt-1">
                        <Checkbox
                          id="progression-pause-enabled"
                          checked={pauseEnabled ?? false}
                          onCheckedChange={(v) => setPauseEnabled(v === true)}
                          disabled={!isAdmin || save.isPending || pauseEnabled == null}
                        />
                      </div>
                    </Field>
                    {pauseDurationSeconds == null ? (
                      <ShimmerBlock className="h-10 w-full rounded-md" />
                    ) : (
                      <Field
                        id="progression-pause-duration"
                        label={chrome.pause_duration_label}
                        description={chrome.pause_duration_blurb}
                        descriptionWrap
                      >
                        <PauseDurationField
                          id="progression-pause-duration"
                          valueSeconds={pauseDurationSeconds}
                          onChange={setPauseDurationSeconds}
                          disabled={!isAdmin || save.isPending}
                          placeholder={(chrome.pause_duration_placeholder || "").trim()}
                          unitAria={(chrome.pause_duration_unit_aria || "").trim()}
                          secondsLabel={(chrome.pause_duration_seconds_label || "").trim()}
                          minutesLabel={(chrome.pause_duration_minutes_label || "").trim()}
                        />
                      </Field>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field
                      id="progression-initial"
                      label={chrome.initial_seconds_label}
                      description={chrome.initial_seconds_blurb}
                      descriptionWrap
                    >
                      {enabledPresets.length > 0 ? (
                        <Select
                          value={
                            initialSeconds != null && initialSeconds > 0
                              ? String(initialSeconds)
                              : undefined
                          }
                          onValueChange={(next) => {
                            const n = Number(next);
                            setInitialSeconds(Number.isFinite(n) && n > 0 ? n : null);
                          }}
                          disabled={!isAdmin || save.isPending || initialSeconds == null}
                        >
                          <SelectTrigger id="progression-initial">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {enabledPresets.map((p) => (
                              <SelectItem key={`${p.seconds}-${p.label}`} value={String(p.seconds)}>
                                {p.label} ({p.seconds}s)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id="progression-initial"
                          type="number"
                          min={1}
                          value={initialSeconds ?? ""}
                          onChange={(e) => {
                            const digits = sanitizeIntegerInput(e.target.value);
                            setInitialSeconds(digits === "" ? null : Number(digits));
                          }}
                          inputMode="numeric"
                          disabled={!isAdmin || save.isPending || initialSeconds == null}
                        />
                      )}
                    </Field>
                    <Field id="progression-increment" label={chrome.increment_seconds_label}>
                      <Input
                        id="progression-increment"
                        type="number"
                        min={0}
                        value={incrementSeconds ?? ""}
                        onChange={(e) => {
                          const digits = sanitizeIntegerInput(e.target.value);
                          setIncrementSeconds(digits === "" ? null : Number(digits));
                        }}
                        inputMode="numeric"
                        disabled={!isAdmin || save.isPending || incrementSeconds == null}
                      />
                    </Field>
                    <Field id="progression-invite-ttl" label={chrome.invite_ttl_seconds_label}>
                      <Input
                        id="progression-invite-ttl"
                        type="number"
                        min={1}
                        value={inviteTtlSeconds ?? ""}
                        onChange={(e) => {
                          const digits = sanitizeIntegerInput(e.target.value);
                          setInviteTtlSeconds(digits === "" ? null : Number(digits));
                        }}
                        inputMode="numeric"
                        disabled={!isAdmin || save.isPending || inviteTtlSeconds == null}
                      />
                    </Field>
                    <Field id="progression-unit-cost" label={chrome.unit_cost_label}>
                      <AmountInput
                        id="progression-unit-cost"
                        value={unitCost == null ? "" : String(unitCost)}
                        onValueChange={(next) => {
                          setUnitCost(next === "" ? null : Number(next));
                        }}
                        disabled={!isAdmin || save.isPending || unitCost == null}
                        maxDecimals={4}
                      />
                    </Field>
                  </div>

                  <div className="space-y-3 border-t border-[var(--dama-border)] pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--dama-text)]">
                          {chrome.match_clock_presets_label}
                        </h3>
                        {(chrome.match_clock_presets_blurb || "").trim() ? (
                          <p className="mt-1 text-sm text-[var(--dama-muted)]">
                            {chrome.match_clock_presets_blurb}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="gold"
                        disabled={!isAdmin || save.isPending}
                        onClick={() => tcDialog.openWith({ kind: "create" })}
                      >
                        {chrome.tc_preset_add_action}
                      </Button>
                    </div>
                    <AdminFilterBar
                      filters={[
                        {
                          kind: "search",
                          id: "admin-tc-preset-search",
                          label: (chrome.tc_preset_search_label || "").trim(),
                          value: tcSearch,
                          onChange: setTcSearch,
                          placeholder:
                            (chrome.tc_preset_search_placeholder || "").trim() || undefined,
                        },
                      ]}
                    />
                    <OpsDataTable
                      columns={tcColumns}
                      data={filteredTcRows}
                      getRowId={(row) => row.id}
                      empty={
                        <p className="py-6 text-center text-sm text-[var(--dama-muted)]">
                          {chrome.tc_preset_empty}
                        </p>
                      }
                    />
                  </div>

                  <div className="space-y-3 border-t border-[var(--dama-border)] pt-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--dama-text)]">
                        {chrome.campaign_create_fees_section_title}
                      </h3>
                      {currencyQuery.isLoading ? (
                        <ShimmerBlock className="mt-1 h-4 w-full max-w-xl rounded-md" />
                      ) : (
                        <p className="mt-1 text-sm text-[var(--dama-muted)]">{geoBlurb}</p>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field
                        id="progression-create-fee-ethiopia"
                        label={chrome.campaign_create_fee_ethiopia_label}
                      >
                        <AmountInput
                          id="progression-create-fee-ethiopia"
                          value={
                            ethiopiaCreateFeeAmount == null ? "" : String(ethiopiaCreateFeeAmount)
                          }
                          onValueChange={(next) => {
                            setEthiopiaCreateFeeAmount(next === "" ? null : Number(next));
                          }}
                          disabled={!isAdmin || save.isPending || ethiopiaCreateFeeAmount == null}
                          maxDecimals={2}
                        />
                      </Field>
                      <Field
                        id="progression-create-fee-ethiopia-currency"
                        label={chrome.campaign_create_fee_ethiopia_currency_label}
                      >
                        {currencyQuery.isLoading ? (
                          <ShimmerBlock className="h-10 w-full rounded-md" />
                        ) : (
                          <p className="rounded-md border border-[var(--dama-border)] bg-[var(--dama-surface)] px-3 py-2 text-sm text-[var(--dama-muted)]">
                            {ethiopiaCur || emptyChrome}
                          </p>
                        )}
                      </Field>
                      <Field
                        id="progression-create-fee-global"
                        label={chrome.campaign_create_fee_global_label}
                      >
                        <AmountInput
                          id="progression-create-fee-global"
                          value={globalCreateFeeAmount == null ? "" : String(globalCreateFeeAmount)}
                          onValueChange={(next) => {
                            setGlobalCreateFeeAmount(next === "" ? null : Number(next));
                          }}
                          disabled={!isAdmin || save.isPending || globalCreateFeeAmount == null}
                          maxDecimals={2}
                        />
                      </Field>
                      <Field
                        id="progression-create-fee-global-currency"
                        label={chrome.campaign_create_fee_global_currency_label}
                      >
                        {currencyQuery.isLoading ? (
                          <ShimmerBlock className="h-10 w-full rounded-md" />
                        ) : (
                          <p className="rounded-md border border-[var(--dama-border)] bg-[var(--dama-surface)] px-3 py-2 text-sm text-[var(--dama-muted)]">
                            {globalCur || emptyChrome}
                          </p>
                        )}
                      </Field>
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-[var(--dama-border)] pt-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--dama-text)]">
                        {chrome.marketplace_section_title}
                      </h3>
                      {(chrome.marketplace_section_blurb || "").trim() ? (
                        <p className="mt-1 text-sm text-[var(--dama-muted)]">
                          {chrome.marketplace_section_blurb}
                        </p>
                      ) : null}
                    </div>

                    {!marketplaceHydrated ? (
                      <ShimmerBlock className="h-32 w-full rounded-md" />
                    ) : (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <Field
                            id="progression-marketplace-enabled"
                            label={chrome.marketplace_enabled_label}
                          >
                            <div className="flex min-h-10 items-center gap-2 pt-1">
                              <Checkbox
                                id="progression-marketplace-enabled"
                                checked={marketplaceEnabled === true}
                                onCheckedChange={(v) => setMarketplaceEnabled(v === true)}
                                disabled={!isAdmin || save.isPending}
                              />
                            </div>
                          </Field>
                          <Field
                            id="progression-auction-enabled"
                            label={chrome.auction_enabled_label}
                          >
                            <div className="flex min-h-10 items-center gap-2 pt-1">
                              <Checkbox
                                id="progression-auction-enabled"
                                checked={auctionEnabled === true}
                                onCheckedChange={(v) => setAuctionEnabled(v === true)}
                                disabled={!isAdmin || save.isPending}
                              />
                            </div>
                          </Field>
                          <Field
                            id="progression-reservation-enabled"
                            label={chrome.reservation_enabled_label}
                          >
                            <div className="flex min-h-10 items-center gap-2 pt-1">
                              <Checkbox
                                id="progression-reservation-enabled"
                                checked={reservationEnabled === true}
                                onCheckedChange={(v) => setReservationEnabled(v === true)}
                                disabled={!isAdmin || save.isPending}
                              />
                            </div>
                          </Field>
                          <Field
                            id="progression-dynamic-floor-enabled"
                            label={chrome.dynamic_floor_enabled_label}
                          >
                            <div className="flex min-h-10 items-center gap-2 pt-1">
                              <Checkbox
                                id="progression-dynamic-floor-enabled"
                                checked={dynamicFloorEnabled === true}
                                onCheckedChange={(v) => setDynamicFloorEnabled(v === true)}
                                disabled={!isAdmin || save.isPending}
                              />
                            </div>
                          </Field>
                          <Field
                            id="progression-agency-enabled"
                            label={chrome.agency_enabled_label}
                          >
                            <div className="flex min-h-10 items-center gap-2 pt-1">
                              <Checkbox
                                id="progression-agency-enabled"
                                checked={agencyEnabled === true}
                                onCheckedChange={(v) => setAgencyEnabled(v === true)}
                                disabled={!isAdmin || save.isPending}
                              />
                            </div>
                          </Field>
                          <Field
                            id="progression-impression-wallet-settle"
                            label={chrome.impression_wallet_settle_label}
                            description={chrome.impression_wallet_settle_blurb}
                            descriptionWrap
                          >
                            <div className="flex min-h-10 items-center gap-2 pt-1">
                              <Checkbox
                                id="progression-impression-wallet-settle"
                                checked={impressionWalletSettleEnabled === true}
                                onCheckedChange={(v) =>
                                  setImpressionWalletSettleEnabled(v === true)
                                }
                                disabled={!isAdmin || save.isPending}
                              />
                            </div>
                          </Field>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <Field
                            id="progression-default-buying-type"
                            label={chrome.default_buying_type_label}
                          >
                            <Select
                              value={defaultBuyingType || undefined}
                              onValueChange={setDefaultBuyingType}
                              disabled={!isAdmin || save.isPending}
                            >
                              <SelectTrigger id="progression-default-buying-type">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(marketplaceEnabled === true
                                  ? MARKETPLACE_BUYING_TYPE_OPTIONS
                                  : BUYING_TYPE_OPTIONS
                                ).map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field id="progression-floor-cpm" label={chrome.floor_cpm_label}>
                            <AmountInput
                              id="progression-floor-cpm"
                              value={floorCpm == null ? "" : String(floorCpm)}
                              onValueChange={(next) => {
                                setFloorCpm(next === "" ? null : Number(next));
                              }}
                              disabled={!isAdmin || save.isPending || floorCpm == null}
                              maxDecimals={4}
                            />
                          </Field>
                          <Field
                            id="progression-floor-cpm-ethiopia"
                            label={chrome.floor_cpm_ethiopia_label}
                            description={
                              (chrome.floor_cpm_ethiopia_blurb || "").trim() || undefined
                            }
                          >
                            <AmountInput
                              id="progression-floor-cpm-ethiopia"
                              value={floorCpmEthiopia == null ? "" : String(floorCpmEthiopia)}
                              onValueChange={(next) => {
                                setFloorCpmEthiopia(next === "" ? null : Number(next));
                              }}
                              disabled={!isAdmin || save.isPending || floorCpmEthiopia == null}
                              maxDecimals={4}
                            />
                          </Field>
                          <Field
                            id="progression-floor-cpm-global"
                            label={chrome.floor_cpm_global_label}
                            description={(chrome.floor_cpm_global_blurb || "").trim() || undefined}
                          >
                            <AmountInput
                              id="progression-floor-cpm-global"
                              value={floorCpmGlobal == null ? "" : String(floorCpmGlobal)}
                              onValueChange={(next) => {
                                setFloorCpmGlobal(next === "" ? null : Number(next));
                              }}
                              disabled={!isAdmin || save.isPending || floorCpmGlobal == null}
                              maxDecimals={4}
                            />
                          </Field>
                          <Field
                            id="progression-placement-lobby"
                            label={chrome.placement_lobby_multiplier_label}
                          >
                            <AmountInput
                              id="progression-placement-lobby"
                              value={
                                placementLobbyMultiplier == null
                                  ? ""
                                  : String(placementLobbyMultiplier)
                              }
                              onValueChange={(next) => {
                                setPlacementLobbyMultiplier(next === "" ? null : Number(next));
                              }}
                              disabled={
                                !isAdmin || save.isPending || placementLobbyMultiplier == null
                              }
                              maxDecimals={4}
                            />
                          </Field>
                          <Field
                            id="progression-placement-in-match"
                            label={chrome.placement_in_match_multiplier_label}
                          >
                            <AmountInput
                              id="progression-placement-in-match"
                              value={
                                placementInMatchMultiplier == null
                                  ? ""
                                  : String(placementInMatchMultiplier)
                              }
                              onValueChange={(next) => {
                                setPlacementInMatchMultiplier(next === "" ? null : Number(next));
                              }}
                              disabled={
                                !isAdmin || save.isPending || placementInMatchMultiplier == null
                              }
                              maxDecimals={4}
                            />
                          </Field>
                          <Field
                            id="progression-viewport-desktop"
                            label={chrome.viewport_desktop_multiplier_label}
                          >
                            <AmountInput
                              id="progression-viewport-desktop"
                              value={
                                viewportDesktopMultiplier == null
                                  ? ""
                                  : String(viewportDesktopMultiplier)
                              }
                              onValueChange={(next) => {
                                setViewportDesktopMultiplier(next === "" ? null : Number(next));
                              }}
                              disabled={
                                !isAdmin || save.isPending || viewportDesktopMultiplier == null
                              }
                              maxDecimals={4}
                            />
                          </Field>
                          <Field
                            id="progression-viewport-tablet"
                            label={chrome.viewport_tablet_multiplier_label}
                          >
                            <AmountInput
                              id="progression-viewport-tablet"
                              value={
                                viewportTabletMultiplier == null
                                  ? ""
                                  : String(viewportTabletMultiplier)
                              }
                              onValueChange={(next) => {
                                setViewportTabletMultiplier(next === "" ? null : Number(next));
                              }}
                              disabled={
                                !isAdmin || save.isPending || viewportTabletMultiplier == null
                              }
                              maxDecimals={4}
                            />
                          </Field>
                          <Field
                            id="progression-viewport-mobile"
                            label={chrome.viewport_mobile_multiplier_label}
                          >
                            <AmountInput
                              id="progression-viewport-mobile"
                              value={
                                viewportMobileMultiplier == null
                                  ? ""
                                  : String(viewportMobileMultiplier)
                              }
                              onValueChange={(next) => {
                                setViewportMobileMultiplier(next === "" ? null : Number(next));
                              }}
                              disabled={
                                !isAdmin || save.isPending || viewportMobileMultiplier == null
                              }
                              maxDecimals={4}
                            />
                          </Field>
                          <Field
                            id="progression-peak-hour-mult"
                            label={chrome.peak_hour_multiplier_label}
                          >
                            <AmountInput
                              id="progression-peak-hour-mult"
                              value={peakHourMultiplier == null ? "" : String(peakHourMultiplier)}
                              onValueChange={(next) => {
                                setPeakHourMultiplier(next === "" ? null : Number(next));
                              }}
                              disabled={!isAdmin || save.isPending || peakHourMultiplier == null}
                              maxDecimals={4}
                            />
                          </Field>
                          <Field
                            id="progression-peak-hours-utc"
                            label={chrome.peak_hours_utc_label}
                          >
                            <div className="flex gap-2">
                              <Input
                                id="progression-peak-hours-start"
                                type="number"
                                min={0}
                                max={23}
                                inputMode="numeric"
                                value={peakHoursUtcStart ?? ""}
                                onChange={(e) => {
                                  const digits = sanitizeIntegerInput(e.target.value);
                                  setPeakHoursUtcStart(digits === "" ? null : Number(digits));
                                }}
                                disabled={!isAdmin || save.isPending || peakHoursUtcStart == null}
                                aria-label={chrome.peak_hours_utc_label}
                              />
                              <Input
                                id="progression-peak-hours-end"
                                type="number"
                                min={0}
                                max={23}
                                inputMode="numeric"
                                value={peakHoursUtcEnd ?? ""}
                                onChange={(e) => {
                                  const digits = sanitizeIntegerInput(e.target.value);
                                  setPeakHoursUtcEnd(digits === "" ? null : Number(digits));
                                }}
                                disabled={!isAdmin || save.isPending || peakHoursUtcEnd == null}
                                aria-label={chrome.peak_hours_utc_label}
                              />
                            </div>
                          </Field>
                          <Field
                            id="progression-dynamic-floor-fill"
                            label={chrome.dynamic_floor_fill_pct_label}
                          >
                            <AmountInput
                              id="progression-dynamic-floor-fill"
                              value={dynamicFloorFillPct == null ? "" : String(dynamicFloorFillPct)}
                              onValueChange={(next) => {
                                setDynamicFloorFillPct(next === "" ? null : Number(next));
                              }}
                              disabled={!isAdmin || save.isPending || dynamicFloorFillPct == null}
                              maxDecimals={2}
                            />
                          </Field>
                          <Field
                            id="progression-dynamic-floor-boost"
                            label={chrome.dynamic_floor_boost_label}
                          >
                            <AmountInput
                              id="progression-dynamic-floor-boost"
                              value={dynamicFloorBoost == null ? "" : String(dynamicFloorBoost)}
                              onValueChange={(next) => {
                                setDynamicFloorBoost(next === "" ? null : Number(next));
                              }}
                              disabled={!isAdmin || save.isPending || dynamicFloorBoost == null}
                              maxDecimals={4}
                            />
                          </Field>
                          <Field
                            id="progression-audience-rating-min"
                            label={chrome.audience_high_rating_min_label}
                            description={
                              (chrome.audience_high_rating_min_blurb || "").trim() || undefined
                            }
                          >
                            <AmountInput
                              id="progression-audience-rating-min"
                              value={
                                audienceHighRatingMin == null ? "" : String(audienceHighRatingMin)
                              }
                              onValueChange={(next) => {
                                setAudienceHighRatingMin(next === "" ? null : Number(next));
                              }}
                              disabled={!isAdmin || save.isPending || audienceHighRatingMin == null}
                              maxDecimals={0}
                            />
                          </Field>
                          <Field
                            id="progression-audience-rating-mult"
                            label={chrome.audience_high_rating_multiplier_label}
                            description={
                              (chrome.audience_high_rating_multiplier_blurb || "").trim() ||
                              undefined
                            }
                          >
                            <AmountInput
                              id="progression-audience-rating-mult"
                              value={
                                audienceHighRatingMultiplier == null
                                  ? ""
                                  : String(audienceHighRatingMultiplier)
                              }
                              onValueChange={(next) => {
                                setAudienceHighRatingMultiplier(next === "" ? null : Number(next));
                              }}
                              disabled={
                                !isAdmin || save.isPending || audienceHighRatingMultiplier == null
                              }
                              maxDecimals={4}
                            />
                          </Field>
                          <Field
                            id="progression-agency-spend-pct"
                            label={chrome.agency_spend_percent_label}
                          >
                            <AmountInput
                              id="progression-agency-spend-pct"
                              value={agencySpendPercent == null ? "" : String(agencySpendPercent)}
                              onValueChange={(next) => {
                                setAgencySpendPercent(next === "" ? null : Number(next));
                              }}
                              disabled={!isAdmin || save.isPending || agencySpendPercent == null}
                              maxDecimals={2}
                            />
                          </Field>
                        </div>

                        <div className="space-y-3 border-t border-[var(--dama-border)] pt-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-semibold text-[var(--dama-text)]">
                                {chrome.tiers_section_title}
                              </h4>
                              {(chrome.tiers_section_blurb || "").trim() ? (
                                <p className="mt-1 text-sm text-[var(--dama-muted)]">
                                  {chrome.tiers_section_blurb}
                                </p>
                              ) : null}
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="gold"
                              disabled={!isAdmin || save.isPending}
                              onClick={() => setTiers((prev) => [...prev, emptyAdvertiserTier()])}
                            >
                              {chrome.xp_add_action}
                            </Button>
                          </div>
                          {tiers.length === 0 ? (
                            <p className="text-sm text-[var(--dama-muted)]">{chrome.xp_empty}</p>
                          ) : (
                            <div className="space-y-3">
                              {tiers.map((tier, index) => (
                                <div
                                  key={tier.rowKey}
                                  className="space-y-2 rounded-md border border-[var(--dama-border)] p-3"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-[var(--dama-text)]">
                                      {(tier.label || "").trim() ||
                                        (tier.code || "").trim() ||
                                        (chrome.empty_value || "").trim()}
                                    </p>
                                    {(chrome.xp_delete_action || "").trim() ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="destructive"
                                        disabled={!isAdmin || save.isPending}
                                        onClick={() =>
                                          setTiers((prev) => prev.filter((_, i) => i !== index))
                                        }
                                      >
                                        {(chrome.xp_delete_action || "").trim()}
                                      </Button>
                                    ) : null}
                                  </div>
                                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                    <Field
                                      id={`tier-code-${index}`}
                                      label={(chrome.tier_code_label || "").trim()}
                                    >
                                      <Input
                                        id={`tier-code-${index}`}
                                        value={tier.code}
                                        onChange={(e) =>
                                          setTiers((prev) =>
                                            prev.map((row, i) =>
                                              i === index
                                                ? {
                                                    ...row,
                                                    code: e.target.value.trim().toLowerCase(),
                                                  }
                                                : row,
                                            ),
                                          )
                                        }
                                        disabled={!isAdmin || save.isPending}
                                      />
                                    </Field>
                                    <Field
                                      id={`tier-label-${index}`}
                                      label={(chrome.tier_label_label || "").trim()}
                                    >
                                      <Input
                                        id={`tier-label-${index}`}
                                        value={tier.label}
                                        onChange={(e) =>
                                          setTiers((prev) =>
                                            prev.map((row, i) =>
                                              i === index ? { ...row, label: e.target.value } : row,
                                            ),
                                          )
                                        }
                                        disabled={!isAdmin || save.isPending}
                                      />
                                    </Field>
                                    <Field
                                      id={`tier-blurb-${index}`}
                                      label={(chrome.tiers_section_blurb || "").trim()}
                                    >
                                      <Input
                                        id={`tier-blurb-${index}`}
                                        value={tier.blurb || ""}
                                        onChange={(e) =>
                                          setTiers((prev) =>
                                            prev.map((row, i) =>
                                              i === index ? { ...row, blurb: e.target.value } : row,
                                            ),
                                          )
                                        }
                                        disabled={!isAdmin || save.isPending}
                                      />
                                    </Field>
                                    <Field
                                      id={`tier-monthly-min-${index}`}
                                      label={(chrome.tier_monthly_spend_min_label || "").trim()}
                                    >
                                      <AmountInput
                                        id={`tier-monthly-min-${index}`}
                                        value={String(tier.monthly_spend_min)}
                                        onValueChange={(next) => {
                                          const n = next === "" ? 0 : Number(next);
                                          setTiers((prev) =>
                                            prev.map((row, i) =>
                                              i === index ? { ...row, monthly_spend_min: n } : row,
                                            ),
                                          );
                                        }}
                                        disabled={!isAdmin || save.isPending}
                                        maxDecimals={2}
                                      />
                                    </Field>
                                    <Field
                                      id={`tier-create-fee-mult-${index}`}
                                      label={(chrome.tier_create_fee_multiplier_label || "").trim()}
                                    >
                                      <AmountInput
                                        id={`tier-create-fee-mult-${index}`}
                                        value={String(tier.create_fee_multiplier)}
                                        onValueChange={(next) => {
                                          const n = next === "" ? 0 : Number(next);
                                          setTiers((prev) =>
                                            prev.map((row, i) =>
                                              i === index
                                                ? { ...row, create_fee_multiplier: n }
                                                : row,
                                            ),
                                          );
                                        }}
                                        disabled={!isAdmin || save.isPending}
                                        maxDecimals={4}
                                      />
                                    </Field>
                                    <Field
                                      id={`tier-media-daily-${index}`}
                                      label={(chrome.tier_media_daily_min_label || "").trim()}
                                    >
                                      <AmountInput
                                        id={`tier-media-daily-${index}`}
                                        value={String(tier.media_daily_min)}
                                        onValueChange={(next) => {
                                          const n = next === "" ? 0 : Number(next);
                                          setTiers((prev) =>
                                            prev.map((row, i) =>
                                              i === index ? { ...row, media_daily_min: n } : row,
                                            ),
                                          );
                                        }}
                                        disabled={!isAdmin || save.isPending}
                                        maxDecimals={2}
                                      />
                                    </Field>
                                    <Field
                                      id={`tier-list-cpm-mult-${index}`}
                                      label={(chrome.tier_list_cpm_multiplier_label || "").trim()}
                                    >
                                      <AmountInput
                                        id={`tier-list-cpm-mult-${index}`}
                                        value={String(tier.list_cpm_multiplier)}
                                        onValueChange={(next) => {
                                          const n = next === "" ? 0 : Number(next);
                                          setTiers((prev) =>
                                            prev.map((row, i) =>
                                              i === index
                                                ? { ...row, list_cpm_multiplier: n }
                                                : row,
                                            ),
                                          );
                                        }}
                                        disabled={!isAdmin || save.isPending}
                                        maxDecimals={4}
                                      />
                                    </Field>
                                    <Field
                                      id={`tier-unlock-reservation-${index}`}
                                      label={chrome.tier_unlock_reservation_label}
                                    >
                                      <div className="flex min-h-10 items-center gap-2 pt-1">
                                        <Checkbox
                                          id={`tier-unlock-reservation-${index}`}
                                          checked={tier.unlock_reservation}
                                          onCheckedChange={(v) =>
                                            setTiers((prev) =>
                                              prev.map((row, i) =>
                                                i === index
                                                  ? { ...row, unlock_reservation: v === true }
                                                  : row,
                                              ),
                                            )
                                          }
                                          disabled={!isAdmin || save.isPending}
                                        />
                                      </div>
                                    </Field>
                                    <Field
                                      id={`tier-unlock-packages-${index}`}
                                      label={chrome.tier_unlock_packages_label}
                                    >
                                      <div className="flex min-h-10 items-center gap-2 pt-1">
                                        <Checkbox
                                          id={`tier-unlock-packages-${index}`}
                                          checked={tier.unlock_packages}
                                          onCheckedChange={(v) =>
                                            setTiers((prev) =>
                                              prev.map((row, i) =>
                                                i === index
                                                  ? { ...row, unlock_packages: v === true }
                                                  : row,
                                              ),
                                            )
                                          }
                                          disabled={!isAdmin || save.isPending}
                                        />
                                      </div>
                                    </Field>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="space-y-3 border-t border-[var(--dama-border)] pt-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-semibold text-[var(--dama-text)]">
                                {chrome.packages_admin_title}
                              </h4>
                              {(chrome.packages_admin_blurb || "").trim() ? (
                                <p className="mt-1 text-sm text-[var(--dama-muted)]">
                                  {chrome.packages_admin_blurb}
                                </p>
                              ) : null}
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="gold"
                              disabled={!isAdmin || save.isPending}
                              onClick={() =>
                                setAdPackages((prev) => [...prev, emptyAdPackage(prev.length)])
                              }
                            >
                              {chrome.xp_add_action}
                            </Button>
                          </div>
                          {adPackages.length === 0 ? (
                            <p className="text-sm text-[var(--dama-muted)]">{chrome.xp_empty}</p>
                          ) : (
                            <div className="space-y-3">
                              {adPackages.map((pkg, index) => (
                                <div
                                  key={pkg.rowKey}
                                  className="space-y-2 rounded-md border border-[var(--dama-border)] p-3"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-[var(--dama-text)]">
                                      {(pkg.title || "").trim() ||
                                        (pkg.code || "").trim() ||
                                        (chrome.empty_value || "").trim()}
                                    </p>
                                    {(chrome.xp_delete_action || "").trim() ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="destructive"
                                        disabled={!isAdmin || save.isPending}
                                        onClick={() =>
                                          setAdPackages((prev) =>
                                            prev.filter((_, i) => i !== index),
                                          )
                                        }
                                      >
                                        {(chrome.xp_delete_action || "").trim()}
                                      </Button>
                                    ) : null}
                                  </div>
                                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                    <Field
                                      id={`pkg-code-${index}`}
                                      label={(chrome.xp_col_label || "").trim()}
                                    >
                                      <Input
                                        id={`pkg-code-${index}`}
                                        value={pkg.code}
                                        onChange={(e) =>
                                          setAdPackages((prev) =>
                                            prev.map((row, i) =>
                                              i === index
                                                ? {
                                                    ...row,
                                                    code: e.target.value.trim().toLowerCase(),
                                                  }
                                                : row,
                                            ),
                                          )
                                        }
                                        disabled={!isAdmin || save.isPending}
                                      />
                                    </Field>
                                    <Field
                                      id={`pkg-title-${index}`}
                                      label={(chrome.xp_label_field || "").trim()}
                                    >
                                      <Input
                                        id={`pkg-title-${index}`}
                                        value={pkg.title}
                                        onChange={(e) =>
                                          setAdPackages((prev) =>
                                            prev.map((row, i) =>
                                              i === index ? { ...row, title: e.target.value } : row,
                                            ),
                                          )
                                        }
                                        disabled={!isAdmin || save.isPending}
                                      />
                                    </Field>
                                    <Field
                                      id={`pkg-blurb-${index}`}
                                      label={(chrome.packages_admin_blurb || "").trim()}
                                    >
                                      <Input
                                        id={`pkg-blurb-${index}`}
                                        value={pkg.blurb || ""}
                                        onChange={(e) =>
                                          setAdPackages((prev) =>
                                            prev.map((row, i) =>
                                              i === index ? { ...row, blurb: e.target.value } : row,
                                            ),
                                          )
                                        }
                                        disabled={!isAdmin || save.isPending}
                                      />
                                    </Field>
                                    <Field
                                      id={`pkg-buying-type-${index}`}
                                      label={chrome.default_buying_type_label}
                                    >
                                      <Select
                                        value={pkg.buying_type || undefined}
                                        onValueChange={(next) =>
                                          setAdPackages((prev) =>
                                            prev.map((row, i) =>
                                              i === index ? { ...row, buying_type: next } : row,
                                            ),
                                          )
                                        }
                                        disabled={!isAdmin || save.isPending}
                                      >
                                        <SelectTrigger id={`pkg-buying-type-${index}`}>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {(marketplaceEnabled === true
                                            ? MARKETPLACE_BUYING_TYPE_OPTIONS
                                            : BUYING_TYPE_OPTIONS
                                          ).map((opt) => (
                                            <SelectItem key={opt} value={opt}>
                                              {opt}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </Field>
                                    <Field
                                      id={`pkg-fixed-cpm-${index}`}
                                      label={chrome.package_fixed_cpm_label}
                                    >
                                      <AmountInput
                                        id={`pkg-fixed-cpm-${index}`}
                                        value={String(pkg.fixed_cpm)}
                                        onValueChange={(next) => {
                                          const n = next === "" ? 0 : Number(next);
                                          setAdPackages((prev) =>
                                            prev.map((row, i) =>
                                              i === index ? { ...row, fixed_cpm: n } : row,
                                            ),
                                          );
                                        }}
                                        disabled={!isAdmin || save.isPending}
                                        maxDecimals={4}
                                      />
                                    </Field>
                                    <Field
                                      id={`pkg-flight-fee-${index}`}
                                      label={chrome.package_flight_fee_label}
                                    >
                                      <AmountInput
                                        id={`pkg-flight-fee-${index}`}
                                        value={String(pkg.flight_fee)}
                                        onValueChange={(next) => {
                                          const n = next === "" ? 0 : Number(next);
                                          setAdPackages((prev) =>
                                            prev.map((row, i) =>
                                              i === index ? { ...row, flight_fee: n } : row,
                                            ),
                                          );
                                        }}
                                        disabled={!isAdmin || save.isPending}
                                        maxDecimals={2}
                                      />
                                    </Field>
                                    <Field
                                      id={`pkg-min-tier-${index}`}
                                      label={chrome.package_min_tier_label}
                                    >
                                      <Input
                                        id={`pkg-min-tier-${index}`}
                                        value={pkg.min_tier}
                                        onChange={(e) =>
                                          setAdPackages((prev) =>
                                            prev.map((row, i) =>
                                              i === index
                                                ? { ...row, min_tier: e.target.value }
                                                : row,
                                            ),
                                          )
                                        }
                                        disabled={!isAdmin || save.isPending}
                                      />
                                    </Field>
                                    <Field
                                      id={`pkg-placement-${index}`}
                                      label={chrome.package_placement_label}
                                    >
                                      <Input
                                        id={`pkg-placement-${index}`}
                                        value={pkg.placement || ""}
                                        onChange={(e) =>
                                          setAdPackages((prev) =>
                                            prev.map((row, i) =>
                                              i === index
                                                ? { ...row, placement: e.target.value }
                                                : row,
                                            ),
                                          )
                                        }
                                        disabled={!isAdmin || save.isPending}
                                      />
                                    </Field>
                                    <Field
                                      id={`pkg-sort-${index}`}
                                      label={(chrome.tc_preset_col_sort || "").trim()}
                                    >
                                      <Input
                                        id={`pkg-sort-${index}`}
                                        inputMode="numeric"
                                        value={String(pkg.sort_order)}
                                        onChange={(e) => {
                                          const digits = sanitizeIntegerInput(e.target.value, {
                                            allowNegative: true,
                                          });
                                          setAdPackages((prev) =>
                                            prev.map((row, i) =>
                                              i === index
                                                ? {
                                                    ...row,
                                                    sort_order: digits === "" ? 0 : Number(digits),
                                                  }
                                                : row,
                                            ),
                                          );
                                        }}
                                        disabled={!isAdmin || save.isPending}
                                      />
                                    </Field>
                                    <Field
                                      id={`pkg-exclusive-${index}`}
                                      label={(chrome.package_exclusive_label || "").trim()}
                                      description={
                                        (chrome.package_exclusive_blurb || "").trim() || undefined
                                      }
                                    >
                                      <div className="flex min-h-10 items-center gap-2 pt-1">
                                        <Checkbox
                                          id={`pkg-exclusive-${index}`}
                                          checked={pkg.exclusive === true}
                                          onCheckedChange={(v) =>
                                            setAdPackages((prev) =>
                                              prev.map((row, i) =>
                                                i === index
                                                  ? { ...row, exclusive: v === true }
                                                  : row,
                                              ),
                                            )
                                          }
                                          disabled={!isAdmin || save.isPending}
                                        />
                                      </div>
                                    </Field>
                                    <Field
                                      id={`pkg-exclusive-category-${index}`}
                                      label={(chrome.package_exclusive_category_label || "").trim()}
                                    >
                                      <Input
                                        id={`pkg-exclusive-category-${index}`}
                                        value={pkg.exclusive_category || ""}
                                        onChange={(e) =>
                                          setAdPackages((prev) =>
                                            prev.map((row, i) =>
                                              i === index
                                                ? { ...row, exclusive_category: e.target.value }
                                                : row,
                                            ),
                                          )
                                        }
                                        disabled={
                                          !isAdmin || save.isPending || pkg.exclusive !== true
                                        }
                                      />
                                    </Field>
                                    <Field
                                      id={`pkg-lobby-takeover-${index}`}
                                      label={(chrome.package_lobby_takeover_label || "").trim()}
                                      description={
                                        (chrome.package_lobby_takeover_blurb || "").trim() ||
                                        undefined
                                      }
                                    >
                                      <div className="flex min-h-10 items-center gap-2 pt-1">
                                        <Checkbox
                                          id={`pkg-lobby-takeover-${index}`}
                                          checked={pkg.lobby_takeover === true}
                                          onCheckedChange={(v) =>
                                            setAdPackages((prev) =>
                                              prev.map((row, i) => {
                                                if (i !== index) return row;
                                                if (v !== true) {
                                                  return { ...row, lobby_takeover: false };
                                                }
                                                // Phase C shape: lobby + exclusive reservation.
                                                return {
                                                  ...row,
                                                  lobby_takeover: true,
                                                  placement: "lobby",
                                                  exclusive: true,
                                                  exclusive_category:
                                                    (row.exclusive_category || "").trim() ||
                                                    (row.code || "").trim() ||
                                                    "lobby_takeover",
                                                  buying_type: "reservation",
                                                };
                                              }),
                                            )
                                          }
                                          disabled={!isAdmin || save.isPending}
                                        />
                                      </div>
                                    </Field>
                                    <Field
                                      id={`pkg-enabled-${index}`}
                                      label={(chrome.package_enabled_label || "").trim()}
                                    >
                                      <div className="flex min-h-10 items-center gap-2 pt-1">
                                        <Checkbox
                                          id={`pkg-enabled-${index}`}
                                          checked={pkg.enabled}
                                          onCheckedChange={(v) =>
                                            setAdPackages((prev) =>
                                              prev.map((row, i) =>
                                                i === index ? { ...row, enabled: v === true } : row,
                                              ),
                                            )
                                          }
                                          disabled={!isAdmin || save.isPending}
                                        />
                                      </div>
                                    </Field>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <Field id="progression-web-origin" label={chrome.web_app_origin_label}>
                    <Input
                      id="progression-web-origin"
                      type="url"
                      value={webAppOrigin}
                      onChange={(e) => setWebAppOrigin(e.target.value.trim())}
                      disabled={!isAdmin || save.isPending}
                      autoComplete="url"
                    />
                  </Field>

                  <Button
                    variant="gold"
                    isLoading={save.isPending}
                    pendingLabel={chrome.save_platform_pending}
                    disabled={
                      !isAdmin ||
                      unitCost == null ||
                      ethiopiaCreateFeeAmount == null ||
                      globalCreateFeeAmount == null ||
                      winXp == null ||
                      drawXp == null ||
                      lossXp == null ||
                      winRating == null ||
                      drawRating == null ||
                      lossRating == null ||
                      ratingFloor == null ||
                      startingRating == null ||
                      !marketplaceHydrated
                    }
                    onClick={() => {
                      try {
                        if (!levels.length) {
                          throw new Error((chrome.err_xp_levels_empty || "").trim());
                        }
                        const parseRewardInt = (raw: string | null, allowNegative: boolean) => {
                          if (raw == null) return null;
                          const cleaned = sanitizeIntegerInput(raw, { allowNegative });
                          if (cleaned === "" || cleaned === "-") return null;
                          const n = Number(cleaned);
                          if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
                          return n;
                        };
                        const winXpN = parseRewardInt(winXp, false);
                        const drawXpN = parseRewardInt(drawXp, false);
                        const lossXpN = parseRewardInt(lossXp, false);
                        if (
                          winXpN == null ||
                          drawXpN == null ||
                          lossXpN == null ||
                          winXpN < 0 ||
                          drawXpN < 0 ||
                          lossXpN < 0
                        ) {
                          throw new Error((chrome.err_match_rewards_xp || "").trim());
                        }
                        const winRatingN = parseRewardInt(winRating, true);
                        const drawRatingN = parseRewardInt(drawRating, true);
                        const lossRatingN = parseRewardInt(lossRating, true);
                        if (winRatingN == null || drawRatingN == null || lossRatingN == null) {
                          throw new Error((chrome.err_match_rewards_rating || "").trim());
                        }
                        const ratingFloorN = parseRewardInt(ratingFloor, false);
                        if (ratingFloorN == null || ratingFloorN < 0) {
                          throw new Error((chrome.err_rating_floor || "").trim());
                        }
                        const startingRatingN = parseRewardInt(startingRating, false);
                        if (startingRatingN == null || startingRatingN < ratingFloorN) {
                          throw new Error((chrome.err_starting_rating || "").trim());
                        }
                        if (unitCost == null || !(unitCost > 0)) {
                          throw new Error(chrome.err_unit_cost);
                        }
                        if (
                          ethiopiaCreateFeeAmount == null ||
                          !(ethiopiaCreateFeeAmount > 0) ||
                          !ethiopiaCur ||
                          globalCreateFeeAmount == null ||
                          !(globalCreateFeeAmount > 0) ||
                          !globalCur
                        ) {
                          throw new Error(chrome.err_campaign_create_fee);
                        }
                        if (
                          clockEnabled == null ||
                          initialSeconds == null ||
                          incrementSeconds == null ||
                          inviteTtlSeconds == null ||
                          !(inviteTtlSeconds > 0)
                        ) {
                          throw new Error(chrome.err_clock_values);
                        }
                        if (pauseEnabled == null || pauseDurationSeconds == null) {
                          throw new Error((chrome.err_pause_duration || "").trim());
                        }
                        if (pauseEnabled && !(pauseDurationSeconds > 0)) {
                          throw new Error((chrome.err_pause_duration || "").trim());
                        }
                        if (!enabledPresets.length) {
                          throw new Error((chrome.err_tc_presets_empty || "").trim());
                        }
                        const presetSecs = enabledPresets.map((p) => p.seconds);
                        if (!presetSecs.includes(initialSeconds)) {
                          throw new Error(
                            (chrome.err_clock_initial_not_in_presets || "").trim() ||
                              chrome.err_clock_values,
                          );
                        }
                        const seenSecs = new Set<number>();
                        for (const p of presets) {
                          if (!(p.seconds > 0) || !p.label.trim()) {
                            throw new Error((chrome.err_tc_preset_values || "").trim());
                          }
                          if (seenSecs.has(p.seconds)) {
                            throw new Error((chrome.err_tc_preset_duplicate || "").trim());
                          }
                          seenSecs.add(p.seconds);
                        }
                        const origin = (webAppOrigin || "").trim().replace(/\/$/, "");
                        if (!origin || !/^https?:\/\//i.test(origin)) {
                          throw new Error(chrome.err_web_app_origin);
                        }
                        const multPositive = (n: number | null | undefined) =>
                          typeof n === "number" && Number.isFinite(n) && n > 0;
                        const hourOk = (n: number | null | undefined) =>
                          typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 23;
                        if (marketplaceEnabled === true) {
                          if (
                            !multPositive(floorCpm) ||
                            !multPositive(floorCpmEthiopia) ||
                            !multPositive(floorCpmGlobal) ||
                            !multPositive(placementLobbyMultiplier) ||
                            !multPositive(placementInMatchMultiplier) ||
                            !multPositive(viewportDesktopMultiplier) ||
                            !multPositive(viewportTabletMultiplier) ||
                            !multPositive(viewportMobileMultiplier) ||
                            !multPositive(peakHourMultiplier) ||
                            !hourOk(peakHoursUtcStart) ||
                            !hourOk(peakHoursUtcEnd) ||
                            dynamicFloorFillPct == null ||
                            dynamicFloorFillPct < 0 ||
                            dynamicFloorFillPct > 100 ||
                            !multPositive(dynamicFloorBoost) ||
                            agencySpendPercent == null ||
                            agencySpendPercent < 0 ||
                            !Number.isFinite(agencySpendPercent) ||
                            audienceHighRatingMin == null ||
                            audienceHighRatingMin < 0 ||
                            !Number.isFinite(audienceHighRatingMin) ||
                            !multPositive(audienceHighRatingMultiplier)
                          ) {
                            throw new Error((chrome.err_marketplace_invalid || "").trim());
                          }
                          const tierOk = tiers.some(
                            (t) => t.code.trim().length > 0 && t.label.trim().length > 0,
                          );
                          if (!tierOk) {
                            throw new Error((chrome.err_marketplace_invalid || "").trim());
                          }
                        }
                        const tiersOut = tiers.map((t) => ({
                          code: t.code.trim().toLowerCase(),
                          label: t.label.trim(),
                          blurb: (t.blurb || "").trim() || undefined,
                          monthly_spend_min: t.monthly_spend_min,
                          create_fee_multiplier: t.create_fee_multiplier,
                          media_daily_min: t.media_daily_min,
                          unlock_reservation: t.unlock_reservation,
                          unlock_packages: t.unlock_packages,
                          list_cpm_multiplier: t.list_cpm_multiplier,
                        }));
                        const packagesOut = adPackages.map((p, i) => {
                          const code = p.code.trim().toLowerCase();
                          // Phase C: flag OR seeded code (API Validate matches this).
                          const takeover = p.lobby_takeover === true || code === "lobby_takeover";
                          let buy = (p.buying_type || "").trim();
                          if (!takeover) {
                            buy = (buy || defaultBuyingType || "auction").trim();
                            if (marketplaceEnabled === true && (buy === "legacy" || !buy)) {
                              buy = "reservation";
                            }
                          }
                          // Phase C: save-time coerce for takeover SKUs (flag or code).
                          if (takeover) {
                            buy = "reservation";
                          }
                          const place = takeover
                            ? "lobby"
                            : (p.placement || "").trim() || undefined;
                          const exclusive = takeover ? true : p.exclusive === true;
                          const exclusiveCategory = takeover
                            ? (p.exclusive_category || "").trim() || code || "lobby_takeover"
                            : (p.exclusive_category || "").trim() || undefined;
                          return {
                            code,
                            title: p.title.trim(),
                            blurb: (p.blurb || "").trim() || undefined,
                            buying_type: buy,
                            fixed_cpm: p.fixed_cpm,
                            flight_fee: p.flight_fee,
                            min_tier: p.min_tier.trim(),
                            placement: place,
                            enabled: p.enabled,
                            sort_order: Number.isFinite(p.sort_order) ? p.sort_order : i,
                            exclusive,
                            exclusive_category: exclusiveCategory,
                            lobby_takeover: takeover,
                          };
                        });
                        if (marketplaceEnabled === true) {
                          const badPkg = packagesOut.find(
                            (p) => p.enabled && !(Number(p.fixed_cpm) > 0),
                          );
                          if (badPkg) {
                            throw new Error(
                              (chrome.err_marketplace_invalid || "").trim() ||
                                (chrome.package_fixed_cpm_label || "").trim(),
                            );
                          }
                        }
                        save.mutate({
                          xp_levels: levels,
                          match_rewards: {
                            win_xp: winXpN,
                            draw_xp: drawXpN,
                            loss_xp: lossXpN,
                            win_rating: winRatingN,
                            draw_rating: drawRatingN,
                            loss_rating: lossRatingN,
                            rating_floor: ratingFloorN,
                            starting_rating: startingRatingN,
                          },
                          match_clock: {
                            enabled: clockEnabled,
                            initial_seconds: initialSeconds,
                            increment_seconds: incrementSeconds,
                            invite_ttl_seconds: inviteTtlSeconds,
                            pause_enabled: pauseEnabled,
                            pause_duration_seconds: pauseDurationSeconds,
                            presets: sortTcPresets(presets),
                          },
                          ad_pricing: {
                            impression_unit_cost: unitCost,
                            campaign_create_fee_ethiopia_amount: ethiopiaCreateFeeAmount,
                            campaign_create_fee_ethiopia_currency: ethiopiaCur,
                            campaign_create_fee_global_amount: globalCreateFeeAmount,
                            campaign_create_fee_global_currency: globalCur,
                            marketplace_enabled: marketplaceEnabled === true,
                            auction_enabled: auctionEnabled === true,
                            reservation_enabled: reservationEnabled === true,
                            default_buying_type: (() => {
                              let raw = (defaultBuyingType || "").trim();
                              if (marketplaceEnabled === true) {
                                if (raw === "legacy" || !raw) {
                                  raw =
                                    auctionEnabled === true
                                      ? "auction"
                                      : reservationEnabled === true
                                        ? "reservation"
                                        : "";
                                } else if (raw === "auction" && auctionEnabled !== true) {
                                  raw = reservationEnabled === true ? "reservation" : "";
                                } else if (raw === "reservation" && reservationEnabled !== true) {
                                  raw = auctionEnabled === true ? "auction" : "";
                                }
                                return raw;
                              }
                              return raw || "auction";
                            })(),
                            floor_cpm: floorCpm ?? 0,
                            floor_cpm_ethiopia: floorCpmEthiopia ?? floorCpm ?? 0,
                            floor_cpm_global: floorCpmGlobal ?? floorCpm ?? 0,
                            placement_lobby_multiplier: placementLobbyMultiplier ?? 1,
                            placement_in_match_multiplier: placementInMatchMultiplier ?? 1,
                            viewport_desktop_multiplier: viewportDesktopMultiplier ?? 1,
                            viewport_tablet_multiplier: viewportTabletMultiplier ?? 1,
                            viewport_mobile_multiplier: viewportMobileMultiplier ?? 1,
                            peak_hour_multiplier: peakHourMultiplier ?? 1,
                            peak_hours_utc_start: peakHoursUtcStart ?? 0,
                            peak_hours_utc_end: peakHoursUtcEnd ?? 0,
                            dynamic_floor_enabled: dynamicFloorEnabled === true,
                            dynamic_floor_fill_pct: dynamicFloorFillPct ?? 0,
                            dynamic_floor_boost: dynamicFloorBoost ?? 1,
                            agency_enabled: agencyEnabled === true,
                            agency_spend_percent: agencySpendPercent ?? 0,
                            impression_wallet_settle_enabled:
                              impressionWalletSettleEnabled === true,
                            audience_high_rating_min: audienceHighRatingMin ?? 0,
                            audience_high_rating_multiplier: audienceHighRatingMultiplier ?? 1,
                            tiers: tiersOut,
                          },
                          ad_packages: packagesOut,
                          web_app_origin: origin,
                        });
                      } catch (err) {
                        const msg =
                          (err instanceof Error ? err.message : "").trim() ||
                          (chrome.toast_save_failed || "").trim();
                        if (msg) toast.error(msg);
                      }
                    }}
                  >
                    {chrome.save_platform_action}
                  </Button>
                </>
              )}
            </div>
          ) : null}

          {tab === "board" ? (
            <div className="space-y-4 rounded-xl border border-[var(--dama-border)] bg-[var(--dama-card)] p-5">
              <h2 className="font-semibold text-[var(--dama-gold)]">
                {chrome.board_section_title}
              </h2>
              {boardLoading ? (
                <ProgressionBoardBodySkeleton />
              ) : boardQuery.error || boardSize == null ? (
                <p className="text-sm text-[var(--dama-danger)]">{chrome.board_unavailable}</p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field id="board-size" label={chrome.board_size_label}>
                      <Input
                        id="board-size"
                        type="number"
                        min={1}
                        value={boardSize}
                        onChange={(e) => {
                          const digits = sanitizeIntegerInput(e.target.value);
                          setBoardSize(digits === "" ? 0 : Number(digits));
                        }}
                        inputMode="numeric"
                        disabled={!isAdmin || saveBoard.isPending}
                      />
                    </Field>
                    <Field id="board-pieces" label={chrome.pieces_per_side_label}>
                      <Input
                        id="board-pieces"
                        type="number"
                        min={1}
                        value={piecesPerSide ?? ""}
                        onChange={(e) => {
                          const digits = sanitizeIntegerInput(e.target.value);
                          setPiecesPerSide(digits === "" ? null : Number(digits));
                        }}
                        inputMode="numeric"
                        disabled={!isAdmin || saveBoard.isPending}
                      />
                    </Field>
                    <Field id="board-setup" label={chrome.setup_rows_label}>
                      <Input
                        id="board-setup"
                        type="number"
                        min={1}
                        value={setupRows ?? ""}
                        onChange={(e) => {
                          const digits = sanitizeIntegerInput(e.target.value);
                          setSetupRows(digits === "" ? null : Number(digits));
                        }}
                        inputMode="numeric"
                        disabled={!isAdmin || saveBoard.isPending}
                      />
                    </Field>
                    <Field id="board-variant" label={chrome.variant_label}>
                      <Input
                        id="board-variant"
                        value={boardVariant}
                        onChange={(e) => setBoardVariant(e.target.value)}
                        disabled={!isAdmin || saveBoard.isPending}
                      />
                    </Field>
                  </div>
                  <Button
                    variant="gold"
                    isLoading={saveBoard.isPending}
                    pendingLabel={chrome.save_board_pending}
                    disabled={!isAdmin}
                    onClick={() => {
                      if (
                        boardSize == null ||
                        piecesPerSide == null ||
                        setupRows == null ||
                        !boardVariant.trim()
                      ) {
                        const msg = (chrome.board_fields_required || "").trim();
                        if (msg) toast.error(msg);
                        return;
                      }
                      saveBoard.mutate({
                        size: boardSize,
                        pieces_per_side: piecesPerSide,
                        setup_rows: setupRows,
                        variant: boardVariant.trim(),
                      });
                    }}
                  >
                    {chrome.save_board_action}
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </>
      )}

      <Dialog open={xpDialog.open} onOpenChange={xpDialog.onOpenChange}>
        <DialogContent
          closeLabel={(chrome.xp_dialog_close_label || "").trim()}
          className="max-w-lg sm:max-w-xl"
        >
          <DialogHeader>
            <DialogTitle>{xpFormTitle}</DialogTitle>
            <DialogDescription className="sr-only">{xpFormTitle}</DialogDescription>
          </DialogHeader>
          {xpViewing ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailRow
                label={(chrome.xp_label_field || "").trim()}
                value={levelLabel || (chrome.empty_value || "").trim()}
              />
              <DetailRow
                label={(chrome.xp_min_xp_field || "").trim()}
                value={levelMinXp || (chrome.empty_value || "").trim()}
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="xp-level-label" label={(chrome.xp_label_field || "").trim()}>
                <Input
                  id="xp-level-label"
                  value={levelLabel}
                  onChange={(e) => setLevelLabel(e.target.value)}
                />
              </Field>
              <Field id="xp-level-min" label={(chrome.xp_min_xp_field || "").trim()}>
                <Input
                  id="xp-level-min"
                  inputMode="numeric"
                  value={levelMinXp}
                  onChange={(e) => setLevelMinXp(sanitizeIntegerInput(e.target.value))}
                />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => xpDialog.close()}>
              {xpViewing
                ? (chrome.xp_dialog_close_label || "").trim()
                : (chrome.xp_cancel_action || "").trim()}
            </Button>
            {!xpViewing ? (
              <Button
                type="button"
                variant="gold"
                pendingLabel={(chrome.xp_save_pending || "").trim()}
                disabled={!levelLabel.trim() || levelMinXp.trim() === ""}
                onClick={() => saveXpLevel()}
              >
                {(chrome.xp_save_action || "").trim()}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteIndex != null}
        onOpenChange={(open) => {
          if (!open) setDeleteIndex(null);
        }}
        title={(chrome.xp_delete_action || "").trim()}
        description={(chrome.xp_delete_confirm || "").trim()}
        cancelLabel={(chrome.xp_cancel_action || "").trim()}
        confirmLabel={(chrome.xp_delete_action || "").trim()}
        destructive
        onConfirm={() => {
          if (deleteIndex == null) return;
          setLevels((prev) => prev.filter((_, i) => i !== deleteIndex));
          setDeleteIndex(null);
        }}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => {
          if (!open) setBulkDeleteOpen(false);
        }}
        title={(chrome.xp_delete_action || "").trim()}
        description={(chrome.xp_delete_confirm || "").trim()}
        cancelLabel={(chrome.xp_cancel_action || "").trim()}
        confirmLabel={(chrome.xp_delete_action || "").trim()}
        destructive
        onConfirm={() => {
          const ids = new Set(selectedRowIds(rowSelection));
          if (!ids.size) return;
          setLevels((prev) => prev.filter((l, i) => !ids.has(`xp-${i}-${l.label}-${l.min_xp}`)));
          setRowSelection({});
          setBulkDeleteOpen(false);
        }}
      />

      <Dialog open={tcDialog.open} onOpenChange={tcDialog.onOpenChange}>
        <DialogContent
          closeLabel={(chrome.tc_preset_dialog_close_label || "").trim()}
          className="max-w-lg sm:max-w-xl"
        >
          <DialogHeader>
            <DialogTitle>{tcFormTitle}</DialogTitle>
            <DialogDescription className="sr-only">{tcFormTitle}</DialogDescription>
          </DialogHeader>
          {tcViewing ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailRow
                label={(chrome.tc_preset_label_field || "").trim()}
                value={presetLabel || (chrome.empty_value || "").trim()}
              />
              <DetailRow
                label={(chrome.tc_preset_seconds_field || "").trim()}
                value={presetSeconds || (chrome.empty_value || "").trim()}
              />
              <DetailRow
                label={(chrome.tc_preset_enabled_field || "").trim()}
                value={
                  presetEnabled
                    ? (chrome.tc_preset_enable_action || "").trim()
                    : (chrome.tc_preset_disable_action || "").trim()
                }
              />
              <DetailRow
                label={(chrome.tc_preset_sort_field || "").trim()}
                value={presetSortOrder || (chrome.empty_value || "").trim()}
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="tc-preset-label" label={(chrome.tc_preset_label_field || "").trim()}>
                <Input
                  id="tc-preset-label"
                  value={presetLabel}
                  onChange={(e) => setPresetLabel(e.target.value)}
                />
              </Field>
              <Field id="tc-preset-seconds" label={(chrome.tc_preset_seconds_field || "").trim()}>
                <Input
                  id="tc-preset-seconds"
                  inputMode="numeric"
                  value={presetSeconds}
                  onChange={(e) => setPresetSeconds(sanitizeIntegerInput(e.target.value))}
                />
              </Field>
              <Field id="tc-preset-sort" label={(chrome.tc_preset_sort_field || "").trim()}>
                <Input
                  id="tc-preset-sort"
                  inputMode="numeric"
                  value={presetSortOrder}
                  onChange={(e) =>
                    setPresetSortOrder(
                      sanitizeIntegerInput(e.target.value, { allowNegative: true }),
                    )
                  }
                />
              </Field>
              <Field id="tc-preset-enabled" label={(chrome.tc_preset_enabled_field || "").trim()}>
                <div className="flex min-h-10 items-center gap-2 pt-1">
                  <Checkbox
                    id="tc-preset-enabled"
                    checked={presetEnabled}
                    onCheckedChange={(v) => setPresetEnabled(v === true)}
                  />
                </div>
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => tcDialog.close()}>
              {tcViewing
                ? (chrome.tc_preset_dialog_close_label || "").trim()
                : (chrome.tc_preset_cancel_action || "").trim()}
            </Button>
            {!tcViewing ? (
              <Button
                type="button"
                variant="gold"
                pendingLabel={(chrome.tc_preset_save_pending || "").trim()}
                disabled={!presetLabel.trim() || presetSeconds.trim() === ""}
                onClick={() => saveTcPreset()}
              >
                {(chrome.tc_preset_save_action || "").trim()}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={disablePresetIndex != null}
        onOpenChange={(open) => {
          if (!open) setDisablePresetIndex(null);
        }}
        title={(chrome.tc_preset_disable_action || "").trim()}
        description={(chrome.tc_preset_disable_confirm || "").trim()}
        cancelLabel={(chrome.tc_preset_cancel_action || "").trim()}
        confirmLabel={(chrome.tc_preset_disable_action || "").trim()}
        destructive
        onConfirm={() => {
          if (disablePresetIndex == null) return;
          const idx = disablePresetIndex;
          const target = presets[idx];
          if (!target) {
            setDisablePresetIndex(null);
            return;
          }
          const enabledCount = presets.filter((p, i) => i !== idx && p.enabled).length;
          if (enabledCount < 1) {
            const msg = (chrome.err_tc_preset_disable_last || "").trim();
            if (msg) toast.error(msg);
            setDisablePresetIndex(null);
            return;
          }
          if (initialSeconds != null && target.seconds === initialSeconds) {
            const msg = (chrome.err_tc_preset_disable_default || "").trim();
            if (msg) toast.error(msg);
            setDisablePresetIndex(null);
            return;
          }
          setPresets((prev) =>
            sortTcPresets(prev.map((p, i) => (i === idx ? { ...p, enabled: false } : p))),
          );
          setDisablePresetIndex(null);
        }}
      />
    </div>
  );
}
