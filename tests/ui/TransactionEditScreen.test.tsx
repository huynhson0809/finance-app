import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { initI18n, i18n } from '../../src/i18n';
import { __resetDBForTests } from '../../src/db';
import { getAllRules } from '../../src/db/category-rules';
import type { Transaction, UserCategory } from '../../src/types';

const transactionMocks = vi.hoisted(() => ({
  supabase: {},
  getCloudTransaction: vi.fn(),
  updateCloudTransaction: vi.fn(),
  deleteCloudTransaction: vi.fn(),
  addCloudTransaction: vi.fn(),
}));

const customCategoryMocks = vi.hoisted(() => ({
  categories: [] as UserCategory[],
}));

vi.mock('../../src/supabase/client', () => ({
  get supabase() {
    return transactionMocks.supabase;
  },
}));

vi.mock('../../src/supabase/transactions', () => ({
  getCloudTransaction: transactionMocks.getCloudTransaction,
  updateCloudTransaction: transactionMocks.updateCloudTransaction,
  deleteCloudTransaction: transactionMocks.deleteCloudTransaction,
  addCloudTransaction: transactionMocks.addCloudTransaction,
}));

vi.mock('../../src/hooks/useCustomCategories', () => ({
  useCustomCategories: vi.fn(() => ({
    categories: customCategoryMocks.categories,
    loading: false,
    error: null,
    reload: vi.fn(),
    addCategory: vi.fn(),
    renameCategory: vi.fn(),
    deleteCategory: vi.fn(),
  })),
}));

import { TransactionEditScreen } from '../../src/ui/TransactionEditScreen';

beforeAll(async () => { await initI18n(); });

beforeEach(async () => {
  await i18n.changeLanguage('vi');
  await __resetDBForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('finance-app');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
  vi.restoreAllMocks();
  transactionMocks.supabase = {};
  transactionMocks.getCloudTransaction.mockReset();
  transactionMocks.updateCloudTransaction.mockReset();
  transactionMocks.deleteCloudTransaction.mockReset();
  transactionMocks.addCloudTransaction.mockReset();
  customCategoryMocks.categories = [];
});

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    amount: 38560,
    currency: 'VND',
    occurredAt: '2026-07-08T04:14:42.000Z',
    merchant: 'Giao dịch chi tiêu tại Grab* BXTTDKA62JSE-G-3',
    category: 'transportation',
    direction: 'expense',
    source: 'bank-email',
    bankHint: 'mb',
    bank: 'MB',
    transactionType: 'card',
    rawSource: 'email',
    createdAt: '2026-07-08T04:14:45.000Z',
    updatedAt: '2026-07-08T04:14:45.000Z',
    ...overrides,
  } as Transaction;
}

function customCategory(overrides: Partial<UserCategory> = {}): UserCategory {
  return {
    id: 'custom-expense-pet-care',
    direction: 'expense',
    name: 'Pet Care',
    createdAt: '2026-07-08T04:14:45.000Z',
    updatedAt: '2026-07-08T04:14:45.000Z',
    ...overrides,
  } as UserCategory;
}

type TestEntry = string | {
  pathname: string;
  search?: string;
  state?: {
    backTo?: string;
  };
};

function renderEdit(entry: TestEntry = '/transactions/tx-1') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<div>Home</div>} />
        <Route path="/calendar" element={<div>Calendar</div>} />
        <Route path="/transactions/:id" element={<TransactionEditScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TransactionEditScreen', () => {
  it('renders editable fields, metadata, and direction-specific categories', async () => {
    transactionMocks.getCloudTransaction.mockResolvedValue(tx());

    renderEdit();

    expect(await screen.findByRole('heading', { name: /chỉnh sửa/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/ngày/i)).toHaveValue('2026-07-08T11:14');
    expect(screen.getByLabelText(/ghi chú/i)).toHaveValue('Giao dịch chi tiêu tại Grab* BXTTDKA62JSE-G-3');
    expect(screen.getByLabelText(/tiền chi/i)).toHaveValue(38560);
    expect(screen.getByText('Email ngân hàng')).toBeInTheDocument();
    expect(screen.getByText('MB')).toBeInTheDocument();
    expect(screen.getByText('MB Card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /đi lại/i, pressed: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lương/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument();
  });

  it('returns to the calendar when opened from the calendar', async () => {
    const user = userEvent.setup();
    transactionMocks.getCloudTransaction.mockResolvedValue(tx());

    renderEdit({
      pathname: '/transactions/tx-1',
      state: { backTo: '/calendar?month=2026-07' },
    });

    await screen.findByRole('heading', { name: /chỉnh sửa/i });
    await user.click(screen.getByRole('button', { name: /back/i }));

    expect(await screen.findByText('Calendar')).toBeInTheDocument();
  });

  it('saves edited amount, date, text, and category', async () => {
    const user = userEvent.setup();
    transactionMocks.getCloudTransaction.mockResolvedValue(tx());
    transactionMocks.updateCloudTransaction.mockResolvedValue(tx({ amount: 45000, category: 'food-drinks' }));

    renderEdit();

    await screen.findByRole('heading', { name: /chỉnh sửa/i });
    await user.clear(screen.getByLabelText(/tiền chi/i));
    await user.type(screen.getByLabelText(/tiền chi/i), '45000');
    await user.clear(screen.getByLabelText(/ghi chú/i));
    await user.type(screen.getByLabelText(/ghi chú/i), 'Updated memo');
    await user.click(screen.getByRole('button', { name: /ăn uống/i }));
    await user.click(screen.getByRole('button', { name: /lưu thay đổi/i }));

    await waitFor(() => {
      expect(transactionMocks.updateCloudTransaction).toHaveBeenCalledWith(
        expect.anything(),
        'tx-1',
        expect.objectContaining({
          amount: 45000,
          content: 'Updated memo',
          merchant: 'Updated memo',
          note: null,
          category: 'food-drinks',
        }),
      );
    });
    expect(await screen.findByText('Home')).toBeInTheDocument();
  });

  it('learns a local rule when correcting an email transaction category', async () => {
    const user = userEvent.setup();
    transactionMocks.getCloudTransaction.mockResolvedValue(tx({
      category: 'others',
      merchant: 'Lunch near office',
      source: 'bank-email',
      rawSource: 'email',
    }));
    transactionMocks.updateCloudTransaction.mockResolvedValue(tx({
      category: 'food-drinks',
      merchant: 'Lunch near office',
    }));

    renderEdit();

    await screen.findByRole('heading', { name: /chỉnh sửa/i });
    await user.click(screen.getByRole('button', { name: /ăn uống/i }));
    await user.click(screen.getByRole('button', { name: /lưu thay đổi/i }));

    await waitFor(async () => {
      const rules = await getAllRules();
      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({
        pattern: 'lunch near office',
        category: 'food-drinks',
        learned: true,
      });
    });
  });

  it('saves an edited transaction with a custom category', async () => {
    const user = userEvent.setup();
    customCategoryMocks.categories = [customCategory()];
    transactionMocks.getCloudTransaction.mockResolvedValue(tx());
    transactionMocks.updateCloudTransaction.mockResolvedValue(tx({ category: 'custom-expense-pet-care' }));

    renderEdit();

    await screen.findByRole('heading', { name: /chỉnh sửa/i });
    await user.click(screen.getByRole('button', { name: 'Pet Care' }));
    await user.click(screen.getByRole('button', { name: /lưu thay đổi/i }));

    await waitFor(() => {
      expect(transactionMocks.updateCloudTransaction).toHaveBeenCalledWith(
        expect.anything(),
        'tx-1',
        expect.objectContaining({
          category: 'custom-expense-pet-care',
        }),
      );
    });
    expect(await screen.findByText('Home')).toBeInTheDocument();
  });

  it('renders an existing custom category that is missing from local settings', async () => {
    transactionMocks.getCloudTransaction.mockResolvedValue(tx({
      category: 'custom-expense-child-care',
      merchant: 'Child care',
    }));

    renderEdit();

    expect(await screen.findByRole('heading', { name: /chỉnh sửa/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Child Care', pressed: true })).toBeInTheDocument();
  });

  it('saves blank text with category fallback content', async () => {
    const user = userEvent.setup();
    transactionMocks.getCloudTransaction.mockResolvedValue(tx());
    transactionMocks.updateCloudTransaction.mockResolvedValue(tx({ merchant: undefined }));

    renderEdit();

    await screen.findByRole('heading', { name: /chỉnh sửa/i });
    await user.clear(screen.getByLabelText(/ghi chú/i));
    await user.click(screen.getByRole('button', { name: /lưu thay đổi/i }));

    await waitFor(() => {
      expect(transactionMocks.updateCloudTransaction).toHaveBeenCalledWith(
        expect.anything(),
        'tx-1',
        expect.objectContaining({
          content: 'transportation',
          merchant: null,
          note: null,
          category: 'transportation',
        }),
      );
    });
    expect(await screen.findByText('Home')).toBeInTheDocument();
  });

  it('confirms before deleting a transaction', async () => {
    const user = userEvent.setup();
    transactionMocks.getCloudTransaction.mockResolvedValue(tx());
    transactionMocks.deleteCloudTransaction.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(true);

    renderEdit();

    await screen.findByRole('heading', { name: /chỉnh sửa/i });
    await user.click(screen.getByRole('button', { name: /xóa/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith('Xóa giao dịch này?');
    await waitFor(() => {
      expect(transactionMocks.deleteCloudTransaction).toHaveBeenCalledWith(expect.anything(), 'tx-1');
    });
    expect(await screen.findByText('Home')).toBeInTheDocument();
  });

  it('does not delete when confirmation is cancelled', async () => {
    const user = userEvent.setup();
    transactionMocks.getCloudTransaction.mockResolvedValue(tx());
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);

    renderEdit();

    expect(await screen.findByRole('heading', { name: /chỉnh sửa/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /xóa/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith('Xóa giao dịch này?');
    expect(transactionMocks.deleteCloudTransaction).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: /chỉnh sửa/i })).toBeInTheDocument();
  });

});
