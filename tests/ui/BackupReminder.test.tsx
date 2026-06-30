import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import { __resetDBForTests } from '../../src/db';
import { addTransaction } from '../../src/db/transactions';
import { setSetting } from '../../src/db/settings';
import { initI18n } from '../../src/i18n';
import { BackupReminder } from '../../src/ui/components/BackupReminder';

beforeEach(async () => {
  await __resetDBForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('finance-app');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // continue even if blocked in tests
  });
  await initI18n();
});

function mount() {
  return render(<MemoryRouter><BackupReminder /></MemoryRouter>);
}

describe('BackupReminder', () => {
  it('renders nothing when there are no transactions', async () => {
    const { container } = mount();
    await waitFor(() => { expect(container.firstChild).toBeNull(); });
  });

  it('shows when transactions exist and no lastBackupAt', async () => {
    await addTransaction({
      amount: 1000, currency: 'VND',
      occurredAt: '2026-06-15T08:00:00.000Z',
      category: 'others', source: 'manual',
    });
    mount();
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/30 day|30 ng[aà]y/i);
    });
  });

  it('hides when lastBackupAt is recent', async () => {
    await addTransaction({
      amount: 1000, currency: 'VND',
      occurredAt: '2026-06-15T08:00:00.000Z',
      category: 'others', source: 'manual',
    });
    await setSetting('lastBackupAt', new Date().toISOString());
    const { container } = mount();
    await waitFor(() => { expect(container.firstChild).toBeNull(); });
  });

  it('hides the banner when dismiss button is clicked', async () => {
    // Pre-seed with a transaction so the reminder shows
    await addTransaction({
      amount: 1000, currency: 'VND',
      occurredAt: '2026-06-15T08:00:00.000Z',
      category: 'others', source: 'manual',
    });
    mount();
    // Wait for banner to render
    const banner = await screen.findByRole('status');
    expect(banner).toBeInTheDocument();
    // Click the dismiss button (the × with aria-label backup.dismiss)
    const dismissBtn = screen.getByRole('button', { name: /dismiss|đóng/i });
    const user = userEvent.setup();
    await user.click(dismissBtn);
    // Banner disappears
    expect(screen.queryByRole('status')).toBeNull();
  });
});
