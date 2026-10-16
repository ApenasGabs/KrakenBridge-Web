#!/usr/bin/env node
/**
 * Script de Validação e Regressão Visual Responsiva do KrakenBridge
 * Viewports padrão: Mobile (360x800), Tablet (768x1024), Desktop (1280x800)
 */

import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const VIEWPORTS = [
  { name: 'mobile-360', label: 'Mobile (360x800)', width: 360, height: 800 },
  { name: 'tablet-768', label: 'Tablet (768x1024)', width: 768, height: 1024 },
  { name: 'desktop-1280', label: 'Desktop (1280x800)', width: 1280, height: 800 }
];

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:5173';
const OUTPUT_DIR = path.resolve('reports/responsive-screenshots');

async function main() {
  console.log('🚀 Iniciando verificação de regressão visual responsiva...');
  console.log(`📍 URL Alvo: ${TARGET_URL}`);
  console.log(`📁 Diretório de saída: ${OUTPUT_DIR}\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const vp of VIEWPORTS) {
      console.log(`📱 Capturando viewport: ${vp.label}...`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height }
      });
      const page = await context.newPage();

      try {
        await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
      } catch (err) {
        console.warn(`   ⚠️ Aviso ao carregar ${TARGET_URL}: ${err.message}. Tentando continuar com domcontentloaded...`);
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      }

      // Fecha balão de cotas para consistência se estiver aberto
      try {
        const quotaClose = page.getByTestId('quota-bubble-close');
        if (await quotaClose.isVisible()) {
          await quotaClose.click();
        }
      } catch {}

      // Verifica overflow horizontal
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 2;
      });

      const screenshotFile = `screenshot-${vp.name}.png`;
      const screenshotPath = path.join(OUTPUT_DIR, screenshotFile);

      await page.screenshot({ path: screenshotPath, fullPage: true });

      results.push({
        viewport: vp.name,
        label: vp.label,
        width: vp.width,
        height: vp.height,
        screenshot: screenshotFile,
        overflow: hasHorizontalOverflow,
        status: hasHorizontalOverflow ? 'FAIL (Overflow detectado)' : 'PASS (Layout contido)'
      });

      console.log(`   ✅ Salvo: ${screenshotFile} | Status: ${hasHorizontalOverflow ? '❌ OVERFLOW' : '✔️ OK'}`);
      await context.close();
    }

    // Gerar Relatório HTML
    const htmlReport = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório de Validação Visual Responsiva - KrakenBridge</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; margin: 0; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    p.subtitle { color: #94a3b8; margin-bottom: 24px; font-size: 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 24px; }
    .card { background: #1e293b; border-radius: 12px; border: 1px solid #334155; padding: 16px; overflow: hidden; }
    .card h3 { margin-top: 0; font-size: 16px; display: flex; align-items: center; justify-content: space-between; }
    .badge { font-size: 11px; padding: 3px 8px; border-radius: 9999px; font-weight: bold; }
    .badge-pass { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid #22c55e; }
    .badge-fail { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }
    .img-container { background: #020617; border-radius: 8px; overflow: hidden; max-height: 600px; overflow-y: auto; border: 1px solid #334155; }
    img { width: 100%; height: auto; display: block; }
  </style>
</head>
<body>
  <h1>📱 Relatório de Validação Visual Responsiva</h1>
  <p class="subtitle">Gerado automaticamente pelo script de visual regression do KrakenBridge em ${new Date().toLocaleString('pt-BR')}</p>

  <div class="grid">
    ${results.map(r => `
      <div class="card">
        <h3>
          <span>${r.label}</span>
          <span class="badge ${r.overflow ? 'badge-fail' : 'badge-pass'}">${r.overflow ? 'OVERFLOW' : 'OK'}</span>
        </h3>
        <p style="font-size: 12px; color: #94a3b8; margin: 4px 0 12px;">Dimensões: ${r.width}px × ${r.height}px</p>
        <div class="img-container">
          <img src="${r.screenshot}" alt="${r.label}" />
        </div>
      </div>
    `).join('\n')}
  </div>
</body>
</html>`;

    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), htmlReport, 'utf8');
    fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(results, null, 2), 'utf8');

    console.log(`\n🎉 Relatório gerado com sucesso em: ${path.join(OUTPUT_DIR, 'index.html')}`);

    const hasAnyFailure = results.some(r => r.overflow);
    if (hasAnyFailure) {
      console.error('\n❌ Falha: Quebra de layout ou overflow horizontal detectado em uma ou mais viewports!');
      process.exit(1);
    } else {
      console.log('\n✅ Sucesso: Todas as viewports padrão passaram sem overflow horizontal!');
    }
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Erro na execução do script de responsividade:', err);
  process.exit(1);
});
