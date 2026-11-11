import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { OfficeFloor } from './office/OfficeFloor';
import { useStore, type Agent } from './store/officeStore';
import { api } from '../../services/api';
import type { PaperclipStateSnapshot, LocalSubagent } from '../../types';
import {
  Building2,
  Users,
  RefreshCw,
  Radio,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  Clock,
  Sparkles,
  Terminal,
  Coffee,
  AlertTriangle,
} from 'lucide-react';

interface OfficeViewProps {
  localActiveTool?: string | null;
  localSubagents?: LocalSubagent[] | null;
  onFocusChat?: () => void;
}

export const OfficeView: React.FC<OfficeViewProps> = ({ localActiveTool, localSubagents, onFocusChat }) => {
  const agents = useStore((s) => s.agents);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const filterSource = useStore((s) => s.filterSource);
  const setFilterSource = useStore((s) => s.setFilterSource);
  const syncWithPaperclip = useStore((s) => s.syncWithPaperclip);
  const syncKrakenSubagents = useStore((s) => s.syncKrakenSubagents);
  const syncLocalKraken = useStore((s) => s.syncLocalKraken);

  const [isLive, setIsLive] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [selectedAgentDetailsOpen, setSelectedAgentDetailsOpen] = useState(false);

  // Carrega status inicial do Paperclip e configura SSE
  const refreshStatus = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const snapshot = await api.getPaperclipStatus();
      syncWithPaperclip(snapshot, localActiveTool, localSubagents);
      setLastSyncTime(new Date());
    } catch (err) {
      console.warn('[OfficeView] Falha ao sincronizar com Paperclip:', err);
      syncLocalKraken(localActiveTool, localSubagents);
    } finally {
      setIsRefreshing(false);
    }
  }, [syncWithPaperclip, syncLocalKraken, localActiveTool, localSubagents]);

  useEffect(() => {
    void refreshStatus();

    let es: EventSource | null = null;
    try {
      es = api.createPaperclipEventSource(
        (snapshot: PaperclipStateSnapshot) => {
          setIsLive(true);
          syncWithPaperclip(snapshot, localActiveTool, localSubagents);
          setLastSyncTime(new Date());
        },
        () => {
          // Atualiza dados no recebimento de eventos da timeline
          void refreshStatus();
        },
        () => {
          setIsLive(false);
        }
      );
    } catch {
      setIsLive(false);
    }

    // Polling de fallback a cada 15s
    const pollInterval = setInterval(() => {
      void refreshStatus();
    }, 15000);

    return () => {
      clearInterval(pollInterval);
      if (es) {
        es.close();
      }
    };
  }, [refreshStatus, syncWithPaperclip, localActiveTool, localSubagents]);

  // Sincroniza subagentes do Kraken reativamente quando mudarem
  useEffect(() => {
    syncKrakenSubagents(localSubagents, localActiveTool);
  }, [localActiveTool, localSubagents, syncKrakenSubagents]);

  // Se o usuário selecionou um agente, abre os detalhes
  useEffect(() => {
    if (selectedId) {
      setSelectedAgentDetailsOpen(true);
    }
  }, [selectedId]);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedId) || null,
    [agents, selectedId]
  );

  const stats = useMemo(() => {
    const total = agents.length;
    const working = agents.filter((a) => a.status === 'working' || a.status === 'thinking').length;
    const idle = agents.filter((a) => a.status === 'idle').length;
    const blocked = agents.filter((a) => a.status === 'blocked').length;
    const paperclipCount = agents.filter((a) => a.source === 'paperclip').length;
    const krakenCount = agents.filter((a) => a.source === 'kraken').length;
    return { total, working, idle, blocked, paperclipCount, krakenCount };
  }, [agents]);

  const displayedAgents = useMemo(
    () => agents.filter((a) => (filterSource === 'all' ? true : a.source === filterSource)),
    [agents, filterSource]
  );

  const getStatusBadge = (status: Agent['status']) => {
    switch (status) {
      case 'working':
        return <span className="badge badge-warning badge-sm gap-1 animate-pulse"><Terminal className="w-3 h-3" /> Trabalhando</span>;
      case 'thinking':
        return <span className="badge badge-info badge-sm gap-1"><Sparkles className="w-3 h-3" /> Pensando</span>;
      case 'blocked':
        return <span className="badge badge-error badge-sm gap-1"><AlertTriangle className="w-3 h-3" /> Bloqueado</span>;
      case 'success':
        return <span className="badge badge-success badge-sm gap-1"><CheckCircle2 className="w-3 h-3" /> Concluído</span>;
      default:
        return <span className="badge badge-ghost badge-sm gap-1 text-base-content/60"><Coffee className="w-3 h-3" /> Ocioso / Café</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-base-200 overflow-hidden" data-testid="office-view">
      {/* Barra de Controle Superior */}
      <div className="bg-base-100 border-b border-base-300 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shadow-inner">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-base-content leading-none">
                Office Floor
              </h2>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-base-200 text-base-content/70 font-mono font-medium border border-base-300">
                2D PixiJS
              </span>
              <div
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  isLive ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                }`}
              >
                <Radio className={`w-3 h-3 ${isLive ? 'animate-pulse' : ''}`} />
                <span>{isLive ? 'Paperclip Live (SSE)' : 'Polling (15s)'}</span>
              </div>
            </div>
            <p className="text-[11px] text-base-content/60 mt-0.5">
              Escritório unificado dos agentes do Paperclip AI e subagentes locais do Kraken
            </p>
          </div>
        </div>

        {/* Estatísticas Rápidas & Atualizar */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-base-content/70 bg-base-200/80 px-2.5 py-1 rounded-lg border border-base-300">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-primary" />
              <strong>{stats.total}</strong> agentes
            </span>
            <span className="opacity-40">•</span>
            <span className="text-success font-medium">
              {stats.working} ativos
            </span>
            <span className="opacity-40">•</span>
            <span className="text-secondary font-medium">
              {stats.krakenCount} Kraken
            </span>
            {lastSyncTime && (
              <>
                <span className="opacity-40">•</span>
                <span className="text-base-content/50 font-mono text-[10px]">
                  {lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </>
            )}
          </div>

          <button
            onClick={() => void refreshStatus()}
            disabled={isRefreshing}
            className="btn btn-ghost btn-sm btn-square"
            title="Atualizar status do Paperclip e Kraken"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Área Central: Canvas do Escritório + Roster Lateral */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Canvas do Pixi.js (Cena 2D) */}
        <div className="flex-1 relative h-full bg-[#1e1726] overflow-hidden flex items-center justify-center">
          <OfficeFloor />

          {/* Dica flutuante de navegação */}
          <div className="absolute bottom-3 left-3 bg-base-100/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-base-300/60 shadow-md text-[11px] text-base-content/70 pointer-events-none flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
            <span>Arraste para mover • Scroll para zoom • Clique em um avatar para inspecionar</span>
          </div>
        </div>

        {/* Barra Lateral / Roster de Agentes */}
        <div className="w-80 border-l border-base-300 bg-base-100 flex flex-col shrink-0 overflow-hidden hidden md:flex">
          <div className="p-3 border-b border-base-300/80 flex items-center justify-between bg-base-200/50">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-base-content/80">
                Elenco do Escritório
              </span>
            </div>
            <span className="badge badge-neutral badge-xs">{displayedAgents.length}</span>
          </div>

          {/* Filtro de Origem: Todos vs Paperclip vs Kraken */}
          <div className="px-2 pt-2 pb-1.5 border-b border-base-300/60 bg-base-100 flex items-center gap-1">
            <button
              onClick={() => setFilterSource('all')}
              className={`btn btn-xs flex-1 text-[11px] font-medium transition-all ${
                filterSource === 'all'
                  ? 'btn-primary shadow-xs'
                  : 'btn-ghost text-base-content/70 hover:text-base-content'
              }`}
            >
              Todos ({agents.length})
            </button>
            <button
              onClick={() => setFilterSource('paperclip')}
              className={`btn btn-xs flex-1 text-[11px] font-medium transition-all ${
                filterSource === 'paperclip'
                  ? 'btn-primary shadow-xs'
                  : 'btn-ghost text-base-content/70 hover:text-base-content'
              }`}
            >
              Paperclip ({stats.paperclipCount})
            </button>
            <button
              onClick={() => setFilterSource('kraken')}
              className={`btn btn-xs flex-1 text-[11px] font-medium transition-all ${
                filterSource === 'kraken'
                  ? 'btn-primary shadow-xs'
                  : 'btn-ghost text-base-content/70 hover:text-base-content'
              }`}
            >
              Kraken ({stats.krakenCount})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {displayedAgents.map((agent) => {
              const isSelected = selectedId === agent.id;
              return (
                <div
                  key={agent.id}
                  onClick={() => select(agent.id)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                    isSelected
                      ? 'bg-primary/5 border-primary shadow-sm'
                      : 'bg-base-100 border-base-300/60 hover:border-primary/40 hover:bg-base-200/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-base-200 border border-base-300 flex items-center justify-center font-bold text-xs capitalize text-primary shadow-xs shrink-0">
                        {agent.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-base-content leading-none truncate">
                            {agent.name}
                          </span>
                          {agent.isGod && (
                            <span className="badge badge-xs badge-primary font-semibold">
                              CEO
                            </span>
                          )}
                          <span
                            className={`badge badge-xs font-semibold ${
                              agent.source === 'kraken'
                                ? 'badge-secondary text-[10px]'
                                : 'badge-primary badge-outline text-[10px]'
                            }`}
                          >
                            {agent.source === 'kraken' ? 'Kraken' : 'Paperclip'}
                          </span>
                        </div>
                        <span className="text-[10px] text-base-content/50 truncate block max-w-[140px]">
                          {agent.project} {agent.subagentType ? `• ${agent.subagentType}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 ml-1">
                      {getStatusBadge(agent.status)}
                    </div>
                  </div>

                  <p className="text-[11px] text-base-content/70 line-clamp-2 bg-base-200/60 p-1.5 rounded-md leading-relaxed border border-base-300/30">
                    {agent.action}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-base-content/50 pt-0.5">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 opacity-60" />
                      {agent.currentStation ? `Estação: ${agent.currentStation}` : 'Mesa'}
                    </span>
                    <span className="text-primary font-medium hover:underline flex items-center gap-0.5">
                      Focar <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Drawer / Modal Inferior de Detalhes do Agente Selecionado */}
      {selectedAgentDetailsOpen && selectedAgent && (
        <div className="border-t border-base-300 bg-base-100 px-4 py-3 shrink-0 flex flex-wrap items-center justify-between gap-4 shadow-lg z-20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center font-bold text-sm shadow-inner shrink-0">
              {selectedAgent.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-base-content truncate">
                  {selectedAgent.name}
                </h3>
                <span
                  className={`badge badge-xs font-semibold ${
                    selectedAgent.source === 'kraken' ? 'badge-secondary' : 'badge-primary'
                  }`}
                >
                  {selectedAgent.source === 'kraken' ? 'Kraken Local' : 'Paperclip AI'}
                </span>
                {selectedAgent.isGod && (
                  <span className="badge badge-primary badge-xs">Chefe / God Agent</span>
                )}
                {selectedAgent.subagentType && (
                  <span className="badge badge-neutral badge-xs font-mono">{selectedAgent.subagentType}</span>
                )}
                {getStatusBadge(selectedAgent.status)}
              </div>
              <p className="text-xs text-base-content/70 truncate mt-0.5">
                {selectedAgent.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {selectedAgent.taskId && (
              <a
                href={`http://192.168.31.5:3101/APE/issues/${selectedAgent.taskId}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm btn-outline gap-1.5 text-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Ver no Paperclip</span>
              </a>
            )}
            {selectedAgent.source === 'kraken' && onFocusChat && (
              <button
                onClick={onFocusChat}
                className="btn btn-sm btn-secondary btn-outline text-xs gap-1.5"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Abrir no Chat</span>
              </button>
            )}
            <button
              onClick={() => setSelectedAgentDetailsOpen(false)}
              className="btn btn-sm btn-ghost text-xs"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};