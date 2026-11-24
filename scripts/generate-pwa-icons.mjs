#!/usr/bin/env node
/**
 * Gerador determinístico de ícones PNG do PWA do KrakenBridge-Web
 * a partir de frontend/public/kraken-icon.svg (ícone) e kraken-symbol.svg (símbolo) via Browserless REST API (/screenshot).
 *
 * Uso:
 *   BROWSERLESS_URL="http://192.168.31.5:9222" BROWSERLESS_TOKEN="kraken_cdp_secret" node scripts/generate-pwa-icons.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../frontend/public');
const iconPath = path.join(publicDir, 'kraken-icon.svg');
const symbolPath = path.join(publicDir, 'kraken-symbol.svg');

const browserlessUrl = (process.env.BROWSERLESS_URL || 'http://192.168.31.5:9222').replace(/\/$/, '');
const browserlessToken = process.env.BROWSERLESS_TOKEN || 'kraken_cdp_secret';

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
    background: linear-gradient(#171635, #0a0b12);
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
  const [icon, symbol] = await Promise.all([
    fs.readFile(iconPath, 'utf8'),
    fs.readFile(symbolPath, 'utf8'),
  ]);
  const targets = [
    { filename: 'icon-192x192.png', size: 192, html: buildRegularHtml(icon, 192), omitBackground: true },
    { filename: 'icon-512x512.png', size: 512, html: buildRegularHtml(icon, 512), omitBackground: true },
    // Header: símbolo transparente leve (o SVG original tem ~1,2 MB)
    { filename: 'kraken-symbol.png', size: 128, html: buildRegularHtml(symbol, 128), omitBackground: true },
    // Maskable: símbolo sobre fundo contínuo, dentro da safe-zone
    { filename: 'icon-maskable-192x192.png', size: 192, html: buildFullBleedHtml(symbol, 192, 0.72), omitBackground: false },
    { filename: 'icon-maskable-512x512.png', size: 512, html: buildFullBleedHtml(symbol, 512, 0.72), omitBackground: false },
    // iOS Apple Touch Icon: 180x180 opaco
    { filename: 'apple-touch-icon.png', size: 180, html: buildFullBleedHtml(symbol, 180, 0.85), omitBackground: false },
  ];

  for (const target of targets) {
    await renderPng(target);
  }
}

main().catch((err) => {
  console.error('[PWA Icons] Erro:', err);
  process.exit(1);
});
