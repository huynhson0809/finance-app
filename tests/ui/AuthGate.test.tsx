import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth, type AuthState } from '../../src/hooks/useAuth';
import { initI18n } from '../../src/i18n';
import { AuthGate } from '../../src/ui/AuthGate';

vi.mock('../../src/hooks/useAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/hooks/useAuth')>();
  return { ...actual, useAuth: vi.fn() };
});

const sessionFor = (userId: string, accessToken: string) => ({
  access_token: accessToken,
  user: { id: userId },
}) as Session;

const signedInState = (session: Session): AuthState => ({
  session,
  loading: false,
  setupError: false,
  error: null,
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
});

function StatefulChild() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((value) => value + 1)}>Count: {count}</button>;
}

beforeAll(async () => { await initI18n(); });

beforeEach(() => {
  vi.mocked(useAuth).mockReset();
});

describe('AuthGate', () => {
  it('preserves the subtree for same-user refreshes and remounts it on a direct user switch', async () => {
    const user = userEvent.setup();
    let authState = signedInState(sessionFor('user-a', 'token-a'));
    vi.mocked(useAuth).mockImplementation(() => authState);

    const view = render(
      <AuthGate>
        <StatefulChild />
      </AuthGate>,
    );

    await user.click(screen.getByRole('button', { name: 'Count: 0' }));
    expect(screen.getByRole('button', { name: 'Count: 1' })).toBeInTheDocument();

    authState = signedInState(sessionFor('user-a', 'refreshed-token-a'));
    view.rerender(
      <AuthGate>
        <StatefulChild />
      </AuthGate>,
    );
    expect(screen.getByRole('button', { name: 'Count: 1' })).toBeInTheDocument();

    authState = signedInState(sessionFor('user-b', 'token-b'));
    view.rerender(
      <AuthGate>
        <StatefulChild />
      </AuthGate>,
    );
    expect(screen.getByRole('button', { name: 'Count: 0' })).toBeInTheDocument();
  });
});
