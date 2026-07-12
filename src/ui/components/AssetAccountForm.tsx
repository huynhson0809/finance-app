import { useEffect, useState, type FormEvent } from 'react';
import type { AssetAccount, AssetAccountKind, AssetCurrency, GoldUnit } from '../../assets/types';
import { DarkField } from './primitives';

export interface AssetAccountFormValues {
  id?: string;
  createdAt?: string;
  kind: AssetAccountKind;
  name: string;
  currency: AssetCurrency;
  balance: number;
  quantity?: number;
  goldUnit?: GoldUnit;
  bank?: string | null;
  accountIdentifier?: string | null;
  cardIdentifier?: string | null;
  includeInTotal: boolean;
}

interface AssetAccountFormProps {
  account?: AssetAccount | null;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (values: AssetAccountFormValues) => Promise<void> | void;
}

interface FormState {
  kind: AssetAccountKind;
  name: string;
  currency: AssetCurrency;
  amount: string;
  goldUnit: GoldUnit;
  bank: string;
  identifier: string;
  includeInTotal: boolean;
}

const KIND_OPTIONS: Array<{ value: AssetAccountKind; label: string }> = [
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'bank', label: 'Tài khoản ngân hàng' },
  { value: 'credit_card', label: 'Thẻ tín dụng' },
  { value: 'savings', label: 'Tiết kiệm' },
  { value: 'gold', label: 'Vàng' },
  { value: 'foreign_currency', label: 'Ngoại tệ' },
];

const SELECT_CLASS = [
  'w-full rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-base text-white outline-none transition',
  'focus:border-sky-300/70',
].join(' ');

function amountForAccount(account: AssetAccount): string {
  if (account.kind === 'gold') return String(account.quantity ?? 0);
  return String(account.balance);
}

function initialState(account?: AssetAccount | null): FormState {
  if (!account) {
    return {
      kind: 'cash',
      name: '',
      currency: 'VND',
      amount: '',
      goldUnit: 'chi',
      bank: '',
      identifier: '',
      includeInTotal: true,
    };
  }

  return {
    kind: account.kind,
    name: account.name,
    currency: account.currency,
    amount: amountForAccount(account),
    goldUnit: account.goldUnit ?? 'chi',
    bank: account.bank ?? '',
    identifier: account.kind === 'credit_card'
      ? account.cardIdentifier ?? ''
      : account.accountIdentifier ?? '',
    includeInTotal: account.includeInTotal,
  };
}

function defaultCurrencyForKind(kind: AssetAccountKind): AssetCurrency {
  return kind === 'foreign_currency' ? 'USD' : 'VND';
}

function currencyOptionsForKind(kind: AssetAccountKind): AssetCurrency[] {
  switch (kind) {
    case 'cash':
    case 'bank':
    case 'savings':
      return ['VND', 'USD'];
    case 'foreign_currency':
      return ['USD'];
    case 'credit_card':
      return ['VND', 'USD'];
    case 'gold':
      return ['VND'];
  }
}

function currencyForKind(kind: AssetAccountKind, currency: AssetCurrency): AssetCurrency {
  const options = currencyOptionsForKind(kind);
  return options.includes(currency) ? currency : defaultCurrencyForKind(kind);
}

function amountLabel(kind: AssetAccountKind): string {
  if (kind === 'credit_card') return 'Dư nợ hiện tại';
  if (kind === 'gold' || kind === 'foreign_currency') return 'Số lượng';
  return 'Số dư ban đầu';
}

function parseNumberInput(raw: string): number {
  const compact = raw.trim().replace(/\s/g, '');
  if (!compact) return NaN;

  const commaIndexes = [...compact.matchAll(/,/g)].map(match => match.index ?? -1);
  const dotIndexes = [...compact.matchAll(/\./g)].map(match => match.index ?? -1);
  const separators = [...commaIndexes, ...dotIndexes].filter(index => index >= 0).sort((left, right) => left - right);
  if (separators.length === 0) return Number(compact);

  const lastSeparator = separators[separators.length - 1];
  const fraction = compact.slice(lastSeparator + 1);
  const shouldTreatLastAsDecimal = fraction.length > 0 && fraction.length <= 2;

  if (shouldTreatLastAsDecimal) {
    const integer = compact.slice(0, lastSeparator).replace(/[,.]/g, '');
    return Number(`${integer}.${fraction}`);
  }

  return Number(compact.replace(/[,.]/g, ''));
}

function supportsBank(kind: AssetAccountKind): boolean {
  return kind === 'bank' || kind === 'credit_card';
}

function supportsCurrency(kind: AssetAccountKind): boolean {
  return kind !== 'gold';
}

export function AssetAccountForm({
  account = null,
  busy = false,
  onCancel,
  onSubmit,
}: AssetAccountFormProps) {
  const [state, setState] = useState<FormState>(() => initialState(account));
  const [error, setError] = useState<string | null>(null);
  const isEditing = account != null;

  useEffect(() => {
    setState(initialState(account));
    setError(null);
  }, [account]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState(current => ({ ...current, [key]: value }));
  }

  function chooseKind(kind: AssetAccountKind) {
    setState(current => ({
      ...current,
      kind,
      currency: currencyForKind(kind, current.currency),
      bank: supportsBank(kind) ? current.bank : '',
      identifier: supportsBank(kind) ? current.identifier : '',
    }));
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = state.name.trim();
    if (!name) {
      setError('Tên tài sản là bắt buộc.');
      return;
    }

    const amount = parseNumberInput(state.amount);
    if (!Number.isFinite(amount)) {
      setError('Số dư hoặc số lượng phải là số.');
      return;
    }

    if ((state.kind === 'gold' || state.kind === 'foreign_currency') && amount < 0) {
      setError('Số lượng không được âm.');
      return;
    }

    const bank = state.bank.trim();
    const identifier = state.identifier.trim();
    if (supportsBank(state.kind) && identifier && !bank) {
      setError('Hãy nhập ngân hàng trước khi thêm mã thẻ hoặc tài khoản.');
      return;
    }

    const normalizedAmount = state.kind === 'credit_card' && !isEditing ? Math.abs(amount) : amount;
    const normalizedCurrency = currencyForKind(state.kind, state.currency);

    await onSubmit({
      id: account?.id,
      createdAt: account?.createdAt,
      kind: state.kind,
      name,
      currency: normalizedCurrency,
      balance: state.kind === 'gold' ? 0 : normalizedAmount,
      quantity: state.kind === 'gold' ? normalizedAmount : undefined,
      goldUnit: state.kind === 'gold' ? state.goldUnit : undefined,
      bank: supportsBank(state.kind) && bank ? bank : null,
      accountIdentifier: state.kind === 'bank' && identifier ? identifier : null,
      cardIdentifier: state.kind === 'credit_card' && identifier ? identifier : null,
      includeInTotal: state.includeInTotal,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="asset-account-form">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white">{isEditing ? 'Sửa tài sản' : 'Thêm tài sản'}</h2>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300"
        >
          Hủy
        </button>
      </div>

      <section aria-label="Loại tài sản">
        <h3 className="text-sm font-semibold text-slate-300">Loại tài sản</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {KIND_OPTIONS.map(option => {
            const selected = state.kind === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => chooseKind(option.value)}
                className={[
                  'min-h-11 rounded-2xl border px-3 text-sm font-semibold transition',
                  selected
                    ? 'border-sky-300 bg-sky-300/15 text-sky-100'
                    : 'border-white/10 bg-white/[0.055] text-slate-300',
                ].join(' ')}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      <DarkField label="Tên tài sản">
        <input
          value={state.name}
          onChange={event => update('name', event.target.value)}
          autoFocus
        />
      </DarkField>

      {supportsCurrency(state.kind) && (
        <label className="block text-sm font-medium text-slate-300">
          Tiền tệ
          <select
            value={currencyForKind(state.kind, state.currency)}
            onChange={event => update('currency', event.target.value as AssetCurrency)}
            className={`mt-2 ${SELECT_CLASS}`}
          >
            {currencyOptionsForKind(state.kind).map(currency => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </select>
        </label>
      )}

      <DarkField label={amountLabel(state.kind)}>
        <input
          inputMode="decimal"
          value={state.amount}
          onChange={event => update('amount', event.target.value)}
        />
      </DarkField>

      {state.kind === 'gold' && (
        <label className="block text-sm font-medium text-slate-300">
          Đơn vị vàng
          <select
            value={state.goldUnit}
            onChange={event => update('goldUnit', event.target.value as GoldUnit)}
            className={`mt-2 ${SELECT_CLASS}`}
          >
            <option value="gram">gram</option>
            <option value="chi">chỉ</option>
            <option value="luong">lượng</option>
          </select>
        </label>
      )}

      {supportsBank(state.kind) && (
        <>
          <DarkField label="Ngân hàng">
            <input
              value={state.bank}
              onChange={event => update('bank', event.target.value)}
            />
          </DarkField>
          <DarkField label="Mã thẻ hoặc tài khoản">
            <input
              value={state.identifier}
              onChange={event => update('identifier', event.target.value)}
            />
          </DarkField>
        </>
      )}

      <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-4 text-sm font-semibold text-slate-200">
        <span>Tính vào tổng tài sản</span>
        <input
          type="checkbox"
          checked={state.includeInTotal}
          onChange={event => update('includeInTotal', event.target.checked)}
          className="h-5 w-5 accent-sky-400"
        />
      </label>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-sky-400 px-4 font-bold text-slate-950 disabled:bg-slate-700 disabled:text-slate-400"
      >
        Lưu tài sản
      </button>
    </form>
  );
}
