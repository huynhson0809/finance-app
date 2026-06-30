import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
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

describe('SettingsScreen backup', () => {
  it('export downloads a finance-backup-*.json file', async () => {
    // pre-seed with one transaction so the export has data
    await import('../../src/db/transactions').then(m => m.addTransaction({
      amount: 1000, currency: 'VND',
      occurredAt: '2026-06-15T08:00:00.000Z',
      category: 'others', source: 'manual',
    }));

    // capture URL.createObjectURL + anchor click
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /export|xuất/i }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    clickSpy.mockRestore();
  });

  it('import replaces existing data after confirm', async () => {
    // pre-seed with one transaction
    await import('../../src/db/transactions').then(m => m.addTransaction({
      amount: 999, currency: 'VND',
      occurredAt: '2026-01-01T00:00:00.000Z',
      category: 'others', source: 'manual',
    }));

    // user confirms the dialog
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      writable: true,
      configurable: true,
    });

    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);

    // fire change directly on the hidden input (importHandlerVia file input)
    const fileInput = screen.getByTestId('backup-import-input') as HTMLInputElement;
    const file = new File([JSON.stringify({
      app: 'finance-app',
      schemaVersion: 1,
      exportedAt: '2026-06-30T00:00:00.000Z',
      transactions: [{
        id: 't1', amount: 5000, currency: 'VND',
        occurredAt: '2026-06-15T08:00:00.000Z',
        category: 'food-drinks', source: 'manual',
        createdAt: '2026-06-15T08:00:00.000Z',
        updatedAt: '2026-06-15T08:00:00.000Z',
      }],
      budgets: [], categoryRules: [], settings: [],
    })], 'b.json', { type: 'application/json' });

    const user = userEvent.setup();
    await user.upload(fileInput, file);

    await waitFor(() => expect(reload).toHaveBeenCalled());

    // verify the DB was replaced
    const { openFinanceDB } = await import('../../src/db');
    const db = await openFinanceDB();
    const txs = await db.getAll('transactions');
    expect(txs).toHaveLength(1);
    expect(txs[0].id).toBe('t1');
  });
});
