#!/usr/bin/env node
/**
 * Gerador determinístico de ícones PNG do PWA do KrakenBridge-Web
 * a partir de frontend/public/kraken-icon.svg via Browserless REST API (/screenshot).
 *
 * Uso:
 *   BROWSERLESS_URL="http://browserless:9222" BROWSERLESS_TOKEN="..." node scripts/generate-pwa-icons.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../frontend/public');

const browserlessUrl = (process.env.BROWSERLESS_URL || 'http://browserless:9222').replace(/\/$/, '');
const browserlessToken = process.env.BROWSERLESS_TOKEN || '';

function buildRegularSvg(size) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: ${size}px;
    height: ${size}px;
    overflow: hidden;
    background: transparent;
  }
  svg { display: block; width: ${size}px; height: ${size}px; }
</style>
</head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <defs>
    <linearGradient id="krakenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="50%" stop-color="#818cf8" />
      <stop offset="100%" stop-color="#6366f1" />
    </linearGradient>
    <linearGradient id="darkBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#18181b" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="504" height="504" rx="124" fill="url(#darkBg)" stroke="#3f3f46" stroke-width="8"/>
  <circle cx="256" cy="256" r="180" fill="url(#krakenGrad)" opacity="0.12"/>
  <path d="M160 140 V372 M160 256 L310 140 M210 218 L330 372"
        stroke="url(#krakenGrad)"
        stroke-width="48"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"/>
  <circle cx="340" cy="140" r="18" fill="#38bdf8" />
  <circle cx="360" cy="372" r="18" fill="#818cf8" />
</svg>
</body>
</html>`;
}

function buildFullBleedSvg(size, scale) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: ${size}px;
    height: ${size}px;
    overflow: hidden;
    background: #09090b;
  }
  svg { display: block; width: ${size}px; height: ${size}px; }
</style>
</head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <defs>
    <linearGradient id="krakenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="50%" stop-color="#818cf8" />
      <stop offset="100%" stop-color="#6366f1" />
    </linearGradient>
    <linearGradient id="darkBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#18181b" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#darkBg)" />
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <circle cx="256" cy="256" r="180" fill="url(#krakenGrad)" opacity="0.14"/>
    <path d="M160 140 V372 M160 256 L310 140 M210 218 L330 372"
          stroke="url(#krakenGrad)"
          stroke-width="48"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none"/>
    <circle cx="340" cy="140" r="18" fill="#38bdf8" />
    <circle cx="360" cy="372" r="18" fill="#818cf8" />
  </g>
</svg>
</body>
</html>`;
}

async function renderPng({ filename, size, html, omitBackground }) {
  const endpoint = `${browserlessUrl}/screenshot${browserlessToken ? `?token=${encodeURIComponent(browserlessToken)}` : ''}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html,
      viewport: { width: size, height: size, deviceScaleFactor: 1 },
      options: {
        type: 'png',
        omitBackground,
        clip: { x: 0, y: 0, width: size, height: size },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Falha ao gerar ${filename} (${res.status}): ${text}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const outPath = path.join(publicDir, filename);
  await fs.writeFile(outPath, buffer);
  console.log(`[PWA Icons] Gerado ${filename} (${size}x${size}, ${buffer.length} bytes)`);
}

async function main() {
  const targets = [
    { filename: 'icon-192x192.png', size: 192, html: buildRegularSvg(192), omitBackground: true },
    { filename: 'icon-512x512.png', size: 512, html: buildRegularSvg(512), omitBackground: true },
    // Maskable: 20% safe-zone (emblema contido nos 80% centrais, scale 0.74)
    { filename: 'icon-maskable-192x192.png', size: 192, html: buildFullBleedSvg(192, 0.74), omitBackground: false },
    { filename: 'icon-maskable-512x512.png', size: 512, html: buildFullBleedSvg(512, 0.74), omitBackground: false },
    // iOS Apple Touch Icon: 180x180 opaco sem transparência
    { filename: 'apple-touch-icon.png', size: 180, html: buildFullBleedSvg(180, 0.84), omitBackground: false },
  ];

  for (const target of targets) {
    await renderPng(target);
  }
}

main().catch((err) => {
  console.error('[PWA Icons] Erro:', err);
  process.exit(1);
});
