import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initI18n } from '../../src/i18n';
import { imageHolder } from '../../src/lib/image';
import { __resetDBForTests } from '../../src/db';
import { listTransactions } from '../../src/db/transactions';
import { ConfirmScreen } from '../../src/ui/ConfirmScreen';

// Mock useOcr so tests don't load Tesseract
const recognize = vi.fn();
vi.mock('../../src/hooks/useOcr', () => ({
  useOcr: () => ({
    recognize,
    status: 'idle',
    progress: 0,
    error: null,
  }),
}));

beforeEach(async () => {
  await initI18n();
  await __resetDBForTests();
  indexedDB.deleteDatabase('finance-app');
  recognize.mockReset();
});

function mountWithImage(text: string) {
  recognize.mockResolvedValue({ text, confidence: 90 });
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
  const imageId = imageHolder.put(blob);
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/confirm', state: { imageId } }]}>
      <ConfirmScreen />
    </MemoryRouter>,
  );
}

describe('ConfirmScreen', () => {
  it('pre-fills amount and merchant from a Vietcombank-shaped OCR text', async () => {
    mountWithImage([
      'Vietcombank',
      'So tien: -250.000 VND',
      'Noi dung: Thanh toan Highlands Coffee Hanoi',
      'Thoi gian: 15/06/2026 14:32',
    ].join('\n'));
    await waitFor(() => expect(screen.getByText(/250.*000/)).toBeInTheDocument());
    expect(screen.getByDisplayValue(/Thanh toan Highlands Coffee Hanoi/)).toBeInTheDocument();
  });

  it('falls through to empty fields when OCR throws', async () => {
    recognize.mockRejectedValueOnce(new Error('engine down'));
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    const imageId = imageHolder.put(blob);
    render(
      <MemoryRouter initialEntries={[{ pathname: '/confirm', state: { imageId } }]}>
        <ConfirmScreen />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Could not read|Không đọc được/i)).toBeInTheDocument());
    expect(screen.getByDisplayValue('')).toBeInTheDocument(); // merchant empty
  });

  it('Save writes a transaction with source=bank-screenshot and bankHint', async () => {
    mountWithImage([
      'Vietcombank',
      'So tien: -50.000 VND',
      'Noi dung: Test',
    ].join('\n'));
    await waitFor(() => screen.getByText(/50.*000/));
    // pick category
    fireEvent.click(screen.getByRole('button', { name: /coffee|cà phê/i }));
    fireEvent.click(screen.getByRole('button', { name: /save|lưu/i }));
    await waitFor(async () => {
      const all = await listTransactions();
      expect(all).toHaveLength(1);
      expect(all[0].source).toBe('bank-screenshot');
      expect(all[0].bankHint).toBe('vietcombank');
      expect(all[0].amount).toBe(50000);
    });
  });
});
