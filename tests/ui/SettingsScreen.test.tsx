import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { MemoryRouter } from 'react-router-dom';
import { __resetDBForTests } from '../../src/db';
import { upsertBudget, getBudgetForMonth } from '../../src/db/budgets';
import { monthOf, todayISO } from '../../src/lib/date';
import { initI18n } from '../../src/i18n';
import { SettingsScreen } from '../../src/ui/SettingsScreen';

beforeAll(async () => { await initI18n(); });

beforeEach(async () => {
  await __resetDBForTests();
  indexedDB.deleteDatabase('finance-app');
});

describe('SettingsScreen caps editor', () => {
  it('saves a per-category cap after debounce', async () => {
    await upsertBudget(monthOf(todayISO()), 5000000);
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
    // open the disclosure
    fireEvent.click(await screen.findByRole('button', { name: /caps|hạng mục/i }));
    const coffeeInput = await screen.findByLabelText(/coffee|cà phê/i);
    fireEvent.change(coffeeInput, { target: { value: '500000' } });
    await waitFor(async () => {
      const b = await getBudgetForMonth(monthOf(todayISO()));
      expect(b?.caps?.['coffee-bubble-tea']).toBe(500000);
    }, { timeout: 1500 });
  });

  it('clears a cap when input is emptied', async () => {
    await upsertBudget(monthOf(todayISO()), 5000000, { 'coffee-bubble-tea': 500000 });
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /caps|hạng mục/i }));
    const coffeeInput = await screen.findByLabelText(/coffee|cà phê/i);
    fireEvent.change(coffeeInput, { target: { value: '' } });
    await waitFor(async () => {
      const b = await getBudgetForMonth(monthOf(todayISO()));
      expect(b?.caps?.['coffee-bubble-tea']).toBeUndefined();
    }, { timeout: 1500 });
  });
});
