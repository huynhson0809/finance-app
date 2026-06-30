process.env.TZ = 'UTC';
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';
import { __resetDBForTests } from '../src/db';
beforeEach(async () => { await __resetDBForTests(); });
