import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PaperclipDashboard } from '../PaperclipDashboard';
import { api } from '../../../services/api';

vi.mock('../../../services/api', () => ({
  api: {
    getPaperclipStatus: vi.fn(),
    pollPaperclip: vi.fn(),
    simulatePaperclipEvent: vi.fn(),
    sendPaperclipAction: vi.fn(),
    createPaperclipEventSource: vi.fn(() => ({
      addEventListener: vi.fn(),
      close: vi.fn()
    }))
  }
}));

describe('PaperclipDashboard UI Component (Issue #141)', () => {
  const mockSnapshot = {
    connected: true,
    lastPollAt: '2026-11-05T21:15:00.000Z',
    companyId: '4034eb89-a640-48d2-8b4d-f2bb0f10a119',
    paperclipUrl: 'http://192.168.31.5:3101',
    agents: [
      {
        id: 'ag-forge',
        companyId: '4034eb89-a640-48d2-8b4d-f2bb0f10a119',
        name: 'Kraken Forge',
        role: 'engineer',
        title: 'Principal Systems Engineer',
        status: 'error',
        lastError: 'RESOURCE_EXHAUSTED 429',
        lastErrorDetails: 'AGY_ERROR: quota limit exceeded for all accounts'
      },
      {
        id: 'ag-sentinel',
        companyId: '4034eb89-a640-48d2-8b4d-f2bb0f10a119',
        name: 'Kraken Sentinel',
        role: 'qa',
        title: 'Lead QA Engineer',
        status: 'idle'
      }
    ],
    issues: [
      {
        id: 'iss-47',
        identifier: 'APE-47',
        title: '[F0-05] CLI esqueleto: init, validate, doctor',
        status: 'in_progress',
        priority: 'high',
        projectId: 'proj-1',
        projectName: 'kraken-cleanroom',
        assigneeAgentId: 'ag-forge',
        assigneeAgentName: 'Kraken Forge',
        createdAt: '2026-11-05T20:00:00.000Z',
        updatedAt: '2026-11-05T21:10:00.000Z'
      },
      {
        id: 'iss-48',
        identifier: 'APE-48',
        title: '[F1-01] Core: SQLite EvidenceStore',
        status: 'blocked',
        priority: 'high',
        projectId: 'proj-1',
        projectName: 'kraken-cleanroom',
        activeRecoveryAction: {
          kind: 'blocked_by_dependency',
          nextAction: 'Aguardando merge da issue APE-47'
        },
        createdAt: '2026-11-05T20:00:00.000Z',
        updatedAt: '2026-11-05T21:10:00.000Z'
      }
    ],
    activeRuns: [],
    recentRuns: [],
    projectsProgress: [
      {
        projectId: 'proj-1',
        projectName: 'kraken-cleanroom',
        totalIssues: 23,
        completedIssues: 6,
        inProgressIssues: 1,
        blockedIssues: 1,
        todoIssues: 15,
        percentage: 26
      }
    ],
    openPrs: [
      {
        number: 6,
        title: 'feat(cli): init, validate, doctor',
        url: 'https://github.com/ApenasGabs/kraken-cleanroom/pull/6',
        repo: 'ApenasGabs/kraken-cleanroom',
        headRefName: 'feat/F0-05-cli-init-validate-doctor',
        issueIdentifier: 'APE-47',
        ciStatus: 'FAILURE' as const,
        ciWorkflowName: 'Lint, Typecheck & Test'
      }
    ],
    stalls: [
      {
        id: 'stall-47',
        issueId: 'iss-47',
        issueIdentifier: 'APE-47',
        issueTitle: '[F0-05] CLI esqueleto: init, validate, doctor',
        agentId: 'ag-forge',
        agentName: 'Kraken Forge',
        issueStatus: 'in_progress',
        lastActivityAt: '2026-11-05T21:10:00.000Z',
        inactiveMinutes: 35,
        reason: 'Issue atribuída em status in_progress sem execuções ativas há 35 min',
        recoverySuggestion: 'Disparar wakeup para o agente Kraken Forge',
        detectedAt: '2026-11-05T21:45:00.000Z'
      }
    ],
    timeline: [
      {
        id: 'evt-1',
        type: 'agent.status_changed' as const,
        timestamp: '2026-11-05T21:10:51.000Z',
        title: 'Agente Kraken Forge mudou para ERROR',
        description: 'Erro: adapter_failed (RESOURCE_EXHAUSTED 429)',
        severity: 'error' as const,
        agentName: 'Kraken Forge'
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getPaperclipStatus).mockResolvedValue(mockSnapshot as any);
    vi.mocked(api.pollPaperclip).mockResolvedValue({ success: true, snapshot: mockSnapshot as any });
    vi.mocked(api.sendPaperclipAction).mockResolvedValue({ success: true });
    vi.mocked(api.simulatePaperclipEvent).mockResolvedValue({
      success: true,
      event: {
        id: 'sim-1',
        type: 'agent.status_changed',
        timestamp: new Date().toISOString(),
        title: 'Simulação',
        description: 'Simulação',
        severity: 'error'
      }
    });
  });

  it('deve renderizar o título do orquestrador e indicador de status Online', async () => {
    render(<PaperclipDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Paperclip Orchestrator')).toBeDefined();
      expect(screen.getByText('Online (Dell)')).toBeDefined();
      expect(screen.getByText('SSE Live')).toBeDefined();
    });
  });

  it('deve exibir os agentes e o erro real desmascarado do Kraken Forge', async () => {
    render(<PaperclipDashboard />);

    await waitFor(() => {
      expect(screen.getAllByText('Kraken Forge').length).toBeGreaterThan(0);
      expect(screen.getByText('Kraken Sentinel')).toBeDefined();
      expect(screen.getByText(/Erro Real: RESOURCE_EXHAUSTED 429/i)).toBeDefined();
    });
  });

  it('deve renderizar o banner de alerta de Stall com APE-47 e botão de wakeup', async () => {
    render(<PaperclipDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Detector de Stall Ativo/i)).toBeDefined();
      expect(screen.getAllByText('APE-47').length).toBeGreaterThan(0);
      expect(screen.getByText(/sem execuções ativas há 35 min/i)).toBeDefined();
      expect(screen.getByText(/Acordar Agente \(Kraken Forge\)/i)).toBeDefined();
    });

    // Clica no botão acordar agente
    const wakeBtn = screen.getByText(/Acordar Agente \(Kraken Forge\)/i);
    fireEvent.click(wakeBtn);

    await waitFor(() => {
      expect(api.sendPaperclipAction).toHaveBeenCalledWith('wakeup', 'ag-forge', 'iss-47');
    });
  });

  it('deve renderizar o progresso de kraken-cleanroom e o status do PR #6 com CI Failure', async () => {
    render(<PaperclipDashboard />);

    await waitFor(() => {
      expect(screen.getAllByText('kraken-cleanroom').length).toBeGreaterThan(0);
      expect(screen.getByText('6/23 (26%)')).toBeDefined();
      expect(screen.getByText('#6 feat(cli): init, validate, doctor')).toBeDefined();
      expect(screen.getByText('CI: FAILURE')).toBeDefined();
    });
  });

  it('deve renderizar os eventos da timeline ao vivo', async () => {
    render(<PaperclipDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Agente Kraken Forge mudou para ERROR')).toBeDefined();
      expect(screen.getByText(/Erro: adapter_failed/i)).toBeDefined();
    });
  });
});
