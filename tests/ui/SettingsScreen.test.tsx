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
import * as settingsModule from '../../src/db/settings';

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
    const setSettingSpy = vi.spyOn(settingsModule, 'setSetting');

    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /export|xuất/i }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
    await waitFor(() => {
      expect(setSettingSpy).toHaveBeenCalledWith('lastBackupAt', expect.any(String));
    });

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    clickSpy.mockRestore();
    setSettingSpy.mockRestore();
  });

  it('import replaces existing data after confirm', async () => {
    const originalLocation = window.location;
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadMock },
    });

    try {
      // pre-seed with one transaction
      await import('../../src/db/transactions').then(m => m.addTransaction({
        amount: 999, currency: 'VND',
        occurredAt: '2026-01-01T00:00:00.000Z',
        category: 'others', source: 'manual',
      }));

      // user confirms the dialog
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.spyOn(window, 'alert').mockImplementation(() => {});

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

      await waitFor(() => expect(reloadMock).toHaveBeenCalled());

      // verify the DB was replaced
      const { openFinanceDB } = await import('../../src/db');
      const db = await openFinanceDB();
      const txs = await db.getAll('transactions');
      expect(txs).toHaveLength(1);
      expect(txs[0].id).toBe('t1');
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it('import button triggers confirm dialog before opening file picker', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const inputClickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
    const user = userEvent.setup();
    const importBtn = await screen.findByRole('button', { name: /restore|khôi phục/i });
    await user.click(importBtn);

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    // When confirm returns false, file input click should NOT fire
    expect(inputClickSpy).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
    inputClickSpy.mockRestore();
  });

  it('import button triggers file picker when user confirms', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const inputClickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
    const user = userEvent.setup();
    const importBtn = await screen.findByRole('button', { name: /restore|khôi phục/i });
    await user.click(importBtn);

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(inputClickSpy).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
    inputClickSpy.mockRestore();
  });
});
