import { existsSync, mkdirSync, copyFileSync, readdirSync, createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const targetDir = join(projectRoot, 'public', 'tesseract');
mkdirSync(targetDir, { recursive: true });

const require = createRequire(import.meta.url);

const workerPath = require.resolve('tesseract.js/dist/worker.min.js');
copyFileSync(workerPath, join(targetDir, 'worker.min.js'));

// Locate tesseract.js-core - try pnpm structure first, then standard node_modules
let coreDir;
try {
  coreDir = dirname(require.resolve('tesseract.js-core/package.json'));
} catch {
  // Fallback: pnpm structure - search for the package in .pnpm
  const pnpmPath = join(projectRoot, 'node_modules', '.pnpm');
  const dirs = readdirSync(pnpmPath);
  const corePackageDir = dirs.find(d => d.startsWith('tesseract.js-core@'));
  if (!corePackageDir) {
    throw new Error('Could not locate tesseract.js-core in node_modules');
  }
  coreDir = join(pnpmPath, corePackageDir, 'node_modules', 'tesseract.js-core');
}

let coreCount = 0;
for (const file of readdirSync(coreDir)) {
  if (/^tesseract-core(-.*)?\.(wasm|wasm\.js)$/.test(file)) {
    copyFileSync(join(coreDir, file), join(targetDir, file));
    coreCount++;
  }
}

const lang = join(targetDir, 'vie.traineddata');
if (!existsSync(lang)) {
  const url = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/vie.traineddata';
  console.log(`[tesseract] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(lang);
    stream.on('finish', resolve);
    stream.on('error', reject);
    stream.end(buf);
  });
}

console.log(`✓ Tesseract assets ready in public/tesseract (worker + ${coreCount} core variants + vie.traineddata.gz)`);
