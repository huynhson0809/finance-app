process.env.TZ = 'UTC';

// jsdom doesn't implement ResizeObserver; Recharts' ResponsiveContainer needs one.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver = MockResizeObserver;

const originalGBCR = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function () {
  const rect = originalGBCR.call(this);
  if (rect.width === 0 && rect.height === 0) {
    return { ...rect, width: 320, height: 256, top: 0, left: 0, right: 320, bottom: 256, x: 0, y: 0, toJSON: () => ({}) };
  }
  return rect;
};

import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';
import { __resetDBForTests } from '../src/db';
beforeEach(async () => { await __resetDBForTests(); });
import { __resetOcrForTests } from '../src/ocr';
beforeEach(async () => { await __resetOcrForTests(); });
import { imageHolder } from '../src/lib/image';
beforeEach(() => { imageHolder._clear(); });
