import { create } from 'zustand';
import type { OfficeCharacterName } from '../office/cast';
import type { AccentColorName } from '../design/tokens';
import type { ThemeId } from '../office/themeRegistry';
import type { PaperclipStateSnapshot, PaperclipAgent, PaperclipIssue, LocalSubagent } from '../../../types';

export type ToolKind =
  | 'Read' | 'Edit' | 'Write' | 'Bash' | 'WebFetch' | 'WebSearch'
  | 'Grep' | 'Glob' | 'TodoWrite' | 'MCP';

export type StationKind =
  | 'shelf' | 'terminal' | 'web' | 'board' | 'mailbox' | 'mcp' | 'desk';

export type StatusKind =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'blocked'
  | 'success'
  | 'ghost'
  | 'waiting'
  | 'compacting'
  | 'looping';

export type AgentSource = 'paperclip' | 'kraken';

export interface LocalKrakenChatState {
  isLoading?: boolean;
  isRunning?: boolean;
  isThinking?: boolean;
  activeChatTitle?: string | null;
  runningChatsCount?: number;
  runningChatTitles?: string[];
}

export interface Agent {
  id: string;
  name: string;
  character: OfficeCharacterName;
  accent: AccentColorName;
  description: string;
  project: string;
  status: StatusKind;
  action: string;
  progress: number;
  currentStation?: StationKind;
  carrying?: ToolKind;
  recentAssistantText?: string;
  recentTextTs?: number;
  isGod?: boolean;
  lastPrompt?: string;
  taskTitle?: string;
  taskId?: string;
  source?: AgentSource;
  subagentType?: string;
}

export interface OfficeState {
  officeTheme: ThemeId;
  fullscreenAgentId: string | null;
  ideOpen: boolean;
  selectedId: string | null;
  agents: Agent[];
  filterSource: 'all' | 'paperclip' | 'kraken';
  localChatState: LocalKrakenChatState | null;
  setFilterSource: (source: 'all' | 'paperclip' | 'kraken') => void;
  setLocalChatState: (chatState: LocalKrakenChatState | null) => void;
  select: (id: string | null) => void;
  setAgents: (agents: Agent[]) => void;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  requestCommandCenterTab?: (tab: string) => void;
  syncWithPaperclip: (
    snapshot: PaperclipStateSnapshot | null,
    localActiveTool?: string | null,
    localSubagents?: LocalSubagent[] | null,
    localChatState?: LocalKrakenChatState | null
  ) => void;
  syncKrakenSubagents: (
    subagents?: LocalSubagent[] | null,
    localActiveTool?: string | null,
    localChatState?: LocalKrakenChatState | null
  ) => void;
  syncLocalKraken: (
    activeTool?: string | null,
    subagents?: LocalSubagent[] | null,
    localChatState?: LocalKrakenChatState | null
  ) => void;
}

const mapSubagentStatus = (status?: string, isWorking = false): StatusKind => {
  if (status === 'working' || status === 'running') return 'working';
  if (status === 'thinking') return 'thinking';
  if (status === 'error' || status === 'blocked') return 'blocked';
  if (status === 'done' || status === 'success') return 'success';
  return isWorking ? 'working' : 'idle';
};

const DEFAULT_AGENTS: Agent[] = [
  {
    id: '38631dff-5dd3-4fb6-bc81-d90aa6b27a00',
    name: 'Pai do Kraken',
    character: 'michael',
    accent: 'lemon',
    description: 'CEO / Arquiteto Chefe do Homelab',
    project: 'Gabisa Infra',
    status: 'idle',
    action: 'Planejando e orquestrando o ecossistema',
    progress: 100,
    isGod: true,
    source: 'paperclip',
  },
  {
    id: 'fb0ad346-e4b6-42dc-a3fa-ec26d43454d1',
    name: 'Kraken Forge',
    character: 'dwight',
    accent: 'mint',
    description: 'Principal Fullstack & Systems Engineer',
    project: 'Gabisa Infra',
    status: 'idle',
    action: 'Pronto para tarefas de código e refatoração',
    progress: 0,
    currentStation: 'terminal',
    source: 'paperclip',
  },
  {
    id: '217c4ccc-e831-4d0e-bf70-a0266f7ceb15',
    name: 'Kraken Sentinel',
    character: 'jim',
    accent: 'sky',
    description: 'Lead QA, UX & Code Review Engineer',
    project: 'Gabisa Infra',
    status: 'idle',
    action: 'Monitorando suites de teste e Browserless',
    progress: 0,
    currentStation: 'desk',
    source: 'paperclip',
  },
  {
    id: '1f898ec2-7916-4f2f-828e-f96b06a798b9',
    name: 'Kraken Watchtower',
    character: 'stanley',
    accent: 'coral',
    description: 'Lead SRE & Autonomous Log Auditor',
    project: 'Gabisa Infra',
    status: 'idle',
    action: 'Auditando métricas e telemetria',
    progress: 0,
    currentStation: 'shelf',
    source: 'paperclip',
  },
  {
    id: 'local-kraken-bridge',
    name: 'Kraken (Bridge)',
    character: 'pam',
    accent: 'lilac',
    description: 'Operador Local & Assistente Web',
    project: 'KrakenBridge-Web',
    status: 'idle',
    action: 'Conectado à dashboard web',
    progress: 100,
    currentStation: 'desk',
    source: 'kraken',
  },
  {
    id: 'subagent-research',
    name: 'Kraken Researcher',
    character: 'ryan',
    accent: 'mint',
    description: 'Subagente de pesquisa no codebase e internet (read-only)',
    project: 'KrakenBridge-Web',
    status: 'idle',
    action: 'Pronto para pesquisas e documentação',
    progress: 0,
    currentStation: 'web',
    source: 'kraken',
    subagentType: 'research',
  },
  {
    id: 'subagent-reviewer',
    name: 'Kraken Reviewer',
    character: 'angela',
    accent: 'coral',
    description: 'Auditor de regras, padrões e testes (agent-standards)',
    project: 'KrakenBridge-Web',
    status: 'idle',
    action: 'Pronto para auditoria de código e PRs',
    progress: 0,
    currentStation: 'shelf',
    source: 'kraken',
    subagentType: 'code-reviewer',
  },
  {
    id: 'subagent-image',
    name: 'Kraken Designer',
    character: 'kelly',
    accent: 'lilac',
    description: 'Geração e edição visual de assets e imagens',
    project: 'KrakenBridge-Web',
    status: 'idle',
    action: 'Pronto para criação e mockups visuais',
    progress: 0,
    currentStation: 'desk',
    source: 'kraken',
    subagentType: 'image-generator',
  },
  {
    id: 'subagent-swarm',
    name: 'Kraken Swarm Worker',
    character: 'oscar',
    accent: 'peach',
    description: 'Trabalhador paralelo de tarefas de enxame (Swarm Workers / Background tasks -> oscar, kevin ou andy)',
    project: 'KrakenBridge-Web',
    status: 'idle',
    action: 'Pronto para tarefas paralelas e background',
    progress: 0,
    currentStation: 'terminal',
    source: 'kraken',
    subagentType: 'swarm-worker',
  },
];

const resolveKrakenBridgePatch = (
  localActiveTool?: string | null,
  chatState?: LocalKrakenChatState | null
): Partial<Agent> => {
  if (localActiveTool) {
    let station: StationKind = 'terminal';
    let toolKind: ToolKind = 'Bash';

    if (localActiveTool.includes('file') || localActiveTool.includes('edit')) {
      station = 'shelf';
      toolKind = 'Write';
    } else if (localActiveTool.includes('mcp')) {
      station = 'mcp';
      toolKind = 'MCP';
    } else if (localActiveTool.includes('search') || localActiveTool.includes('web')) {
      station = 'web';
      toolKind = 'WebSearch';
    }

    return {
      status: 'working',
      action: `Executando: ${localActiveTool}`,
      currentStation: station,
      carrying: toolKind,
    };
  }

  const hasActiveChat = Boolean(chatState?.isLoading || chatState?.isRunning);
  if (hasActiveChat) {
    const isThinking = Boolean(chatState?.isThinking);
    const chatTitle =
      chatState?.activeChatTitle ||
      (chatState?.runningChatTitles && chatState.runningChatTitles[0]) ||
      'conversa ativa';

    const actionText = isThinking
      ? `Raciocinando no chat: ${chatTitle}`
      : `Respondendo no chat: ${chatTitle}`;

    return {
      status: isThinking ? 'thinking' : 'working',
      action: actionText,
      recentAssistantText: actionText,
      currentStation: 'terminal',
      carrying: 'Write',
      progress: isThinking ? 30 : 60,
    };
  }

  return {
    status: 'idle',
    action: 'Aguardando instruções no chat',
    currentStation: 'desk',
    carrying: undefined,
  };
};

export const useStore = create<OfficeState>((set, get) => ({
  officeTheme: 'office',
  fullscreenAgentId: null,
  ideOpen: false,
  selectedId: null,
  agents: DEFAULT_AGENTS,
  filterSource: 'all',
  localChatState: null,

  setFilterSource: (source) => set({ filterSource: source }),

  setLocalChatState: (chatState) => set({ localChatState: chatState }),

  select: (id) => set({ selectedId: id }),

  setAgents: (agents) => set({ agents }),

  updateAgent: (id, patch) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),

  requestCommandCenterTab: () => {
    // Intencional no-op: no Electron original abria a aba de triggers/tarefas no Command Center
  },

  syncLocalKraken: (activeTool, subagents, localChatState) => {
    get().syncKrakenSubagents(subagents, activeTool, localChatState);
  },

  syncKrakenSubagents: (subagents, localActiveTool, localChatState) => {
    const effectiveChatState = localChatState !== undefined ? localChatState : get().localChatState;
    if (localChatState !== undefined) {
      set({ localChatState });
    }

    const agentsMap: Record<string, Partial<Agent>> = {};

    // Atualiza Kraken Bridge local (Pam) considerando ferramentas e chats ativos
    agentsMap['local-kraken-bridge'] = resolveKrakenBridgePatch(localActiveTool, effectiveChatState);

    // Sincroniza subagentes locais se fornecidos
    if (subagents && Array.isArray(subagents)) {
      subagents.forEach((sa) => {
        const existing = get().agents.find((a) => a.id === sa.id || a.subagentType === sa.type);
        const targetId = existing?.id || sa.id;

        let station: StationKind = 'desk';
        let toolKind: ToolKind = 'Read';
        if (sa.type === 'research' || sa.activeTool?.includes('search') || sa.activeTool?.includes('web')) {
          station = 'web';
          toolKind = 'WebSearch';
        } else if (sa.type === 'code-reviewer' || sa.activeTool?.includes('lint') || sa.activeTool?.includes('test')) {
          station = 'shelf';
          toolKind = 'Grep';
        } else if (
          sa.type === 'swarm-worker' ||
          sa.id.includes('swarm') ||
          sa.activeTool?.includes('bash') ||
          sa.activeTool?.includes('command')
        ) {
          station = 'terminal';
          toolKind = 'Bash';
        }

        const isWorking = sa.status === 'working' || sa.status === 'thinking';

        // Balões de pensamento refletem a tarefa ativa do subagente
        const activeThought = sa.action || sa.currentTask || (isWorking ? 'Executando subagente...' : 'Pronto');

        agentsMap[targetId] = {
          status: mapSubagentStatus(sa.status, isWorking),
          action: activeThought,
          recentAssistantText: activeThought,
          taskTitle: sa.currentTask,
          currentStation: isWorking ? station : 'desk',
          carrying: isWorking ? toolKind : undefined,
          progress: sa.progress ?? (isWorking ? 50 : 0),
        };
      });
    }

    const currentAgents = get().agents;
    const updated = currentAgents.map((agent) => {
      const patch = agentsMap[agent.id];
      return patch ? { ...agent, ...patch } : agent;
    });

    set({ agents: updated });
  },

  syncWithPaperclip: (snapshot, localActiveTool, localSubagents, localChatState) => {
    if (!snapshot) return;

    const effectiveChatState = localChatState !== undefined ? localChatState : get().localChatState;
    if (localChatState !== undefined) {
      set({ localChatState });
    }

    const agentsMap: Record<string, Partial<Agent>> = {};

    // Sincroniza agentes do Paperclip
    if (snapshot.agents && Array.isArray(snapshot.agents)) {
      snapshot.agents.forEach((pa: PaperclipAgent) => {
        let status: StatusKind = 'idle';
        if (pa.status === 'running' || pa.status === 'working') {
          status = 'working';
        } else if (pa.status === 'thinking' || pa.status === 'starting') {
          status = 'thinking';
        } else if (pa.status === 'error' || pa.status === 'blocked') {
          status = 'blocked';
        }

        // Procura se o agente possui uma issue ativa atribuída
        let activeIssue: PaperclipIssue | undefined;
        if (snapshot.issues && Array.isArray(snapshot.issues)) {
          activeIssue = snapshot.issues.find(
            (issue: PaperclipIssue) =>
              issue.assigneeAgentId === pa.id &&
              (issue.status === 'in_progress' || issue.status === 'todo')
          );
        }

        agentsMap[pa.id] = {
          status,
          action: activeIssue
            ? `Trabalhando em: ${activeIssue.title}`
            : pa.title || 'Aguardando novas atribuições',
          taskTitle: activeIssue?.title,
          taskId: activeIssue?.id,
          carrying: activeIssue ? 'Write' : undefined,
          currentStation: activeIssue ? 'terminal' : 'desk',
        };
      });
    }

    // Atualiza Kraken Bridge local (Pam) considerando ferramentas e chats ativos
    agentsMap['local-kraken-bridge'] = resolveKrakenBridgePatch(localActiveTool, effectiveChatState);

    // Sincroniza subagentes locais se fornecidos
    if (localSubagents && Array.isArray(localSubagents)) {
      localSubagents.forEach((sa) => {
        const existing = get().agents.find((a) => a.id === sa.id || a.subagentType === sa.type);
        const targetId = existing?.id || sa.id;

        const isWorking = sa.status === 'working' || sa.status === 'thinking';
        agentsMap[targetId] = {
          status: mapSubagentStatus(sa.status, isWorking),
          action: sa.action || sa.currentTask || (isWorking ? 'Executando subagente...' : 'Pronto'),
          taskTitle: sa.currentTask,
          progress: sa.progress ?? (isWorking ? 50 : 0),
        };
      });
    }

    const currentAgents = get().agents;
    const updated = currentAgents.map((agent) => {
      const patch = agentsMap[agent.id];
      return patch ? { ...agent, ...patch } : agent;
    });

    set({ agents: updated });
  },
}));
