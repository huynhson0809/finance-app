import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AssetAccount, AssetRate } from '../../src/assets/types';
import { clearSpendlyQueryCacheForTests } from '../../src/query/client';
import type { AssetRateRefreshResult } from '../../src/supabase/rates';

const assetMocks = vi.hoisted(() => ({
  supabase: {} as unknown,
  accounts: [] as AssetAccount[],
  rates: [] as AssetRate[],
  nextId: 1,
  getUser: vi.fn(),
  invokeFunction: vi.fn(),
  listCloudAssetAccounts: vi.fn(),
  listCloudAssetRates: vi.fn(),
  listCloudAssetEvents: vi.fn(),
  upsertCloudAssetAccount: vi.fn(),
  reorderCloudAssetAccounts: vi.fn(),
  upsertCloudAssetRate: vi.fn(),
  deleteCloudAssetRate: vi.fn(),
  refreshCloudAssetRates: vi.fn(),
}));

vi.mock('../../src/supabase/client', () => ({
  get supabase() {
    return assetMocks.supabase;
  },
}));

vi.mock('../../src/supabase/assets', () => ({
  listCloudAssetAccounts: assetMocks.listCloudAssetAccounts,
  listCloudAssetEvents: assetMocks.listCloudAssetEvents,
  upsertCloudAssetAccount: assetMocks.upsertCloudAssetAccount,
  reorderCloudAssetAccounts: assetMocks.reorderCloudAssetAccounts,
}));

vi.mock('../../src/supabase/rates', () => ({
  listCloudAssetRates: assetMocks.listCloudAssetRates,
  upsertCloudAssetRate: assetMocks.upsertCloudAssetRate,
  deleteCloudAssetRate: assetMocks.deleteCloudAssetRate,
  refreshCloudAssetRates: assetMocks.refreshCloudAssetRates,
}));

import { AssetManagementScreen } from '../../src/ui/AssetManagementScreen';

function nowIso() {
  return '2026-07-11T00:00:00.000Z';
}

function account(overrides: Partial<AssetAccount> = {}): AssetAccount {
  return {
    id: overrides.id ?? `account-${assetMocks.nextId++}`,
    userId: 'user-1',
    kind: 'cash',
    name: 'Cash',
    currency: 'VND',
    balance: 0,
    includeInTotal: true,
    sortOrder: assetMocks.accounts.length,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
}

function rate(overrides: Partial<AssetRate> = {}): AssetRate {
  return {
    id: 'rate-usd',
    userId: 'user-1',
    pair: 'USD_VND',
    value: 25_000,
    source: 'manual',
    fetchedAt: nowIso(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
}

function refreshResult(
  outcomes: AssetRateRefreshResult['outcomes'] = {
    USD_VND: 'refreshed',
    GOLD_GRAM_VND: 'refreshed',
  },
): AssetRateRefreshResult {
  return {
    ok: true,
    outcomes,
    rates: assetMocks.rates.filter(item => item.source === 'auto'),
  };
}

function resetMocks() {
  clearSpendlyQueryCacheForTests();
  assetMocks.getUser.mockReset();
  assetMocks.invokeFunction.mockReset();
  assetMocks.getUser.mockResolvedValue({
    data: { user: { id: 'user-1' } },
    error: null,
  });
  assetMocks.invokeFunction.mockResolvedValue({ data: { ok: true }, error: null });
  assetMocks.supabase = {
    auth: { getUser: assetMocks.getUser },
    functions: { invoke: assetMocks.invokeFunction },
  };
  assetMocks.accounts = [];
  assetMocks.rates = [
    rate({
      id: 'rate-usd-auto',
      userId: undefined,
      value: 24_500,
      source: 'auto',
      fetchedAt: '2026-07-10T00:00:00.000Z',
    }),
    rate({ id: 'rate-usd-manual' }),
    rate({
      id: 'rate-gold-auto',
      userId: undefined,
      pair: 'GOLD_GRAM_VND',
      value: 1_900_000,
      source: 'auto',
      fetchedAt: '2026-07-10T00:00:00.000Z',
    }),
    rate({
      id: 'rate-gold-manual',
      pair: 'GOLD_GRAM_VND',
      value: 2_000_000,
    }),
  ];
  assetMocks.nextId = 1;
  assetMocks.listCloudAssetAccounts.mockReset();
  assetMocks.listCloudAssetRates.mockReset();
  assetMocks.listCloudAssetEvents.mockReset();
  assetMocks.upsertCloudAssetAccount.mockReset();
  assetMocks.reorderCloudAssetAccounts.mockReset();
  assetMocks.upsertCloudAssetRate.mockReset();
  assetMocks.deleteCloudAssetRate.mockReset();
  assetMocks.refreshCloudAssetRates.mockReset();
  assetMocks.listCloudAssetAccounts.mockImplementation(() => Promise.resolve([...assetMocks.accounts]));
  assetMocks.listCloudAssetRates.mockImplementation(() => Promise.resolve([...assetMocks.rates]));
  assetMocks.listCloudAssetEvents.mockResolvedValue([]);
  assetMocks.upsertCloudAssetAccount.mockImplementation(async (_client: unknown, input: Partial<AssetAccount>) => {
    const existing = input.id
      ? assetMocks.accounts.find(item => item.id === input.id)
      : undefined;
    const saved = account({
      ...existing,
      ...input,
      id: input.id ?? `account-${assetMocks.nextId++}`,
      sortOrder: input.sortOrder ?? existing?.sortOrder ?? assetMocks.accounts.length,
      createdAt: input.createdAt ?? existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    });
    const existingIndex = assetMocks.accounts.findIndex(item => item.id === saved.id);
    if (existingIndex >= 0) {
      assetMocks.accounts.splice(existingIndex, 1, saved);
    } else {
      assetMocks.accounts.push(saved);
    }
    assetMocks.accounts.sort((left, right) => left.sortOrder - right.sortOrder);
    return saved;
  });
  assetMocks.reorderCloudAssetAccounts.mockImplementation(async (_client: unknown, ids: string[]) => {
    assetMocks.accounts = ids.map((id, index) => ({
      ...assetMocks.accounts.find(accountItem => accountItem.id === id)!,
      sortOrder: index,
    }));
  });
  assetMocks.upsertCloudAssetRate.mockImplementation(async (
    _client: unknown,
    input: Pick<AssetRate, 'pair' | 'value'>,
  ) => {
    const existing = assetMocks.rates.find(item => (
      item.pair === input.pair && item.source === 'manual' && item.userId === 'user-1'
    ));
    const saved = rate({
      ...existing,
      id: existing?.id ?? `rate-${input.pair.toLowerCase()}-manual`,
      userId: 'user-1',
      pair: input.pair,
      value: input.value,
      source: 'manual',
      fetchedAt: nowIso(),
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    });
    assetMocks.rates = [
      ...assetMocks.rates.filter(item => !(
        item.pair === input.pair && item.source === 'manual' && item.userId === 'user-1'
      )),
      saved,
    ];
    return saved;
  });
  assetMocks.deleteCloudAssetRate.mockImplementation(async (_client: unknown, pair: AssetRate['pair']) => {
    assetMocks.rates = assetMocks.rates.filter(item => !(
      item.pair === pair && item.source === 'manual' && item.userId === 'user-1'
    ));
  });
  assetMocks.refreshCloudAssetRates.mockImplementation(async () => {
    assetMocks.rates = assetMocks.rates.map(item => item.source === 'auto'
      ? { ...item, fetchedAt: '2026-07-12T00:00:00.000Z', value: item.value + 100 }
      : item);
    return refreshResult();
  });
}

beforeEach(() => {
  resetMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/assets']}>
      <Routes>
        <Route path="/" element={<div>Home</div>} />
        <Route path="/assets" element={<AssetManagementScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openForm(user: ReturnType<typeof userEvent.setup>) {
  renderScreen();
  await user.click(await screen.findByRole('button', { name: 'Thêm tài sản' }));
}

describe('AssetManagementScreen', () => {
  it('shows effective values, sources, and fetched times for both rate pairs', async () => {
    assetMocks.rates = [
      rate({
        id: 'usd-auto',
        userId: undefined,
        source: 'auto',
        value: 24_500,
        fetchedAt: '2026-07-10T02:30:00.000Z',
      }),
      rate({
        id: 'gold-manual',
        pair: 'GOLD_GRAM_VND',
        value: 2_100_000,
        fetchedAt: '2026-07-11T01:15:00.000Z',
      }),
    ];
    renderScreen();

    const usdRate = await screen.findByRole('region', { name: 'USD / VND' });
    expect(await within(usdRate).findByText('1 USD = 24.500 ₫')).toBeInTheDocument();
    expect(within(usdRate).getByText('Tự động')).toBeInTheDocument();
    expect(within(usdRate).getByText('09:30 10/07/2026')).toBeInTheDocument();
    expect(within(usdRate).getByRole('button', { name: 'Xóa tỷ giá thủ công USD / VND' })).toBeDisabled();

    const goldRate = screen.getByRole('region', { name: 'Gram vàng / VND' });
    expect(within(goldRate).getByText('1 gram vàng = 2.100.000 ₫')).toBeInTheDocument();
    expect(within(goldRate).getByText('Thủ công')).toBeInTheDocument();
    expect(within(goldRate).getByText('08:15 11/07/2026')).toBeInTheDocument();
    expect(within(goldRate).getByRole('button', {
      name: 'Xóa tỷ giá thủ công Gram vàng / VND',
    })).toBeEnabled();
  });

  it('saves a Vietnamese-formatted override and clears it back to automatic', async () => {
    assetMocks.rates = assetMocks.rates.filter(item => !(
      item.pair === 'USD_VND' && item.source === 'manual'
    ));
    const user = userEvent.setup();
    renderScreen();

    const usdRate = await screen.findByRole('region', { name: 'USD / VND' });
    const input = within(usdRate).getByLabelText('Tỷ giá thủ công USD / VND');
    const clearButton = within(usdRate).getByRole('button', {
      name: 'Xóa tỷ giá thủ công USD / VND',
    });
    await waitFor(() => expect(input).toHaveValue('24.500'));
    expect(clearButton).toBeDisabled();

    await user.clear(input);
    await user.type(input, '25.500,5');
    await user.click(within(usdRate).getByRole('button', {
      name: 'Lưu tỷ giá thủ công USD / VND',
    }));

    await waitFor(() => {
      expect(assetMocks.upsertCloudAssetRate).toHaveBeenCalledWith(assetMocks.supabase, {
        pair: 'USD_VND',
        value: 25_500.5,
      });
    });
    expect(await within(usdRate).findByText('1 USD = 25.500,5 ₫')).toBeInTheDocument();
    expect(within(usdRate).getByText('Thủ công')).toBeInTheDocument();
    expect(clearButton).toBeEnabled();

    await user.click(clearButton);
    await waitFor(() => {
      expect(assetMocks.deleteCloudAssetRate).toHaveBeenCalledWith(assetMocks.supabase, 'USD_VND');
    });
    expect(await within(usdRate).findByText('1 USD = 24.500 ₫')).toBeInTheDocument();
    expect(within(usdRate).getByText('Tự động')).toBeInTheDocument();
    expect(clearButton).toBeDisabled();
  });

  it('shows refresh progress and all-refreshed feedback with manual precedence in an Info popover', async () => {
    let finishRefresh: ((result: AssetRateRefreshResult) => void) | undefined;
    assetMocks.refreshCloudAssetRates.mockImplementationOnce(() => new Promise(resolve => {
      finishRefresh = resolve;
    }));
    const user = userEvent.setup();
    renderScreen();

    const refreshButton = await screen.findByRole('button', { name: 'Làm mới tỷ giá tự động' });
    const infoButton = screen.getByRole('button', { name: 'Thông tin về tỷ giá thủ công' });
    expect(screen.queryByText(/tỷ giá thủ công luôn được ưu tiên áp dụng/i)).not.toBeInTheDocument();
    expect(infoButton).toHaveAttribute('aria-expanded', 'false');
    await user.click(infoButton);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Tỷ giá thủ công luôn được ưu tiên áp dụng cho đến khi bạn xóa tỷ giá đó.',
    );
    expect(infoButton).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(infoButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(refreshButton);

    expect(refreshButton).toBeDisabled();
    expect(refreshButton).toHaveAttribute('aria-busy', 'true');
    expect(refreshButton).toHaveTextContent('Đang làm mới');
    expect(assetMocks.refreshCloudAssetRates).toHaveBeenCalledWith(assetMocks.supabase);

    await act(async () => {
      finishRefresh?.(refreshResult());
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã làm mới tất cả tỷ giá tự động.',
    );
    expect(assetMocks.refreshCloudAssetRates).toHaveBeenCalledTimes(1);
    expect(refreshButton).toBeEnabled();
    expect(refreshButton).toHaveAttribute('aria-busy', 'false');
  });

  it.each([
    {
      name: 'already-current cached rates',
      outcomes: { USD_VND: 'cached', GOLD_GRAM_VND: 'cached' },
      role: 'status',
      message: 'Tỷ giá tự động đã được cập nhật trước đó và vẫn còn hiệu lực.',
    },
    {
      name: 'a refreshed and a cached rate',
      outcomes: { USD_VND: 'refreshed', GOLD_GRAM_VND: 'cached' },
      role: 'status',
      message: 'Đã làm mới một phần tỷ giá tự động (USD / VND). Gram vàng / VND đã được cập nhật trước đó và vẫn còn hiệu lực.',
    },
    {
      name: 'a partially unavailable refresh',
      outcomes: { USD_VND: 'refreshed', GOLD_GRAM_VND: 'unavailable' },
      role: 'alert',
      message: 'Đã làm mới một phần tỷ giá tự động (USD / VND). Chưa thể cập nhật Gram vàng / VND.',
    },
    {
      name: 'both unavailable rates',
      outcomes: { USD_VND: 'unavailable', GOLD_GRAM_VND: 'unavailable' },
      role: 'alert',
      message: 'Tỷ giá tự động hiện không khả dụng.',
    },
  ] as const)('reports $name accurately', async ({ outcomes, role, message }) => {
    assetMocks.refreshCloudAssetRates.mockResolvedValueOnce(refreshResult(outcomes));
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Làm mới tỷ giá tự động' }));

    expect(await screen.findByRole(role)).toHaveTextContent(message);
    expect(assetMocks.refreshCloudAssetRates).toHaveBeenCalledTimes(1);
  });

  it('validates that overrides are positive finite values', async () => {
    const user = userEvent.setup();
    renderScreen();

    const usdRate = await screen.findByRole('region', { name: 'USD / VND' });
    const input = within(usdRate).getByLabelText('Tỷ giá thủ công USD / VND');
    const saveButton = within(usdRate).getByRole('button', {
      name: 'Lưu tỷ giá thủ công USD / VND',
    });
    await waitFor(() => expect(input).toHaveValue('25.000'));
    await user.clear(input);
    await user.type(input, '0');
    await user.click(saveButton);

    expect(within(usdRate).getByRole('alert')).toHaveTextContent(
      'Nhập tỷ giá là một số hữu hạn lớn hơn 0.',
    );
    expect(assetMocks.upsertCloudAssetRate).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, '1e309');
    await user.click(saveButton);
    expect(within(usdRate).getByRole('alert')).toHaveTextContent(
      'Nhập tỷ giá là một số hữu hạn lớn hơn 0.',
    );
    expect(assetMocks.upsertCloudAssetRate).not.toHaveBeenCalled();
  });

  it('shows refresh failures and re-enables the refresh control', async () => {
    assetMocks.refreshCloudAssetRates.mockRejectedValueOnce(new Error('Dịch vụ tỷ giá tạm thời lỗi.'));
    const user = userEvent.setup();
    renderScreen();

    const refreshButton = await screen.findByRole('button', { name: 'Làm mới tỷ giá tự động' });
    await user.click(refreshButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể làm mới tỷ giá tự động: Dịch vụ tỷ giá tạm thời lỗi.',
    );
    expect(refreshButton).toBeEnabled();
  });

  it('keeps a rate query error visible alongside refresh feedback', async () => {
    assetMocks.listCloudAssetRates.mockRejectedValue(new Error('Không thể tải danh sách tỷ giá.'));
    assetMocks.refreshCloudAssetRates.mockResolvedValueOnce(refreshResult({
      USD_VND: 'cached',
      GOLD_GRAM_VND: 'cached',
    }));
    const user = userEvent.setup();
    renderScreen();

    expect(await screen.findByText('Không thể tải danh sách tỷ giá.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Làm mới tỷ giá tự động' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Tỷ giá tự động đã được cập nhật trước đó và vẫn còn hiệu lực.',
    );
    expect(screen.getByText('Không thể tải danh sách tỷ giá.')).toBeInTheDocument();
  });

  it('preserves a typed override when refreshed query data changes', async () => {
    assetMocks.rates = assetMocks.rates.filter(item => !(
      item.pair === 'USD_VND' && item.source === 'manual'
    ));
    assetMocks.refreshCloudAssetRates.mockImplementationOnce(async () => {
      assetMocks.rates = assetMocks.rates.map(item => item.pair === 'USD_VND'
        ? { ...item, value: 26_000, fetchedAt: '2026-07-12T00:00:00.000Z' }
        : item);
      return refreshResult({ USD_VND: 'refreshed', GOLD_GRAM_VND: 'cached' });
    });
    const user = userEvent.setup();
    renderScreen();

    const usdRate = await screen.findByRole('region', { name: 'USD / VND' });
    const input = within(usdRate).getByLabelText('Tỷ giá thủ công USD / VND');
    await waitFor(() => expect(input).toHaveValue('24.500'));
    await user.clear(input);
    await user.type(input, '25.750');
    await user.click(screen.getByRole('button', { name: 'Làm mới tỷ giá tự động' }));

    expect(await within(usdRate).findByText('1 USD = 26.000 ₫')).toBeInTheDocument();
    expect(input).toHaveValue('25.750');
  });

  it('creates a cash account', async () => {
    const user = userEvent.setup();
    await openForm(user);

    await user.type(screen.getByLabelText('Tên tài sản'), 'Ví tiền mặt');
    await user.type(screen.getByLabelText('Số dư ban đầu'), '1.200.000');
    await user.click(screen.getByRole('button', { name: 'Lưu tài sản' }));

    await waitFor(() => {
      expect(assetMocks.upsertCloudAssetAccount).toHaveBeenCalledWith(assetMocks.supabase, expect.objectContaining({
        kind: 'cash',
        name: 'Ví tiền mặt',
        currency: 'VND',
        balance: 1_200_000,
        quantity: undefined,
        includeInTotal: true,
      }));
    });
    expect(await screen.findByText('Ví tiền mặt')).toBeInTheDocument();
    expect(screen.getByText('Tiền mặt')).toBeInTheDocument();
    expect(screen.getAllByText('Tính tổng').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1.200.000 ₫').length).toBeGreaterThan(0);
  });

  it('creates a credit card account as positive debt', async () => {
    const user = userEvent.setup();
    await openForm(user);

    await user.click(screen.getByRole('button', { name: 'Thẻ tín dụng' }));
    await user.type(screen.getByLabelText('Tên tài sản'), 'Visa travel');
    await user.type(screen.getByLabelText('Ngân hàng'), 'VCB');
    await user.type(screen.getByLabelText('Mã thẻ hoặc tài khoản'), '1234');
    await user.type(screen.getByLabelText('Dư nợ hiện tại'), '3500000');
    await user.click(screen.getByRole('button', { name: 'Lưu tài sản' }));

    await waitFor(() => {
      expect(assetMocks.upsertCloudAssetAccount).toHaveBeenCalledWith(assetMocks.supabase, expect.objectContaining({
        kind: 'credit_card',
        name: 'Visa travel',
        balance: 3_500_000,
        bank: 'VCB',
        cardIdentifier: '1234',
        accountIdentifier: null,
      }));
    });
    expect(await screen.findByText('Visa travel')).toBeInTheDocument();
    expect(screen.getByText('VCB')).toBeInTheDocument();
    expect(screen.getAllByText('Thẻ tín dụng').length).toBeGreaterThan(0);
  });

  it('preserves USD when editing a USD credit card', async () => {
    assetMocks.accounts = [
      account({
        id: 'card-usd',
        kind: 'credit_card',
        name: 'USD card',
        currency: 'USD',
        balance: 100,
        sortOrder: 0,
      }),
    ];
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Sửa USD card' }));
    expect(screen.getByLabelText('Tiền tệ')).toHaveValue('USD');
    await user.click(screen.getByRole('button', { name: 'Lưu tài sản' }));

    await waitFor(() => {
      expect(assetMocks.upsertCloudAssetAccount).toHaveBeenCalledWith(assetMocks.supabase, expect.objectContaining({
        id: 'card-usd',
        currency: 'USD',
        balance: 100,
      }));
    });
  });

  it('preserves a negative overpaid credit-card balance when editing', async () => {
    assetMocks.accounts = [
      account({
        id: 'card-overpaid',
        kind: 'credit_card',
        name: 'Overpaid card',
        balance: -100_000,
        sortOrder: 0,
      }),
    ];
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Sửa Overpaid card' }));
    const nameInput = screen.getByLabelText('Tên tài sản');
    await user.clear(nameInput);
    await user.type(nameInput, 'Card đã trả dư');
    await user.click(screen.getByRole('button', { name: 'Lưu tài sản' }));

    await waitFor(() => {
      expect(assetMocks.upsertCloudAssetAccount).toHaveBeenCalledWith(assetMocks.supabase, expect.objectContaining({
        id: 'card-overpaid',
        name: 'Card đã trả dư',
        balance: -100_000,
      }));
    });
  });

  it('requires a bank name before accepting an account identifier', async () => {
    const user = userEvent.setup();
    await openForm(user);

    await user.click(screen.getByRole('button', { name: 'Tài khoản ngân hàng' }));
    await user.type(screen.getByLabelText('Tên tài sản'), 'Tài khoản chính');
    await user.type(screen.getByLabelText('Số dư ban đầu'), '100000');
    await user.type(screen.getByLabelText('Mã thẻ hoặc tài khoản'), '1234');
    await user.click(screen.getByRole('button', { name: 'Lưu tài sản' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Hãy nhập ngân hàng trước khi thêm mã thẻ hoặc tài khoản.',
    );
    expect(assetMocks.upsertCloudAssetAccount).not.toHaveBeenCalled();
  });

  it('creates a gold account using chi', async () => {
    const user = userEvent.setup();
    await openForm(user);

    await user.click(screen.getByRole('button', { name: 'Vàng' }));
    await user.type(screen.getByLabelText('Tên tài sản'), 'Vàng cưới');
    await user.selectOptions(screen.getByLabelText('Đơn vị vàng'), 'chi');
    await user.type(screen.getByLabelText('Số lượng'), '2');
    await user.click(screen.getByRole('button', { name: 'Lưu tài sản' }));

    await waitFor(() => {
      expect(assetMocks.upsertCloudAssetAccount).toHaveBeenCalledWith(assetMocks.supabase, expect.objectContaining({
        kind: 'gold',
        name: 'Vàng cưới',
        balance: 0,
        quantity: 2,
        goldUnit: 'chi',
      }));
    });
    expect(await screen.findByText('Vàng cưới')).toBeInTheDocument();
    expect(screen.getByText('2 chỉ')).toBeInTheDocument();
    expect(screen.getAllByText('15.000.000 ₫').length).toBeGreaterThan(0);
  });

  it('creates USD foreign currency and does not offer an invalid VND choice', async () => {
    const user = userEvent.setup();
    await openForm(user);

    await user.click(screen.getByRole('button', { name: 'Ngoại tệ' }));
    const currencySelect = screen.getByLabelText('Tiền tệ') as HTMLSelectElement;
    expect(Array.from(currencySelect.options).map(option => option.value)).toEqual(['USD']);

    await user.type(screen.getByLabelText('Tên tài sản'), 'USD cash');
    await user.type(screen.getByLabelText('Số lượng'), '10');
    await user.click(screen.getByRole('button', { name: 'Lưu tài sản' }));

    await waitFor(() => {
      expect(assetMocks.upsertCloudAssetAccount).toHaveBeenCalledWith(assetMocks.supabase, expect.objectContaining({
        kind: 'foreign_currency',
        name: 'USD cash',
        currency: 'USD',
        balance: 10,
      }));
    });
    expect(await screen.findByText('USD cash')).toBeInTheDocument();
    expect(screen.getByText('10 USD')).toBeInTheDocument();
    expect(screen.getAllByText('250.000 ₫').length).toBeGreaterThan(0);
  });

  it('edits an account name and balance', async () => {
    assetMocks.accounts = [
      account({ id: 'cash-1', name: 'Ví cũ', balance: 100_000, sortOrder: 0 }),
    ];
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /Sửa Ví cũ/i }));
    const nameInput = screen.getByLabelText('Tên tài sản');
    await user.clear(nameInput);
    await user.type(nameInput, 'Ví mới');
    const balanceInput = screen.getByLabelText('Số dư ban đầu');
    await user.clear(balanceInput);
    await user.type(balanceInput, '250000');
    await user.click(screen.getByRole('button', { name: 'Lưu tài sản' }));

    await waitFor(() => {
      expect(assetMocks.upsertCloudAssetAccount).toHaveBeenCalledWith(assetMocks.supabase, expect.objectContaining({
        id: 'cash-1',
        name: 'Ví mới',
        balance: 250_000,
      }));
      expect(assetMocks.upsertCloudAssetAccount.mock.calls.at(-1)?.[1]).not.toHaveProperty('sortOrder');
    });
    expect(await screen.findByText('Ví mới')).toBeInTheDocument();
    expect(screen.queryByText('Ví cũ')).not.toBeInTheDocument();
  });

  it('reorders accounts', async () => {
    assetMocks.accounts = [
      account({ id: 'cash-1', name: 'Ví tiền mặt', sortOrder: 0 }),
      account({ id: 'bank-1', kind: 'bank', name: 'Tài khoản MB', sortOrder: 1 }),
    ];
    renderScreen();

    const rows = await screen.findAllByTestId('asset-account-row');
    fireEvent.dragStart(within(rows[0]).getByRole('button', { name: 'Kéo Ví tiền mặt' }));
    fireEvent.dragOver(rows[1]);
    fireEvent.drop(rows[1]);

    await waitFor(() => {
      expect(assetMocks.reorderCloudAssetAccounts).toHaveBeenCalledWith(assetMocks.supabase, ['bank-1', 'cash-1']);
    });
    const reorderedRows = await screen.findAllByTestId('asset-account-row');
    expect(reorderedRows.map(row => within(row).getByTestId('asset-account-name').textContent)).toEqual([
      'Tài khoản MB',
      'Ví tiền mặt',
    ]);
  });

  it('ignores drag and drop across asset groups', async () => {
    assetMocks.accounts = [
      account({ id: 'cash-1', name: 'Ví tiền mặt', sortOrder: 0 }),
      account({ id: 'card-1', kind: 'credit_card', name: 'Visa', sortOrder: 1 }),
      account({ id: 'bank-1', kind: 'bank', name: 'Tài khoản MB', sortOrder: 2 }),
    ];
    renderScreen();

    const rows = await screen.findAllByTestId('asset-account-row');
    const cashRow = rows.find(row => within(row).queryByText('Ví tiền mặt'))!;
    const cardRow = rows.find(row => within(row).queryByText('Visa'))!;
    fireEvent.dragStart(within(cashRow).getByRole('button', { name: 'Kéo Ví tiền mặt' }));
    fireEvent.dragOver(cardRow);
    fireEvent.drop(cardRow);

    expect(assetMocks.reorderCloudAssetAccounts).not.toHaveBeenCalled();
  });

  it('reorders interleaved accounts without moving another group slot', async () => {
    assetMocks.accounts = [
      account({ id: 'cash-1', name: 'Ví tiền mặt', sortOrder: 0 }),
      account({ id: 'card-1', kind: 'credit_card', name: 'Visa', sortOrder: 1 }),
      account({ id: 'bank-1', kind: 'bank', name: 'Tài khoản MB', sortOrder: 2 }),
    ];
    renderScreen();

    const rows = await screen.findAllByTestId('asset-account-row');
    const cashRow = rows.find(row => within(row).queryByText('Ví tiền mặt'))!;
    const bankRow = rows.find(row => within(row).queryByText('Tài khoản MB'))!;
    fireEvent.dragStart(within(cashRow).getByRole('button', { name: 'Kéo Ví tiền mặt' }));
    fireEvent.dragOver(bankRow);
    fireEvent.drop(bankRow);

    await waitFor(() => {
      expect(assetMocks.reorderCloudAssetAccounts).toHaveBeenCalledWith(
        assetMocks.supabase,
        ['bank-1', 'card-1', 'cash-1'],
      );
    });
  });
});
