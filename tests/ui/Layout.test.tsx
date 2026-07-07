import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { initI18n, i18n } from '../../src/i18n';
import { Layout } from '../../src/ui/Layout';

vi.mock('../../src/ui/components/UpdatePrompt', () => ({
  UpdatePrompt: () => null,
}));

vi.mock('../../src/ui/components/InstallPrompt', () => ({
  InstallPrompt: () => null,
}));

beforeAll(async () => { await initI18n(); });

describe('Layout', () => {
  it('keeps manual add in the primary navigation', () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<div>Home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /add|thêm/i })).toHaveAttribute('href', '/add');
  });

  it('adds the calendar tab between add and reports', () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<div>Home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const links = screen.getAllByRole('link');
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/',
      '/add',
      '/calendar',
      '/reports',
      '/settings',
    ]);
    expect(screen.getByRole('link', { name: /calendar|lịch/i })).toHaveAttribute('href', '/calendar');
  });

  it('uses current i18next plural keys for calendar transaction counts', async () => {
    await i18n.changeLanguage('en');

    expect(i18n.t('calendar.transactionCount', { count: 2 })).toBe('2 transactions');
  });
});
