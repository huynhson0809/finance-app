import { useCallback, useState } from 'react';
import { recognize as ocrRecognize } from '../ocr';
import type { OcrStatus } from '../ocr';

export function useOcr(): {
  recognize(blob: Blob): Promise<{ text: string; confidence: number }>;
  status: OcrStatus;
  progress: number;
  error: Error | null;
} {
  const [status, setStatus] = useState<OcrStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const recognize = useCallback(async (blob: Blob) => {
    setStatus('loading-engine');
    setProgress(0);
    setError(null);
    try {
      const out = await ocrRecognize(blob, {
        onProgress: pct => {
          setStatus('recognizing');
          setProgress(pct);
        },
      });
      setStatus('done');
      setProgress(100);
      return out;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      setStatus('error');
      throw err;
    }
  }, []);

  return { recognize, status, progress, error };
}
