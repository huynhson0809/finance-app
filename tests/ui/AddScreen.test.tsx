import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AddScreen } from '../../src/ui/AddScreen';
import { HomeScreen } from '../../src/ui/HomeScreen';
import { initI18n } from '../../src/i18n';
import { listTransactions } from '../../src/db/transactions';

beforeAll(async () => { await initI18n(); });

beforeEach(async () => {
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
    const all = await listTransactions();
    expect(all).toHaveLength(1);
    expect(all[0].amount).toBe(45000);
    expect(all[0].category).toBe('coffee-bubble-tea');
  });
});
