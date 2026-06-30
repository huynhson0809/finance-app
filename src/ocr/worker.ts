import type { RecognizeOpts } from './types';

type TesseractWorker = {
  recognize: (blob: Blob) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<void>;
};

let workerPromise: Promise<TesseractWorker> | null = null;

async function getWorker(opts: RecognizeOpts): Promise<TesseractWorker> {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const Tesseract = await import('tesseract.js');
    return Tesseract.createWorker(opts.lang ?? 'vie', 1, {
      logger: (msg: { status?: string; progress?: number }) => {
        if (msg.status === 'recognizing text' && typeof msg.progress === 'number') {
          opts.onProgress?.(Math.round(msg.progress * 100));
        }
      },
    }) as unknown as Promise<TesseractWorker>;
  })();
  return workerPromise;
}

export async function recognize(
  blob: Blob,
  opts: RecognizeOpts = {},
): Promise<{ text: string; confidence: number }> {
  const worker = await getWorker(opts);
  const result = await worker.recognize(blob);
  return { text: result.data.text, confidence: result.data.confidence };
}

export async function __resetOcrForTests() {
  if (workerPromise) {
    const w = await workerPromise.catch(() => null);
    await w?.terminate().catch(() => {});
    workerPromise = null;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    workerPromise?.then(w => w.terminate()).catch(() => {});
  });
}
