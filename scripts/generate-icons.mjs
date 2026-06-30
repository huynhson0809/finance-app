// scripts/generate-icons.mjs
// One-shot script. Run with: node scripts/generate-icons.mjs
// Produces public/icons/icon-192.png and icon-512.png from public/favicon.svg.
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const src = join(projectRoot, 'public', 'favicon.svg');
const out = join(projectRoot, 'public', 'icons');
mkdirSync(out, { recursive: true });

for (const size of [192, 512]) {
  await sharp(src, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toFile(join(out, `icon-${size}.png`));
  console.log(`✓ wrote icon-${size}.png`);
}
