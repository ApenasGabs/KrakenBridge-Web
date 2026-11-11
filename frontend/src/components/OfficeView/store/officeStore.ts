import { create } from 'zustand';
import type { OfficeCharacterName } from '../office/cast';
import type { AccentColorName } from '../design/tokens';
import type { ThemeId } from '../office/themeRegistry';
import type { PaperclipStateSnapshot, PaperclipAgent, PaperclipIssue } from '../../../types';

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
}

export interface OfficeState {
  officeTheme: ThemeId;
  fullscreenAgentId: string | null;
  ideOpen: boolean;
  selectedId: string | null;
  agents: Agent[];
  select: (id: string | null) => void;
  setAgents: (agents: Agent[]) => void;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  requestCommandCenterTab?: (tab: string) => void;
  syncWithPaperclip: (snapshot: PaperclipStateSnapshot | null, localActiveTool?: string | null) => void;
}

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
  },
];

export const useStore = create<OfficeState>((set, get) => ({
  officeTheme: 'office',
  fullscreenAgentId: null,
  ideOpen: false,
  selectedId: null,
  agents: DEFAULT_AGENTS,

  select: (id) => set({ selectedId: id }),

  setAgents: (agents) => set({ agents }),

  updateAgent: (id, patch) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),

  requestCommandCenterTab: (tab: string) => {
    // eslint-disable-next-line no-console
    console.log(`[Office] Request tab: ${tab}`);
  },

  syncWithPaperclip: (snapshot, localActiveTool) => {
    if (!snapshot) return;

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

    // Atualiza Kraken Bridge local se houver tool em execução
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

      agentsMap['local-kraken-bridge'] = {
        status: 'working',
        action: `Executando: ${localActiveTool}`,
        currentStation: station,
        carrying: toolKind,
      };
    } else {
      agentsMap['local-kraken-bridge'] = {
        status: 'idle',
        action: 'Aguardando instruções no chat',
        currentStation: 'desk',
        carrying: undefined,
      };
    }

    const currentAgents = get().agents;
    const updated = currentAgents.map((agent) => {
      const patch = agentsMap[agent.id];
      return patch ? { ...agent, ...patch } : agent;
    });

    set({ agents: updated });
  },
}));
