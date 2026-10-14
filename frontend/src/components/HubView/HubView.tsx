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
import { RootNode, ProjectNode, AgentNode } from './HubNodes';
import type { ConversationSession, ProjectWorkspace } from '../../types';
import { 
  Network, 
  Plus, 
  Search, 
  Filter
} from 'lucide-react';

interface HubViewProps {
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

const HubFlowContent: React.FC<HubViewProps> = ({
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

  // Filtragem de conversas
  const filteredConversations = useMemo(() => {
    return conversations.filter(c => {
      if (onlyRunning && !c.isRunning) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return (
          c.title.toLowerCase().includes(term) ||
          (c.subproject && c.subproject.toLowerCase().includes(term)) ||
          (c.tags && c.tags.some(t => t.toLowerCase().includes(term))) ||
          (c.model && c.model.toLowerCase().includes(term))
        );
      }
      return true;
    });
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

    const cols = 4;
    const colWidth = 290;
    const rowHeight = 360;
    const totalCols = Math.min(cols, Math.max(1, displayProjects.length));
    const gridWidth = totalCols * colWidth;
    const rootX = Math.max(80, (gridWidth / 2) - 120);
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

    // 2. Nós de Projetos e seus Agentes em Grade Responsiva
    displayProjects.forEach((proj, pIdx) => {
      const col = pIdx % cols;
      const row = Math.floor(pIdx / cols);

      const projId = `project-${proj.name}`;
      const projX = col * colWidth;
      const projY = 180 + row * rowHeight;

      // Conversas atribuídas a este projeto
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

      // Aresta do Root para o Projeto
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

      // 3. Nós de Agentes (exibe até os 3 mais recentes por projeto)
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

        // Aresta do Projeto para o Agente
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
  }, [displayProjects, filteredConversations, workspaceDir, runningCount, onNewChatInProject, onSelectConversation]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sincroniza o estado do React Flow sempre que os dados assíncronos do backend forem carregados
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Enquadra a malha automaticamente na tela com transição suave
  useEffect(() => {
    if (nodes.length > 1) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.15, duration: 400 });
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [nodes.length, fitView]);

  // MiniMap node color logic
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
      {/* Barra Superior de Controles e Estatísticas do Hub */}
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-base-100/90 border-b border-base-300 backdrop-blur-md z-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 shrink-0 shadow-sm">
        
        {/* Esquerda: Identificação e Métricas Rápidas */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Network className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-base-content leading-tight flex items-center gap-2">
              Topologia de Agentes
              {runningCount > 0 && (
                <span className="badge badge-xs badge-primary animate-pulse font-mono">
                  {runningCount} rodando
                </span>
              )}
            </h2>
            <p className="text-[10px] sm:text-[11px] text-base-content/60">
              {projects.length} workspaces • {conversations.length} execuções
            </p>
          </div>
        </div>

        {/* Direita: Busca, Filtros e Botão de Ação */}
        <div className="flex items-center gap-2">
          {/* Campo de Busca Rápida */}
          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
            <input
              type="text"
              placeholder="Filtrar malha..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input input-xs input-bordered w-full pl-8 bg-base-200/50 rounded-lg text-xs"
            />
          </div>

          {/* Toggle Apenas Ativos */}
          <button
            onClick={() => setOnlyRunning(!onlyRunning)}
            className={`btn btn-xs rounded-lg gap-1.5 transition-all ${
              onlyRunning 
                ? 'btn-primary shadow-sm' 
                : 'btn-ghost border border-base-300 text-base-content/70 hover:bg-base-200'
            }`}
            title="Mostrar apenas agentes rodando no momento"
          >
            <Filter className="w-3 h-3" />
            <span className="text-[11px]">Ativos</span>
          </button>

          {/* Botão Novo Chat Geral */}
          <button
            onClick={onNewChat}
            className="btn btn-xs btn-primary gap-1 rounded-lg shadow-sm shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-[11px] hidden xs:inline">Novo</span>
          </button>
        </div>
      </div>

      {/* Canvas Interativo do React Flow */}
      <div className="flex-1 w-full h-full relative">
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
      </div>
    </div>
  );
};

export const HubView: React.FC<HubViewProps> = (props) => {
  return (
    <ReactFlowProvider>
      <HubFlowContent {...props} />
    </ReactFlowProvider>
  );
};
