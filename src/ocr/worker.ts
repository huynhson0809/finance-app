import type { RecognizeOpts } from './types';

type TesseractWorker = {
  recognize: (blob: Blob) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<void>;
};

let workerPromise: Promise<TesseractWorker> | null = null;
let currentOnProgress: ((pct: number) => void) | undefined;

async function getWorker(): Promise<TesseractWorker> {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const Tesseract = await import('tesseract.js');
    const worker = await Tesseract.createWorker('vie', 1, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract/',
      langPath: '/tesseract/',
      logger: (msg: { status?: string; progress?: number }) => {
        if (msg.status === 'recognizing text' && typeof msg.progress === 'number') {
          currentOnProgress?.(Math.round(msg.progress * 100));
        }
      },
    });
    return worker as unknown as TesseractWorker;
  })();
  return workerPromise;
}

export async function recognize(
  blob: Blob,
  opts: RecognizeOpts = {},
): Promise<{ text: string; confidence: number }> {
  currentOnProgress = opts.onProgress;
  try {
    const worker = await getWorker();
    const result = await worker.recognize(blob);
    return { text: result.data.text, confidence: result.data.confidence };
  } finally {
    currentOnProgress = undefined;
  }
}

export async function __resetOcrForTests() {
  if (workerPromise) {
    const w = await workerPromise.catch(() => null);
    await w?.terminate().catch(() => {});
    workerPromise = null;
  }
  currentOnProgress = undefined;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    workerPromise?.then(w => w.terminate()).catch(() => {});
  });
}
