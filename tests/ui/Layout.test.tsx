import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { initI18n } from '../../src/i18n';
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
});
