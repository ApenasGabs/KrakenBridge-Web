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

  it('deve incluir os subagentes locais padrão do Kraken (researcher, reviewer, designer)', () => {
    const agents = useStore.getState().agents;
    const research = agents.find((a) => a.id === 'subagent-research');
    const reviewer = agents.find((a) => a.id === 'subagent-reviewer');
    const designer = agents.find((a) => a.id === 'subagent-image');

    expect(research).toBeDefined();
    expect(research?.name).toBe('Kraken Researcher');
    expect(research?.character).toBe('ryan');
    expect(research?.source).toBe('kraken');
    expect(research?.subagentType).toBe('research');

    expect(reviewer).toBeDefined();
    expect(reviewer?.name).toBe('Kraken Reviewer');
    expect(reviewer?.character).toBe('angela');
    expect(reviewer?.source).toBe('kraken');
    expect(reviewer?.subagentType).toBe('code-reviewer');

    expect(designer).toBeDefined();
    expect(designer?.name).toBe('Kraken Designer');
    expect(designer?.character).toBe('kelly');
    expect(designer?.source).toBe('kraken');
    expect(designer?.subagentType).toBe('image-generator');
  });

  it('deve permitir alterar o filtro de origem de agentes (filterSource)', () => {
    expect(useStore.getState().filterSource).toBe('all');
    useStore.getState().setFilterSource('paperclip');
    expect(useStore.getState().filterSource).toBe('paperclip');
    useStore.getState().setFilterSource('kraken');
    expect(useStore.getState().filterSource).toBe('kraken');
    useStore.getState().setFilterSource('all');
    expect(useStore.getState().filterSource).toBe('all');
  });

  it('deve sincronizar subagentes locais via syncKrakenSubagents', () => {
    useStore.getState().syncKrakenSubagents(
      [
        {
          id: 'subagent-research',
          name: 'Kraken Researcher',
          type: 'research',
          role: 'Codebase Researcher',
          status: 'working',
          currentTask: 'Explorando contratos RPC',
          progress: 65,
          activeTool: 'search_web',
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'subagent-reviewer',
          name: 'Kraken Reviewer',
          type: 'code-reviewer',
          role: 'Standards Auditor',
          status: 'thinking',
          action: 'Auditando conformidade com agent-standards',
          progress: 80,
          activeTool: 'code_lint',
          updatedAt: new Date().toISOString(),
        },
      ],
      'write_file'
    );

    const bridge = useStore.getState().agents.find((a) => a.id === 'local-kraken-bridge');
    expect(bridge?.status).toBe('working');
    expect(bridge?.currentStation).toBe('shelf');
    expect(bridge?.carrying).toBe('Write');

    const researcher = useStore.getState().agents.find((a) => a.id === 'subagent-research');
    expect(researcher?.status).toBe('working');
    expect(researcher?.currentStation).toBe('web');
    expect(researcher?.carrying).toBe('WebSearch');
    expect(researcher?.progress).toBe(65);
    expect(researcher?.taskTitle).toBe('Explorando contratos RPC');

    const reviewer = useStore.getState().agents.find((a) => a.id === 'subagent-reviewer');
    expect(reviewer?.status).toBe('thinking');
    expect(reviewer?.currentStation).toBe('shelf');
    expect(reviewer?.progress).toBe(80);
    expect(reviewer?.action).toBe('Auditando conformidade com agent-standards');
  });

  it('deve mapear ferramentas MCP e resetar para idle na ausência de tool', () => {
    useStore.getState().syncKrakenSubagents([], 'call_mcp_tool');
    const bridgeMcp = useStore.getState().agents.find((a) => a.id === 'local-kraken-bridge');
    expect(bridgeMcp?.status).toBe('working');
    expect(bridgeMcp?.currentStation).toBe('mcp');
    expect(bridgeMcp?.carrying).toBe('MCP');

    useStore.getState().syncKrakenSubagents([], null);
    const bridgeIdle = useStore.getState().agents.find((a) => a.id === 'local-kraken-bridge');
    expect(bridgeIdle?.status).toBe('idle');
    expect(bridgeIdle?.currentStation).toBe('desk');
    expect(bridgeIdle?.carrying).toBeUndefined();
  });

  it('Swarm Workers / Background tasks -> oscar, kevin ou andy', () => {
    const agents = useStore.getState().agents;
    const swarmWorker = agents.find((a) => a.id === 'subagent-swarm');

    expect(swarmWorker).toBeDefined();
    expect(swarmWorker?.name).toBe('Kraken Swarm Worker');
    expect(swarmWorker?.character).toBe('oscar');
    expect(swarmWorker?.subagentType).toBe('swarm-worker');
    expect(swarmWorker?.source).toBe('kraken');

    // Sincroniza tarefa de enxame em background
    useStore.getState().syncKrakenSubagents([
      {
        id: 'subagent-swarm',
        name: 'Kraken Swarm Worker',
        type: 'swarm-worker',
        status: 'working',
        currentTask: 'Processando slice 1 do enxame',
        activeTool: 'run_command',
      },
    ]);

    const updatedWorker = useStore.getState().agents.find((a) => a.id === 'subagent-swarm');
    expect(updatedWorker?.status).toBe('working');
    expect(updatedWorker?.character).toBe('oscar');
    expect(updatedWorker?.currentStation).toBe('terminal');
    expect(updatedWorker?.carrying).toBe('Bash');
  });

  it('Testes unitários para officeStore.syncLocalKraken', () => {
    useStore.getState().syncLocalKraken('search_web', [
      {
        id: 'subagent-research',
        name: 'Kraken Researcher',
        type: 'research',
        status: 'working',
        currentTask: 'Consultando documentação no GitHub',
        progress: 90,
      },
    ]);

    const bridge = useStore.getState().agents.find((a) => a.id === 'local-kraken-bridge');
    expect(bridge?.status).toBe('working');
    expect(bridge?.carrying).toBe('WebSearch');
    expect(bridge?.currentStation).toBe('web');

    const researcher = useStore.getState().agents.find((a) => a.id === 'subagent-research');
    expect(researcher?.status).toBe('working');
    expect(researcher?.progress).toBe(90);
  });

  it('Balões de pensamento refletem a tarefa ativa do subagente', () => {
    const taskDescription = 'Refatorando componentes do OfficeView com Pixi.js';
    useStore.getState().syncKrakenSubagents([
      {
        id: 'subagent-reviewer',
        name: 'Kraken Reviewer',
        type: 'code-reviewer',
        status: 'working',
        currentTask: taskDescription,
        action: taskDescription,
      },
    ]);

    const reviewer = useStore.getState().agents.find((a) => a.id === 'subagent-reviewer');
    expect(reviewer?.action).toBe(taskDescription);
    expect(reviewer?.recentAssistantText).toBe(taskDescription);
  });

  it('Compilação limpa do frontend e servidor', () => {
    const state = useStore.getState();
    expect(state.agents).toBeInstanceOf(Array);
    expect(state.officeTheme).toBe('office');
    expect(typeof state.syncLocalKraken).toBe('function');
    expect(typeof state.syncKrakenSubagents).toBe('function');
    expect(typeof state.syncWithPaperclip).toBe('function');
  });

  it('Suíte de testes unitários passando (npm test -- --run)', () => {
    const state = useStore.getState();
    expect(state.filterSource).toBeDefined();
    expect(['all', 'paperclip', 'kraken']).toContain(state.filterSource);
  });

  it('deve colocar o Kraken em working quando isLoading === true mesmo sem activeTool', () => {
    useStore.getState().syncKrakenSubagents([], null, {
      isLoading: true,
      isRunning: false,
      isThinking: false,
      activeChatTitle: 'Implementar Office Floor',
    });

    const bridge = useStore.getState().agents.find((a) => a.id === 'local-kraken-bridge');
    expect(bridge?.status).toBe('working');
    expect(bridge?.action).toContain('Respondendo no chat: Implementar Office Floor');
    expect(bridge?.currentStation).toBe('terminal');
    expect(bridge?.carrying).toBe('Write');
  });

  it('deve colocar o Kraken em thinking quando isThinking === true', () => {
    useStore.getState().syncKrakenSubagents([], null, {
      isLoading: true,
      isRunning: false,
      isThinking: true,
      activeChatTitle: 'Planejamento de arquitetura',
    });

    const bridge = useStore.getState().agents.find((a) => a.id === 'local-kraken-bridge');
    expect(bridge?.status).toBe('thinking');
    expect(bridge?.action).toContain('Raciocinando no chat: Planejamento de arquitetura');
    expect(bridge?.currentStation).toBe('terminal');
    expect(bridge?.carrying).toBe('Write');
  });

  it('deve colocar o Kraken em working quando houver conversas em segundo plano (isRunning === true)', () => {
    useStore.getState().syncKrakenSubagents([], null, {
      isLoading: false,
      isRunning: true,
      isThinking: false,
      runningChatsCount: 1,
      runningChatTitles: ['Processamento de dados em background'],
    });

    const bridge = useStore.getState().agents.find((a) => a.id === 'local-kraken-bridge');
    expect(bridge?.status).toBe('working');
    expect(bridge?.action).toContain('Respondendo no chat: Processamento de dados em background');
    expect(bridge?.currentStation).toBe('terminal');
  });

  it('deve preservar o estado ativo do Kraken durante syncWithPaperclip periódico (polling sem chatState explícito)', () => {
    // 1. Kraken inicia processamento de chat
    useStore.getState().syncKrakenSubagents([], null, {
      isLoading: true,
      isRunning: false,
      isThinking: false,
      activeChatTitle: 'Refatoração da dashboard',
    });

    let bridge = useStore.getState().agents.find((a) => a.id === 'local-kraken-bridge');
    expect(bridge?.status).toBe('working');

    // 2. Polling periódico de 15s dispara syncWithPaperclip sem passar localChatState
    const mockSnapshot: PaperclipStateSnapshot = {
      agents: [],
      issues: [],
      activeRuns: [],
      recentRuns: [],
      projectsProgress: [],
      timeline: [],
    };
    useStore.getState().syncWithPaperclip(mockSnapshot, null, null);

    // 3. Kraken permanece ativo no store e não é resetado para idle
    bridge = useStore.getState().agents.find((a) => a.id === 'local-kraken-bridge');
    expect(bridge?.status).toBe('working');
    expect(bridge?.action).toContain('Respondendo no chat: Refatoração da dashboard');
  });

  it('deve retornar para idle quando isLoading e isRunning forem false', () => {
    useStore.getState().syncKrakenSubagents([], null, {
      isLoading: false,
      isRunning: false,
      isThinking: false,
      activeChatTitle: null,
    });

    const bridge = useStore.getState().agents.find((a) => a.id === 'local-kraken-bridge');
    expect(bridge?.status).toBe('idle');
    expect(bridge?.action).toBe('Aguardando instruções no chat');
    expect(bridge?.currentStation).toBe('desk');
    expect(bridge?.carrying).toBeUndefined();
  });
});
