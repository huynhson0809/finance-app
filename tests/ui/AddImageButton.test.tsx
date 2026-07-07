import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { beforeEach, describe, it, expect, beforeAll } from 'vitest';
import { initI18n } from '../../src/i18n';
import { AddImageButton } from '../../src/ui/AddImageButton';
import { imageHolder } from '../../src/lib/image';

function ConfirmStub() {
  const location = useLocation();
  const imageId = (location.state as { imageId?: string } | null)?.imageId ?? '';
  return <div data-testid="confirm-imageid">{imageId}</div>;
}

beforeAll(async () => { await initI18n(); });

beforeEach(() => {
  imageHolder._clear();
});

function mount() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AddImageButton />} />
        <Route path="/confirm" element={<ConfirmStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mountTile() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AddImageButton variant="tile" />} />
        <Route path="/confirm" element={<ConfirmStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AddImageButton', () => {
  it('renders the floating trigger as a keyboard-accessible button', () => {
    render(
      <MemoryRouter>
        <AddImageButton />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /image|hình ảnh|ảnh/i })).toHaveClass('rounded-full');
  });

  it('can render as a dark action tile', () => {
    render(
      <MemoryRouter>
        <AddImageButton variant="tile" />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText(/image|hình ảnh|ảnh/i)).toHaveClass('rounded-2xl');
  });

  it('puts blob in imageHolder and navigates to /confirm with imageId in router state', async () => {
    const user = userEvent.setup();
    mount();
    const input = screen.getByTestId('image-file-input') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], 'pic.jpg', { type: 'image/jpeg' });
    await user.upload(input, file);
    const idEl = await waitFor(() => screen.getByTestId('confirm-imageid'));
    const imageId = idEl.textContent ?? '';
    expect(imageId.length).toBeGreaterThan(0);
    const stashed = imageHolder.get(imageId);
    expect(stashed).toBeInstanceOf(Blob);
    expect(imageHolder._size()).toBe(1);
  });

  it('uploads from the tile variant and navigates to /confirm with imageId in router state', async () => {
    const user = userEvent.setup();
    mountTile();
    const input = screen.getByTestId('image-file-input') as HTMLInputElement;
    const file = new File([new Uint8Array([4, 5, 6])], 'receipt.png', { type: 'image/png' });
    await user.upload(input, file);
    const idEl = await waitFor(() => screen.getByTestId('confirm-imageid'));
    const imageId = idEl.textContent ?? '';
    expect(imageId.length).toBeGreaterThan(0);
    const stashed = imageHolder.get(imageId);
    expect(stashed).toBeInstanceOf(Blob);
    expect(imageHolder._size()).toBe(1);
  });

  it('resets the input value after change so re-selecting the same file fires change again', async () => {
    const user = userEvent.setup();
    mount();
    const input = screen.getByTestId('image-file-input') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], 'pic.jpg', { type: 'image/jpeg' });
    await user.upload(input, file);
    expect(input.value).toBe('');
  });
});
