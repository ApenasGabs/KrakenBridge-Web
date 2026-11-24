#!/usr/bin/env node
/**
 * Gerador determinístico de ícones PNG do PWA do KrakenBridge-Web
 * a partir de frontend/public/kraken-icon.svg via Browserless REST API (/screenshot).
 *
 * Uso:
 *   BROWSERLESS_URL="http://192.168.31.5:9222" BROWSERLESS_TOKEN="kraken_cdp_secret" node scripts/generate-pwa-icons.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../frontend/public');
const svgPath = path.join(publicDir, 'kraken-icon.svg');

const browserlessUrl = (process.env.BROWSERLESS_URL || 'http://192.168.31.5:9222').replace(/\/$/, '');
const browserlessToken = process.env.BROWSERLESS_TOKEN || 'kraken_cdp_secret';

async function getSvgContent() {
  return await fs.readFile(svgPath, 'utf8');
}

function buildRegularHtml(svgContent, size) {
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
${svgContent}
</body>
</html>`;
}

function buildFullBleedHtml(svgContent, size, scale) {
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
    background: #06070e;
  }
  .wrapper {
    width: ${size}px;
    height: ${size}px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  svg {
    display: block;
    width: ${size}px;
    height: ${size}px;
    transform: scale(${scale});
    transform-origin: center center;
  }
</style>
</head>
<body>
<div class="wrapper">
${svgContent}
</div>
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
  const svgContent = await getSvgContent();
  const targets = [
    { filename: 'icon-192x192.png', size: 192, html: buildRegularHtml(svgContent, 192), omitBackground: true },
    { filename: 'icon-512x512.png', size: 512, html: buildRegularHtml(svgContent, 512), omitBackground: true },
    // Maskable: 20% safe-zone (scale 0.8)
    { filename: 'icon-maskable-192x192.png', size: 192, html: buildFullBleedHtml(svgContent, 192, 0.8), omitBackground: false },
    { filename: 'icon-maskable-512x512.png', size: 512, html: buildFullBleedHtml(svgContent, 512, 0.8), omitBackground: false },
    // iOS Apple Touch Icon: 180x180 opaco
    { filename: 'apple-touch-icon.png', size: 180, html: buildFullBleedHtml(svgContent, 180, 0.9), omitBackground: false },
  ];

  for (const target of targets) {
    await renderPng(target);
  }
}

main().catch((err) => {
  console.error('[PWA Icons] Erro:', err);
  process.exit(1);
});
