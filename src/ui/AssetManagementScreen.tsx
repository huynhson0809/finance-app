import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  GripVertical,
  Info,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  AssetAccount,
  AssetAccountKind,
  AssetRate,
  AssetRatePair,
  AssetSummary,
  GoldUnit,
} from "../assets/types";
import { valueAssetAccountVnd } from "../assets/valuation";
import {
  useAssetAccounts,
  useAssetRates,
  useAssetSummary,
  useClearAssetRateOverride,
  useRefreshAssetRates,
  useSaveAssetRateOverride,
} from "../hooks/useAssets";
import { errorMessage } from "../lib/error";
import { formatVND } from "../lib/money";
import { invalidateAssetQueries } from "../query/client";
import {
  deleteCloudAssetAccount,
  reorderCloudAssetAccounts,
  upsertCloudAssetAccount,
} from "../supabase/assets";
import { supabase } from "../supabase/client";
import type { AssetRateRefreshResult } from "../supabase/rates";
import {
  AssetAccountForm,
  type AssetAccountFormValues,
} from "./components/AssetAccountForm";
import { GlassPanel } from "./components/primitives";

type EditingState =
  | { mode: "new" }
  | { mode: "edit"; account: AssetAccount }
  | null;

interface AccountGroup {
  title: string;
  kinds: AssetAccountKind[];
}

interface RatePairConfig {
  pair: AssetRatePair;
  title: string;
  unitLabel: string;
  inputLabel: string;
  placeholder: string;
}

interface RateFeedback {
  tone: "success" | "warning" | "error";
  message: string;
}

const ACCOUNT_GROUPS: AccountGroup[] = [
  { title: "groupCashBank", kinds: ["cash", "bank"] },
  { title: "groupCreditCard", kinds: ["credit_card"] },
  { title: "groupSavings", kinds: ["savings"] },
  { title: "groupGoldFx", kinds: ["gold", "foreign_currency"] },
];
const RATE_PAIR_CONFIGS: readonly RatePairConfig[] = [
  {
    pair: "USD_VND",
    title: "rateUsdTitle",
    unitLabel: "rateUsdUnit",
    inputLabel: "rateManualUsd",
    placeholder: "ratePlaceholderUsd",
  },
  {
    pair: "GOLD_GRAM_VND",
    title: "rateGoldTitle",
    unitLabel: "rateGoldUnit",
    inputLabel: "rateManualGold",
    placeholder: "ratePlaceholderGold",
  },
];
const EMPTY_ASSET_ACCOUNTS: AssetAccount[] = [];
const EMPTY_ASSET_RATES: AssetRate[] = [];

const NUMBER_FORMAT = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 4,
});
const RATE_FETCHED_AT_FORMAT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function zeroSummary(): AssetSummary {
  return {
    totalAssetsVnd: 0,
    liquidVnd: 0,
    savingsVnd: 0,
    liabilityVnd: 0,
    byAccount: [],
  };
}

const KIND_KEYS: Record<AssetAccountKind, string> = {
  cash: "assets.kindCash",
  bank: "assets.kindBank",
  credit_card: "assets.kindCreditCard",
  savings: "assets.kindSavings",
  gold: "assets.kindGold",
  foreign_currency: "assets.kindForeignCurrency",
};

const GOLD_UNIT_KEYS: Record<GoldUnit, string> = {
  gram: "gram",
  chi: "assets.goldUnitChi",
  luong: "assets.goldUnitLuong",
};

function nativeAmountLabel(
  account: AssetAccount,
  translate: (key: string) => string,
): string {
  if (account.kind === "gold") {
    const unit = account.goldUnit ?? "gram";
    const unitLabel =
      unit === "gram" ? "gram" : translate(GOLD_UNIT_KEYS[unit]);
    return `${NUMBER_FORMAT.format(account.quantity ?? 0)} ${unitLabel}`;
  }

  if (account.kind === "foreign_currency") {
    return `${NUMBER_FORMAT.format(account.balance)} ${account.currency}`;
  }

  if (account.currency === "USD") {
    return `${NUMBER_FORMAT.format(account.balance)} USD`;
  }

  return formatVND(account.balance, "vi");
}

function formatLiability(amount: number): string {
  if (amount <= 0) return formatVND(0, "vi");
  return `-${formatVND(amount, "vi")}`;
}

function formatRateValue(value: number): string {
  return `${NUMBER_FORMAT.format(value)} ₫`;
}

function formatRateFetchedAt(fetchedAt: string): string {
  const date = new Date(fetchedAt);
  if (Number.isNaN(date.getTime())) return "—";
  return RATE_FETCHED_AT_FORMAT.format(date);
}

function parseGroupedInteger(
  value: string,
  separator: "." | ",",
): string | null {
  const groups = value.split(separator);
  if (groups.length === 1) return /^\d+$/.test(value) ? value : null;
  if (!/^\d{1,3}$/.test(groups[0] ?? "")) return null;
  if (!groups.slice(1).every((group) => /^\d{3}$/.test(group))) return null;
  return groups.join("");
}

function parseVietnameseRateInput(raw: string): number {
  const compact = raw.trim().replace(/[\s\u00a0\u202f]/g, "");
  if (!/^\+?\d+(?:[.,]\d+)*$/.test(compact)) return Number.NaN;

  const value = compact.startsWith("+") ? compact.slice(1) : compact;
  const lastDot = value.lastIndexOf(".");
  const lastComma = value.lastIndexOf(",");
  let normalized: string | null = null;

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    if (value.split(decimalSeparator).length !== 2) return Number.NaN;

    const [integerPart = "", fractionPart = ""] = value.split(decimalSeparator);
    const integerDigits = parseGroupedInteger(integerPart, groupingSeparator);
    if (!integerDigits || !/^\d+$/.test(fractionPart)) return Number.NaN;
    normalized = `${integerDigits}.${fractionPart}`;
  } else if (lastComma >= 0) {
    const commaParts = value.split(",");
    if (commaParts.length > 2) {
      normalized = parseGroupedInteger(value, ",");
    } else {
      const [integerPart = "", fractionPart = ""] = commaParts;
      if (/^\d+$/.test(integerPart) && /^\d+$/.test(fractionPart)) {
        normalized = `${integerPart}.${fractionPart}`;
      }
    }
  } else if (lastDot >= 0) {
    const dotParts = value.split(".");
    if (dotParts.length > 2) {
      normalized = parseGroupedInteger(value, ".");
    } else {
      const [integerPart = "", fractionPart = ""] = dotParts;
      if (/^\d{1,3}$/.test(integerPart) && /^\d{3}$/.test(fractionPart)) {
        normalized = `${integerPart}${fractionPart}`;
      } else if (/^\d+$/.test(integerPart) && /^\d+$/.test(fractionPart)) {
        normalized = `${integerPart}.${fractionPart}`;
      }
    }
  } else {
    normalized = value;
  }

  if (!normalized) return Number.NaN;
  return Number(normalized);
}

function ratePairTitle(
  pair: AssetRatePair,
  t: (key: string) => string,
): string {
  const config = RATE_PAIR_CONFIGS.find((c) => c.pair === pair);
  return config ? t(`assets.${config.title}`) : pair;
}

function refreshRateFeedback(
  result: AssetRateRefreshResult,
  t: (key: string) => string,
): RateFeedback {
  const entries = RATE_PAIR_CONFIGS.map((config) => ({
    title: t(`assets.${config.title}`),
    outcome: result.outcomes[config.pair],
  }));
  const refreshed = entries.filter((entry) => entry.outcome === "refreshed");
  const cached = entries.filter((entry) => entry.outcome === "cached");
  const unavailable = entries.filter(
    (entry) => entry.outcome === "unavailable",
  );
  const titles = (items: typeof entries) =>
    items.map((item) => item.title).join(" & ");

  if (refreshed.length === entries.length) {
    return { tone: "success", message: t("assets.rateRefreshSuccess") };
  }
  if (cached.length === entries.length) {
    return {
      tone: "success",
      message: t("assets.rateRefreshCached"),
    };
  }
  if (unavailable.length === entries.length) {
    return { tone: "error", message: t("assets.rateRefreshUnavailable") };
  }
  if (unavailable.length > 0) {
    const availableMessage =
      refreshed.length > 0
        ? `${t("assets.rateRefreshSuccess")} (${titles(refreshed)})`
        : t("assets.rateRefreshCached");
    return {
      tone: "warning",
      message: availableMessage,
    };
  }

  return {
    tone: "success",
    message: t("assets.rateRefreshSuccess"),
  };
}

function sameAccountOrder(
  left: readonly AssetAccount[],
  right: readonly AssetAccount[],
): boolean {
  return (
    left.length === right.length &&
    left.every((account, index) => account.id === right[index]?.id)
  );
}

function moveAccountNear(
  accounts: readonly AssetAccount[],
  movingId: string,
  targetId: string,
): AssetAccount[] {
  const moving = accounts.find((account) => account.id === movingId);
  const target = accounts.find((account) => account.id === targetId);
  if (!moving || !target || moving.id === target.id) return [...accounts];

  const fromIndex = accounts.findIndex((account) => account.id === movingId);
  const withoutMoving = accounts.filter((account) => account.id !== movingId);
  const targetIndexAfterRemoval = withoutMoving.findIndex(
    (account) => account.id === targetId,
  );
  const insertIndex =
    fromIndex < accounts.findIndex((account) => account.id === targetId)
      ? targetIndexAfterRemoval + 1
      : targetIndexAfterRemoval;

  return [
    ...withoutMoving.slice(0, insertIndex),
    moving,
    ...withoutMoving.slice(insertIndex),
  ];
}

function moveAccountWithinGroup(
  accounts: readonly AssetAccount[],
  groupAccounts: readonly AssetAccount[],
  movingId: string,
  targetId: string,
): AssetAccount[] {
  const groupIds = new Set(groupAccounts.map((account) => account.id));
  const currentGroup = accounts.filter((account) => groupIds.has(account.id));
  const reorderedGroup = moveAccountNear(currentGroup, movingId, targetId);
  let groupIndex = 0;

  return accounts.map((account) => {
    if (!groupIds.has(account.id)) return account;
    const replacement = reorderedGroup[groupIndex];
    groupIndex += 1;
    return replacement ?? account;
  });
}

function accountValues(
  accounts: AssetAccount[],
  rates: AssetRate[],
): Map<string, number> {
  return new Map(
    accounts.map((account) => [
      account.id,
      valueAssetAccountVnd(account, rates),
    ]),
  );
}

export function AssetManagementScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const accountsQuery = useAssetAccounts();
  const ratesQuery = useAssetRates();
  const summaryQuery = useAssetSummary();
  const saveRateOverride = useSaveAssetRateOverride();
  const clearRateOverride = useClearAssetRateOverride();
  const refreshRates = useRefreshAssetRates();
  const [editing, setEditing] = useState<EditingState>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [rateDrafts, setRateDrafts] = useState<
    Partial<Record<AssetRatePair, string>>
  >({});
  const [rateFieldErrors, setRateFieldErrors] = useState<
    Partial<Record<AssetRatePair, string>>
  >({});
  const [rateFeedback, setRateFeedback] = useState<RateFeedback | null>(null);
  const [rateInfoOpen, setRateInfoOpen] = useState(false);
  const [draftOrder, setDraftOrderState] = useState<AssetAccount[] | null>(
    null,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
  );

  const accounts = accountsQuery.data ?? EMPTY_ASSET_ACCOUNTS;
  const rates = ratesQuery.data ?? EMPTY_ASSET_RATES;
  const summary = summaryQuery.data ?? zeroSummary();
  const displayedAccounts = draftOrder ?? accounts;
  const effectiveRateByPair = useMemo(
    () =>
      new Map<AssetRatePair, AssetRate>(rates.map((rate) => [rate.pair, rate])),
    [rates],
  );
  const valueByAccount = useMemo(
    () => accountValues(displayedAccounts, rates),
    [displayedAccounts, rates],
  );
  const accountsKey = accounts
    .map((account) => `${account.id}:${account.sortOrder}`)
    .join("|");
  const queryError =
    accountsQuery.error ?? ratesQuery.error ?? summaryQuery.error;
  const screenErrors = Array.from(
    new Set(
      [localError, queryError ? errorMessage(queryError) : null].filter(
        (message): message is string => message !== null,
      ),
    ),
  );
  const isLoading =
    accountsQuery.isLoading || ratesQuery.isLoading || summaryQuery.isLoading;
  const rateMutationBusy =
    saveRateOverride.isPending ||
    clearRateOverride.isPending ||
    refreshRates.isPending;

  useEffect(() => {
    setDraftOrder(null);
  }, [accountsKey]);

  function setDraftOrder(next: AssetAccount[] | null) {
    setDraftOrderState(next);
  }

  function startCreate() {
    setEditing({ mode: "new" });
    setLocalError(null);
  }

  function startEdit(account: AssetAccount) {
    setEditing({ mode: "edit", account });
    setLocalError(null);
  }

  function updateRateDraft(pair: AssetRatePair, value: string) {
    setRateDrafts((current) => ({ ...current, [pair]: value }));
    setRateFieldErrors((current) => ({ ...current, [pair]: undefined }));
    setRateFeedback(null);
  }

  function forgetRateDraft(pair: AssetRatePair) {
    setRateDrafts((current) => {
      if (!(pair in current)) return current;
      const next = { ...current };
      delete next[pair];
      return next;
    });
  }

  async function saveManualRate(pair: AssetRatePair) {
    const effectiveRate = effectiveRateByPair.get(pair);
    const raw =
      rateDrafts[pair] ??
      (effectiveRate ? NUMBER_FORMAT.format(effectiveRate.value) : "");
    const value = parseVietnameseRateInput(raw);

    if (!Number.isFinite(value) || value <= 0) {
      setRateFieldErrors((current) => ({
        ...current,
        [pair]: t("assets.rateInvalidInput"),
      }));
      return;
    }

    setRateFieldErrors((current) => ({ ...current, [pair]: undefined }));
    setRateFeedback(null);
    try {
      await saveRateOverride.mutateAsync({ pair, value });
      forgetRateDraft(pair);
      setRateFeedback({
        tone: "success",
        message: t("assets.rateSaved", { pair: ratePairTitle(pair, t) }),
      });
    } catch (error) {
      setRateFeedback({
        tone: "error",
        message: t("assets.rateSaveFailed", {
          pair: ratePairTitle(pair, t),
          error: errorMessage(error),
        }),
      });
    }
  }

  async function clearManualRate(pair: AssetRatePair) {
    setRateFeedback(null);
    try {
      await clearRateOverride.mutateAsync(pair);
      forgetRateDraft(pair);
      setRateFieldErrors((current) => ({ ...current, [pair]: undefined }));
      setRateFeedback({
        tone: "success",
        message: t("assets.rateCleared", { pair: ratePairTitle(pair, t) }),
      });
    } catch (error) {
      setRateFeedback({
        tone: "error",
        message: t("assets.rateClearFailed", {
          pair: ratePairTitle(pair, t),
          error: errorMessage(error),
        }),
      });
    }
  }

  async function refreshAutomaticRates() {
    setRateFeedback(null);
    try {
      const result = await refreshRates.mutateAsync();
      setRateFeedback(refreshRateFeedback(result, t));
    } catch (error) {
      setRateFeedback({
        tone: "error",
        message: t("assets.rateRefreshFailed", { error: errorMessage(error) }),
      });
    }
  }

  async function saveAccount(values: AssetAccountFormValues) {
    if (!supabase) {
      setLocalError(t("assets.noSupabase"));
      return;
    }

    setBusy(true);
    setLocalError(null);
    try {
      const existing = editing?.mode === "edit" ? editing.account : null;
      await upsertCloudAssetAccount(supabase, {
        ...values,
        ...(existing ? {} : { sortOrder: accounts.length }),
      });
      await invalidateAssetQueries();
      setEditing(null);
    } catch (error) {
      setLocalError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    const account = editing?.mode === "edit" ? editing.account : null;
    if (!account || !supabase) return;
    if (!confirm(t("assets.formDeleteConfirm"))) return;

    setBusy(true);
    setLocalError(null);
    try {
      await deleteCloudAssetAccount(supabase, account.id);
      await invalidateAssetQueries();
      setEditing(null);
    } catch (error) {
      setLocalError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function persistAccountOrder(next: AssetAccount[]) {
    if (sameAccountOrder(next, accounts)) {
      setDraftOrder(null);
      return;
    }

    if (!supabase) {
      setLocalError(t("assets.noSupabaseReorder"));
      setDraftOrder(null);
      return;
    }

    setDraftOrder(next);
    setBusy(true);
    setLocalError(null);
    try {
      await reorderCloudAssetAccounts(
        supabase,
        next.map((account) => account.id),
      );
      await invalidateAssetQueries();
    } catch (error) {
      setLocalError(errorMessage(error));
    } finally {
      setBusy(false);
      setDraftOrder(null);
    }
  }

  function handleDndEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const movingId = active.id as string;
    const targetId = over.id as string;
    // Find which group both belong to
    for (const group of ACCOUNT_GROUPS) {
      const groupAccounts = displayedAccounts.filter((a) =>
        group.kinds.includes(a.kind),
      );
      if (
        groupAccounts.some((a) => a.id === movingId) &&
        groupAccounts.some((a) => a.id === targetId)
      ) {
        const next = moveAccountWithinGroup(
          displayedAccounts,
          groupAccounts,
          movingId,
          targetId,
        );
        void persistAccountOrder(next);
        return;
      }
    }
  }

  function moveAccountInGroup(
    groupAccounts: AssetAccount[],
    account: AssetAccount,
    direction: -1 | 1,
  ) {
    const currentIndex = groupAccounts.findIndex(
      (item) => item.id === account.id,
    );
    const target = groupAccounts[currentIndex + direction];
    if (!target) return;

    void persistAccountOrder(
      moveAccountWithinGroup(
        displayedAccounts,
        groupAccounts,
        account.id,
        target.id,
      ),
    );
  }

  return (
    <div className="min-h-screen bg-black pb-28 text-zinc-50">
      <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 border-b border-white/10 px-4 pb-3 pt-5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t("assets.back")}
          className="grid h-11 w-11 place-items-center rounded-full text-slate-100"
        >
          <ArrowLeft aria-hidden="true" className="h-7 w-7" />
        </button>
        <h1 className="truncate text-center text-xl font-bold text-white">
          {t("assets.title")}
        </h1>
        <button
          type="button"
          onClick={startCreate}
          aria-label={t("assets.addAsset")}
          className="grid h-11 w-11 place-items-center rounded-full bg-sky-400 text-slate-950"
        >
          <Plus aria-hidden="true" className="h-6 w-6" />
        </button>
      </header>

      <main className="space-y-4 px-3 py-4">
        <GlassPanel className="p-4">
          <div className="text-xs font-semibold uppercase tracking-normal text-zinc-400">
            {t("assets.totalAssets")}
          </div>
          <div className="mt-1 text-3xl font-bold text-white">
            {formatVND(summary.totalAssetsVnd, "vi")}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <SummaryMetric
              label={t("assets.assetsLabel")}
              value={formatVND(summary.totalAssetsVnd, "vi")}
              tone="sky"
            />
            <SummaryMetric
              label={t("assets.savingsLabel")}
              value={formatVND(summary.savingsVnd, "vi")}
              tone="emerald"
            />
            <SummaryMetric
              label={t("assets.liabilityLabel")}
              value={formatLiability(summary.liabilityVnd)}
              tone="rose"
            />
          </div>
        </GlassPanel>

        <GlassPanel
          aria-label={t("assets.ratesManage")}
          className="overflow-hidden"
        >
          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div
              className="relative min-w-0"
              onKeyDown={(event) => {
                if (event.key === "Escape") setRateInfoOpen(false);
              }}
            >
              <div className="flex items-center gap-1">
                <h2 className="text-base font-bold text-white">
                  {t("assets.ratesTitle")}
                </h2>
                <button
                  type="button"
                  aria-label={t("assets.rateInfoLabel")}
                  aria-controls="manual-rate-precedence"
                  aria-expanded={rateInfoOpen}
                  aria-describedby={
                    rateInfoOpen ? "manual-rate-precedence" : undefined
                  }
                  onClick={() => setRateInfoOpen((open) => !open)}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-white/[0.055] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                >
                  <Info aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              {rateInfoOpen && (
                <div
                  id="manual-rate-precedence"
                  role="tooltip"
                  className="absolute left-0 top-full z-20 mt-1 w-72 max-w-[calc(100vw-3.5rem)] rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-xs leading-5 text-slate-200 shadow-xl"
                >
                  {t("assets.rateInfoTooltip")}
                </div>
              )}
            </div>
            <button
              type="button"
              data-testid="refresh-rates-button"
              onClick={() => void refreshAutomaticRates()}
              disabled={rateMutationBusy}
              aria-busy={refreshRates.isPending}
              aria-label={t("assets.rateRefresh")}
              className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-sky-300/30 bg-sky-300/10 px-3 text-sm font-bold text-sky-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${refreshRates.isPending ? "animate-spin" : ""}`}
              />
              {refreshRates.isPending
                ? t("assets.rateRefreshing")
                : t("assets.rateRefresh")}
            </button>
          </div>

          {rateFeedback && (
            <div
              role={rateFeedback.tone === "success" ? "status" : "alert"}
              className={`border-t px-4 py-2.5 text-sm ${
                rateFeedback.tone === "error"
                  ? "border-rose-300/20 bg-rose-500/10 text-rose-100"
                  : rateFeedback.tone === "warning"
                    ? "border-amber-300/20 bg-amber-500/10 text-amber-100"
                    : "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
              }`}
            >
              {rateFeedback.message}
            </div>
          )}

          {RATE_PAIR_CONFIGS.map((config) => {
            const effectiveRate = effectiveRateByPair.get(config.pair);
            const draftValue =
              rateDrafts[config.pair] ??
              (effectiveRate ? NUMBER_FORMAT.format(effectiveRate.value) : "");
            const fieldError = rateFieldErrors[config.pair];
            const savingThisRate =
              saveRateOverride.isPending &&
              saveRateOverride.variables?.pair === config.pair;
            const clearingThisRate =
              clearRateOverride.isPending &&
              clearRateOverride.variables === config.pair;
            const fieldErrorId = `rate-${config.pair.toLowerCase()}-error`;

            return (
              <section
                key={config.pair}
                aria-label={t(`assets.${config.title}`)}
                className="border-t border-white/10 px-4 py-4"
              >
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-100">
                      {t(`assets.${config.title}`)}
                    </h3>
                    <div className="mt-1 text-lg font-bold text-white">
                      {effectiveRate
                        ? `${t(`assets.${config.unitLabel}`)} = ${formatRateValue(effectiveRate.value)}`
                        : t("assets.rateNoData")}
                    </div>
                  </div>
                  <div className="text-xs leading-5 text-slate-400 sm:text-right">
                    <div>
                      {t("assets.rateSource")}{" "}
                      <span
                        className={
                          effectiveRate?.source === "manual"
                            ? "text-amber-200"
                            : "text-sky-200"
                        }
                      >
                        {effectiveRate
                          ? effectiveRate.source === "manual"
                            ? t("assets.rateSourceManual")
                            : t("assets.rateSourceAuto")
                          : t("assets.rateSourceNone")}
                      </span>
                    </div>
                    {effectiveRate && (
                      <div>
                        {t("assets.rateUpdated")}{" "}
                        <time dateTime={effectiveRate.fetchedAt}>
                          {formatRateFetchedAt(effectiveRate.fetchedAt)}
                        </time>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem] sm:items-end">
                  <label className="col-span-2 min-w-0 sm:col-span-1">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-300">
                      {t(`assets.${config.inputLabel}`)}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={draftValue}
                      onChange={(event) =>
                        updateRateDraft(config.pair, event.target.value)
                      }
                      aria-invalid={Boolean(fieldError)}
                      aria-describedby={fieldError ? fieldErrorId : undefined}
                      placeholder={t(`assets.${config.placeholder}`)}
                      className="h-11 w-full rounded-lg border border-white/10 bg-black/35 px-3 text-base font-semibold text-white outline-none placeholder:text-slate-600 focus:border-sky-300/60 focus:ring-2 focus:ring-sky-300/20"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void saveManualRate(config.pair)}
                    disabled={rateMutationBusy}
                    aria-label={`${t("assets.rateSave")} ${t(`assets.${config.title}`)}`}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-sky-300 px-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Save aria-hidden="true" className="h-4 w-4" />
                    {savingThisRate
                      ? t("assets.rateSaving")
                      : t("assets.rateSave")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void clearManualRate(config.pair)}
                    disabled={
                      rateMutationBusy || effectiveRate?.source !== "manual"
                    }
                    aria-label={`${t("assets.rateClear")} ${t(`assets.${config.title}`)}`}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.055] px-3 text-sm font-bold text-slate-200 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    {clearingThisRate
                      ? t("assets.rateClearing")
                      : t("assets.rateClear")}
                  </button>
                </div>
                {fieldError && (
                  <p
                    id={fieldErrorId}
                    role="alert"
                    className="mt-2 text-xs font-medium text-rose-200"
                  >
                    {fieldError}
                  </p>
                )}
              </section>
            );
          })}
        </GlassPanel>

        {editing && (
          <GlassPanel className="p-4">
            <AssetAccountForm
              account={editing.mode === "edit" ? editing.account : null}
              busy={busy}
              onCancel={() => setEditing(null)}
              onSubmit={saveAccount}
              onDelete={editing.mode === "edit" ? deleteAccount : undefined}
            />
          </GlassPanel>
        )}

        {screenErrors.map((message) => (
          <div
            key={message}
            role="alert"
            className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100"
          >
            {message}
          </div>
        ))}

        <GlassPanel className="overflow-hidden">
          {isLoading && accounts.length === 0 ? (
            <div className="p-4 text-sm font-medium text-zinc-400">
              {t("assets.loading")}
            </div>
          ) : accounts.length === 0 ? (
            <div className="p-4 text-sm font-medium text-zinc-400">
              {t("assets.empty")}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDndEnd}
            >
              <SortableContext
                items={displayedAccounts.map((a) => a.id)}
                strategy={verticalListSortingStrategy}
              >
                {ACCOUNT_GROUPS.map((group) => {
                  const groupAccounts = displayedAccounts.filter((account) =>
                    group.kinds.includes(account.kind),
                  );
                  if (groupAccounts.length === 0) return null;

                  return (
                    <section
                      key={group.title}
                      aria-label={t(`assets.${group.title}`)}
                    >
                      <div className="border-b border-white/10 bg-black/25 px-3 py-2 text-xs font-bold uppercase tracking-normal text-slate-500">
                        {t(`assets.${group.title}`)}
                      </div>
                      {groupAccounts.map((account, index) => (
                        <SortableAccountRow
                          key={account.id}
                          account={account}
                          index={index}
                          total={groupAccounts.length}
                          valueVnd={valueByAccount.get(account.id) ?? 0}
                          busy={busy}
                          onMoveUp={() =>
                            moveAccountInGroup(groupAccounts, account, -1)
                          }
                          onMoveDown={() =>
                            moveAccountInGroup(groupAccounts, account, 1)
                          }
                          onEdit={() => startEdit(account)}
                        />
                      ))}
                    </section>
                  );
                })}
              </SortableContext>
            </DndContext>
          )}
        </GlassPanel>

        <Link
          to="/debts"
          className="flex min-h-14 items-center justify-between rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3 text-slate-100 transition hover:border-sky-300/40 hover:bg-sky-300/10"
        >
          <span className="font-semibold">{t("assets.debtsLink")}</span>
          <ChevronRight aria-hidden="true" className="h-5 w-5 text-slate-500" />
        </Link>
      </main>
    </div>
  );
}

function SortableAccountRow({
  account,
  index,
  total,
  valueVnd,
  busy,
  onMoveUp,
  onMoveDown,
  onEdit,
}: {
  account: AssetAccount;
  index: number;
  total: number;
  valueVnd: number;
  busy: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: account.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const canMoveUp = index > 0;
  const canMoveDown = index < total - 1;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="asset-account-row"
      className={`grid min-h-20 grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-x-2 gap-y-2 border-b border-white/10 px-3 py-3 last:border-b-0 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] ${
        isDragging
          ? "relative z-50 rounded-xl bg-slate-800/95 shadow-xl shadow-black/40 ring-1 ring-white/10"
          : ""
      }`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={t("assets.drag", { name: account.name })}
        className={`grid h-11 w-11 touch-none place-items-center rounded-xl text-slate-500 ${
          isDragging
            ? "cursor-grabbing text-slate-200"
            : "cursor-grab active:cursor-grabbing active:bg-white/10 active:text-slate-200"
        }`}
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" className="h-5 w-5" />
      </button>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span
            data-testid="asset-account-name"
            className="truncate text-base font-bold text-white"
          >
            {account.name}
          </span>
          {account.bank && (
            <span className="shrink-0 rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-xs font-semibold text-sky-200">
              {account.bank}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-400">
          <span>{t(KIND_KEYS[account.kind])}</span>
          <span>{nativeAmountLabel(account, t)}</span>
          <span>
            {account.includeInTotal
              ? t("assets.includeInTotal")
              : t("assets.excludeFromTotal")}
          </span>
        </div>
      </div>

      <div className="col-start-2 flex min-w-0 items-center justify-end gap-2 sm:col-start-auto">
        <div className="grid grid-cols-1 gap-1">
          <button
            type="button"
            disabled={!canMoveUp || busy}
            onClick={onMoveUp}
            aria-label={t("assets.moveUp", { name: account.name })}
            className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.045] text-slate-300 disabled:opacity-30"
          >
            <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={!canMoveDown || busy}
            onClick={onMoveDown}
            aria-label={t("assets.moveDown", { name: account.name })}
            className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.045] text-slate-300 disabled:opacity-30"
          >
            <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="min-w-0 flex-1 text-right sm:flex-none">
          <div className="text-[0.68rem] font-semibold uppercase tracking-normal text-slate-500">
            VND
          </div>
          <div className="truncate text-sm font-bold text-slate-100">
            {formatVND(valueVnd, "vi")}
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-label={t("assets.edit", { name: account.name })}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.055] text-slate-300"
        >
          <Pencil aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "sky" | "emerald" | "rose";
}) {
  const toneClass =
    tone === "rose"
      ? "text-rose-300"
      : tone === "emerald"
        ? "text-emerald-300"
        : "text-sky-300";

  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/30 px-2 py-2">
      <div className="truncate text-[0.68rem] font-semibold text-zinc-400">
        {label}
      </div>
      <div className={`mt-1 truncate text-xs font-bold ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}
