process.env.NODE_ENV = 'test';

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kraken-model-pricing-'));
process.env.DATA_DIR = tmpDir;
process.env.QUOTA_REFRESH_INTERVAL_MS = '300000';

const {
  MODEL_PRICING_CATALOG,
  normalizeModelName,
  getModelPricing,
  calculateTokenCostUsd
} = await import('../dist-server/utils/modelPricing.js');
const { quotaService } = await import('../dist-server/services/quotaService.js');
const { PaperclipService } = await import('../dist-server/services/paperclipService.js');

describe('modelPricing - Catálogo Oficial e Normalização (#212)', () => {
  after(async () => {
    quotaService.stopAutoRefresh();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('cobre todos os modelos oficiais Google Gemini, Anthropic Claude e OpenAI', () => {
    const expectedModels = [
      // Google Gemini
      'gemini-4-argon',
      'gemini-4-neon',
      'gemini-4-hydrogen',
      'gemini-3.8-flash',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      // Anthropic Claude
      'claude-fable-5-2',
      'claude-opus-5-5',
      'claude-opus-4-8',
      'claude-sonnet-5-5',
      'claude-sonnet-5',
      'claude-sonnet-4-6',
      'claude-haiku-5-5',
      'claude-haiku-4-5',
      // OpenAI
      'gpt-6-astra',
      'gpt-6-sol',
      'gpt-6.1-sol',
      'gpt-6-luna',
      'gpt-5.6-sol',
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano',
      'o3',
      'o4-mini'
    ];

    for (const model of expectedModels) {
      assert.ok(MODEL_PRICING_CATALOG[model], `Modelo ${model} deve existir no catálogo oficial`);
    }
  });

  test('normaliza sufixos -high/-medium/-low e aliases como opus', () => {
    assert.equal(normalizeModelName('gemini-4-hydrogen-high'), 'gemini-4-hydrogen');
    assert.equal(normalizeModelName('gemini-4-argon-medium'), 'gemini-4-argon');
    assert.equal(normalizeModelName('gemini-3.8-flash-low'), 'gemini-3.8-flash');
    assert.equal(normalizeModelName('claude-opus-5-5-medium'), 'claude-opus-5-5');
    assert.equal(normalizeModelName('opus'), 'claude-opus-5-5');
    assert.equal(normalizeModelName('anthropic/claude-sonnet-5'), 'claude-sonnet-5');
    assert.equal(normalizeModelName('google/gemini-4-hydrogen-xhigh'), 'gemini-4-hydrogen');
  });

  test('retorna null para modelos desconhecidos ou auto', () => {
    assert.equal(normalizeModelName('auto'), null);
    assert.equal(normalizeModelName('desconhecido'), null);
    assert.equal(normalizeModelName('unknown-model-xyz'), null);
    assert.equal(normalizeModelName(''), null);
    assert.equal(getModelPricing('auto'), null);
  });

  test('calcula custo USD exato por 1M tokens incluindo cached input e thinking tokens', () => {
    // gemini-4-hydrogen: $1.50 / $0.075 / $7.50
    const hydro = calculateTokenCostUsd({
      model: 'gemini-4-hydrogen-high',
      inputTokens: 1_000_000,
      cachedInputTokens: 2_000_000,
      outputTokens: 500_000,
      thinkingTokens: 500_000
    });
    assert.equal(hydro.isPriced, true);
    assert.equal(hydro.canonicalModel, 'gemini-4-hydrogen');
    // 1.50 + 0.15 + (1_000_000 * 7.50 / 1M) = 9.15
    assert.equal(hydro.costUsd, 9.15);

    // opus -> claude-opus-5-5: $4.00 / $0.20 / $20.00
    const opus = calculateTokenCostUsd({
      model: 'opus',
      inputTokens: 500_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 250_000
    });
    // 2.00 + 0.20 + 5.00 = 7.20
    assert.equal(opus.costUsd, 7.2);

    // o4-mini: $1.10 / $0.275 / $4.40
    const o4 = calculateTokenCostUsd({
      model: 'o4-mini',
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 1_000_000
    });
    assert.equal(o4.costUsd, 5.5);

    // auto -> null / isPriced: false
    const auto = calculateTokenCostUsd({
      model: 'auto',
      inputTokens: 1_000_000,
      outputTokens: 500_000
    });
    assert.equal(auto.isPriced, false);
    assert.equal(auto.costUsd, null);
  });

  test('quotaService calcula estimatedCostUsd em aggregates, dailyPoints, modelBreakdown, workspaceBreakdown e recentTurns', async () => {
    // Impede exec do CLI agy durante o teste
    quotaService.fetchLiveQuotaFromGoogle = async () => quotaService.state;
    quotaService.lastAgyFetch = Date.now();

    const today = new Date().toISOString();

    await quotaService.recordUsage({
      model: 'gemini-4-hydrogen-high',
      agent: 'antigravity',
      subproject: 'KrakenBridge-Web',
      input_tokens: 1_000_000,
      output_tokens: 200_000,
      thinking_tokens: 200_000,
      timestamp: today
    });
    // Custo esperado: 1.50 + (400_000 * 7.50 / 1M = 3.00) = $4.50

    await quotaService.recordUsage({
      model: 'auto',
      agent: 'antigravity',
      subproject: 'KrakenBridge-Web',
      input_tokens: 500_000,
      output_tokens: 100_000,
      timestamp: today
    });
    // Unpriced -> null, não quebra o somatório

    const stats = await quotaService.getStats();

    assert.equal(stats.aggregates.estimatedCostUsd, 4.5);
    assert.equal(stats.aggregates.unpricedTurnsCount, 1);
    assert.equal(stats.aggregates.unpricedTokens, 600_000);

    assert.equal(stats.tokens.modelBreakdown['gemini-4-hydrogen-high'].estimatedCostUsd, 4.5);
    assert.equal(stats.tokens.modelBreakdown['gemini-4-hydrogen-high'].isPriced, true);

    assert.equal(stats.tokens.modelBreakdown.auto.estimatedCostUsd, null);
    assert.equal(stats.tokens.modelBreakdown.auto.isPriced, false);

    assert.equal(stats.workspaceBreakdown['KrakenBridge-Web'].estimatedCostUsd, 4.5);
    assert.equal(stats.workspaceBreakdown['KrakenBridge-Web'].unpricedTurnsCount, 1);

    const todayPoint = stats.dailyPoints.find((p) => p.day === today.slice(0, 10));
    assert.ok(todayPoint, 'Ponto diário de hoje deve existir');
    assert.equal(todayPoint.estimatedCostUsd, 4.5);

    assert.equal(stats.tokens.recentTurns.length, 2);
    assert.equal(stats.tokens.recentTurns[0].model, 'auto');
    assert.equal(stats.tokens.recentTurns[0].estimatedCostUsd, null);
    assert.equal(stats.tokens.recentTurns[0].isPriced, false);
    assert.equal(stats.tokens.recentTurns[1].model, 'gemini-4-hydrogen-high');
    assert.equal(stats.tokens.recentTurns[1].estimatedCostUsd, 4.5);
    assert.equal(stats.tokens.recentTurns[1].isPriced, true);
  });

  test('paperclipService calcula custos por agente e empresa usando 1M tokens e fallback estimatedApiCostCents', () => {
    const service = new PaperclipService();
    service.stopBackgroundPolling();

    const rawAgents = [
      { id: 'ag-1', name: 'Pai do Kraken', adapterConfig: { model: 'gemini-4-argon-medium' } },
      { id: 'ag-2', name: 'Kraken Forge Claude', adapterConfig: { model: 'opus' } },
      { id: 'ag-3', name: 'Kraken Legacy', estimatedApiCostCents: 1250 }
    ];

    const rawByAgentModel = [
      {
        agentId: 'ag-1',
        model: 'gemini-4-argon-medium',
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        outputTokens: 500_000,
        costCents: 0,
        eventCount: 10
      },
      {
        agentId: 'ag-1',
        model: 'auto',
        inputTokens: 250_000,
        cachedInputTokens: 0,
        outputTokens: 50_000,
        costCents: 0,
        eventCount: 2
      },
      {
        agentId: 'ag-2',
        model: 'opus',
        inputTokens: 500_000,
        cachedInputTokens: 1_000_000,
        outputTokens: 100_000,
        costCents: 0,
        eventCount: 4
      }
    ];

    const { agentCostMap, costSummary } = service.buildCostSnapshot(
      rawAgents,
      rawByAgentModel,
      [],
      { budgetCents: 50000 }
    );

    // ag-1: argon = 2.00 + 5.00 = $7.00; auto = unpriced (300k tokens)
    assert.equal(agentCostMap.get('ag-1').estimatedCostUsd, 7.0);
    assert.equal(agentCostMap.get('ag-1').tokenUsage.unpricedTokens, 300_000);

    // ag-2: opus = 2.00 + 0.20 + 2.00 = $4.20
    assert.equal(agentCostMap.get('ag-2').estimatedCostUsd, 4.2);

    // ag-3: fallback estimatedApiCostCents = 1250 cents = $12.50
    assert.equal(agentCostMap.get('ag-3').estimatedCostUsd, 12.5);

    // Total = 7.0 + 4.2 + 12.5 = 23.7
    assert.equal(costSummary.totalEstimatedCostUsd, 23.7);
    assert.equal(costSummary.unpricedTokens, 300_000);
    assert.equal(costSummary.budgetMonthlyUsd, 500);
    assert.equal(costSummary.modelBreakdown.length, 3);
  });
});
