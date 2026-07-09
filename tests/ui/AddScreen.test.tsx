import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AddScreen } from '../../src/ui/AddScreen';
import { HomeScreen } from '../../src/ui/HomeScreen';
import { initI18n } from '../../src/i18n';
import { __resetDBForTests } from '../../src/db';
import { getAllRules } from '../../src/db/category-rules';
import { vietnamDateInputToNoonISO } from '../../src/lib/date';

const saveMocks = vi.hoisted(() => ({
  saveUserTransaction: vi.fn(),
}));

vi.mock('../../src/transactions/save', () => ({
  saveUserTransaction: saveMocks.saveUserTransaction,
}));

beforeAll(async () => { await initI18n(); });

beforeEach(async () => {
  await __resetDBForTests();
  saveMocks.saveUserTransaction.mockReset();
  saveMocks.saveUserTransaction.mockResolvedValue({});
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase('finance-app');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/add" element={<AddScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AddScreen manual entry', () => {
  it('renders the compact manual-entry screen without the email setup tile', () => {
    render(<MemoryRouter><AddScreen /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: /add transaction|thêm giao dịch/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByLabelText(/image|hình ảnh|ảnh/i)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /direction|loại giao dịch/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /manage categories|quản lý danh mục/i })).toBeInTheDocument();
    expect(screen.queryByText(/link email/i)).not.toBeInTheDocument();
  });

  it('saves a transaction with the entered amount and selected category', async () => {
    const user = userEvent.setup();
    renderAt('/add');
    await user.clear(screen.getByLabelText(/date|ngày/i));
    await user.type(screen.getByLabelText(/date|ngày/i), '2026-07-07');
    await user.clear(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }));
    await user.type(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }), '45000');
    await user.click(screen.getByRole('button', { name: /Cà phê|Coffee/ }));
    await user.click(screen.getByRole('button', { name: /add expense|thêm tiền chi/i }));
    expect(saveMocks.saveUserTransaction).toHaveBeenCalledWith(expect.objectContaining({
      amount: 45000,
      direction: 'expense',
      category: 'coffee-bubble-tea',
      source: 'manual',
      occurredAt: vietnamDateInputToNoonISO('2026-07-07'),
    }));
  });

  it('does not save when the date is cleared', async () => {
    const user = userEvent.setup();
    renderAt('/add');

    await user.clear(screen.getByLabelText(/date|ngày/i));
    await user.type(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }), '4000');
    await user.click(screen.getByRole('button', { name: /Cà phê|Coffee/ }));

    const saveButton = screen.getByRole('button', { name: /add expense|thêm tiền chi/i });
    expect(saveButton).toBeDisabled();
    await user.click(saveButton);
    expect(saveMocks.saveUserTransaction).not.toHaveBeenCalled();
  });

  it('saves a manual income transaction with an income category', async () => {
    const user = userEvent.setup();
    renderAt('/add');

    await user.click(screen.getByRole('button', { name: /tiền thu|income/i }));
    await user.clear(screen.getByLabelText(/date|ngày/i));
    await user.type(screen.getByLabelText(/date|ngày/i), '2026-07-07');
    await user.type(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }), '5000');
    await user.click(screen.getByRole('button', { name: /salary|lương/i }));
    await user.click(screen.getByRole('button', { name: /add income|thêm tiền thu/i }));

    expect(saveMocks.saveUserTransaction).toHaveBeenCalledWith(expect.objectContaining({
      amount: 5000,
      direction: 'income',
      category: 'salary',
      source: 'manual',
      occurredAt: vietnamDateInputToNoonISO('2026-07-07'),
    }));
  });

  it('filters category chips when switching transaction direction', async () => {
    const user = userEvent.setup();
    renderAt('/add');

    expect(screen.getByRole('button', { name: /food|ăn uống/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /salary|lương/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /tiền thu|income/i }));

    expect(screen.queryByRole('button', { name: /food|ăn uống/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /salary|lương/i })).toBeInTheDocument();
  });

  it('adds a custom expense category from the manager and saves with it', async () => {
    const user = userEvent.setup();
    renderAt('/add');

    await user.click(screen.getByRole('button', { name: /manage categories|quản lý danh mục/i }));
    await user.type(screen.getByLabelText(/new category name|tên danh mục mới/i), 'Snacks');
    await user.click(screen.getByRole('button', { name: /add category|thêm danh mục/i }));

    const customChip = await screen.findByRole('button', { name: 'Snacks', pressed: true });
    expect(customChip).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/date|ngày/i));
    await user.type(screen.getByLabelText(/date|ngày/i), '2026-07-07');
    await user.type(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }), '35000');
    await user.click(screen.getByRole('button', { name: /add expense|thêm tiền chi/i }));

    expect(saveMocks.saveUserTransaction).toHaveBeenCalledWith(expect.objectContaining({
      amount: 35000,
      direction: 'expense',
      category: expect.stringMatching(/^custom-expense-snacks-/),
      source: 'manual',
      occurredAt: vietnamDateInputToNoonISO('2026-07-07'),
    }));
  });

  it('adds a custom income category after switching direction and saves with it', async () => {
    const user = userEvent.setup();
    renderAt('/add');

    await user.click(screen.getByRole('button', { name: /tiền thu|income/i }));
    await user.click(screen.getByRole('button', { name: /manage categories|quản lý danh mục/i }));
    await user.type(screen.getByLabelText(/new category name|tên danh mục mới/i), 'Gift');
    await user.click(screen.getByRole('button', { name: /add category|thêm danh mục/i }));

    const customChip = await screen.findByRole('button', { name: 'Gift', pressed: true });
    expect(customChip).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/date|ngày/i));
    await user.type(screen.getByLabelText(/date|ngày/i), '2026-07-07');
    await user.type(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }), '120000');
    await user.click(screen.getByRole('button', { name: /add income|thêm tiền thu/i }));

    expect(saveMocks.saveUserTransaction).toHaveBeenCalledWith(expect.objectContaining({
      amount: 120000,
      direction: 'income',
      category: expect.stringMatching(/^custom-income-gift-/),
      source: 'manual',
      occurredAt: vietnamDateInputToNoonISO('2026-07-07'),
    }));
  });

  it('renames and deletes a custom category from the manager', async () => {
    const user = userEvent.setup();
    renderAt('/add');

    await user.click(screen.getByRole('button', { name: /manage categories|quản lý danh mục/i }));
    await user.type(screen.getByLabelText(/new category name|tên danh mục mới/i), 'Snacks');
    await user.click(screen.getByRole('button', { name: /add category|thêm danh mục/i }));
    expect(await screen.findByRole('button', { name: 'Snacks' })).toBeInTheDocument();

    const renameInput = await screen.findByLabelText(/rename Snacks|đổi tên Snacks/i);
    await user.clear(renameInput);
    await user.type(renameInput, 'Treats');
    await user.click(screen.getByRole('button', { name: /save Snacks|lưu Snacks/i }));

    expect(await screen.findByRole('button', { name: 'Treats' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Snacks' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /delete Treats|xoá Treats|xóa Treats/i }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Treats' })).not.toBeInTheDocument();
    });
  });
});

it('shows a visible error when saving a manual transaction fails', async () => {
  saveMocks.saveUserTransaction.mockRejectedValue(new Error('new row violates row-level security policy'));
  const user = userEvent.setup();

  render(<MemoryRouter><AddScreen /></MemoryRouter>);

  await user.type(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }), '45000');
  await user.click(screen.getByRole('button', { name: /Cà phê|Coffee/ }));
  await user.click(screen.getByRole('button', { name: /add expense|thêm tiền chi/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/could not save|không thể lưu/i);
  expect(screen.getByRole('alert')).toHaveTextContent('new row violates row-level security policy');
});

it('auto-highlights category chip when merchant matches seed', async () => {
  render(<MemoryRouter><AddScreen /></MemoryRouter>);
  const input = screen.getByLabelText(/merchant|cửa hàng/i);
  fireEvent.change(input, { target: { value: 'Highlands Coffee' } });
  await waitFor(() => {
    const chip = screen.getByRole('button', { name: /coffee|cà phê/i, pressed: true });
    expect(chip).toBeInTheDocument();
  });
});

it('learns when user overrides the suggested chip on save', async () => {
  render(<MemoryRouter><AddScreen /></MemoryRouter>);
  // enter amount
  fireEvent.change(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }), {
    target: { value: '10000' },
  });
  // merchant -> triggers suggestion 'coffee-bubble-tea'
  fireEvent.change(screen.getByLabelText(/merchant|cửa hàng/i), {
    target: { value: 'Highlands Coffee' },
  });
  // wait for chip selected
  await waitFor(() => screen.getByRole('button', { name: /coffee|cà phê/i, pressed: true }));
  // override → tap food-drinks
  fireEvent.click(screen.getByRole('button', { name: /food|ăn uống/i }));
  // save
  fireEvent.click(screen.getByRole('button', { name: /add expense|thêm tiền chi/i }));
  await waitFor(async () => {
    const rules = await getAllRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].pattern).toBe('highlands coffee');
    expect(rules[0].category).toBe('food-drinks');
  });
});
