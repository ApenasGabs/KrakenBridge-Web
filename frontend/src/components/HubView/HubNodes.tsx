import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { 
  FolderGit2, 
  Bot, 
  Plus, 
  CheckCircle2, 
  ArrowRight,
  Server,
  Layers
} from 'lucide-react';
import type { ConversationSession, ProjectWorkspace } from '../../types';

// Nó Raiz (Workspace Central)
export interface RootNodeData {
  workspaceDir: string;
  totalProjects: number;
  totalAgents: number;
  runningAgents: number;
}

export const RootNode = memo(({ data }: { data: RootNodeData }) => {
  return (
    <div className="px-4 py-3 rounded-2xl bg-base-100/95 border-2 border-primary/60 shadow-xl backdrop-blur-md min-w-[240px] text-left transition-all hover:border-primary hover:shadow-2xl">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shadow-inner">
          <Server className="w-5 h-5" />
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-primary">
            Ambiente Central
          </span>
          <h3 className="font-bold text-sm text-base-content leading-tight">
            Kraken Hub
          </h3>
        </div>
      </div>

      <div className="text-[11px] font-mono text-base-content/60 truncate bg-base-200/60 px-2 py-1 rounded-lg mb-2">
        {data.workspaceDir || '/workspace'}
      </div>

      <div className="flex items-center justify-between text-xs pt-1 border-t border-base-200 text-base-content/70">
        <span className="flex items-center gap-1">
          <Layers className="w-3.5 h-3.5 text-base-content/40" />
          {data.totalProjects} projetos
        </span>
        <span className="flex items-center gap-1 font-mono font-medium">
          {data.runningAgents > 0 ? (
            <span className="text-primary font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              {data.runningAgents} ativos
            </span>
          ) : (
            <span className="text-base-content/50">{data.totalAgents} agentes</span>
          )}
        </span>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-primary !border-2 !border-base-100" />
    </div>
  );
});

RootNode.displayName = 'RootNode';

// Nó de Projeto / Subprojeto
export interface ProjectNodeData {
  project: ProjectWorkspace;
  agentCount: number;
  runningCount: number;
  onNewAgent: (subproject: string) => void;
}

export const ProjectNode = memo(({ data }: { data: ProjectNodeData }) => {
  const isRunning = data.runningCount > 0;

  return (
    <div className={`px-4 py-3 rounded-2xl bg-base-100/95 border-2 ${
      isRunning ? 'border-primary/80 shadow-primary/10 shadow-lg' : 'border-base-300'
    } shadow-md backdrop-blur-md min-w-[220px] text-left transition-all hover:border-primary/60 hover:shadow-xl`}>
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-primary/80 !border-2 !border-base-100" />

      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-base-200 text-primary flex items-center justify-center">
            <FolderGit2 className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-base-content truncate max-w-[120px]">
              {data.project.name}
            </h4>
            <span className="text-[10px] text-base-content/50 truncate block max-w-[120px]">
              {data.project.path || 'Raiz'}
            </span>
          </div>
        </div>

        {isRunning && (
          <span className="badge badge-xs badge-primary animate-pulse font-mono">
            {data.runningCount} ativo
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-base-200 text-xs">
        <span className="text-[11px] text-base-content/60 font-mono">
          {data.agentCount} {data.agentCount === 1 ? 'agente' : 'agentes'}
        </span>
        <button
          onClick={() => data.onNewAgent(data.project.name)}
          className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 gap-1 px-1.5 h-6 min-h-6"
          title="Iniciar novo agente neste projeto"
        >
          <Plus className="w-3 h-3" />
          <span className="text-[10px]">Novo</span>
        </button>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-primary/80 !border-2 !border-base-100" />
    </div>
  );
});

ProjectNode.displayName = 'ProjectNode';

// Nó de Agente / Conversa
export interface AgentNodeData {
  conversation: ConversationSession;
  onOpen: (id: string) => void;
}

export const AgentNode = memo(({ data }: { data: AgentNodeData }) => {
  const conv = data.conversation;
  const isRunning = conv.isRunning;

  // Formatação amigável do modelo
  const shortModel = (conv.model || '3.8-flash')
    .replace('gemini-', '')
    .replace('claude-', '')
    .replace('-high', '');

  const dateStr = conv.updatedAt || conv.createdAt;
  const formattedDate = dateStr 
    ? new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div 
      onClick={() => data.onOpen(conv.id)}
      className={`
        group px-3.5 py-2.5 rounded-2xl bg-base-100/95 border-2 text-left cursor-pointer
        transition-all duration-200 min-w-[210px] max-w-[240px]
        ${isRunning 
          ? 'border-primary ring-2 ring-primary/20 shadow-lg shadow-primary/10 hover:shadow-primary/20 scale-[1.02]' 
          : 'border-base-300 hover:border-primary/50 hover:shadow-md'
        }
      `}
    >
      <Handle type="target" position={Position.Top} className={`!w-2 !h-2 ${isRunning ? '!bg-primary' : '!bg-base-content/40'} !border-2 !border-base-100`} />

      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
            isRunning ? 'bg-primary text-primary-content animate-pulse' : 'bg-base-200 text-base-content/70'
          }`}>
            <Bot className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-xs text-base-content truncate">
            {conv.title || 'Conversa'}
          </span>
        </div>

        {isRunning ? (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-success/60 shrink-0" />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px] text-base-content/60 font-mono mt-2 pt-1.5 border-t border-base-200/80">
        <span className="bg-base-200/80 px-1.5 py-0.5 rounded text-sky-400 font-medium truncate max-w-[90px]">
          {shortModel}
        </span>
        <div className="flex items-center gap-1 group-hover:text-primary transition-colors">
          <span>{formattedDate}</span>
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </div>
  );
});

AgentNode.displayName = 'AgentNode';
