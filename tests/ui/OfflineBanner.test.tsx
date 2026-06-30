import { render, screen, act } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import { initI18n } from '../../src/i18n';
import { OfflineBanner } from '../../src/ui/components/OfflineBanner';

beforeEach(async () => { await initI18n(); });

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}

describe('OfflineBanner', () => {
  it('renders nothing when online', () => {
    setOnline(true);
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a banner when offline', () => {
    setOnline(false);
    render(<OfflineBanner />);
    expect(screen.getByRole('status')).toHaveTextContent(/offline|ngo[aà]i tuyến/i);
  });

  it('hides the banner when going back online', () => {
    setOnline(false);
    render(<OfflineBanner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => setOnline(true));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
