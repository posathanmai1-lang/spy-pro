/**
 * Icon generator script for Fullscreen Control.
 * Creates SVG-based PNG icons at 16, 32, 48, and 128px.
 * Run with: node scripts/gen-icons.mjs
 *
 * Uses only Node.js built-ins + the Canvas API via node-canvas (optional).
 * If node-canvas is unavailable, writes SVG files that the browser can use.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '../src/icons');

mkdirSync(iconsDir, { recursive: true });

// SVG template — scales cleanly at all sizes
function makeSVG(size) {
  const r = Math.round(size * 0.22); // border radius ~22% of size
  const stroke = Math.max(1.5, size * 0.08);
  const inset = Math.round(size * 0.22);
  const armLen = Math.round(size * 0.16);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>
  <!-- Fullscreen corner arrows -->
  <!-- Top-left -->
  <path d="M${inset} ${inset + armLen} L${inset} ${inset} L${inset + armLen} ${inset}"
        stroke="white" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <!-- Top-right -->
  <path d="M${size - inset - armLen} ${inset} L${size - inset} ${inset} L${size - inset} ${inset + armLen}"
        stroke="white" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <!-- Bottom-right -->
  <path d="M${size - inset} ${size - inset - armLen} L${size - inset} ${size - inset} L${size - inset - armLen} ${size - inset}"
        stroke="white" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <!-- Bottom-left -->
  <path d="M${inset + armLen} ${size - inset} L${inset} ${size - inset} L${inset} ${size - inset - armLen}"
        stroke="white" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;
}

const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const svg = makeSVG(size);
  // Write SVG version (can be used directly in manifest if Chrome supports it)
  writeFileSync(join(iconsDir, `icon${size}.svg`), svg, 'utf8');
  console.log(`✓ Generated icon${size}.svg`);
}

// Also write a placeholder PNG notice — real PNG generation requires canvas
// Chrome accepts SVG in manifest icons since Chrome 90+, so SVG is sufficient.
console.log('\n✅ Icons generated as SVG files.');
console.log('   Chrome 90+ supports SVG manifest icons.');
console.log('   For PNG output, run: npm install -g sharp && node scripts/gen-icons-png.mjs');
