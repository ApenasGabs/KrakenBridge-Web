process.env.NODE_ENV = 'test';

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kraken-paperclip-usage-'));
process.env.DATA_DIR = tmpDir;

const { saoPauloDayKey, saoPauloDayStart } = await import('../dist-server/utils/saoPauloDay.js');
const { PaperclipUsageService, PAPERCLIP_USAGE_DAYS } = await import('../dist-server/services/paperclipUsageService.js');
const { quotaService } = await import('../dist-server/services/quotaService.js');
quotaService.fetchLiveQuotaFromGoogle = async () => {};

const row = { model: 'gemini-4-hydrogen-high', eventCount: 2, inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 100_000 };
const run = {
  id: 'r1', agentId: 'a1', startedAt: new Date(Date.now() - 1000).toISOString(),
  finishedAt: new Date().toISOString(), inputTokens: 10, outputTokens: 5, usageJson: null
};
const agents = [{ id: 'a1', name: 'Kraken Sentinel', adapterConfig: { model: 'gemini-4-hydrogen-high' } }];

const makeFetcher = (calls = []) => async (url) => {
  calls.push(url);
  if (url.startsWith('heartbeat-runs')) return [run, { ...run, id: 'r2', inputTokens: 0, outputTokens: 0 }];
  if (url === 'agents') return agents;
  const params = new URLSearchParams(url.split('?')[1]);
  const isToday = saoPauloDayKey(params.get('to')) === saoPauloDayKey(Date.now());
  return isToday ? [row] : [];
};

describe('Consumo do Paperclip no painel geral (#226)', () => {
  after(async () => {
    quotaService.stopAutoRefresh();
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  test('agrupa dias em America/Sao_Paulo', () => {
    assert.equal(saoPauloDayKey('2026-11-25T01:30:00Z'), '2026-11-24');
    assert.equal(saoPauloDayKey('invalida'), '');
    assert.equal(new Date(saoPauloDayStart('2026-11-25')).toISOString(), '2026-11-25T03:00:00.000Z');
  });

  test('consulta cada dia uma vez e deduplica chamadas simultâneas', async () => {
    const calls = [];
    const service = new PaperclipUsageService(makeFetcher(calls));
    const [a, b] = await Promise.all([service.getSnapshot(), service.getSnapshot()]);
    assert.equal(a, b);
    assert.equal(calls.filter((c) => c.startsWith('costs/')).length, PAPERCLIP_USAGE_DAYS + 3);
    assert.equal(a.items.length, 1);
    assert.equal(a.recentTurns.length, 1, 'runs sem uso ficam fora');
    assert.equal(a.recentTurns[0].agent, 'Kraken Sentinel');
  });

  test('filtra por origem sem contar em dobro', async () => {
    await quotaService.recordUsage({ model: 'gemini-4-hydrogen-high', input_tokens: 100, output_tokens: 50, total_tokens: 150 });
    const external = await new PaperclipUsageService(makeFetcher()).getSnapshot();
    const [all, kraken, paperclip] = await Promise.all(
      ['all', 'kraken', 'paperclip'].map((source) => quotaService.getStats({ source, external }))
    );
    assert.equal(kraken.aggregates.totalTokensAllTime, 150);
    assert.equal(paperclip.aggregates.totalTokensAllTime, 1_100_000);
    assert.equal(all.aggregates.totalTokensAllTime, 1_100_150);
    assert.equal(all.aggregates.totalRecordedTurns, 3);
    assert.equal(all.tokens.hourly.totalTokens, 1_100_150);
    assert.equal(all.tokens.weekly.totalTokens, 1_100_150);
    assert.equal(paperclip.aggregates.estimatedCostUsd, 2.25);
    assert.equal(paperclip.dailyPoints.at(-1).turnsCount, 2);
    assert.deepEqual(all.tokens.recentTurns.map((t) => t.source).sort(), ['kraken', 'paperclip']);
    assert.equal(kraken.paperclipUsage, null);
  });

  test('falha do Paperclip é sinalizada e mantém o consumo do Kraken', async () => {
    const external = await new PaperclipUsageService(async () => { throw new Error('offline'); }).getSnapshot();
    const stats = await quotaService.getStats({ source: 'all', external });
    assert.deepEqual(stats.paperclipUsage, { available: false, stale: false });
    assert.equal(stats.aggregates.totalTokensAllTime, 150);
  });

  test('falha após um dado bom preserva o último valor como stale', async () => {
    let offline = false;
    const ok = makeFetcher();
    const service = new PaperclipUsageService(async (url) => {
      if (offline) throw new Error('offline');
      return ok(url);
    });
    await service.getSnapshot();
    offline = true;
    service.fetchedAt = 0;
    const snapshot = await service.getSnapshot();
    assert.equal(snapshot.available, true);
    assert.equal(snapshot.stale, true);
    assert.equal(snapshot.items.length, 1);
  });
});
