import { ArrowDown, ArrowLeft, ArrowUp, GripVertical, Pencil, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AssetAccount, AssetAccountKind, AssetRate, AssetSummary, GoldUnit } from '../assets/types';
import { valueAssetAccountVnd } from '../assets/valuation';
import { useAssetAccounts, useAssetRates, useAssetSummary } from '../hooks/useAssets';
import { errorMessage } from '../lib/error';
import { formatVND } from '../lib/money';
import { invalidateAssetQueries } from '../query/client';
import { reorderCloudAssetAccounts, upsertCloudAssetAccount } from '../supabase/assets';
import { supabase } from '../supabase/client';
import { AssetAccountForm, type AssetAccountFormValues } from './components/AssetAccountForm';
import { GlassPanel } from './components/primitives';

type EditingState =
  | { mode: 'new' }
  | { mode: 'edit'; account: AssetAccount }
  | null;

interface AccountGroup {
  title: string;
  kinds: AssetAccountKind[];
}

const ACCOUNT_GROUPS: AccountGroup[] = [
  { title: 'Tiền mặt & tài khoản', kinds: ['cash', 'bank'] },
  { title: 'Thẻ tín dụng', kinds: ['credit_card'] },
  { title: 'Tiết kiệm', kinds: ['savings'] },
  { title: 'Vàng & ngoại tệ', kinds: ['gold', 'foreign_currency'] },
];
const EMPTY_ASSET_ACCOUNTS: AssetAccount[] = [];
const EMPTY_ASSET_RATES: AssetRate[] = [];

const NUMBER_FORMAT = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 });

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
    case 'cash':
      return 'Tiền mặt';
    case 'bank':
      return 'Tài khoản ngân hàng';
    case 'credit_card':
      return 'Thẻ tín dụng';
    case 'savings':
      return 'Tiết kiệm';
    case 'gold':
      return 'Vàng';
    case 'foreign_currency':
      return 'Ngoại tệ';
  }
}

function goldUnitLabel(unit: GoldUnit): string {
  switch (unit) {
    case 'gram':
      return 'gram';
    case 'chi':
      return 'chỉ';
    case 'luong':
      return 'lượng';
  }
}

function nativeAmountLabel(account: AssetAccount): string {
  if (account.kind === 'gold') {
    return `${NUMBER_FORMAT.format(account.quantity ?? 0)} ${goldUnitLabel(account.goldUnit ?? 'gram')}`;
  }

  if (account.kind === 'foreign_currency') {
    return `${NUMBER_FORMAT.format(account.balance)} ${account.currency}`;
  }

  if (account.currency === 'USD') {
    return `${NUMBER_FORMAT.format(account.balance)} USD`;
  }

  return formatVND(account.balance, 'vi');
}

function formatLiability(amount: number): string {
  if (amount <= 0) return formatVND(0, 'vi');
  return `-${formatVND(amount, 'vi')}`;
}

function sameAccountOrder(left: readonly AssetAccount[], right: readonly AssetAccount[]): boolean {
  return left.length === right.length && left.every((account, index) => account.id === right[index]?.id);
}

function moveAccountNear(
  accounts: readonly AssetAccount[],
  movingId: string,
  targetId: string,
): AssetAccount[] {
  const moving = accounts.find(account => account.id === movingId);
  const target = accounts.find(account => account.id === targetId);
  if (!moving || !target || moving.id === target.id) return [...accounts];

  const fromIndex = accounts.findIndex(account => account.id === movingId);
  const withoutMoving = accounts.filter(account => account.id !== movingId);
  const targetIndexAfterRemoval = withoutMoving.findIndex(account => account.id === targetId);
  const insertIndex = fromIndex < accounts.findIndex(account => account.id === targetId)
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
  const groupIds = new Set(groupAccounts.map(account => account.id));
  const currentGroup = accounts.filter(account => groupIds.has(account.id));
  const reorderedGroup = moveAccountNear(currentGroup, movingId, targetId);
  let groupIndex = 0;

  return accounts.map(account => {
    if (!groupIds.has(account.id)) return account;
    const replacement = reorderedGroup[groupIndex];
    groupIndex += 1;
    return replacement ?? account;
  });
}

function accountValues(accounts: AssetAccount[], rates: AssetRate[]): Map<string, number> {
  return new Map(accounts.map(account => [account.id, valueAssetAccountVnd(account, rates)]));
}

export function AssetManagementScreen() {
  const navigate = useNavigate();
  const accountsQuery = useAssetAccounts();
  const ratesQuery = useAssetRates();
  const summaryQuery = useAssetSummary();
  const [editing, setEditing] = useState<EditingState>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [draftOrder, setDraftOrderState] = useState<AssetAccount[] | null>(null);
  const draggingAccountRef = useRef<string | null>(null);
  const draftOrderRef = useRef<AssetAccount[] | null>(null);

  const accounts = accountsQuery.data ?? EMPTY_ASSET_ACCOUNTS;
  const rates = ratesQuery.data ?? EMPTY_ASSET_RATES;
  const summary = summaryQuery.data ?? zeroSummary();
  const displayedAccounts = draftOrder ?? accounts;
  const valueByAccount = useMemo(
    () => accountValues(displayedAccounts, rates),
    [displayedAccounts, rates],
  );
  const accountsKey = accounts.map(account => `${account.id}:${account.sortOrder}`).join('|');
  const queryError = accountsQuery.error ?? ratesQuery.error ?? summaryQuery.error;
  const screenError = localError ?? (queryError ? errorMessage(queryError) : null);
  const isLoading = accountsQuery.isLoading || ratesQuery.isLoading || summaryQuery.isLoading;

  useEffect(() => {
    setDraftOrder(null);
  }, [accountsKey]);

  function setDraftOrder(next: AssetAccount[] | null) {
    draftOrderRef.current = next;
    setDraftOrderState(next);
  }

  function startCreate() {
    setEditing({ mode: 'new' });
    setLocalError(null);
  }

  function startEdit(account: AssetAccount) {
    setEditing({ mode: 'edit', account });
    setLocalError(null);
  }

  async function saveAccount(values: AssetAccountFormValues) {
    if (!supabase) {
      setLocalError('Không thể lưu tài sản khi chưa cấu hình Supabase.');
      return;
    }

    setBusy(true);
    setLocalError(null);
    try {
      const existing = editing?.mode === 'edit' ? editing.account : null;
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
      setLocalError('Không thể sắp xếp tài sản khi chưa cấu hình Supabase.');
      setDraftOrder(null);
      return;
    }

    setDraftOrder(next);
    setBusy(true);
    setLocalError(null);
    try {
      await reorderCloudAssetAccounts(supabase, next.map(account => account.id));
      await invalidateAssetQueries();
    } catch (error) {
      setLocalError(errorMessage(error));
    } finally {
      setBusy(false);
      setDraftOrder(null);
    }
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>, accountId: string) {
    draggingAccountRef.current = accountId;
    setDraftOrder(displayedAccounts);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', accountId);
    }
  }

  function handleDragOver(event: DragEvent<HTMLElement>, targetId: string, groupAccounts: AssetAccount[]) {
    const movingId = draggingAccountRef.current;
    if (!movingId || movingId === targetId) return;
    if (!groupAccounts.some(account => account.id === movingId)) return;

    event.preventDefault();
    const current = draftOrderRef.current ?? displayedAccounts;
    const next = moveAccountWithinGroup(current, groupAccounts, movingId, targetId);
    if (!sameAccountOrder(next, current)) setDraftOrder(next);
  }

  async function handleDrop(event: DragEvent<HTMLElement>, targetId: string, groupAccounts: AssetAccount[]) {
    const movingId = draggingAccountRef.current;
    draggingAccountRef.current = null;
    if (!movingId || movingId === targetId) {
      setDraftOrder(null);
      return;
    }

    if (!groupAccounts.some(account => account.id === movingId)) {
      setDraftOrder(null);
      return;
    }

    event.preventDefault();
    const next = draftOrderRef.current
      ?? moveAccountWithinGroup(displayedAccounts, groupAccounts, movingId, targetId);
    await persistAccountOrder(next);
  }

  function handleDragEnd() {
    draggingAccountRef.current = null;
    setDraftOrder(null);
  }

  function moveAccountInGroup(groupAccounts: AssetAccount[], account: AssetAccount, direction: -1 | 1) {
    const currentIndex = groupAccounts.findIndex(item => item.id === account.id);
    const target = groupAccounts[currentIndex + direction];
    if (!target) return;

    void persistAccountOrder(moveAccountWithinGroup(displayedAccounts, groupAccounts, account.id, target.id));
  }

  function renderAccountRow(account: AssetAccount, groupAccounts: AssetAccount[], groupIndex: number) {
    const valueVnd = valueByAccount.get(account.id) ?? 0;
    const canMoveUp = groupIndex > 0;
    const canMoveDown = groupIndex < groupAccounts.length - 1;

    return (
      <div
        key={account.id}
        data-testid="asset-account-row"
        onDragOver={event => handleDragOver(event, account.id, groupAccounts)}
        onDrop={event => void handleDrop(event, account.id, groupAccounts)}
        className="grid min-h-20 grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-x-2 gap-y-2 border-b border-white/10 px-3 py-3 last:border-b-0 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto]"
      >
        <button
          type="button"
          draggable={!busy}
          disabled={busy}
          onDragStart={event => handleDragStart(event, account.id)}
          onDragEnd={handleDragEnd}
          aria-label={`Kéo ${account.name}`}
          className="grid h-11 w-11 cursor-grab place-items-center rounded-xl text-slate-500 active:cursor-grabbing active:bg-white/10 active:text-slate-200 disabled:cursor-default disabled:opacity-30"
        >
          <GripVertical aria-hidden="true" className="h-5 w-5" />
        </button>

        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span data-testid="asset-account-name" className="truncate text-base font-bold text-white">
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
            <span>{account.includeInTotal ? 'Tính tổng' : 'Không tính tổng'}</span>
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
            <div className="text-[0.68rem] font-semibold uppercase tracking-normal text-slate-500">VND</div>
            <div className="truncate text-sm font-bold text-slate-100">{formatVND(valueVnd, 'vi')}</div>
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
        <h1 className="truncate text-center text-xl font-bold text-white">Tài sản</h1>
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
          <div className="text-xs font-semibold uppercase tracking-normal text-zinc-400">Tổng tài sản</div>
          <div className="mt-1 text-3xl font-bold text-white">{formatVND(summary.totalAssetsVnd, 'vi')}</div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <SummaryMetric label="Tài sản" value={formatVND(summary.totalAssetsVnd, 'vi')} tone="sky" />
            <SummaryMetric label="Tiết kiệm" value={formatVND(summary.savingsVnd, 'vi')} tone="emerald" />
            <SummaryMetric label="Nợ" value={formatLiability(summary.liabilityVnd)} tone="rose" />
          </div>
        </GlassPanel>

        {editing && (
          <GlassPanel className="p-4">
            <AssetAccountForm
              account={editing.mode === 'edit' ? editing.account : null}
              busy={busy}
              onCancel={() => setEditing(null)}
              onSubmit={saveAccount}
            />
          </GlassPanel>
        )}

        {screenError && (
          <div role="alert" className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">
            {screenError}
          </div>
        )}

        <GlassPanel className="overflow-hidden">
          {isLoading && accounts.length === 0 ? (
            <div className="p-4 text-sm font-medium text-zinc-400">Đang tải tài sản...</div>
          ) : accounts.length === 0 ? (
            <div className="p-4 text-sm font-medium text-zinc-400">Chưa thiết lập tài sản</div>
          ) : (
            ACCOUNT_GROUPS.map(group => {
              const groupAccounts = displayedAccounts.filter(account => group.kinds.includes(account.kind));
              if (groupAccounts.length === 0) return null;

              return (
                <section key={group.title} aria-label={group.title}>
                  <div className="border-b border-white/10 bg-black/25 px-3 py-2 text-xs font-bold uppercase tracking-normal text-slate-500">
                    {group.title}
                  </div>
                  {groupAccounts.map((account, index) => renderAccountRow(account, groupAccounts, index))}
                </section>
              );
            })
          )}
        </GlassPanel>
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
  tone: 'sky' | 'emerald' | 'rose';
}) {
  const toneClass = tone === 'rose'
    ? 'text-rose-300'
    : tone === 'emerald'
      ? 'text-emerald-300'
      : 'text-sky-300';

  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/30 px-2 py-2">
      <div className="truncate text-[0.68rem] font-semibold text-zinc-400">{label}</div>
      <div className={`mt-1 truncate text-xs font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}
