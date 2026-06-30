export type OcrStatus = 'idle' | 'loading-engine' | 'recognizing' | 'done' | 'error';

export interface RecognizeOpts {
  lang?: 'vie' | 'eng' | 'vie+eng';
  onProgress?: (pct: number) => void;
}
