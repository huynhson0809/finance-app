import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { initI18n, i18n } from '../../src/i18n';
import type { Transaction } from '../../src/types';

const transactionMocks = vi.hoisted(() => ({
  supabase: {},
  getCloudTransaction: vi.fn(),
  updateCloudTransaction: vi.fn(),
  deleteCloudTransaction: vi.fn(),
  addCloudTransaction: vi.fn(),
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

import { TransactionEditScreen } from '../../src/ui/TransactionEditScreen';

beforeAll(async () => { await initI18n(); });

beforeEach(async () => {
  await i18n.changeLanguage('vi');
  transactionMocks.supabase = {};
  transactionMocks.getCloudTransaction.mockReset();
  transactionMocks.updateCloudTransaction.mockReset();
  transactionMocks.deleteCloudTransaction.mockReset();
  transactionMocks.addCloudTransaction.mockReset();
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

function renderEdit(path = '/transactions/tx-1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>Home</div>} />
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

  it('copies the visible transaction as a manual transaction', async () => {
    const user = userEvent.setup();
    transactionMocks.getCloudTransaction.mockResolvedValue(tx());
    transactionMocks.addCloudTransaction.mockResolvedValue(tx({ source: 'manual', bank: undefined }));

    renderEdit();

    await screen.findByRole('heading', { name: /chỉnh sửa/i });
    await user.click(screen.getByRole('button', { name: /copy/i }));

    await waitFor(() => {
      expect(transactionMocks.addCloudTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          amount: 38560,
          direction: 'expense',
          category: 'transportation',
          source: 'manual',
          merchant: 'Giao dịch chi tiêu tại Grab* BXTTDKA62JSE-G-3',
        }),
      );
    });
    expect(await screen.findByText('Home')).toBeInTheDocument();
  });
});
