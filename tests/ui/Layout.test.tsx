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
    expect(screen.getByTestId('app-main')).toHaveClass('pb-[calc(env(safe-area-inset-bottom)+10.625rem)]');
    expect(screen.getByRole('link', { name: /add|thêm/i })).toHaveAttribute('href', '/add');
  });

  it('keeps the bottom navigation comfortably above the iOS home indicator', () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<div>Home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('navigation', { name: /primary/i }))
      .toHaveClass('pb-[calc(env(safe-area-inset-bottom)+1.5rem)]');
    expect(screen.getByTestId('app-main'))
      .toHaveClass('pb-[calc(env(safe-area-inset-bottom)+10.625rem)]');
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

  it('marks the active bottom navigation link in the primary landmark', () => {
    render(
      <MemoryRouter initialEntries={['/calendar']}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/calendar" element={<div>Calendar</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /calendar|lịch/i })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps settings active for settings report subpages', () => {
    render(
      <MemoryRouter initialEntries={['/settings/reports/year-summary']}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/settings/reports/year-summary" element={<div>Yearly settings report</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /settings|cài đặt/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /reports|báo cáo/i })).not.toHaveAttribute('aria-current');
  });

  it('uses current i18next plural keys for calendar transaction counts', async () => {
    await i18n.changeLanguage('en');

    expect(i18n.t('calendar.transactionCount', { count: 2 })).toBe('2 transactions');
  });
});
