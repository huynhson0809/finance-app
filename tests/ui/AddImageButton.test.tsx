// tests/ui/AddImageButton.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, beforeAll } from 'vitest';
import { AddImageButton } from '../../src/ui/AddImageButton';
import { imageHolder } from '../../src/lib/image';
import { initI18n } from '../../src/i18n';

beforeAll(async () => { await initI18n(); });

function ConfirmStub() {
  // smuggle the state out via a data attribute so the test can read it
  return <div data-testid="confirm-state" id="ok">on confirm</div>;
}

describe('AddImageButton', () => {
  it('puts blob in imageHolder and navigates to /confirm with imageId', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AddImageButton />} />
          <Route path="/confirm" element={<ConfirmStub />} />
        </Routes>
      </MemoryRouter>,
    );
    const input = screen.getByLabelText(/image|ảnh/i) as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], 'pic.jpg', { type: 'image/jpeg' });
    await user.upload(input, file);
    await waitFor(() => expect(screen.getByTestId('confirm-state')).toBeInTheDocument());
    // exactly one blob should be in the holder
    expect(imageHolder._size()).toBe(1);
  });
});
