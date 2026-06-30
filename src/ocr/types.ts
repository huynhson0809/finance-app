export type OcrStatus = 'idle' | 'loading-engine' | 'recognizing' | 'done' | 'error';

export interface RecognizeOpts {
  /**
   * Progress callback fired as Tesseract processes the image.
   * Receives an integer percentage (0–100). Updated per call.
   */
  onProgress?: (pct: number) => void;
}
