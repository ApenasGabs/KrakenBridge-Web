import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { 
  ReactFlow, 
  ReactFlowProvider,
  useReactFlow,
  Background, 
  Controls, 
  MiniMap, 
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge
} from '@xyflow/react';
import { RootNode, ProjectNode, AgentNode } from '../HubView/HubNodes';
import { StatsDashboard } from './StatsDashboard';
import type { ConversationSession, ProjectWorkspace } from '../../types';
import { calculateRelevance } from '../../utils/searchUtils';
import { 
  Network, 
  Plus, 
  Search, 
  Filter,
  Columns2,
  Activity,
  BarChart2
} from 'lucide-react';

interface StatusViewProps {
  conversations: ConversationSession[];
  projects: ProjectWorkspace[];
  workspaceDir: string;
  onSelectConversation: (id: string) => void;
  onNewChatInProject: (subproject: string) => void;
  onNewChat: () => void;
}

const nodeTypes = {
  rootNode: RootNode,
  projectNode: ProjectNode,
  agentNode: AgentNode,
};

type ViewLayoutMode = 'split' | 'mesh' | 'stats';

const StatusContent: React.FC<StatusViewProps> = ({
  conversations,
  projects,
  workspaceDir,
  onSelectConversation,
  onNewChatInProject,
  onNewChat,
}) => {
  const { fitView } = useReactFlow();
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyRunning, setOnlyRunning] = useState(false);
  const [layoutMode, setLayoutMode] = useState<ViewLayoutMode>(() => {
    const saved = localStorage.getItem('kraken_status_layout_mode');
    return (saved === 'mesh' || saved === 'stats') ? saved : 'split';
  });

  const handleSetLayoutMode = (mode: ViewLayoutMode) => {
    setLayoutMode(mode);
    localStorage.setItem('kraken_status_layout_mode', mode);
  };

  // Filtragem e ordenação de conversas por relevância
  const filteredConversations = useMemo(() => {
    const list = conversations.filter(c => {
      if (onlyRunning && !c.isRunning) return false;
      if (searchTerm.trim()) {
        const { score } = calculateRelevance(c, searchTerm);
        return score > 0;
      }
      return true;
    });

    if (searchTerm.trim()) {
      return [...list].sort((a, b) => {
        const scoreA = calculateRelevance(a, searchTerm).score;
        const scoreB = calculateRelevance(b, searchTerm).score;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
      });
    }

    return list;
  }, [conversations, onlyRunning, searchTerm]);

  // Estatísticas do Hub
  const runningCount = useMemo(() => {
    return conversations.filter(c => c.isRunning).length;
  }, [conversations]);

  // Lista normalizada de projetos incluindo um "Projeto Geral" se houver conversas sem subproject
  const displayProjects = useMemo(() => {
    const list = [...projects];
    const hasUnassigned = filteredConversations.some(c => !c.subproject);
    if (hasUnassigned && !list.some(p => p.name === 'Geral')) {
      list.unshift({ name: 'Geral', path: workspaceDir, isGit: false });
    }
    return list;
  }, [projects, filteredConversations, workspaceDir]);

  // Montagem dinâmica dos nós e arestas em layout de grade proporcional
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const cols = layoutMode === 'split' ? 2 : 4;
    const colWidth = 270;
    const rowHeight = 350;
    const totalCols = Math.min(cols, Math.max(1, displayProjects.length));
    const gridWidth = totalCols * colWidth;
    const rootX = Math.max(60, (gridWidth / 2) - 120);
    const rootY = 30;

    // 1. Nó Raiz Central
    nodes.push({
      id: 'root',
      type: 'rootNode',
      position: { x: rootX, y: rootY },
      data: {
        workspaceDir,
        totalProjects: displayProjects.length,
        totalAgents: filteredConversations.length,
        runningAgents: runningCount
      }
    });

    // 2. Nós de Projetos e seus Agentes
    displayProjects.forEach((proj, pIdx) => {
      const col = pIdx % cols;
      const row = Math.floor(pIdx / cols);

      const projId = `project-${proj.name}`;
      const projX = col * colWidth;
      const projY = 180 + row * rowHeight;

      const projConversations = filteredConversations.filter(c => {
        if (proj.name === 'Geral') return !c.subproject;
        return c.subproject === proj.name;
      });

      const projRunning = projConversations.filter(c => c.isRunning).length;

      nodes.push({
        id: projId,
        type: 'projectNode',
        position: { x: projX, y: projY },
        data: {
          project: proj,
          agentCount: projConversations.length,
          runningCount: projRunning,
          onNewAgent: onNewChatInProject
        }
      });

      edges.push({
        id: `edge-root-${projId}`,
        source: 'root',
        target: projId,
        type: 'smoothstep',
        animated: projRunning > 0,
        style: {
          stroke: projRunning > 0 ? 'var(--color-primary, #6419e6)' : 'var(--color-base-content, #888)',
          strokeWidth: projRunning > 0 ? 2.5 : 1.2,
          opacity: projRunning > 0 ? 1 : 0.35
        }
      });

      // 3. Nós de Agentes (exibe até 3 mais recentes por projeto)
      const visibleConvs = projConversations.slice(0, 3);
      visibleConvs.forEach((conv, cIdx) => {
        const agentId = `agent-${conv.id}`;
        const agentX = projX;
        const agentY = projY + 130 + cIdx * 75;

        nodes.push({
          id: agentId,
          type: 'agentNode',
          position: { x: agentX, y: agentY },
          data: {
            conversation: conv,
            onOpen: onSelectConversation
          }
        });

        edges.push({
          id: `edge-${projId}-${agentId}`,
          source: projId,
          target: agentId,
          type: 'smoothstep',
          animated: !!conv.isRunning,
          style: {
            stroke: conv.isRunning ? 'var(--color-primary, #6419e6)' : 'var(--color-base-content, #888)',
            strokeWidth: conv.isRunning ? 2.5 : 1.2,
            opacity: conv.isRunning ? 1 : 0.35
          }
        });
      });
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [displayProjects, filteredConversations, workspaceDir, runningCount, layoutMode, onNewChatInProject, onSelectConversation]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  useEffect(() => {
    if (nodes.length > 1 && layoutMode !== 'stats') {
      const timer = setTimeout(() => {
        fitView({ padding: 0.15, duration: 400 });
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [nodes.length, fitView, layoutMode]);

  const getNodeColor = useCallback((node: Node) => {
    if (node.type === 'rootNode') return '#6419e6';
    if (node.type === 'projectNode') return '#00b5ff';
    if (node.type === 'agentNode') {
      const data = node.data as { conversation?: ConversationSession };
      return data?.conversation?.isRunning ? '#6419e6' : '#9ca3af';
    }
    return '#ccc';
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-base-200/40 relative">
      
      {/* Barra de Sub-Navegação e Layout Split do Status */}
      <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-base-100/90 border-b border-base-300 backdrop-blur-md z-10 flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-xs">
        
        {/* Esquerda: Identificação e Alternador de Modo Dividido */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs sm:text-sm font-bold text-base-content leading-tight flex items-center gap-1.5">
                Status Operacional
              </span>
            </div>
          </div>

          {/* Botões de Seleção de Divisão de Tela */}
          <div className="inline-flex items-center bg-base-200/80 rounded-lg p-0.5 border border-base-300/60 ml-1 sm:ml-2">
            <button
              onClick={() => handleSetLayoutMode('split')}
              className={`px-2 py-1 text-xs rounded-md flex items-center gap-1 font-medium transition-all ${
                layoutMode === 'split'
                  ? 'bg-primary text-primary-content shadow-xs'
                  : 'text-base-content/70 hover:text-base-content'
              }`}
              title="Dividir tela: Malha à esquerda e Métricas à direita"
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Dividido</span>
            </button>

            <button
              onClick={() => handleSetLayoutMode('mesh')}
              className={`px-2 py-1 text-xs rounded-md flex items-center gap-1 font-medium transition-all ${
                layoutMode === 'mesh'
                  ? 'bg-primary text-primary-content shadow-xs'
                  : 'text-base-content/70 hover:text-base-content'
              }`}
              title="Expandir malha de topologia para 100%"
            >
              <Network className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Só Malha</span>
            </button>

            <button
              onClick={() => handleSetLayoutMode('stats')}
              className={`px-2 py-1 text-xs rounded-md flex items-center gap-1 font-medium transition-all ${
                layoutMode === 'stats'
                  ? 'bg-primary text-primary-content shadow-xs'
                  : 'text-base-content/70 hover:text-base-content'
              }`}
              title="Expandir métricas e estatísticas para 100%"
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Só Métricas</span>
            </button>
          </div>
        </div>

        {/* Direita: Busca na Malha, Filtros e Novo Chat */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {layoutMode !== 'stats' && (
            <>
              <div className="relative w-24 sm:w-44">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-base-content/40" />
                <input
                  type="text"
                  placeholder="Filtrar malha..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input input-xs input-bordered w-full pl-7 bg-base-200/50 rounded-lg text-xs"
                />
              </div>

              <button
                onClick={() => setOnlyRunning(!onlyRunning)}
                className={`btn btn-xs rounded-lg gap-1 transition-all ${
                  onlyRunning 
                    ? 'btn-primary shadow-xs' 
                    : 'btn-ghost border border-base-300 text-base-content/70 hover:bg-base-200'
                }`}
                title="Mostrar apenas agentes rodando no momento"
              >
                <Filter className="w-3 h-3" />
                <span className="text-[11px] hidden xs:inline">Ativos</span>
              </button>
            </>
          )}

          <button
            onClick={onNewChat}
            className="btn btn-xs btn-primary gap-1 rounded-lg shadow-xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-[11px]">Novo Agente</span>
          </button>
        </div>
      </div>

      {/* ÁREA PRINCIPAL DIVIDIDA */}
      <div className="flex-1 w-full h-full overflow-hidden flex flex-col lg:flex-row relative">
        
        {/* Painel da Malha (ReactFlow) */}
        {layoutMode !== 'stats' && (
          <div 
            className={`h-full relative transition-all duration-300 border-b lg:border-b-0 lg:border-r border-base-300/80 ${
              layoutMode === 'split' ? 'w-full lg:w-[48%] xl:w-[45%] h-1/2 lg:h-full' : 'w-full h-full'
            }`}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.1}
              maxZoom={1.8}
              proOptions={{ hideAttribution: true }}
              className="bg-base-200/30"
            >
              <Background 
                variant={BackgroundVariant.Dots} 
                gap={20} 
                size={1.2} 
                color="currentColor" 
                className="text-base-content/10"
              />
              <Controls 
                position="bottom-right" 
                className="!bg-base-100 !border !border-base-300 !rounded-xl !shadow-lg !overflow-hidden"
              />
              <MiniMap 
                nodeColor={getNodeColor}
                position="bottom-left"
                zoomable
                pannable
                className="!hidden sm:!block !bg-base-100/90 !border !border-base-300 !rounded-xl !shadow-lg !overflow-hidden"
                maskColor="rgba(0, 0, 0, 0.3)"
              />
            </ReactFlow>

            <div className="absolute top-2 left-2 pointer-events-none z-10 bg-base-100/80 backdrop-blur-xs px-2 py-1 rounded-md border border-base-300/60 text-[10px] text-base-content/60 font-mono">
              Topologia de Workspaces & Agentes
            </div>
          </div>
        )}

        {/* Painel de Métricas e Telemetria (Stats Dashboard) */}
        {layoutMode !== 'mesh' && (
          <div 
            className={`h-full overflow-hidden transition-all duration-300 flex flex-col ${
              layoutMode === 'split' ? 'w-full lg:w-[52%] xl:w-[55%] h-1/2 lg:h-full' : 'w-full h-full'
            }`}
          >
            <StatsDashboard 
              runningCount={runningCount}
              totalConversations={conversations.length}
              totalWorkspaces={projects.length}
            />
          </div>
        )}

      </div>
    </div>
  );
};

export const StatusView: React.FC<StatusViewProps> = (props) => {
  return (
    <ReactFlowProvider>
      <StatusContent {...props} />
    </ReactFlowProvider>
  );
};
