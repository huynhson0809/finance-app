import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AssetAccount } from '../../src/assets/types';
import { AddScreen } from '../../src/ui/AddScreen';
import { initI18n, i18n } from '../../src/i18n';
import { __resetDBForTests } from '../../src/db';
import { getAllRules } from '../../src/db/category-rules';
import { createCustomCategory } from '../../src/db/custom-categories';
import { vietnamDatetimeInputToISO } from '../../src/lib/date';
import { clearSpendlyQueryCacheForTests } from '../../src/query/client';

const saveMocks = vi.hoisted(() => ({
  saveTransactionWithAssetEffect: vi.fn(),
  saveAssetTransfer: vi.fn(),
}));

const assetMocks = vi.hoisted(() => ({
  accounts: [] as AssetAccount[],
  isLoading: false,
  isError: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));

vi.mock('../../src/assets/save', () => ({
  saveTransactionWithAssetEffect: saveMocks.saveTransactionWithAssetEffect,
  saveAssetTransfer: saveMocks.saveAssetTransfer,
}));

vi.mock('../../src/hooks/useAssets', () => ({
  useAssetAccounts: () => ({
    data: assetMocks.accounts,
    isLoading: assetMocks.isLoading,
    isError: assetMocks.isError,
    error: assetMocks.error,
    refetch: assetMocks.refetch,
  }),
}));

function account(overrides: Partial<AssetAccount> = {}): AssetAccount {
  return {
    id: 'cash-1',
    userId: 'user-1',
    kind: 'cash',
    name: 'Ví tiền mặt',
    currency: 'VND',
    balance: 0,
    includeInTotal: true,
    sortOrder: 0,
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    ...overrides,
  };
}

beforeAll(async () => {
  await initI18n();
});

beforeEach(async () => {
  await __resetDBForTests();
  await i18n.changeLanguage('vi');
  clearSpendlyQueryCacheForTests();
  assetMocks.accounts = [];
  assetMocks.isLoading = false;
  assetMocks.isError = false;
  assetMocks.error = null;
  assetMocks.refetch.mockReset();
  assetMocks.refetch.mockResolvedValue({});
  saveMocks.saveTransactionWithAssetEffect.mockReset();
  saveMocks.saveTransactionWithAssetEffect.mockResolvedValue({});
  saveMocks.saveAssetTransfer.mockReset();
  saveMocks.saveAssetTransfer.mockResolvedValue(undefined);
  await new Promise<void>(resolve => {
    const request = indexedDB.deleteDatabase('finance-app');
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
  clearSpendlyQueryCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderAt(path = '/add') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>Home</div>} />
        <Route path="/add" element={<AddScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AddScreen manual entry', () => {
  it('defaults a new manual transaction to the current Vietnam time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-10T14:34:00.000Z'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderAt();

    await user.type(screen.getByLabelText('Số tiền'), '500000');
    await user.click(screen.getByRole('button', { name: 'Đi lại' }));
    await user.click(screen.getByRole('button', { name: 'Thêm tiền chi' }));

    expect(saveMocks.saveTransactionWithAssetEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 500000,
        direction: 'expense',
        category: 'transportation',
        source: 'manual',
        occurredAt: '2026-07-10T14:34:00.000Z',
        operationId: expect.any(String),
      }),
    );
  });

  it('keeps the form and submit fixed while only the category list scrolls', () => {
    renderAt();

    expect(screen.getByRole('heading', { name: 'Thêm giao dịch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chi tiêu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thu nhập' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chuyển tiền' })).toBeInTheDocument();
    expect(screen.getByLabelText('Số tiền')).toBeInTheDocument();
    expect(screen.getByLabelText(/hình ảnh|ảnh/i)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Loại giao dịch' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quản lý danh mục' })).toHaveAttribute(
      'href',
      '/categories?direction=expense',
    );
    expect(screen.getByTestId('add-screen')).toHaveClass('overflow-hidden');
    expect(screen.getByTestId('add-header')).toHaveClass('shrink-0');
    expect(screen.getByTestId('add-fixed-form')).toHaveClass('shrink-0');
    expect(screen.getByTestId('add-category-scroll')).toHaveClass('overflow-hidden');
    expect(screen.getByTestId('add-category-list')).toHaveClass('overflow-y-auto');
    expect(screen.getByTestId('add-submit-footer')).toHaveClass('fixed');
    expect(screen.queryByText(/link email/i)).not.toBeInTheDocument();
  });

  it('labels the note field Ghi chú instead of Cửa hàng', () => {
    renderAt();

    expect(screen.getByLabelText('Ghi chú', { selector: 'input' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Cửa hàng')).not.toBeInTheDocument();
  });

  it('keeps legacy saving available and links to asset setup when there are no accounts', async () => {
    const user = userEvent.setup();
    renderAt();

    expect(screen.queryByLabelText('Tài khoản chi')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Thiết lập tài khoản' })).toHaveAttribute(
      'href',
      '/assets',
    );

    await user.type(screen.getByLabelText('Số tiền'), '45000');
    await user.click(screen.getByRole('button', { name: 'Cà phê & Trà sữa' }));
    await user.click(screen.getByRole('button', { name: 'Thêm tiền chi' }));

    expect(saveMocks.saveTransactionWithAssetEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 45000,
        direction: 'expense',
        assetAccountId: undefined,
      }),
    );
  });

  it('blocks saving and offers retry when accounts fail to load', async () => {
    assetMocks.isError = true;
    assetMocks.error = new Error('network unavailable');
    const user = userEvent.setup();
    renderAt();

    expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải tài khoản.');
    expect(screen.queryByRole('link', { name: 'Thiết lập tài khoản' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Số tiền'), '45000');
    await user.click(screen.getByRole('button', { name: 'Ăn uống' }));
    expect(screen.getByRole('button', { name: 'Thêm tiền chi' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(assetMocks.refetch).toHaveBeenCalledTimes(1);
    expect(saveMocks.saveTransactionWithAssetEffect).not.toHaveBeenCalled();
  });

  it('defaults to the first cash or bank account and saves a selected expense wallet', async () => {
    assetMocks.accounts = [
      account({
        id: 'savings-1',
        kind: 'savings',
        name: 'Tiết kiệm',
        sortOrder: 0,
      }),
      account({
        id: 'cash-1',
        name: 'Ví tiền mặt',
        sortOrder: 1,
      }),
      account({
        id: 'bank-1',
        kind: 'bank',
        name: 'Tài khoản MB',
        sortOrder: 2,
      }),
    ];
    const user = userEvent.setup();
    renderAt();

    const wallet = screen.getByLabelText('Tài khoản chi');
    await waitFor(() => expect(wallet).toHaveValue('cash-1'));
    await user.selectOptions(wallet, 'bank-1');
    await user.type(screen.getByLabelText('Số tiền'), '125000');
    await user.click(screen.getByRole('button', { name: 'Ăn uống' }));
    await user.click(screen.getByRole('button', { name: 'Thêm tiền chi' }));

    expect(saveMocks.saveTransactionWithAssetEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'expense',
        assetAccountId: 'bank-1',
        operationId: expect.any(String),
      }),
    );
  });

  it('allows selecting a credit card for an expense', async () => {
    assetMocks.accounts = [
      account(),
      account({
        id: 'card-1',
        kind: 'credit_card',
        name: 'Visa Travel',
        sortOrder: 1,
      }),
    ];
    const user = userEvent.setup();
    renderAt();

    const wallet = screen.getByLabelText('Tài khoản chi');
    expect(within(wallet).getByRole('option', { name: 'Visa Travel' })).toBeInTheDocument();
    await user.selectOptions(wallet, 'card-1');
    await user.type(screen.getByLabelText('Số tiền'), '800000');
    await user.click(screen.getByRole('button', { name: 'Mua sắm' }));
    await user.click(screen.getByRole('button', { name: 'Thêm tiền chi' }));

    expect(saveMocks.saveTransactionWithAssetEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'expense',
        assetAccountId: 'card-1',
      }),
    );
  });

  it('uses a non-credit destination account for income', async () => {
    assetMocks.accounts = [
      account({
        id: 'card-1',
        kind: 'credit_card',
        name: 'Visa Travel',
        sortOrder: 0,
      }),
      account({
        id: 'savings-1',
        kind: 'savings',
        name: 'Tiết kiệm',
        sortOrder: 1,
      }),
      account({
        id: 'bank-1',
        kind: 'bank',
        name: 'Tài khoản MB',
        sortOrder: 2,
      }),
    ];
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('button', { name: 'Thu nhập' }));
    const destination = screen.getByLabelText('Tài khoản nhận');
    await waitFor(() => expect(destination).toHaveValue('bank-1'));
    expect(within(destination).queryByRole('option', { name: 'Visa Travel' })).not.toBeInTheDocument();
    await user.selectOptions(destination, 'savings-1');
    await user.type(screen.getByLabelText('Số tiền'), '5000000');
    await user.click(screen.getByRole('button', { name: 'Lương' }));
    await user.click(screen.getByRole('button', { name: 'Thêm tiền thu' }));

    expect(saveMocks.saveTransactionWithAssetEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'income',
        category: 'salary',
        assetAccountId: 'savings-1',
        operationId: expect.any(String),
      }),
    );
  });

  it('validates and saves a transfer', async () => {
    assetMocks.accounts = [
      account({
        id: 'bank-1',
        kind: 'bank',
        name: 'Tài khoản MB',
      }),
      account({
        id: 'savings-1',
        kind: 'savings',
        name: 'Tiết kiệm',
        sortOrder: 1,
      }),
    ];
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('button', { name: 'Chuyển tiền' }));
    const from = screen.getByLabelText('Từ tài khoản');
    const to = screen.getByLabelText('Đến tài khoản');
    await waitFor(() => {
      expect(from).toHaveValue('bank-1');
      expect(to).toHaveValue('savings-1');
    });
    expect(screen.queryByTestId('add-category-scroll')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Ngày'));
    await user.type(screen.getByLabelText('Ngày'), '2026-07-07T11:20');
    await user.type(screen.getByLabelText('Ghi chú'), 'Để dành tháng 7');
    await user.type(screen.getByLabelText('Số tiền'), '750000');
    await user.selectOptions(to, 'bank-1');
    expect(screen.getByRole('button', { name: 'Lưu chuyển tiền' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Tài khoản nguồn và đích phải khác nhau.',
    );

    await user.selectOptions(to, 'savings-1');
    await user.click(screen.getByRole('button', { name: 'Lưu chuyển tiền' }));

    expect(saveMocks.saveAssetTransfer).toHaveBeenCalledWith({
      fromAccountId: 'bank-1',
      toAccountId: 'savings-1',
      amount: 750000,
      currency: 'VND',
      occurredAt: vietnamDatetimeInputToISO('2026-07-07T11:20'),
      note: 'Để dành tháng 7',
      operationId: expect.any(String),
    });
    expect(saveMocks.saveTransactionWithAssetEffect).not.toHaveBeenCalled();
  });

  it('preserves cents when transferring between USD accounts', async () => {
    assetMocks.accounts = [
      account({
        id: 'usd-cash-1',
        kind: 'foreign_currency',
        name: 'USD cash',
        currency: 'USD',
      }),
      account({
        id: 'usd-cash-2',
        kind: 'foreign_currency',
        name: 'USD reserve',
        currency: 'USD',
        sortOrder: 1,
      }),
    ];
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('button', { name: 'Chuyển tiền' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Từ tài khoản')).toHaveValue('usd-cash-1');
      expect(screen.getByLabelText('Đến tài khoản')).toHaveValue('usd-cash-2');
    });
    await user.type(screen.getByLabelText('Số tiền'), '12.50');
    await user.click(screen.getByRole('button', { name: 'Lưu chuyển tiền' }));

    expect(saveMocks.saveAssetTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 12.5,
        currency: 'USD',
      }),
    );
  });

  it('clears the amount when the selected currency context changes', async () => {
    assetMocks.accounts = [
      account({ id: 'vnd-bank-1', kind: 'bank', name: 'VND bank' }),
      account({ id: 'vnd-cash-1', name: 'VND cash', sortOrder: 1 }),
      account({
        id: 'usd-cash-1',
        kind: 'foreign_currency',
        name: 'USD cash',
        currency: 'USD',
        sortOrder: 2,
      }),
      account({
        id: 'usd-cash-2',
        kind: 'foreign_currency',
        name: 'USD reserve',
        currency: 'USD',
        sortOrder: 3,
      }),
    ];
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('button', { name: 'Chuyển tiền' }));
    const source = screen.getByLabelText('Từ tài khoản');
    const amountInput = screen.getByLabelText('Số tiền');
    await waitFor(() => expect(source).toHaveValue('vnd-bank-1'));
    await user.type(amountInput, '1250');

    await user.selectOptions(source, 'usd-cash-1');
    await waitFor(() => expect(amountInput).toHaveValue(''));
    await user.type(amountInput, '12.50');

    await user.click(screen.getByRole('button', { name: 'Chi tiêu' }));
    await waitFor(() => expect(amountInput).toHaveValue(''));
  });

  it('reuses the same operation ID when a failed save is retried', async () => {
    saveMocks.saveTransactionWithAssetEffect.mockRejectedValueOnce(
      new Error('temporary network failure'),
    );
    const user = userEvent.setup();
    renderAt();

    await user.type(screen.getByLabelText('Số tiền'), '45000');
    await user.click(screen.getByRole('button', { name: 'Cà phê & Trà sữa' }));
    await user.click(screen.getByRole('button', { name: 'Thêm tiền chi' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('temporary network failure');
    const firstOperationId = saveMocks.saveTransactionWithAssetEffect.mock.calls[0]?.[0]
      ?.operationId;

    await user.click(screen.getByRole('button', { name: 'Thêm tiền chi' }));
    await waitFor(() => {
      expect(saveMocks.saveTransactionWithAssetEffect).toHaveBeenCalledTimes(2);
    });
    const secondOperationId = saveMocks.saveTransactionWithAssetEffect.mock.calls[1]?.[0]
      ?.operationId;

    expect(firstOperationId).toEqual(expect.any(String));
    expect(secondOperationId).toBe(firstOperationId);
  });

  it('saves the entered note and never introduces a merchant field', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.clear(screen.getByLabelText('Ngày'));
    await user.type(screen.getByLabelText('Ngày'), '2026-07-07T09:15');
    await user.type(screen.getByLabelText('Ghi chú'), 'Ăn uống trưa');
    await user.type(screen.getByLabelText('Số tiền'), '45000');
    await user.click(screen.getByRole('button', { name: 'Cà phê & Trà sữa' }));
    await user.click(screen.getByRole('button', { name: 'Thêm tiền chi' }));

    const saved = saveMocks.saveTransactionWithAssetEffect.mock.calls[0]?.[0];
    expect(saved).toEqual(expect.objectContaining({
      amount: 45000,
      direction: 'expense',
      category: 'coffee-bubble-tea',
      note: 'Ăn uống trưa',
      source: 'manual',
      occurredAt: vietnamDatetimeInputToISO('2026-07-07T09:15'),
    }));
    expect(saved).not.toHaveProperty('merchant');
  });

  it('does not save when the date is cleared', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.clear(screen.getByLabelText('Ngày'));
    await user.type(screen.getByLabelText('Số tiền'), '4000');
    await user.click(screen.getByRole('button', { name: 'Cà phê & Trà sữa' }));

    const saveButton = screen.getByRole('button', { name: 'Thêm tiền chi' });
    expect(saveButton).toBeDisabled();
    await user.click(saveButton);
    expect(saveMocks.saveTransactionWithAssetEffect).not.toHaveBeenCalled();
  });

  it('filters category chips when switching transaction mode', async () => {
    const user = userEvent.setup();
    renderAt();

    expect(screen.getByRole('button', { name: 'Ăn uống' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lương' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Thu nhập' }));

    expect(screen.queryByRole('button', { name: 'Ăn uống' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lương' })).toBeInTheDocument();
  });

  it('renders and saves a custom expense category', async () => {
    const customCategory = await createCustomCategory('expense', 'Snacks', 'shopping');
    const user = userEvent.setup();
    renderAt();

    await user.click(await screen.findByRole('button', { name: 'Snacks' }));
    await user.clear(screen.getByLabelText('Ngày'));
    await user.type(screen.getByLabelText('Ngày'), '2026-07-07T15:45');
    await user.type(screen.getByLabelText('Số tiền'), '35000');
    await user.click(screen.getByRole('button', { name: 'Thêm tiền chi' }));

    expect(saveMocks.saveTransactionWithAssetEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 35000,
        direction: 'expense',
        category: customCategory.id,
        source: 'manual',
      }),
    );
  });

  it('renders and saves a custom income category', async () => {
    const customCategory = await createCustomCategory('income', 'Gift', 'gift');
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('button', { name: 'Thu nhập' }));
    await user.click(await screen.findByRole('button', { name: 'Gift' }));
    await user.clear(screen.getByLabelText('Ngày'));
    await user.type(screen.getByLabelText('Ngày'), '2026-07-07T18:05');
    await user.type(screen.getByLabelText('Số tiền'), '120000');
    await user.click(screen.getByRole('button', { name: 'Thêm tiền thu' }));

    expect(saveMocks.saveTransactionWithAssetEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 120000,
        direction: 'income',
        category: customCategory.id,
        source: 'manual',
      }),
    );
  });
});

it('auto-highlights a category when the note matches a seed', async () => {
  renderAt();

  fireEvent.change(screen.getByLabelText('Ghi chú'), {
    target: { value: 'Highlands Coffee' },
  });

  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: 'Cà phê & Trà sữa', pressed: true }),
    ).toBeInTheDocument();
  });
});

it('auto-highlights food when the note contains the Vietnamese category label', async () => {
  renderAt();

  fireEvent.change(screen.getByLabelText('Ghi chú'), {
    target: { value: 'chuyển khoản ăn uống' },
  });

  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: 'Ăn uống', pressed: true }),
    ).toBeInTheDocument();
  });
});

it('learns when the user overrides the suggested category on save', async () => {
  renderAt();

  fireEvent.change(screen.getByLabelText('Số tiền'), {
    target: { value: '10000' },
  });
  fireEvent.change(screen.getByLabelText('Ghi chú'), {
    target: { value: 'Highlands Coffee' },
  });
  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: 'Cà phê & Trà sữa', pressed: true }),
    ).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ăn uống' }));
  fireEvent.click(screen.getByRole('button', { name: 'Thêm tiền chi' }));

  await waitFor(async () => {
    const rules = await getAllRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].pattern).toBe('highlands coffee');
    expect(rules[0].category).toBe('food-drinks');
  });
});
