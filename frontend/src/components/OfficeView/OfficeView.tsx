import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { OfficeFloor } from './office/OfficeFloor';
import { useStore, type Agent } from './store/officeStore';
import { api } from '../../services/api';
import type { PaperclipStateSnapshot } from '../../types';
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
}

export const OfficeView: React.FC<OfficeViewProps> = ({ localActiveTool }) => {
  const agents = useStore((s) => s.agents);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const syncWithPaperclip = useStore((s) => s.syncWithPaperclip);

  const [isLive, setIsLive] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [selectedAgentDetailsOpen, setSelectedAgentDetailsOpen] = useState(false);

  // Carrega status inicial do Paperclip e configura SSE
  const refreshStatus = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const snapshot = await api.getPaperclipStatus();
      syncWithPaperclip(snapshot, localActiveTool);
      setLastSyncTime(new Date());
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[OfficeView] Falha ao sincronizar com Paperclip:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [syncWithPaperclip, localActiveTool]);

  useEffect(() => {
    void refreshStatus();

    let es: EventSource | null = null;
    try {
      es = api.createPaperclipEventSource(
        (snapshot: PaperclipStateSnapshot) => {
          setIsLive(true);
          syncWithPaperclip(snapshot, localActiveTool);
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
  }, [refreshStatus, syncWithPaperclip, localActiveTool]);

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
    return { total, working, idle, blocked };
  }, [agents]);

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
                title={isLive ? 'Conexão SSE com Paperclip ativa' : 'Operando via polling'}
              >
                <Radio className={`w-3 h-3 ${isLive ? 'animate-pulse' : ''}`} />
                <span>{isLive ? 'Paperclip Live' : 'Polling'}</span>
              </div>
            </div>
            <p className="text-[11px] text-base-content/60 flex items-center gap-1 mt-0.5">
              <span>Simulação interativa dos agentes em tempo real</span>
              {lastSyncTime && (
                <span className="text-[10px] opacity-75">
                  • Atualizado às {lastSyncTime.toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Resumo de Agentes & Ações */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 bg-base-200/80 px-2.5 py-1 rounded-lg border border-base-300 text-xs">
            <Users className="w-3.5 h-3.5 text-base-content/60" />
            <span className="font-semibold text-base-content">{stats.total} agentes</span>
            <span className="text-base-content/30">•</span>
            <span className="text-warning font-medium">{stats.working} ativos</span>
            <span className="text-base-content/30">•</span>
            <span className="text-base-content/60">{stats.idle} ociosos</span>
          </div>

          <button
            onClick={() => void refreshStatus()}
            disabled={isRefreshing}
            className="btn btn-ghost btn-sm btn-square"
            title="Atualizar status do Paperclip"
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
                Elenco do Homelab
              </span>
            </div>
            <span className="badge badge-neutral badge-xs">{agents.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {agents.map((agent) => {
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
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-base-200 border border-base-300 flex items-center justify-center font-bold text-xs capitalize text-primary shadow-xs">
                        {agent.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-base-content leading-none">
                            {agent.name}
                          </span>
                          {agent.isGod && (
                            <span className="badge badge-xs badge-primary font-semibold">
                              CEO
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-base-content/50 truncate block max-w-[140px]">
                          {agent.project}
                        </span>
                      </div>
                    </div>
                    {getStatusBadge(agent.status)}
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
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-base-content truncate">
                  {selectedAgent.name}
                </h3>
                {selectedAgent.isGod && (
                  <span className="badge badge-primary badge-xs">Chefe / God Agent</span>
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
