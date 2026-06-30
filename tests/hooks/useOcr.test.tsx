// tests/hooks/useOcr.test.tsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock tesseract.js so the test doesn't pull WASM
vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(async (_lang: string, _oem: number, opts: any) => ({
    recognize: vi.fn(async () => ({ data: { text: 'Hello world', confidence: 87 } })),
    terminate: vi.fn(async () => {}),
    _logger: opts?.logger,
  })),
}));

import { useOcr } from '../../src/hooks/useOcr';

beforeEach(() => { vi.clearAllMocks(); });

describe('useOcr', () => {
  it('starts in idle status', () => {
    const { result } = renderHook(() => useOcr());
    expect(result.current.status).toBe('idle');
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it('transitions through statuses and returns text', async () => {
    const { result } = renderHook(() => useOcr());
    let promise: ReturnType<typeof result.current.recognize>;
    await act(async () => {
      promise = result.current.recognize(new Blob());
    });
    const out = await promise!;
    expect(out.text).toBe('Hello world');
    expect(out.confidence).toBe(87);
    await waitFor(() => expect(result.current.status).toBe('done'));
  });
});
