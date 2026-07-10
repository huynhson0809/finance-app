import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AddScreen } from '../../src/ui/AddScreen';
import { HomeScreen } from '../../src/ui/HomeScreen';
import { initI18n } from '../../src/i18n';
import { __resetDBForTests } from '../../src/db';
import { getAllRules } from '../../src/db/category-rules';
import { createCustomCategory } from '../../src/db/custom-categories';
import { vietnamDatetimeInputToISO } from '../../src/lib/date';

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

afterEach(() => {
  vi.useRealTimers();
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
  it('defaults a new manual transaction to the current Vietnam time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-10T14:34:00.000Z'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderAt('/add');

    await user.type(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }), '500000');
    await user.click(screen.getByRole('button', { name: /transport|đi lại/i }));
    await user.click(screen.getByRole('button', { name: /add expense|thêm tiền chi/i }));

    expect(saveMocks.saveUserTransaction).toHaveBeenCalledWith(expect.objectContaining({
      amount: 500000,
      direction: 'expense',
      category: 'transportation',
      source: 'manual',
      occurredAt: '2026-07-10T14:34:00.000Z',
    }));

  });

  it('renders the compact manual-entry screen without the email setup tile', () => {
    render(<MemoryRouter><AddScreen /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: /add transaction|thêm giao dịch/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByLabelText(/image|hình ảnh|ảnh/i)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /direction|loại giao dịch/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /manage categories|quản lý danh mục/i })).toHaveAttribute('href', '/categories?direction=expense');
    expect(screen.getByTestId('add-fixed-form')).toHaveClass('shrink-0');
    expect(screen.getByTestId('add-category-scroll')).toHaveClass('overflow-hidden');
    expect(screen.getByTestId('add-submit-footer')).toHaveClass('fixed');
    expect(screen.queryByText(/link email/i)).not.toBeInTheDocument();
  });

  it('saves a transaction with the entered amount and selected category', async () => {
    const user = userEvent.setup();
    renderAt('/add');
    await user.clear(screen.getByLabelText(/date|ngày/i));
    await user.type(screen.getByLabelText(/date|ngày/i), '2026-07-07T09:15');
    await user.type(screen.getByLabelText(/note|ghi chú/i), 'Ăn uống trưa');
    await user.clear(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }));
    await user.type(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }), '45000');
    await user.click(screen.getByRole('button', { name: /Cà phê|Coffee/ }));
    await user.click(screen.getByRole('button', { name: /add expense|thêm tiền chi/i }));
    const saved = saveMocks.saveUserTransaction.mock.calls[0]?.[0];
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
    await user.type(screen.getByLabelText(/date|ngày/i), '2026-07-07T08:30');
    await user.type(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }), '5000');
    await user.click(screen.getByRole('button', { name: /salary|lương/i }));
    await user.click(screen.getByRole('button', { name: /add income|thêm tiền thu/i }));

    expect(saveMocks.saveUserTransaction).toHaveBeenCalledWith(expect.objectContaining({
      amount: 5000,
      direction: 'income',
      category: 'salary',
      source: 'manual',
      occurredAt: vietnamDatetimeInputToISO('2026-07-07T08:30'),
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

  it('renders a saved custom expense category and saves with it', async () => {
    const customCategory = await createCustomCategory('expense', 'Snacks', 'shopping');
    const user = userEvent.setup();
    renderAt('/add');

    const customChip = await screen.findByRole('button', { name: 'Snacks' });
    expect(customChip).toBeInTheDocument();
    await user.click(customChip);

    await user.clear(screen.getByLabelText(/date|ngày/i));
    await user.type(screen.getByLabelText(/date|ngày/i), '2026-07-07T15:45');
    await user.type(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }), '35000');
    await user.click(screen.getByRole('button', { name: /add expense|thêm tiền chi/i }));

    expect(saveMocks.saveUserTransaction).toHaveBeenCalledWith(expect.objectContaining({
      amount: 35000,
      direction: 'expense',
      category: customCategory.id,
      source: 'manual',
      occurredAt: vietnamDatetimeInputToISO('2026-07-07T15:45'),
    }));
  });

  it('renders a saved custom income category after switching direction and saves with it', async () => {
    const customCategory = await createCustomCategory('income', 'Gift', 'gift');
    const user = userEvent.setup();
    renderAt('/add');

    await user.click(screen.getByRole('button', { name: /tiền thu|income/i }));
    const customChip = await screen.findByRole('button', { name: 'Gift' });
    expect(customChip).toBeInTheDocument();
    await user.click(customChip);

    await user.clear(screen.getByLabelText(/date|ngày/i));
    await user.type(screen.getByLabelText(/date|ngày/i), '2026-07-07T18:05');
    await user.type(screen.getByLabelText(/amount|số tiền/i, { selector: 'input' }), '120000');
    await user.click(screen.getByRole('button', { name: /add income|thêm tiền thu/i }));

    expect(saveMocks.saveUserTransaction).toHaveBeenCalledWith(expect.objectContaining({
      amount: 120000,
      direction: 'income',
      category: customCategory.id,
      source: 'manual',
      occurredAt: vietnamDatetimeInputToISO('2026-07-07T18:05'),
    }));
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

it('auto-highlights category chip when note matches seed', async () => {
  render(<MemoryRouter><AddScreen /></MemoryRouter>);
  const input = screen.getByLabelText(/note|ghi chú/i);
  fireEvent.change(input, { target: { value: 'Highlands Coffee' } });
  await waitFor(() => {
    const chip = screen.getByRole('button', { name: /coffee|cà phê/i, pressed: true });
    expect(chip).toBeInTheDocument();
  });
});

it('auto-highlights food when note contains the Vietnamese category label', async () => {
  render(<MemoryRouter><AddScreen /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText(/note|ghi chú/i), {
    target: { value: 'chuyển khoản ăn uống' },
  });

  await waitFor(() => {
    const chip = screen.getByRole('button', { name: /food|ăn uống/i, pressed: true });
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
  fireEvent.change(screen.getByLabelText(/note|ghi chú/i), {
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
