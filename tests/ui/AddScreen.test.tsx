import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AddScreen } from '../../src/ui/AddScreen';
import { HomeScreen } from '../../src/ui/HomeScreen';
import { initI18n } from '../../src/i18n';
import { __resetDBForTests } from '../../src/db';
import { getAllRules } from '../../src/db/category-rules';

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
  it('saves a transaction with the entered amount and selected category', async () => {
    const user = userEvent.setup();
    renderAt('/add');
    // Three taps: digit 4, digit 5, then three zeros via the "000" key, pick chip, save
    await user.click(screen.getByRole('button', { name: '4' }));
    await user.click(screen.getByRole('button', { name: '5' }));
    await user.click(screen.getByRole('button', { name: '000' }));
    await user.click(screen.getByRole('button', { name: /Cà phê|Coffee/ }));
    await user.click(screen.getByRole('button', { name: /Lưu|Save/ }));
    expect(saveMocks.saveUserTransaction).toHaveBeenCalledWith(expect.objectContaining({
      amount: 45000,
      category: 'coffee-bubble-tea',
      source: 'manual',
    }));
  });
});

it('shows a visible error when saving a manual transaction fails', async () => {
  saveMocks.saveUserTransaction.mockRejectedValue(new Error('new row violates row-level security policy'));
  const user = userEvent.setup();

  render(<MemoryRouter><AddScreen /></MemoryRouter>);

  await user.click(screen.getByRole('button', { name: '4' }));
  await user.click(screen.getByRole('button', { name: '5' }));
  await user.click(screen.getByRole('button', { name: '000' }));
  await user.click(screen.getByRole('button', { name: /Cà phê|Coffee/ }));
  await user.click(screen.getByRole('button', { name: /Lưu|Save/ }));

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
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('0'));
  fireEvent.click(screen.getByText('0'));
  fireEvent.click(screen.getByText('0'));
  fireEvent.click(screen.getByText('0'));
  // merchant -> triggers suggestion 'coffee-bubble-tea'
  fireEvent.change(screen.getByLabelText(/merchant|cửa hàng/i), {
    target: { value: 'Highlands Coffee' },
  });
  // wait for chip selected
  await waitFor(() => screen.getByRole('button', { name: /coffee|cà phê/i, pressed: true }));
  // override → tap food-drinks
  fireEvent.click(screen.getByRole('button', { name: /food|ăn uống/i }));
  // save
  fireEvent.click(screen.getByRole('button', { name: /save|lưu/i }));
  await waitFor(async () => {
    const rules = await getAllRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].pattern).toBe('highlands coffee');
    expect(rules[0].category).toBe('food-drinks');
  });
});
