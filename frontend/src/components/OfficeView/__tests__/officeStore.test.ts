import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store/officeStore';
import type { PaperclipStateSnapshot, PaperclipAgent, PaperclipIssue } from '../../../types';

describe('officeStore', () => {
  beforeEach(() => {
    useStore.setState({
      selectedId: null,
      officeTheme: 'office',
    });
  });

  it('deve inicializar com o elenco padrão do Homelab', () => {
    const agents = useStore.getState().agents;
    expect(agents.length).toBeGreaterThanOrEqual(4);

    const pai = agents.find((a) => a.id === '38631dff-5dd3-4fb6-bc81-d90aa6b27a00');
    expect(pai).toBeDefined();
    expect(pai?.name).toBe('Pai do Kraken');
    expect(pai?.isGod).toBe(true);
    expect(pai?.character).toBe('michael');

    const forge = agents.find((a) => a.id === 'fb0ad346-e4b6-42dc-a3fa-ec26d43454d1');
    expect(forge?.name).toBe('Kraken Forge');
    expect(forge?.character).toBe('dwight');

    const sentinel = agents.find((a) => a.id === '217c4ccc-e831-4d0e-bf70-a0266f7ceb15');
    expect(sentinel?.name).toBe('Kraken Sentinel');
    expect(sentinel?.character).toBe('jim');
  });

  it('deve selecionar e desselecionar agentes', () => {
    expect(useStore.getState().selectedId).toBeNull();

    useStore.getState().select('fb0ad346-e4b6-42dc-a3fa-ec26d43454d1');
    expect(useStore.getState().selectedId).toBe('fb0ad346-e4b6-42dc-a3fa-ec26d43454d1');

    useStore.getState().select(null);
    expect(useStore.getState().selectedId).toBeNull();
  });

  it('deve sincronizar com snapshot em tempo real do Paperclip', () => {
    const mockSnapshot: PaperclipStateSnapshot = {
      agents: [
        {
          id: 'fb0ad346-e4b6-42dc-a3fa-ec26d43454d1',
          name: 'Kraken Forge',
          role: 'engineer',
          status: 'running',
          lifecycleState: 'ready',
          updatedAt: new Date().toISOString(),
          title: 'Executando testes',
        } as unknown as PaperclipAgent,
      ],
      issues: [
        {
          id: 'issue-152',
          companyId: '4034eb89-a640-48d2-8b4d-f2bb0f10a119',
          title: 'feat(office): implementar office floor',
          status: 'in_progress',
          assigneeAgentId: 'fb0ad346-e4b6-42dc-a3fa-ec26d43454d1',
        } as unknown as PaperclipIssue,
      ],
      activeRuns: [],
      recentRuns: [],
      projectsProgress: [],
      timeline: [],
    };

    useStore.getState().syncWithPaperclip(mockSnapshot, 'run_command');

    const forge = useStore.getState().agents.find((a) => a.id === 'fb0ad346-e4b6-42dc-a3fa-ec26d43454d1');
    expect(forge?.status).toBe('working');
    expect(forge?.action).toContain('feat(office): implementar office floor');
    expect(forge?.taskId).toBe('issue-152');
    expect(forge?.carrying).toBe('Write');
    expect(forge?.currentStation).toBe('terminal');

    // Kraken local ativo
    const local = useStore.getState().agents.find((a) => a.id === 'local-kraken-bridge');
    expect(local?.status).toBe('working');
    expect(local?.currentStation).toBe('terminal');
  });
});
