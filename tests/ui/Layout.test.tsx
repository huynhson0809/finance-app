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
  it('uses a mobile app shell with the add link centered in navigation', () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<div>Home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('app-shell')).toHaveClass('min-h-screen');
    expect(screen.getByRole('link', { name: /add|thêm/i })).toHaveAttribute('href', '/add');
  });

  it('orders bottom navigation like a mobile finance app', () => {
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
      '/calendar',
      '/add',
      '/reports',
      '/settings',
    ]);
  });

  it('uses current i18next plural keys for calendar transaction counts', async () => {
    await i18n.changeLanguage('en');

    expect(i18n.t('calendar.transactionCount', { count: 2 })).toBe('2 transactions');
  });
});
