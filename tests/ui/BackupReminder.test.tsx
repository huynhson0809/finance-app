import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { __resetDBForTests } from '../../src/db';
import { addTransaction } from '../../src/db/transactions';
import { setSetting } from '../../src/db/settings';
import { initI18n } from '../../src/i18n';
import { BackupReminder } from '../../src/ui/components/BackupReminder';

beforeEach(async () => {
  await __resetDBForTests();
  indexedDB.deleteDatabase('finance-app');
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
});
