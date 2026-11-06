import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../services/api';
import type {
  PaperclipStateSnapshot,
  PaperclipTimelineEvent
} from '../../types';
import {
  Bot,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  RotateCw,
  GitPullRequest,
  FolderKanban,
  ChevronDown,
  ChevronUp,
  Zap,
  Flame,
  Radio,
  Play
} from 'lucide-react';

export const PaperclipDashboard: React.FC = () => {
  const [snapshot, setSnapshot] = useState<PaperclipStateSnapshot | null>(null);
  const [timeline, setTimeline] = useState<PaperclipTimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedErrorAgentId, setExpandedErrorAgentId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [filterProject, setFilterProject] = useState<string>('all');

  // Carrega estado inicial e conecta SSE para tempo real
  useEffect(() => {
    let isMounted = true;

    // 1. Carga inicial via REST
    api.getPaperclipStatus()
      .then((data) => {
        if (!isMounted) return;
        setSnapshot(data);
        if (data.timeline) setTimeline(data.timeline);
        setIsLoading(false);
      })
      .catch((err) => {
        console.warn('[PaperclipDashboard] Falha ao carregar estado inicial:', err);
        if (isMounted) setIsLoading(false);
      });

    // 2. Conexão SSE persistente
    const es = api.createPaperclipEventSource(
      (newSnapshot) => {
        if (!isMounted) return;
        setSnapshot(newSnapshot);
        if (newSnapshot.timeline) {
          setTimeline(newSnapshot.timeline);
        }
      },
      (newEvent) => {
        if (!isMounted) return;
        setTimeline((prev) => [newEvent, ...prev.slice(0, 99)]);
      },
      (err) => {
        console.warn('[PaperclipDashboard] SSE Reconectando...', err);
      }
    );

    return () => {
      isMounted = false;
      es.close();
    };
  }, []);

  // Forçar atualização manual
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setActionFeedback(null);
    try {
      const res = await api.pollPaperclip();
      if (res.snapshot) {
        setSnapshot(res.snapshot);
        if (res.snapshot.timeline) setTimeline(res.snapshot.timeline);
      }
    } catch (err: any) {
      setActionFeedback({ message: `Erro ao sincronizar: ${err.message}`, type: 'error' });
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Simular evento (para testes e critérios de aceite)
  const handleSimulate = useCallback(async (type: 'error' | 'blocked' | 'stall') => {
    setActionFeedback(null);
    try {
      const res = await api.simulatePaperclipEvent(type);
      if (res.event) {
        setTimeline((prev) => [res.event, ...prev]);
        setActionFeedback({ message: `Evento simulado disparado com sucesso (${type})!`, type: 'success' });
      }
    } catch (err: any) {
      setActionFeedback({ message: `Falha ao simular: ${err.message}`, type: 'error' });
    }
  }, []);

  // Ação rápida: Acordar agente
  const handleWakeupAgent = useCallback(async (agentId: string, issueId?: string) => {
    setActionFeedback(null);
    try {
      await api.sendPaperclipAction('wakeup', agentId, issueId);
      setActionFeedback({ message: `Comando wakeup enviado com sucesso para o agente!`, type: 'success' });
      handleRefresh();
    } catch (err: any) {
      setActionFeedback({ message: `Erro ao acordar agente: ${err.message}`, type: 'error' });
    }
  }, [handleRefresh]);

  // Estatísticas calculadas
  const stats = useMemo(() => {
    if (!snapshot) return { totalAgents: 0, running: 0, error: 0, stallsCount: 0, blockedIssues: 0, openPrsCount: 0 };
    const totalAgents = snapshot.agents.length;
    const running = snapshot.agents.filter(a => a.status === 'running').length;
    const error = snapshot.agents.filter(a => a.status === 'error').length;
    const stallsCount = snapshot.stalls.length;
    const blockedIssues = snapshot.issues.filter(i => i.status === 'blocked').length;
    const openPrsCount = snapshot.openPrs.length;
    return { totalAgents, running, error, stallsCount, blockedIssues, openPrsCount };
  }, [snapshot]);

  // Lista de issues filtrada
  const filteredIssues = useMemo(() => {
    if (!snapshot) return { inProgress: [], blocked: [], todo: [] };
    const list = filterProject === 'all' 
      ? snapshot.issues 
      : snapshot.issues.filter(i => i.projectId === filterProject);

    return {
      inProgress: list.filter(i => i.status === 'in_progress'),
      blocked: list.filter(i => i.status === 'blocked'),
      todo: list.filter(i => i.status === 'todo')
    };
  }, [snapshot, filterProject]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-base-content/60 space-y-4">
        <RotateCw className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm">Conectando ao conector de tempo real do Paperclip...</p>
      </div>
    );
  }

  const isConnected = snapshot?.connected ?? false;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 py-4 animate-in fade-in duration-200">
      {/* Barra de Cabeçalho Superior */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-base-200/50 backdrop-blur-md p-4 rounded-2xl border border-base-300">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-base-content">Paperclip Orchestrator</h2>
                <span className={`badge badge-sm font-semibold gap-1.5 ${isConnected ? 'badge-success' : 'badge-error'}`}>
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success-content animate-pulse' : 'bg-error-content'}`} />
                  {isConnected ? 'Online (Dell)' : 'Offline'}
                </span>
                <span className="badge badge-outline badge-xs text-xs opacity-75">
                  SSE Live
                </span>
              </div>
              <p className="text-xs text-base-content/60">
                Última sincronização: {snapshot?.lastPollAt ? new Date(snapshot.lastPollAt).toLocaleTimeString('pt-BR') : 'nunca'} | Endpoint: <code className="text-xs">{snapshot?.paperclipUrl}</code>
              </p>
            </div>
          </div>
        </div>

        {/* Ações e Simulação */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Menu Dropdown de Simulação para Validação de Critérios */}
          <div className="dropdown dropdown-end">
            <button tabIndex={0} className="btn btn-outline btn-xs gap-1">
              <Zap className="w-3.5 h-3.5 text-warning" />
              Simular Eventos
              <ChevronDown className="w-3 h-3" />
            </button>
            <ul tabIndex={0} className="dropdown-content z-50 menu p-2 shadow-xl bg-base-100 rounded-xl w-52 border border-base-300 text-xs">
              <li>
                <button onClick={() => handleSimulate('error')} className="text-error hover:bg-error/10">
                  🔴 Simular Agente em ERRO
                </button>
              </li>
              <li>
                <button onClick={() => handleSimulate('blocked')} className="text-warning hover:bg-warning/10">
                  🟠 Simular Issue BLOQUEADA
                </button>
              </li>
              <li>
                <button onClick={() => handleSimulate('stall')} className="text-warning hover:bg-warning/10">
                  ⚠️ Simular Detector de STALL
                </button>
              </li>
            </ul>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="btn btn-primary btn-xs gap-1.5 shadow-sm"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
        </div>
      </div>

      {/* Feedback de Ação */}
      {actionFeedback && (
        <div className={`alert text-xs py-2 px-4 shadow-sm rounded-xl ${actionFeedback.type === 'success' ? 'alert-success' : 'alert-error'}`}>
          {actionFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          <span>{actionFeedback.message}</span>
        </div>
      )}

      {/* Alerta Destacado de Stall (Se houver stalls detectados) */}
      {snapshot && snapshot.stalls.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-warning font-bold text-sm">
            <Flame className="w-5 h-5 animate-bounce" />
            <span>Detector de Stall Ativo: {snapshot.stalls.length} tarefa(s) ou agente(s) parados</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {snapshot.stalls.map((stall) => (
              <div key={stall.id} className="bg-base-100/80 backdrop-blur-sm p-3 rounded-xl border border-warning/20 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-warning-content bg-warning/80 px-2 py-0.5 rounded-md">
                    {stall.issueIdentifier}
                  </span>
                  <span className="text-base-content/60">
                    Parado há <strong>{stall.inactiveMinutes} min</strong>
                  </span>
                </div>
                <div className="font-semibold text-base-content truncate">{stall.issueTitle}</div>
                <p className="text-base-content/70">{stall.reason}</p>
                {stall.recoverySuggestion && (
                  <p className="text-primary italic">💡 {stall.recoverySuggestion}</p>
                )}
                {stall.agentId && (
                  <div className="pt-1 flex items-center justify-end">
                    <button
                      onClick={() => handleWakeupAgent(stall.agentId, stall.issueId)}
                      className="btn btn-warning btn-xs gap-1 text-[11px]"
                    >
                      <Play className="w-3 h-3" />
                      Acordar Agente ({stall.agentName})
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cartões Rápidos de Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-base-200/40 border border-base-300 p-3 rounded-xl flex flex-col items-center text-center">
          <span className="text-xs text-base-content/60">Agentes</span>
          <span className="text-xl font-bold text-base-content">{stats.totalAgents}</span>
          <span className="text-[10px] text-base-content/50">esquadrão ativo</span>
        </div>

        <div className="bg-base-200/40 border border-base-300 p-3 rounded-xl flex flex-col items-center text-center">
          <span className="text-xs text-base-content/60">Em Execução</span>
          <span className="text-xl font-bold text-info">{stats.running}</span>
          <span className="text-[10px] text-info/70">runs ao vivo</span>
        </div>

        <div className={`bg-base-200/40 border p-3 rounded-xl flex flex-col items-center text-center ${stats.error > 0 ? 'border-error/40 bg-error/5' : 'border-base-300'}`}>
          <span className="text-xs text-base-content/60">Com Erro</span>
          <span className={`text-xl font-bold ${stats.error > 0 ? 'text-error animate-pulse' : 'text-base-content'}`}>{stats.error}</span>
          <span className="text-[10px] text-error/70">necessita atenção</span>
        </div>

        <div className={`bg-base-200/40 border p-3 rounded-xl flex flex-col items-center text-center ${stats.stallsCount > 0 ? 'border-warning/40 bg-warning/5' : 'border-base-300'}`}>
          <span className="text-xs text-base-content/60">Stalls (&gt;30m)</span>
          <span className={`text-xl font-bold ${stats.stallsCount > 0 ? 'text-warning' : 'text-base-content'}`}>{stats.stallsCount}</span>
          <span className="text-[10px] text-warning/70">atrasos críticos</span>
        </div>

        <div className="bg-base-200/40 border border-base-300 p-3 rounded-xl flex flex-col items-center text-center">
          <span className="text-xs text-base-content/60">Bloqueadas</span>
          <span className="text-xl font-bold text-warning">{stats.blockedIssues}</span>
          <span className="text-[10px] text-base-content/50">aguardando liberação</span>
        </div>

        <div className="bg-base-200/40 border border-base-300 p-3 rounded-xl flex flex-col items-center text-center">
          <span className="text-xs text-base-content/60">PRs Abertos</span>
          <span className="text-xl font-bold text-primary">{stats.openPrsCount}</span>
          <span className="text-[10px] text-base-content/50">com auditoria CI</span>
        </div>
      </div>

      {/* Grid Principal: Agentes + Projetos/Issues */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Painel de Agentes (5 colunas no desktop) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-base-content flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              Painel de Agentes ({snapshot?.agents.length || 0})
            </h3>
            <span className="text-xs text-base-content/50">tempo real</span>
          </div>

          <div className="space-y-3">
            {snapshot?.agents.map((agent) => {
              const isError = agent.status === 'error';
              const isRunning = agent.status === 'running';
              const isExpanded = expandedErrorAgentId === agent.id;

              return (
                <div
                  key={agent.id}
                  className={`bg-base-100 p-4 rounded-2xl border transition-all shadow-xs ${
                    isError
                      ? 'border-error/40 bg-error/5'
                      : isRunning
                      ? 'border-info/40 bg-info/5'
                      : 'border-base-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                        isError ? 'bg-error text-error-content' : isRunning ? 'bg-info text-info-content animate-pulse' : 'bg-base-200 text-base-content'
                      }`}>
                        {agent.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-xs sm:text-sm text-base-content flex items-center gap-1.5">
                          {agent.name}
                          <span className={`badge badge-xs font-semibold ${
                            isError ? 'badge-error' : isRunning ? 'badge-info' : 'badge-success'
                          }`}>
                            {agent.status.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-base-content/60 truncate max-w-[200px] sm:max-w-[260px]">
                          {agent.title || agent.role}
                        </p>
                      </div>
                    </div>

                    {/* Botão Acordar */}
                    <button
                      onClick={() => handleWakeupAgent(agent.id, agent.currentIssueId)}
                      title="Disparar wakeup"
                      className="btn btn-ghost btn-xs text-primary gap-1"
                    >
                      <Play className="w-3 h-3" />
                      Wake
                    </button>
                  </div>

                  {/* Detalhes do Run Atual ou Última Atividade */}
                  <div className="mt-3 pt-3 border-t border-base-200/60 text-xs space-y-1.5 text-base-content/75">
                    {agent.currentIssueIdentifier ? (
                      <div className="flex items-center justify-between text-info">
                        <span className="font-semibold flex items-center gap-1">
                          <Radio className="w-3 h-3 animate-ping" />
                          {agent.currentIssueIdentifier}
                        </span>
                        <span className="text-[10px] text-base-content/50 truncate max-w-[150px]">
                          {agent.currentIssueTitle}
                        </span>
                      </div>
                    ) : (
                      <div className="text-base-content/50 text-[11px] flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Último heartbeat: {agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt).toLocaleTimeString('pt-BR') : 'sem registro'}
                      </div>
                    )}

                    {/* Exibição do Erro Real Desmascarado */}
                    {isError && agent.lastError && (
                      <div className="mt-2 p-2.5 bg-error/10 border border-error/20 rounded-xl space-y-1 text-xs">
                        <div className="flex items-center justify-between font-bold text-error">
                          <span className="flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" />
                            Erro Real: {agent.lastError}
                          </span>
                          {agent.lastErrorDetails && (
                            <button
                              onClick={() => setExpandedErrorAgentId(isExpanded ? null : agent.id)}
                              className="btn btn-ghost btn-xs text-error hover:bg-error/20 p-1 h-auto min-h-0"
                            >
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          )}
                        </div>

                        {/* Detalhes expandidos (stderr / stack unmasked) */}
                        {isExpanded && agent.lastErrorDetails && (
                          <pre className="text-[10px] font-mono p-2 bg-base-300/80 rounded-lg overflow-x-auto text-base-content max-h-36 whitespace-pre-wrap">
                            {agent.lastErrorDetails}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Painel de Projetos, Épicos e Issues (7 colunas no desktop) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-base-content flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-primary" />
              Projetos &amp; Épicos
            </h3>

            {/* Filtro de Projetos */}
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="select select-bordered select-xs text-xs"
            >
              <option value="all">Todos os Projetos</option>
              {snapshot?.projectsProgress.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.projectName}
                </option>
              ))}
            </select>
          </div>

          {/* Barras de Progresso dos Projetos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {snapshot?.projectsProgress.map((proj) => (
              <div key={proj.projectId} className="bg-base-100 p-3.5 rounded-2xl border border-base-300 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-base-content truncate max-w-[180px]">{proj.projectName}</span>
                  <span className="badge badge-sm badge-neutral font-mono">{proj.completedIssues}/{proj.totalIssues} ({proj.percentage}%)</span>
                </div>
                <progress
                  className="progress progress-primary w-full h-2"
                  value={proj.percentage}
                  max="100"
                />
                <div className="flex items-center justify-between text-[11px] text-base-content/60">
                  <span>Andamento: <strong>{proj.inProgressIssues}</strong></span>
                  <span className="text-warning">Bloqueadas: <strong>{proj.blockedIssues}</strong></span>
                  <span>A Fazer: <strong>{proj.todoIssues}</strong></span>
                </div>
              </div>
            ))}
          </div>

          {/* Seção de Issues Em Andamento & Bloqueadas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Em Andamento */}
            <div className="bg-base-100 p-4 rounded-2xl border border-base-300 space-y-3">
              <h4 className="text-xs font-bold text-info uppercase tracking-wider flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                Em Andamento ({filteredIssues.inProgress.length})
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {filteredIssues.inProgress.length === 0 ? (
                  <p className="text-xs text-base-content/50 italic">Nenhuma issue em andamento no momento.</p>
                ) : (
                  filteredIssues.inProgress.map((issue) => (
                    <a
                      key={issue.id}
                      href={`${snapshot?.paperclipUrl}/APE/issues/${issue.identifier}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-2.5 rounded-xl bg-base-200/50 hover:bg-base-200 border border-base-300 transition-colors text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-primary">{issue.identifier}</span>
                        <span className="badge badge-xs badge-info">{issue.assigneeAgentName || 'Sem agente'}</span>
                      </div>
                      <p className="text-base-content font-medium line-clamp-1">{issue.title}</p>
                    </a>
                  ))
                )}
              </div>
            </div>

            {/* Bloqueadas */}
            <div className="bg-base-100 p-4 rounded-2xl border border-warning/30 bg-warning/5 space-y-3">
              <h4 className="text-xs font-bold text-warning uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Bloqueadas ({filteredIssues.blocked.length})
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {filteredIssues.blocked.length === 0 ? (
                  <p className="text-xs text-base-content/50 italic">Nenhuma issue bloqueada.</p>
                ) : (
                  filteredIssues.blocked.map((issue) => (
                    <a
                      key={issue.id}
                      href={`${snapshot?.paperclipUrl}/APE/issues/${issue.identifier}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-2.5 rounded-xl bg-base-100 hover:bg-base-200 border border-warning/30 transition-colors text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-warning">{issue.identifier}</span>
                        <span className="badge badge-xs badge-warning">{issue.priority}</span>
                      </div>
                      <p className="text-base-content font-medium line-clamp-1">{issue.title}</p>
                      {issue.activeRecoveryAction?.nextAction && (
                        <p className="text-[10px] text-base-content/60 italic line-clamp-1">
                          Motivo: {issue.activeRecoveryAction.nextAction}
                        </p>
                      )}
                    </a>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Pull Requests & Estado do CI */}
          <div className="bg-base-100 p-4 rounded-2xl border border-base-300 space-y-3">
            <h4 className="text-xs font-bold text-base-content uppercase tracking-wider flex items-center gap-1.5">
              <GitPullRequest className="w-3.5 h-3.5 text-primary" />
              Pull Requests Abertos &amp; Auditoria de CI ({snapshot?.openPrs.length || 0})
            </h4>

            <div className="space-y-2">
              {snapshot?.openPrs.length === 0 ? (
                <p className="text-xs text-base-content/50 italic">Nenhum Pull Request aberto nos repositórios monitorados.</p>
              ) : (
                snapshot?.openPrs.map((pr) => {
                  const isCiFailed = pr.ciStatus === 'FAILURE';
                  const isCiSuccess = pr.ciStatus === 'SUCCESS';

                  return (
                    <div
                      key={pr.url}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-base-200/40 border border-base-300 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <a
                            href={pr.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-primary hover:underline flex items-center gap-1"
                          >
                            #{pr.number} {pr.title}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          {pr.issueIdentifier && (
                            <span className="badge badge-xs badge-outline">{pr.issueIdentifier}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-base-content/60">
                          Repositório: <strong>{pr.repo}</strong> | Branch: <code>{pr.headRefName}</code>
                        </p>
                      </div>

                      {/* Badge do CI */}
                      <div className="flex items-center gap-2 self-start sm:self-center">
                        <span className={`badge badge-sm font-semibold gap-1 ${
                          isCiFailed ? 'badge-error' : isCiSuccess ? 'badge-success' : 'badge-warning'
                        }`}>
                          {isCiFailed ? <XCircle className="w-3 h-3" /> : isCiSuccess ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          CI: {pr.ciStatus}
                        </span>
                        {pr.ciDetailsUrl && (
                          <a
                            href={pr.ciDetailsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content p-1"
                            title="Ver logs no GitHub Actions"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline de Atividade ao Vivo (SSE) */}
      <div className="bg-base-100 p-5 rounded-2xl border border-base-300 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-sm text-base-content">Timeline de Atividade ao Vivo (SSE)</h3>
          </div>
          <span className="text-xs text-base-content/50">
            {timeline.length} eventos registrados
          </span>
        </div>

        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
          {timeline.length === 0 ? (
            <p className="text-xs text-base-content/50 italic py-4 text-center">
              Aguardando novos eventos do Paperclip...
            </p>
          ) : (
            timeline.map((evt) => {
              const isError = evt.severity === 'error';
              const isWarning = evt.severity === 'warning';
              const isSuccess = evt.severity === 'success';

              return (
                <div
                  key={evt.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-xs transition-colors ${
                    isError
                      ? 'bg-error/5 border-error/30'
                      : isWarning
                      ? 'bg-warning/5 border-warning/30'
                      : isSuccess
                      ? 'bg-success/5 border-success/30'
                      : 'bg-base-200/40 border-base-300'
                  }`}
                >
                  <div className="mt-0.5">
                    {isError ? (
                      <XCircle className="w-4 h-4 text-error" />
                    ) : isWarning ? (
                      <AlertTriangle className="w-4 h-4 text-warning" />
                    ) : isSuccess ? (
                      <CheckCircle2 className="w-4 h-4 text-success" />
                    ) : (
                      <Activity className="w-4 h-4 text-info" />
                    )}
                  </div>

                  <div className="flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-bold text-base-content">{evt.title}</span>
                      <span className="text-[10px] text-base-content/50">
                        {new Date(evt.timestamp).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                    <p className="text-base-content/70 whitespace-pre-line">{evt.description}</p>
                    <div className="flex items-center gap-2 pt-1">
                      {evt.issueUrl && (
                        <a
                          href={evt.issueUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-primary hover:underline flex items-center gap-1 font-semibold"
                        >
                          Ver no Paperclip ({evt.issueIdentifier || 'Issue'})
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                      {evt.prUrl && (
                        <a
                          href={evt.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-primary hover:underline flex items-center gap-1 font-semibold"
                        >
                          Ver PR no GitHub
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
