import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let capturedLogger: ((msg: { status: string; progress: number }) => void) | null = null;
let resolveRecognize: (() => void) | null = null;

vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(async (_lang: string, _oem: number, opts: { logger: (msg: { status: string; progress: number }) => void }) => {
    capturedLogger = opts.logger;
    return {
      recognize: vi.fn(() => new Promise<{ data: { text: string; confidence: number } }>((resolve) => {
        resolveRecognize = () => resolve({ data: { text: 'Hello world', confidence: 87 } });
      })),
      terminate: vi.fn(async () => {}),
    };
  }),
}));

import { useOcr } from '../../src/hooks/useOcr';

beforeEach(() => {
  vi.clearAllMocks();
  capturedLogger = null;
  resolveRecognize = null;
});

describe('useOcr', () => {
  it('starts in idle status', () => {
    const { result } = renderHook(() => useOcr());
    expect(result.current.status).toBe('idle');
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it('transitions idle → loading-engine → recognizing → done and returns text', async () => {
    const { result } = renderHook(() => useOcr());
    expect(result.current.status).toBe('idle');

    let promise: Promise<{ text: string; confidence: number }>;
    await act(async () => {
      promise = result.current.recognize(new Blob());
      // allow the loading-engine setState to flush
      await Promise.resolve();
    });
    expect(result.current.status).toBe('loading-engine');

    // simulate Tesseract emitting a progress event
    await act(async () => {
      capturedLogger?.({ status: 'recognizing text', progress: 0.42 });
    });
    expect(result.current.status).toBe('recognizing');
    expect(result.current.progress).toBe(42);

    // finish the OCR call
    await act(async () => {
      resolveRecognize?.();
    });
    const out = await promise!;
    expect(out.text).toBe('Hello world');
    expect(out.confidence).toBe(87);
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.progress).toBe(100);
  });

  it('sets status to error when recognize throws', async () => {
    // re-mock createWorker for this test to throw on recognize
    const Tesseract = await import('tesseract.js');
    (Tesseract.createWorker as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      recognize: vi.fn(async () => { throw new Error('boom'); }),
      terminate: vi.fn(async () => {}),
    });
    // reset the singleton so the next call hits the new mock
    const { __resetOcrForTests } = await import('../../src/ocr/worker');
    await __resetOcrForTests();
    const { result } = renderHook(() => useOcr());
    await act(async () => {
      await expect(result.current.recognize(new Blob())).rejects.toThrow('boom');
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toBe('boom');
  });
});
