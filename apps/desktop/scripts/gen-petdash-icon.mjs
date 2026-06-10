// One-off: generate the PetDash app icon (PNG + ICO) from an inline SVG.
// Run with the desktop package's sharp: `node scripts/gen-petdash-icon.mjs`
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const assets = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");

// A friendly rounded-square mark: blue→indigo gradient (matches the azure pet),
// a 3/4 quota ring, and a simple pet face (eyes + smile) in the center.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f8ff7"/>
      <stop offset="1" stop-color="#3b3ec7"/>
    </linearGradient>
  </defs>
  <rect x="64" y="64" width="896" height="896" rx="220" fill="url(#bg)"/>
  <!-- quota ring: 3/4 arc -->
  <circle cx="512" cy="512" r="300" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="46"/>
  <path d="M512 212 a300 300 0 1 1 -212 88" fill="none" stroke="#ffffff" stroke-width="46" stroke-linecap="round"/>
  <!-- pet face -->
  <circle cx="430" cy="470" r="46" fill="#ffffff"/>
  <circle cx="594" cy="470" r="46" fill="#ffffff"/>
  <circle cx="430" cy="482" r="20" fill="#1f2a55"/>
  <circle cx="594" cy="482" r="20" fill="#1f2a55"/>
  <path d="M430 600 q82 90 164 0" fill="none" stroke="#ffffff" stroke-width="34" stroke-linecap="round"/>
</svg>`;

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngBuffers = await Promise.all(
  sizes.map((s) => sharp(Buffer.from(svg)).resize(s, s).png().toBuffer()),
);

// Main app-icon.png (512) used by Linux + as a general asset.
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile(join(assets, "app-icon.png"));
// Windows .ico (multi-size).
const ico = await pngToIco(pngBuffers);
writeFileSync(join(assets, "app-icon.ico"), ico);
// Tray icon (small, transparent-friendly).
await sharp(Buffer.from(svg)).resize(32, 32).png().toFile(join(assets, "tray-icon.png"));

console.log("Generated app-icon.png, app-icon.ico, tray-icon.png");
