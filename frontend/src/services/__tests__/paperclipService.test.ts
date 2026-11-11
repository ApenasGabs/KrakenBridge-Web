// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaperclipService } from '../../../../src/services/paperclipService';
import type { PaperclipAgent, PaperclipIssue, PaperclipRun, PaperclipStateSnapshot } from '../../../../src/types/paperclip';

describe('PaperclipService - Realtime Status, Stalls & Notifications (Issue #141)', () => {
  let service: PaperclipService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PaperclipService();
    // Interrompe o polling automático para testes determinísticos
    service.stopBackgroundPolling();
  });

  afterEach(() => {
    service.stopBackgroundPolling();
  });

  describe('Detector de Stalls (Inatividade > 30 min / Lost Wake)', () => {
    it('deve disparar stall no cenário de 2026-11-05 (issue in_progress atribuída sem run há mais de 30 min)', () => {
      const now = Date.now();
      const fortyMinutesAgo = new Date(now - 40 * 60 * 1000).toISOString();

      const mockAgents: PaperclipAgent[] = [
        {
          id: 'agent-forge-1',
          companyId: 'company-1',
          name: 'Kraken Forge',
          role: 'engineer',
          status: 'idle',
          lastHeartbeatAt: fortyMinutesAgo
        }
      ];

      const mockIssues: PaperclipIssue[] = [
        {
          id: 'issue-ape-47',
          identifier: 'APE-47',
          title: '[F0-05] CLI esqueleto: init, validate, doctor',
          status: 'in_progress',
          priority: 'high',
          assigneeAgentId: 'agent-forge-1',
          assigneeAgentName: 'Kraken Forge',
          createdAt: fortyMinutesAgo,
          updatedAt: fortyMinutesAgo
        }
      ];

      const activeRuns: PaperclipRun[] = []; // Nenhuma execução ativa no momento
      const recentRuns: PaperclipRun[] = [
        {
          id: 'run-prev',
          companyId: 'company-1',
          agentId: 'agent-forge-1',
          issueId: 'issue-ape-47',
          status: 'failed',
          startedAt: new Date(now - 45 * 60 * 1000).toISOString(),
          finishedAt: fortyMinutesAgo
        }
      ];

      const stalls = service.detectStalls(mockIssues, mockAgents, activeRuns, recentRuns);

      expect(stalls.length).toBeGreaterThanOrEqual(1);
      const stallApe47 = stalls.find(s => s.issueIdentifier === 'APE-47');
      expect(stallApe47).toBeDefined();
      expect(stallApe47?.agentName).toBe('Kraken Forge');
      expect(stallApe47?.inactiveMinutes).toBeGreaterThanOrEqual(39);
      expect(stallApe47?.reason).toContain('sem execuções ativas');
    });

    it('deve detectar stall imediato para issues marcadas com activeRecoveryAction (stranded_assigned_issue / lost wake)', () => {
      const mockAgents: PaperclipAgent[] = [
        {
          id: 'agent-forge-1',
          companyId: 'company-1',
          name: 'Kraken Forge',
          role: 'engineer',
          status: 'error',
          lastError: 'adapter_failed'
        }
      ];

      const mockIssues: PaperclipIssue[] = [
        {
          id: 'issue-stranded',
          identifier: 'APE-47',
          title: 'CLI esqueleto',
          status: 'in_progress',
          priority: 'high',
          assigneeAgentId: 'agent-forge-1',
          activeRecoveryAction: {
            kind: 'stranded_assigned_issue',
            nextAction: 'Board operator: inspect the evidence and retry.',
            wakePolicy: {
              type: 'board_escalation',
              reason: 'stranded_assigned_issue'
            }
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      const stalls = service.detectStalls(mockIssues, mockAgents, [], []);
      expect(stalls.length).toBe(1);
      expect(stalls[0].issueIdentifier).toBe('APE-47');
      expect(stalls[0].reason).toContain('Lost wake / stranded assigned issue');
    });

    it('deve detectar stall de agente sem heartbeat há mais de 60 minutos com trabalho atribuído', () => {
      const now = Date.now();
      const seventyMinutesAgo = new Date(now - 70 * 60 * 1000).toISOString();

      const mockAgents: PaperclipAgent[] = [
        {
          id: 'agent-sentinel',
          companyId: 'company-1',
          name: 'Kraken Sentinel',
          role: 'qa',
          status: 'idle',
          lastHeartbeatAt: seventyMinutesAgo
        }
      ];

      const mockIssues: PaperclipIssue[] = [
        {
          id: 'issue-todo-1',
          identifier: 'APE-50',
          title: 'Validar testes E2E',
          status: 'todo',
          priority: 'medium',
          assigneeAgentId: 'agent-sentinel',
          createdAt: seventyMinutesAgo,
          updatedAt: seventyMinutesAgo
        }
      ];

      const stalls = service.detectStalls(mockIssues, mockAgents, [], []);
      const agentStall = stalls.find(s => s.issueIdentifier === 'AGENT' && s.agentName === 'Kraken Sentinel');
      expect(agentStall).toBeDefined();
      expect(agentStall?.inactiveMinutes).toBeGreaterThanOrEqual(69);
      expect(agentStall?.reason).toContain('sem heartbeat');
    });

    it('NÃO deve disparar stall para issues já concluídas (done)', () => {
      const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000).toISOString();
      const mockIssues: PaperclipIssue[] = [
        {
          id: 'issue-done',
          identifier: 'APE-46',
          title: 'Manifesto pronto',
          status: 'done',
          priority: 'high',
          assigneeAgentId: 'agent-1',
          createdAt: twoHoursAgo,
          updatedAt: twoHoursAgo
        }
      ];

      const stalls = service.detectStalls(mockIssues, [], [], []);
      expect(stalls.length).toBe(0);
    });
  });

  describe('Deduplicação de Alertas e Notificações', () => {
    it('deve suprimir alertas duplicados para a mesma chave dentro do tempo de debounce', async () => {
      const alertOptions = {
        key: 'test-agent-error-1',
        severity: 'red' as const,
        title: '🔴 Agente em Erro',
        body: 'Falha no adapter'
      };

      // Primeiro envio: sucesso
      const res1 = await service.notifyAlert(alertOptions);
      expect(res1.sent).toBe(true);
      expect(res1.deduped).toBe(false);

      // Segundo envio imediato: suprimido por deduplicação
      const res2 = await service.notifyAlert(alertOptions);
      expect(res2.sent).toBe(false);
      expect(res2.deduped).toBe(true);

      // Com force: true: deve enviar mesmo dentro da janela
      const res3 = await service.notifyAlert({ ...alertOptions, force: true });
      expect(res3.sent).toBe(true);
      expect(res3.deduped).toBe(false);
    });
  });

  describe('Resumo Estruturado do Chat (/paperclip status)', () => {
    it('deve gerar markdown com agentes, erros reais, stalls e PRs', () => {
      // Configura snapshot simulado
      (service as unknown as { snapshot: PaperclipStateSnapshot }).snapshot = {
        connected: true,
        lastPollAt: new Date().toISOString(),
        companyId: 'company-1',
        paperclipUrl: 'http://192.168.31.5:3101',
        agents: [
          {
            id: 'ag-1',
            name: 'Kraken Forge',
            role: 'engineer',
            status: 'error',
            lastError: 'RESOURCE_EXHAUSTED 429'
          },
          {
            id: 'ag-2',
            name: 'Pai do Kraken',
            role: 'architect',
            status: 'idle'
          }
        ],
        issues: [
          {
            id: 'iss-1',
            identifier: 'APE-47',
            title: 'CLI esqueleto',
            status: 'in_progress',
            priority: 'high',
            assigneeAgentName: 'Kraken Forge'
          }
        ],
        activeRuns: [],
        recentRuns: [],
        projectsProgress: [
          {
            projectId: 'p-cleanroom',
            projectName: 'kraken-cleanroom',
            totalIssues: 23,
            completedIssues: 6,
            inProgressIssues: 1,
            blockedIssues: 2,
            todoIssues: 14,
            percentage: 26
          }
        ],
        openPrs: [
          {
            number: 6,
            title: 'feat(cli): init, validate, doctor',
            url: 'https://github.com/ApenasGabs/kraken-cleanroom/pull/6',
            repo: 'ApenasGabs/kraken-cleanroom',
            ciStatus: 'FAILURE',
            ciWorkflowName: 'CI'
          }
        ],
        stalls: [
          {
            id: 'stall-1',
            issueId: 'iss-1',
            issueIdentifier: 'APE-47',
            issueTitle: 'CLI esqueleto',
            agentId: 'ag-1',
            agentName: 'Kraken Forge',
            issueStatus: 'in_progress',
            lastActivityAt: new Date().toISOString(),
            inactiveMinutes: 42,
            reason: 'Issue sem run há 42 min'
          }
        ],
        timeline: []
      };

      const summary = service.getPaperclipSummary();

      expect(summary).toContain('## 📎 Status em Tempo Real do Paperclip');
      expect(summary).toContain('Kraken Forge');
      expect(summary).toContain('RESOURCE_EXHAUSTED 429');
      expect(summary).toContain('kraken-cleanroom');
      expect(summary).toContain('6/23');
      expect(summary).toContain('APE-47');
      expect(summary).toContain('Stalls e Travamentos Detectados');
      expect(summary).toContain('PR #6');
      expect(summary).toContain('CI: 🔴 **FAILURE**');
    });
  });

  describe('Simulação de Eventos', () => {
    it('deve simular evento de agente em erro e adicionar à timeline', async () => {
      const evt = await service.simulateEvent('error');
      expect(evt).toBeDefined();
      expect(evt?.type).toBe('agent.status_changed');
      expect(evt?.severity).toBe('error');

      const snapshot = service.getSnapshot();
      expect(snapshot.timeline.length).toBeGreaterThanOrEqual(1);
      expect(snapshot.timeline[0].title).toContain('Kraken Forge');
    });

    it('deve simular evento de stall gerando notificação forçada', async () => {
      const evt = await service.simulateEvent('stall');
      expect(evt).toBeDefined();
      expect(evt?.type).toBe('stall.detected');
      expect(evt?.issueIdentifier).toBe('APE-47');
    });
  });
});
