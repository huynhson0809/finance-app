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
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  { title: "Tiền mặt & tài khoản", kinds: ["cash", "bank"] },
  { title: "Thẻ tín dụng", kinds: ["credit_card"] },
  { title: "Tiết kiệm", kinds: ["savings"] },
  { title: "Vàng & ngoại tệ", kinds: ["gold", "foreign_currency"] },
];
const RATE_PAIR_CONFIGS: readonly RatePairConfig[] = [
  {
    pair: "USD_VND",
    title: "USD / VND",
    unitLabel: "1 USD",
    inputLabel: "Tỷ giá thủ công USD / VND",
    placeholder: "Ví dụ: 25.500",
  },
  {
    pair: "GOLD_GRAM_VND",
    title: "Gram vàng / VND",
    unitLabel: "1 gram vàng",
    inputLabel: "Tỷ giá thủ công gram vàng / VND",
    placeholder: "Ví dụ: 2.500.000",
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

function kindLabel(kind: AssetAccountKind): string {
  switch (kind) {
    case "cash":
      return "Tiền mặt";
    case "bank":
      return "Tài khoản ngân hàng";
    case "credit_card":
      return "Thẻ tín dụng";
    case "savings":
      return "Tiết kiệm";
    case "gold":
      return "Vàng";
    case "foreign_currency":
      return "Ngoại tệ";
  }
}

function goldUnitLabel(unit: GoldUnit): string {
  switch (unit) {
    case "gram":
      return "gram";
    case "chi":
      return "chỉ";
    case "luong":
      return "lượng";
  }
}

function nativeAmountLabel(account: AssetAccount): string {
  if (account.kind === "gold") {
    return `${NUMBER_FORMAT.format(account.quantity ?? 0)} ${goldUnitLabel(account.goldUnit ?? "gram")}`;
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
  if (Number.isNaN(date.getTime())) return "Không rõ thời gian";
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

function ratePairTitle(pair: AssetRatePair): string {
  return (
    RATE_PAIR_CONFIGS.find((config) => config.pair === pair)?.title ?? pair
  );
}

function refreshRateFeedback(result: AssetRateRefreshResult): RateFeedback {
  const entries = RATE_PAIR_CONFIGS.map((config) => ({
    title: config.title,
    outcome: result.outcomes[config.pair],
  }));
  const refreshed = entries.filter((entry) => entry.outcome === "refreshed");
  const cached = entries.filter((entry) => entry.outcome === "cached");
  const unavailable = entries.filter(
    (entry) => entry.outcome === "unavailable",
  );
  const titles = (items: typeof entries) =>
    items.map((item) => item.title).join(" và ");

  if (refreshed.length === entries.length) {
    return { tone: "success", message: "Đã làm mới tất cả tỷ giá tự động." };
  }
  if (cached.length === entries.length) {
    return {
      tone: "success",
      message: "Tỷ giá tự động đã được cập nhật trước đó và vẫn còn hiệu lực.",
    };
  }
  if (unavailable.length === entries.length) {
    return { tone: "error", message: "Tỷ giá tự động hiện không khả dụng." };
  }
  if (unavailable.length > 0) {
    const availableMessage =
      refreshed.length > 0
        ? `Đã làm mới một phần tỷ giá tự động (${titles(refreshed)}).`
        : `Tỷ giá ${titles(cached)} đã được cập nhật trước đó và vẫn còn hiệu lực.`;
    return {
      tone: "warning",
      message: `${availableMessage} Chưa thể cập nhật ${titles(unavailable)}.`,
    };
  }

  return {
    tone: "success",
    message: `Đã làm mới một phần tỷ giá tự động (${titles(refreshed)}). ${titles(cached)} đã được cập nhật trước đó và vẫn còn hiệu lực.`,
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
  const draggingAccountRef = useRef<string | null>(null);
  const draftOrderRef = useRef<AssetAccount[] | null>(null);

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
    draftOrderRef.current = next;
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
        [pair]: "Nhập tỷ giá là một số hữu hạn lớn hơn 0.",
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
        message: `Đã lưu tỷ giá thủ công ${ratePairTitle(pair)}.`,
      });
    } catch (error) {
      setRateFeedback({
        tone: "error",
        message: `Không thể lưu tỷ giá ${ratePairTitle(pair)}: ${errorMessage(error)}`,
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
        message: `Đã xóa tỷ giá thủ công ${ratePairTitle(pair)}.`,
      });
    } catch (error) {
      setRateFeedback({
        tone: "error",
        message: `Không thể xóa tỷ giá ${ratePairTitle(pair)}: ${errorMessage(error)}`,
      });
    }
  }

  async function refreshAutomaticRates() {
    setRateFeedback(null);
    try {
      const result = await refreshRates.mutateAsync();
      setRateFeedback(refreshRateFeedback(result));
    } catch (error) {
      setRateFeedback({
        tone: "error",
        message: `Không thể làm mới tỷ giá tự động: ${errorMessage(error)}`,
      });
    }
  }

  async function saveAccount(values: AssetAccountFormValues) {
    if (!supabase) {
      setLocalError("Không thể lưu tài sản khi chưa cấu hình Supabase.");
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

  async function persistAccountOrder(next: AssetAccount[]) {
    if (sameAccountOrder(next, accounts)) {
      setDraftOrder(null);
      return;
    }

    if (!supabase) {
      setLocalError("Không thể sắp xếp tài sản khi chưa cấu hình Supabase.");
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

  function handleDragStart(
    event: DragEvent<HTMLButtonElement>,
    accountId: string,
  ) {
    draggingAccountRef.current = accountId;
    setDraftOrder(displayedAccounts);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", accountId);
    }
  }

  function handleDragOver(
    event: DragEvent<HTMLElement>,
    targetId: string,
    groupAccounts: AssetAccount[],
  ) {
    const movingId = draggingAccountRef.current;
    if (!movingId || movingId === targetId) return;
    if (!groupAccounts.some((account) => account.id === movingId)) return;

    event.preventDefault();
    const current = draftOrderRef.current ?? displayedAccounts;
    const next = moveAccountWithinGroup(
      current,
      groupAccounts,
      movingId,
      targetId,
    );
    if (!sameAccountOrder(next, current)) setDraftOrder(next);
  }

  async function handleDrop(
    event: DragEvent<HTMLElement>,
    targetId: string,
    groupAccounts: AssetAccount[],
  ) {
    const movingId = draggingAccountRef.current;
    draggingAccountRef.current = null;
    if (!movingId || movingId === targetId) {
      setDraftOrder(null);
      return;
    }

    if (!groupAccounts.some((account) => account.id === movingId)) {
      setDraftOrder(null);
      return;
    }

    event.preventDefault();
    const next =
      draftOrderRef.current ??
      moveAccountWithinGroup(
        displayedAccounts,
        groupAccounts,
        movingId,
        targetId,
      );
    await persistAccountOrder(next);
  }

  function handleDragEnd() {
    draggingAccountRef.current = null;
    setDraftOrder(null);
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

  function renderAccountRow(
    account: AssetAccount,
    groupAccounts: AssetAccount[],
    groupIndex: number,
  ) {
    const valueVnd = valueByAccount.get(account.id) ?? 0;
    const canMoveUp = groupIndex > 0;
    const canMoveDown = groupIndex < groupAccounts.length - 1;

    return (
      <div
        key={account.id}
        data-testid="asset-account-row"
        onDragOver={(event) => handleDragOver(event, account.id, groupAccounts)}
        onDrop={(event) => void handleDrop(event, account.id, groupAccounts)}
        className="grid min-h-20 grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-x-2 gap-y-2 border-b border-white/10 px-3 py-3 last:border-b-0 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto]"
      >
        <button
          type="button"
          draggable={!busy}
          disabled={busy}
          onDragStart={(event) => handleDragStart(event, account.id)}
          onDragEnd={handleDragEnd}
          aria-label={`Kéo ${account.name}`}
          className="grid h-11 w-11 cursor-grab place-items-center rounded-xl text-slate-500 active:cursor-grabbing active:bg-white/10 active:text-slate-200 disabled:cursor-default disabled:opacity-30"
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
            <span>{kindLabel(account.kind)}</span>
            <span>{nativeAmountLabel(account)}</span>
            <span>
              {account.includeInTotal ? "Tính tổng" : "Không tính tổng"}
            </span>
          </div>
        </div>

        <div className="col-start-2 flex min-w-0 items-center justify-end gap-2 sm:col-start-auto">
          <div className="grid grid-cols-1 gap-1">
            <button
              type="button"
              disabled={!canMoveUp || busy}
              onClick={() => moveAccountInGroup(groupAccounts, account, -1)}
              aria-label={`Đưa ${account.name} lên`}
              className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.045] text-slate-300 disabled:opacity-30"
            >
              <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={!canMoveDown || busy}
              onClick={() => moveAccountInGroup(groupAccounts, account, 1)}
              aria-label={`Đưa ${account.name} xuống`}
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
            onClick={() => startEdit(account)}
            aria-label={`Sửa ${account.name}`}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.055] text-slate-300"
          >
            <Pencil aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-28 text-zinc-50">
      <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 border-b border-white/10 px-4 pb-3 pt-5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Quay lại"
          className="grid h-11 w-11 place-items-center rounded-full text-slate-100"
        >
          <ArrowLeft aria-hidden="true" className="h-7 w-7" />
        </button>
        <h1 className="truncate text-center text-xl font-bold text-white">
          Tài sản
        </h1>
        <button
          type="button"
          onClick={startCreate}
          aria-label="Thêm tài sản"
          className="grid h-11 w-11 place-items-center rounded-full bg-sky-400 text-slate-950"
        >
          <Plus aria-hidden="true" className="h-6 w-6" />
        </button>
      </header>

      <main className="space-y-4 px-3 py-4">
        <GlassPanel className="p-4">
          <div className="text-xs font-semibold uppercase tracking-normal text-zinc-400">
            Tổng tài sản
          </div>
          <div className="mt-1 text-3xl font-bold text-white">
            {formatVND(summary.totalAssetsVnd, "vi")}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <SummaryMetric
              label="Tài sản"
              value={formatVND(summary.totalAssetsVnd, "vi")}
              tone="sky"
            />
            <SummaryMetric
              label="Tiết kiệm"
              value={formatVND(summary.savingsVnd, "vi")}
              tone="emerald"
            />
            <SummaryMetric
              label="Nợ"
              value={formatLiability(summary.liabilityVnd)}
              tone="rose"
            />
          </div>
        </GlassPanel>

        <GlassPanel aria-label="Quản lý tỷ giá" className="overflow-hidden">
          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div
              className="relative min-w-0"
              onKeyDown={(event) => {
                if (event.key === "Escape") setRateInfoOpen(false);
              }}
            >
              <div className="flex items-center gap-1">
                <h2 className="text-base font-bold text-white">
                  Tỷ giá quy đổi
                </h2>
                <button
                  type="button"
                  aria-label="Thông tin về tỷ giá thủ công"
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
                  Làm mới chỉ cập nhật nguồn tự động. Tỷ giá thủ công luôn được
                  ưu tiên áp dụng cho đến khi bạn xóa tỷ giá đó.
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void refreshAutomaticRates()}
              disabled={rateMutationBusy}
              aria-busy={refreshRates.isPending}
              aria-label="Làm mới tỷ giá tự động"
              className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-sky-300/30 bg-sky-300/10 px-3 text-sm font-bold text-sky-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${refreshRates.isPending ? "animate-spin" : ""}`}
              />
              {refreshRates.isPending ? "Đang làm mới" : "Làm mới"}
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
                aria-label={config.title}
                className="border-t border-white/10 px-4 py-4"
              >
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-100">
                      {config.title}
                    </h3>
                    <div className="mt-1 text-lg font-bold text-white">
                      {effectiveRate
                        ? `${config.unitLabel} = ${formatRateValue(effectiveRate.value)}`
                        : "Chưa có tỷ giá hiệu lực"}
                    </div>
                  </div>
                  <div className="text-xs leading-5 text-slate-400 sm:text-right">
                    <div>
                      Nguồn:{" "}
                      <span
                        className={
                          effectiveRate?.source === "manual"
                            ? "text-amber-200"
                            : "text-sky-200"
                        }
                      >
                        {effectiveRate
                          ? effectiveRate.source === "manual"
                            ? "Thủ công"
                            : "Tự động"
                          : "Chưa có dữ liệu"}
                      </span>
                    </div>
                    {effectiveRate && (
                      <div>
                        Cập nhật:{" "}
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
                      {config.inputLabel}
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
                      placeholder={config.placeholder}
                      className="h-11 w-full rounded-lg border border-white/10 bg-black/35 px-3 text-base font-semibold text-white outline-none placeholder:text-slate-600 focus:border-sky-300/60 focus:ring-2 focus:ring-sky-300/20"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void saveManualRate(config.pair)}
                    disabled={rateMutationBusy}
                    aria-label={`Lưu tỷ giá thủ công ${config.title}`}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-sky-300 px-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Save aria-hidden="true" className="h-4 w-4" />
                    {savingThisRate ? "Đang lưu" : "Lưu"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void clearManualRate(config.pair)}
                    disabled={
                      rateMutationBusy || effectiveRate?.source !== "manual"
                    }
                    aria-label={`Xóa tỷ giá thủ công ${config.title}`}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.055] px-3 text-sm font-bold text-slate-200 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    {clearingThisRate ? "Đang xóa" : "Xóa"}
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
              Đang tải tài sản...
            </div>
          ) : accounts.length === 0 ? (
            <div className="p-4 text-sm font-medium text-zinc-400">
              Chưa thiết lập tài sản
            </div>
          ) : (
            ACCOUNT_GROUPS.map((group) => {
              const groupAccounts = displayedAccounts.filter((account) =>
                group.kinds.includes(account.kind),
              );
              if (groupAccounts.length === 0) return null;

              return (
                <section key={group.title} aria-label={group.title}>
                  <div className="border-b border-white/10 bg-black/25 px-3 py-2 text-xs font-bold uppercase tracking-normal text-slate-500">
                    {group.title}
                  </div>
                  {groupAccounts.map((account, index) =>
                    renderAccountRow(account, groupAccounts, index),
                  )}
                </section>
              );
            })
          )}
        </GlassPanel>

        <Link
          to="/debts"
          className="flex min-h-14 items-center justify-between rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3 text-slate-100 transition hover:border-sky-300/40 hover:bg-sky-300/10"
        >
          <span className="font-semibold">Vay / Nợ</span>
          <ChevronRight aria-hidden="true" className="h-5 w-5 text-slate-500" />
        </Link>
      </main>
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
