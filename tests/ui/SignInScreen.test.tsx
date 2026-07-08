import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initI18n } from '../../src/i18n';
import { SignInScreen } from '../../src/ui/SignInScreen';

beforeAll(async () => { await initI18n(); });

describe('SignInScreen', () => {
  it('renders the Google sign-in action in the dark auth panel', () => {
    render(<SignInScreen setupError={false} onSignIn={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /finance|quản lý chi tiêu/i })).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /continue with google|tiếp tục với google/i });
    expect(button).toBeEnabled();
    expect(button).toHaveClass('bg-sky-400');
  });

  it('starts Google sign-in when the action is clicked', async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn().mockResolvedValue(undefined);
    render(<SignInScreen setupError={false} onSignIn={onSignIn} />);

    await user.click(screen.getByRole('button', { name: /continue with google|tiếp tục với google/i }));

    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('disables sign-in when Supabase setup is missing', () => {
    render(<SignInScreen setupError onSignIn={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/supabase|chưa cấu hình/i);
    expect(screen.getByRole('button', { name: /continue with google|tiếp tục với google/i })).toBeDisabled();
  });
});
