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
let ocrError: Error | null = null;

vi.mock('../../src/hooks/useOcr', () => ({
  useOcr: () => ({
    recognize,
    status: 'idle' as const,
    progress: 0,
    get error() { return ocrError; },
  }),
}));

beforeEach(async () => {
  await initI18n();
  await __resetDBForTests();
  indexedDB.deleteDatabase('finance-app');
  recognize.mockReset();
  ocrError = null;
  imageHolder._clear();
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
    ocrError = new Error('engine down');
    recognize.mockRejectedValueOnce(new Error('engine down'));
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    const imageId = imageHolder.put(blob);
    render(
      <MemoryRouter initialEntries={[{ pathname: '/confirm', state: { imageId } }]}>
        <ConfirmScreen />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Could not read|Không đọc được/i)).toBeInTheDocument());
    const merchantInput = screen.getByLabelText(/merchant|cửa hàng/i) as HTMLInputElement;
    expect(merchantInput.value).toBe('');
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

  it('suggests category based on OCR note keyword (shopee in transfer memo)', async () => {
    // OCR text contains "shopee" in the transfer memo line.
    // Merchant alone (NGUYEN MINH TUAN) wouldn't match any seed; the OCR text does.
    mountWithImage([
      '13:24',
      'Chuyển tiền thành công',
      '157,000 VND',
      '13:24 - 16/06/2026',
      'NGUYEN MINH TUAN',
      'VPBank (VPB)',
      '290192471',
      'HUYNH NGOC SON chuyen tien hang shopee 6/19 do son',
      'Cảm ơn bạn đã sử dụng dịch vụ của MBBank',
    ].join('\n'));
    await waitFor(() => {
      // Shopping chip should be selected (aria-pressed=true) once OCR completes + categorizer settles
      const chip = screen.getByRole('button', { name: /shopping|mua sắm/i });
      expect(chip).toHaveAttribute('aria-pressed', 'true');
    }, { timeout: 1500 });
  });
});
