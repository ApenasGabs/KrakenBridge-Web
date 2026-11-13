process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { PaperclipService } from '../dist-server/services/paperclipService.js';

// Mock de fetch para interceptar e testar chamadas ao Paperclip e G_aBot/WhatsApp sem tocar a rede real
const originalFetch = globalThis.fetch;

test.beforeEach(() => {
  globalThis.fetch = async (url, options) => {
    return {
      ok: true,
      status: 200,
      text: async () => '{"ok":true}',
      json: async () => ({ ok: true })
    };
  };
});

test.after(() => {
  globalThis.fetch = originalFetch;
});

test('paperclipService: detectStalls deve identificar stall no cenário de 2026-11-05 (>30 min sem run)', () => {
  const service = new PaperclipService();
  service.stopBackgroundPolling();

  const now = Date.now();
  const fortyMinutesAgo = new Date(now - 40 * 60 * 1000).toISOString();

  const mockAgents = [
    {
      id: 'agent-forge',
      companyId: 'company-ape',
      name: 'Kraken Forge',
      role: 'engineer',
      status: 'idle',
      lastHeartbeatAt: new Date(now - 5 * 60 * 1000).toISOString()
    }
  ];

  const mockIssues = [
    {
      id: 'issue-47',
      identifier: 'APE-47',
      title: 'feat: setup cleanroom environment',
      status: 'in_progress',
      assigneeAgentId: 'agent-forge',
      updatedAt: fortyMinutesAgo,
      createdAt: fortyMinutesAgo
    }
  ];

  const mockActiveRuns = []; // Nenhuma run ativa
  const mockRecentRuns = [
    {
      id: 'run-1',
      companyId: 'company-ape',
      agentId: 'agent-forge',
      issueId: 'issue-47',
      status: 'failed',
      finishedAt: fortyMinutesAgo,
      startedAt: new Date(now - 45 * 60 * 1000).toISOString()
    }
  ];

  const stalls = service.detectStalls(mockIssues, mockAgents, mockActiveRuns, mockRecentRuns);

  assert.equal(stalls.length, 1);
  assert.equal(stalls[0].issueIdentifier, 'APE-47');
  assert.equal(stalls[0].agentName, 'Kraken Forge');
  assert.ok(stalls[0].inactiveMinutes >= 40, `Esperado >= 40 min, recebido: ${stalls[0].inactiveMinutes}`);
  assert.match(stalls[0].reason, /sem execuções ativas há/);
});

test('paperclipService: detectStalls deve identificar activeRecoveryAction stranded_assigned_issue', () => {
  const service = new PaperclipService();
  service.stopBackgroundPolling();

  const mockAgents = [
    {
      id: 'agent-forge',
      companyId: 'company-ape',
      name: 'Kraken Forge',
      role: 'engineer',
      status: 'error',
      lastHeartbeatAt: new Date().toISOString()
    }
  ];

  const mockIssues = [
    {
      id: 'issue-stranded',
      identifier: 'APE-47',
      title: 'cleanroom lost wake issue',
      status: 'in_progress',
      assigneeAgentId: 'agent-forge',
      activeRecoveryAction: {
        kind: 'stranded_assigned_issue',
        nextAction: 'Reatribuir ou acordar o agente'
      },
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }
  ];

  const stalls = service.detectStalls(mockIssues, mockAgents, [], []);

  assert.equal(stalls.length, 1);
  assert.equal(stalls[0].issueIdentifier, 'APE-47');
  assert.match(stalls[0].reason, /Lost wake \/ stranded assigned issue/);
  assert.equal(stalls[0].recoverySuggestion, 'Reatribuir ou acordar o agente');
});

test('paperclipService: detectStalls deve detectar agente sem heartbeat há mais de 60 min com tarefas pendentes', () => {
  const service = new PaperclipService();
  service.stopBackgroundPolling();

  const now = Date.now();
  const seventyMinutesAgo = new Date(now - 70 * 60 * 1000).toISOString();

  const mockAgents = [
    {
      id: 'agent-sentinel',
      companyId: 'company-ape',
      name: 'Kraken Sentinel',
      role: 'qa',
      status: 'idle',
      lastHeartbeatAt: seventyMinutesAgo
    }
  ];

  const mockIssues = [
    {
      id: 'issue-review',
      identifier: 'APE-50',
      title: 'Validar PR de Cleanroom',
      status: 'in_progress',
      assigneeAgentId: 'agent-sentinel',
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }
  ];

  const stalls = service.detectStalls(mockIssues, mockAgents, [], []);

  assert.equal(stalls.length, 1);
  assert.equal(stalls[0].agentName, 'Kraken Sentinel');
  assert.match(stalls[0].reason, /sem heartbeat há 70 min/);
});

test('paperclipService: detectStalls deve IGNORAR tarefas em todo (backlog) evitando falso alarme de stall', () => {
  const service = new PaperclipService();
  service.stopBackgroundPolling();

  const now = Date.now();
  const fortyMinutesAgo = new Date(now - 40 * 60 * 1000).toISOString();

  const mockAgents = [
    {
      id: 'agent-forge',
      name: 'Kraken Forge',
      role: 'engineer',
      status: 'idle',
      lastHeartbeatAt: new Date().toISOString()
    }
  ];

  const mockIssues = [
    {
      id: 'issue-queued',
      identifier: 'APE-99',
      title: 'Tarefa futura no backlog',
      status: 'todo',
      assigneeAgentId: 'agent-forge',
      updatedAt: fortyMinutesAgo,
      createdAt: fortyMinutesAgo
    }
  ];

  const stalls = service.detectStalls(mockIssues, mockAgents, [], []);
  assert.equal(stalls.length, 0, 'Tarefas em todo no backlog não devem disparar stalls');
});

test('paperclipService: notifyAlert deve suprimir alertas sem requiresHumanAction e sem force', async () => {
  const service = new PaperclipService();
  service.stopBackgroundPolling();

  const routineAlert = {
    key: 'routine-alert',
    severity: 'yellow',
    title: 'Aviso operacional rotineiro',
    body: 'Métrica oscilou',
    requiresHumanAction: false
  };

  const res = await service.notifyAlert(routineAlert);
  assert.equal(res.sent, false);
  assert.equal(res.suppressed, true);

  const humanAlert = {
    key: 'human-approval-required',
    severity: 'red',
    title: 'Aprovação Manual Necessária',
    body: 'Por favor aprove o PR de produção',
    requiresHumanAction: true
  };

  const resHuman = await service.notifyAlert(humanAlert);
  assert.equal(resHuman.sent, true);
  assert.equal(resHuman.suppressed, undefined);
});

test('paperclipService: notifyAlert deve deduplicar alertas na janela de debounce de 20 min', async () => {
  const service = new PaperclipService();
  service.stopBackgroundPolling();

  const alertOptions = {
    key: 'test-agent-error',
    severity: 'red',
    title: '🔴 Agente em Erro',
    body: 'O agente falhou no adapter',
    requiresHumanAction: true
  };

  const firstCall = await service.notifyAlert(alertOptions);
  assert.equal(firstCall.sent, true);
  assert.equal(firstCall.deduped, false);

  // Segunda chamada imediata com a mesma chave deve ser deduplicada
  const secondCall = await service.notifyAlert(alertOptions);
  assert.equal(secondCall.sent, false);
  assert.equal(secondCall.deduped, true);

  // Chamada forçada deve bypassar o debounce
  const forcedCall = await service.notifyAlert({ ...alertOptions, force: true });
  assert.equal(forcedCall.sent, true);
  assert.equal(forcedCall.deduped, false);
});

test('paperclipService: getPaperclipSummary deve formatar o resumo para /paperclip status com agentes, stalls e épicos', () => {
  const service = new PaperclipService();
  service.stopBackgroundPolling();

  const summary = service.getPaperclipSummary();
  assert.match(summary, /## 📎 Status em Tempo Real do Paperclip/);
  assert.match(summary, /### 🤖 Esquadrão de Agentes/);
  assert.match(summary, /💡 _Dica: Você pode visualizar os painéis completos/);
});
