process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PrReviewSlaService } from '../dist-server/services/prReviewSlaService.js';
import { PaperclipService } from '../dist-server/services/paperclipService.js';

// Salva o fetch global original
const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('PrReviewSlaService: deve extrair resumo limpo do corpo do PR e ignorar tags HTML/checklists', () => {
  const service = new PrReviewSlaService({
    storagePath: path.join(process.cwd(), 'data', 'test_pr_review_sla_1.json')
  });

  const prBody = `
<!-- Comentário interno de template -->
## 🎯 Contexto e Motivação
Esta alteração implementa o cálculo dinâmico de validade dos produtos no estoque.
Resolve problemas de arredondamento e adiciona testes unitários.

## Checklist
- [x] Testes unitários passando
- [ ] Documentação atualizada
  `;

  const summary = service.extractSummary(prBody, 'feat: validade dinamica');
  assert.ok(summary.includes('Esta alteração implementa o cálculo dinâmico'));
  assert.ok(!summary.includes('<!-- Comentário'));
  assert.ok(!summary.includes('- [x]'));
});

test('PrReviewSlaService: deve registrar novo PR com status pending_human e disparar notificação no WhatsApp', async () => {
  const testStorage = path.join(process.cwd(), 'data', 'test_pr_review_sla_2.json');
  if (fs.existsSync(testStorage)) fs.unlinkSync(testStorage);

  const notifications = [];
  const service = new PrReviewSlaService({
    storagePath: testStorage,
    slaDurationMs: 2 * 60 * 60 * 1000, // 2 horas
    notifyAlert: async (options) => {
      notifications.push(options);
      return { sent: true };
    }
  });

  const now = Date.now();
  const mockPr = {
    number: 160,
    title: 'feat(sla): Fluxo de notificação no WhatsApp de MR/PR',
    url: 'https://github.com/ApenasGabs/KrakenBridge-Web/pull/160',
    repo: 'ApenasGabs/KrakenBridge-Web',
    headRefName: 'feat/#160-mr-review-sla-whatsapp',
    author: 'ApenasGabs',
    issueIdentifier: '#160',
    ciStatus: 'SUCCESS',
    updatedAt: new Date(now).toISOString()
  };

  const result = await service.evaluatePrs([mockPr], now);

  assert.equal(result.newTracked, 1);
  assert.equal(result.delegated, 0);

  // Valida que o PR foi enriquecido com SLA
  assert.ok(mockPr.sla);
  assert.equal(mockPr.sla.status, 'pending_human');
  assert.equal(mockPr.sla.isExpired, false);
  assert.ok(mockPr.sla.timeRemainingMs > 0);

  // Valida que a notificação de abertura foi enviada para o WhatsApp via G_aBot
  assert.equal(notifications.length, 1);
  assert.ok(notifications[0].title.includes('Novo PR Aberto para Revisão (SLA 2h)'));
  assert.ok(notifications[0].body.includes('Prazo de Aprovação Humana*: 2 horas'));
  assert.ok(notifications[0].body.includes('Kraken Sentinel'));

  if (fs.existsSync(testStorage)) fs.unlinkSync(testStorage);
});

test('PrReviewSlaService: deve detectar timeout de 2h, criar tarefa no Paperclip, acordar Sentinel e notificar WhatsApp', async () => {
  const testStorage = path.join(process.cwd(), 'data', 'test_pr_review_sla_3.json');
  if (fs.existsSync(testStorage)) fs.unlinkSync(testStorage);

  const notifications = [];
  const paperclipCalls = [];

  globalThis.fetch = async (url, options) => {
    paperclipCalls.push({ url: String(url), options });
    if (String(url).includes('/issues')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'issue-review-123', identifier: 'APE-99' })
      };
    }
    if (String(url).includes('/wakeup')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, wokenUp: true })
      };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };

  const service = new PrReviewSlaService({
    storagePath: testStorage,
    slaDurationMs: 2 * 60 * 60 * 1000,
    notifyAlert: async (options) => {
      notifications.push(options);
      return { sent: true };
    }
  });

  const t0 = Date.now();
  const mockPr = {
    number: 42,
    title: 'feat(core): cálculo de rentabilidade',
    url: 'https://github.com/ApenasGabs/meuestoque/pull/42',
    repo: 'ApenasGabs/meuestoque',
    headRefName: 'feat/#42-rentabilidade',
    author: 'KrakenForge',
    issueIdentifier: 'APE-42',
    ciStatus: 'SUCCESS',
    updatedAt: new Date(t0).toISOString()
  };

  // 1. Registro inicial
  await service.evaluatePrs([mockPr], t0);
  assert.equal(mockPr.sla.status, 'pending_human');

  // 2. Simula passagem de 2 horas e 1 minuto
  const tTimeout = t0 + (2 * 60 * 60 * 1000) + 60000;
  const timeoutResult = await service.evaluatePrs([mockPr], tTimeout);

  assert.equal(timeoutResult.delegated, 1);
  assert.equal(mockPr.sla.status, 'delegated_sentinel');
  assert.equal(mockPr.sla.isExpired, true);
  assert.equal(mockPr.sla.paperclipIssueIdentifier, 'APE-99');

  // Valida chamada ao Paperclip para criar tarefa
  const issueCall = paperclipCalls.find(c => c.url.includes('/issues'));
  assert.ok(issueCall, 'Deveria ter chamado endpoint de issues do Paperclip');
  const issueBody = JSON.parse(issueCall.options.body);
  assert.ok(issueBody.title.includes('Revisão autônoma do PR #42'));
  assert.equal(issueBody.assigneeAgentId, '217c4ccc-e831-4d0e-bf70-a0266f7ceb15'); // Kraken Sentinel
  assert.equal(issueBody.priority, 'high');

  // Valida wakeup do Sentinel
  const wakeupCall = paperclipCalls.find(c => c.url.includes('/wakeup'));
  assert.ok(wakeupCall, 'Deveria ter chamado wakeup do Sentinel');

  // Valida que notificação de timeout foi enviada
  const timeoutNotification = notifications.find(n => n.key.includes('pr_timeout'));
  assert.ok(timeoutNotification);
  assert.ok(timeoutNotification.title.includes('Timeout de 2h no PR #42 — Delegado ao Sentinel'));
  assert.ok(timeoutNotification.body.includes('APE-99'));

  if (fs.existsSync(testStorage)) fs.unlinkSync(testStorage);
});

test('PrReviewSlaService: deve marcar PR fechado/mergeado como closed', async () => {
  const testStorage = path.join(process.cwd(), 'data', 'test_pr_review_sla_4.json');
  if (fs.existsSync(testStorage)) fs.unlinkSync(testStorage);

  const service = new PrReviewSlaService({ storagePath: testStorage });
  const mockPr = {
    number: 10,
    title: 'fix: typo',
    url: 'https://github.com/ApenasGabs/status-hub/pull/10',
    repo: 'ApenasGabs/status-hub',
    ciStatus: 'SUCCESS'
  };

  await service.evaluatePrs([mockPr], Date.now());
  const tracked = service.getTrackedPr('ApenasGabs/status-hub#10');
  assert.equal(tracked.status, 'pending_human');

  // Próxima avaliação com lista vazia (PR foi fechado/mergeado)
  const result = await service.evaluatePrs([], Date.now() + 1000);
  assert.equal(result.closed, 1);
  assert.equal(tracked.status, 'closed');

  if (fs.existsSync(testStorage)) fs.unlinkSync(testStorage);
});

test('PaperclipService: getPaperclipSummary deve exibir SLA humano e delegação do Sentinel', () => {
  const service = new PaperclipService();
  service.stopBackgroundPolling();

  const now = Date.now();
  service['snapshot'] = {
    connected: true,
    lastPollAt: new Date(now).toISOString(),
    companyId: 'company-ape',
    paperclipUrl: 'http://192.168.31.5:3101',
    agents: [],
    issues: [],
    activeRuns: [],
    recentRuns: [],
    projectsProgress: [],
    stalls: [],
    timeline: [],
    openPrs: [
      {
        number: 160,
        title: 'feat(sla): Fluxo de notificação WhatsApp',
        url: 'https://github.com/ApenasGabs/KrakenBridge-Web/pull/160',
        repo: 'ApenasGabs/KrakenBridge-Web',
        ciStatus: 'SUCCESS',
        sla: {
          firstSeenAt: now,
          slaExpiresAt: now + 90 * 60 * 1000,
          status: 'pending_human',
          timeRemainingMs: 90 * 60 * 1000,
          isExpired: false,
          delegatedToSentinel: false
        }
      },
      {
        number: 42,
        title: 'feat: cálculo de rentabilidade',
        url: 'https://github.com/ApenasGabs/meuestoque/pull/42',
        repo: 'ApenasGabs/meuestoque',
        ciStatus: 'SUCCESS',
        sla: {
          firstSeenAt: now - 3 * 60 * 60 * 1000,
          slaExpiresAt: now - 60 * 60 * 1000,
          status: 'delegated_sentinel',
          timeRemainingMs: 0,
          isExpired: true,
          delegatedToSentinel: true,
          paperclipIssueIdentifier: 'APE-99'
        }
      }
    ]
  };

  const summary = service.getPaperclipSummary();
  assert.ok(summary.includes('SLA Humano (2h)'));
  assert.ok(summary.includes('Restam **90 min**'));
  assert.ok(summary.includes('Revisão Delegada ao Sentinel'));
  assert.ok(summary.includes('APE-99'));
});
