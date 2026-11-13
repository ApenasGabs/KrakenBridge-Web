process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PaperclipAutoRemediationService } from '../dist-server/services/paperclipAutoRemediationService.js';

// Salva o fetch global original
const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('PaperclipAutoRemediationService: deve detectar corretamente as categorias de falhas de infraestrutura', () => {
  const service = new PaperclipAutoRemediationService();

  // 1. Permission Denied
  const textPerm = 'Falha ao salvar: open /workspace/KrakenBridge-Web/frontend/src/store.ts: permission denied';
  assert.strictEqual(service.detectCategory(textPerm), 'permission_denied');

  const textEacces = 'Error: EACCES: permission denied, unlink /workspace/status-hub/build';
  assert.strictEqual(service.detectCategory(textEacces), 'permission_denied');

  // 2. Git Hook Missing
  const textHook = 'JSON hook "jsonhook__git-guardrails_PreToolUse_0_0" failed: Cannot find module \'/root/.gemini/config/git-guardrail.cjs\'';
  assert.strictEqual(service.detectCategory(textHook), 'git_hook_missing');

  // 3. Git Index Lock
  const textLock = 'fatal: Unable to create \'/workspace/repo/.git/index.lock\': File exists.';
  assert.strictEqual(service.detectCategory(textLock), 'git_index_lock');

  // 4. Erro de lógica/desconhecido (não deve acionar remediação)
  const textBusiness = 'AssertionError: expected true to be false in billing calculator';
  assert.strictEqual(service.detectCategory(textBusiness), 'unknown');
});

test('PaperclipAutoRemediationService: deve resolver o caminho do workspace de forma segura e determinística', () => {
  const service = new PaperclipAutoRemediationService();

  const issueMock = {
    id: 'test-1',
    identifier: 'APE-96',
    title: 'fix: issue teste',
    status: 'blocked',
    priority: 'high',
    projectName: 'KrakenBridge-Web',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const textWithExplicitPath = 'Erro em /workspace/status-hub/src/index.ts: permission denied';
  const resolved = service.resolveWorkspacePath(textWithExplicitPath, issueMock);
  assert.strictEqual(resolved, '/workspace/status-hub');

  const textWithoutExplicitPath = 'Falha geral de permissões no build';
  const resolvedFallback = service.resolveWorkspacePath(textWithoutExplicitPath, issueMock);
  assert.strictEqual(resolvedFallback, '/workspace/KrakenBridge-Web');
});

test('PaperclipAutoRemediationService: playbookFixPermissions deve rejeitar caminhos fora de /workspace', async () => {
  const service = new PaperclipAutoRemediationService();

  const unsafePath = '/etc/shadow';
  const result = await service.playbookFixPermissions(unsafePath);
  assert.strictEqual(result.success, false);
  assert.ok(result.actions[0].includes('rejeitado por segurança'));
});

test('PaperclipAutoRemediationService: deve auto-remediar issue bloqueada por permission_denied, atualizar status e notificar', async () => {
  const timelineEvents = [];
  const notifications = [];

  const service = new PaperclipAutoRemediationService({
    paperclipUrl: 'http://test-paperclip:3101',
    companyId: 'test-company-123',
    apiToken: 'test-token',
    cooldownMs: 1000,
    addTimelineEvent: (evt) => timelineEvents.push(evt),
    notifyAlert: async (notif) => {
      notifications.push(notif);
      return { sent: true };
    }
  });

  // Mock do fetch da API do Paperclip
  globalThis.fetch = async (url, opts = {}) => {
    const urlStr = String(url);

    // 1. Busca comentários da issue
    if (urlStr.includes('/api/issues/issue-block-1/comments') && opts.method !== 'POST') {
      return {
        ok: true,
        json: async () => [
          {
            id: 'c-1',
            body: 'Tentativa falhou porque run_command falhou com: open /workspace/KrakenBridge-Web/src/test.ts: permission denied'
          }
        ]
      };
    }

    // 2. Wakeup do CEO para obter o runId de atribuição
    if (urlStr.includes('/api/agents/38631dff-5dd3-4fb6-bc81-d90aa6b27a00/wakeup')) {
      return {
        ok: true,
        json: async () => ({ id: 'run-audit-123', status: 'queued' })
      };
    }

    // 3. Post de comentário com X-Paperclip-Run-Id
    if (urlStr.includes('/api/issues/issue-block-1/comments') && opts.method === 'POST') {
      assert.strictEqual(opts.headers['X-Paperclip-Run-Id'], 'run-audit-123');
      return {
        ok: true,
        json: async () => ({ id: 'c-new', status: 'created' })
      };
    }

    // 4. PATCH de status para todo
    if (urlStr.includes('/api/issues/issue-block-1') && opts.method === 'PATCH') {
      assert.strictEqual(opts.headers['X-Paperclip-Run-Id'], 'run-audit-123');
      const payload = JSON.parse(opts.body);
      assert.strictEqual(payload.status, 'todo');
      return {
        ok: true,
        json: async () => ({ id: 'issue-block-1', status: 'todo' })
      };
    }

    // 5. Wakeup do agente atribuído
    if (urlStr.includes('/api/agents/forge-123/wakeup')) {
      return {
        ok: true,
        json: async () => ({ status: 'queued' })
      };
    }

    return { ok: true, json: async () => ({}) };
  };

  const blockedIssue = {
    id: 'issue-block-1',
    identifier: 'APE-99',
    title: 'fix: corrigir erro de permissão',
    status: 'blocked',
    priority: 'high',
    assigneeAgentId: 'forge-123',
    projectName: 'KrakenBridge-Web',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const results = await service.evaluateBlockedIssues([blockedIssue]);

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].issueId, 'issue-block-1');
  assert.strictEqual(results[0].category, 'permission_denied');
  assert.strictEqual(results[0].remediated, true);
  assert.strictEqual(results[0].unblocked, true);

  // Valida que emitiu evento na timeline e notificação SRE
  assert.strictEqual(timelineEvents.length, 1);
  assert.strictEqual(timelineEvents[0].type, 'issue.auto_remediated');
  assert.strictEqual(notifications.length, 1);
  assert.ok(notifications[0].title.includes('Auto-Remediada'));
});
