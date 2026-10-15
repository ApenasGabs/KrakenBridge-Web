import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { 
  ProjectOverview, 
  GithubIssueItem, 
  GithubPullRequestItem,
  GithubRepoInfo
} from '../../types';
import { api } from '../../services/api';
import {
  Compass,
  GitPullRequest,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  Search,
  Filter,
  Bot,
  AlertCircle,
  GitMerge,
  Check,
  Clock,
  User,
  FolderGit2,
  ChevronDown,
  ChevronUp,
  MessageSquarePlus,
  Send,
  Sparkles
} from 'lucide-react';

interface WhatsNextViewProps {
  onResolveIssue: (data: { conversationId: string; subproject: string; suggestedPrompt: string }) => void;
  onReviewPr: (data: { conversationId: string; subproject?: string; suggestedPrompt: string }) => void;
  onOpenConversation: (conversationId: string) => void;
}

export const WhatsNextView: React.FC<WhatsNextViewProps> = ({
  onResolveIssue,
  onReviewPr,
  onOpenConversation
}) => {
  // Dados principais
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [issues, setIssues] = useState<GithubIssueItem[]>([]);
  const [prs, setPrs] = useState<GithubPullRequestItem[]>([]);

  // Estados de carregamento e erro
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros e Navegação Interna
  const [activeSubTab, setActiveSubTab] = useState<'issues' | 'prs'>('issues');
  const [selectedRepo, setSelectedRepo] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Ações em Issues
  const [resolvingIssueNumber, setResolvingIssueNumber] = useState<number | null>(null);

  // Ações em PRs
  const [actioningPrNumber, setActioningPrNumber] = useState<number | null>(null);
  const [confirmMergePrNumber, setConfirmMergePrNumber] = useState<number | null>(null);
  const [expandedReviewPrId, setExpandedReviewPrId] = useState<number | null>(null);
  const [reviewComments, setReviewComments] = useState<Record<number, string>>({});
  const [submittingReviewPrId, setSubmittingReviewPrId] = useState<number | null>(null);

  // Feedback de ações
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Carregar dados da visão
  const loadData = useCallback(async (force = false) => {
    if (force) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const [overviewData, issuesData, prsData] = await Promise.all([
        api.getGithubOverview(force).catch(() => null),
        api.getGithubIssues(force).catch(() => ({ issues: [], count: 0 })),
        api.getGithubPrs(force).catch(() => ({ prs: [], count: 0 }))
      ]);

      if (overviewData) setOverview(overviewData);
      setIssues(issuesData.issues || []);
      setPrs(prsData.prs || []);
    } catch (err) {
      console.error('Erro ao carregar dados do GitHub:', err);
      setError((err as Error).message || 'Falha ao sincronizar com GitHub');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Lista única de repositórios para o filtro
  const repoOptions = useMemo(() => {
    const repos = new Map<string, string>();
    if (overview?.repositories) {
      overview.repositories.forEach((r: GithubRepoInfo) => {
        repos.set(r.ownerRepo, `${r.ownerRepo}${r.subproject ? ` (${r.subproject})` : ''}`);
      });
    }
    // Inclui repositórios presentes nas issues/PRs que possam não estar no overview
    issues.forEach(i => {
      if (i.repository?.nameWithOwner && !repos.has(i.repository.nameWithOwner)) {
        repos.set(i.repository.nameWithOwner, i.repository.nameWithOwner);
      }
    });
    prs.forEach(p => {
      if (p.repository?.nameWithOwner && !repos.has(p.repository.nameWithOwner)) {
        repos.set(p.repository.nameWithOwner, p.repository.nameWithOwner);
      }
    });
    return Array.from(repos.entries());
  }, [overview, issues, prs]);

  // Filtragem de Issues
  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      const matchesRepo = selectedRepo === 'all' || 
        issue.repository?.nameWithOwner === selectedRepo ||
        issue.subproject === selectedRepo;

      const q = searchQuery.toLowerCase().trim();
      const matchesQuery = !q || 
        issue.title.toLowerCase().includes(q) ||
        issue.number.toString().includes(q) ||
        issue.repository?.nameWithOwner.toLowerCase().includes(q) ||
        issue.labels?.some(l => l.name.toLowerCase().includes(q));

      return matchesRepo && matchesQuery;
    });
  }, [issues, selectedRepo, searchQuery]);

  // Filtragem de PRs
  const filteredPrs = useMemo(() => {
    return prs.filter(pr => {
      const matchesRepo = selectedRepo === 'all' || 
        pr.repository?.nameWithOwner === selectedRepo ||
        pr.subproject === selectedRepo;

      const q = searchQuery.toLowerCase().trim();
      const matchesQuery = !q || 
        pr.title.toLowerCase().includes(q) ||
        pr.number.toString().includes(q) ||
        pr.repository?.nameWithOwner.toLowerCase().includes(q) ||
        pr.headRefName?.toLowerCase().includes(q);

      return matchesRepo && matchesQuery;
    });
  }, [prs, selectedRepo, searchQuery]);

  // Formatação de data amigável
  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      const diffMs = Date.now() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return 'hoje';
      if (diffDays === 1) return 'ontem';
      if (diffDays < 30) return `há ${diffDays} dias`;
      return date.toLocaleDateString('pt-BR');
    } catch {
      return dateString;
    }
  };

  // Disparar Resolução de Issue
  const handleResolveIssue = async (issue: GithubIssueItem) => {
    setResolvingIssueNumber(issue.number);
    setActionFeedback(null);
    try {
      const res = await api.resolveGithubIssue({
        repo: issue.repository?.nameWithOwner || '',
        issueNumber: issue.number,
        title: issue.title,
        url: issue.url,
        body: issue.body,
        subproject: issue.subproject
      });

      if (res.success && res.conversationId) {
        setActionFeedback({
          type: 'success',
          message: `Sessão criada com sucesso para a Issue #${issue.number}! Iniciando no chat...`
        });
        // Dispara transição para o chat
        onResolveIssue({
          conversationId: res.conversationId,
          subproject: res.subproject,
          suggestedPrompt: res.suggestedPrompt
        });
      }
    } catch (err) {
      console.error('Erro ao resolver issue:', err);
      setActionFeedback({
        type: 'error',
        message: (err as Error).message || 'Falha ao iniciar resolução da issue'
      });
    } finally {
      setResolvingIssueNumber(null);
    }
  };

  // Disparar Ação no PR (Aprovar ou Fazer Merge)
  const handlePrAction = async (pr: GithubPullRequestItem, action: 'approve' | 'merge') => {
    const repo = pr.repository?.nameWithOwner;
    if (!repo) return;

    setActioningPrNumber(pr.number);
    setActionFeedback(null);
    try {
      const res = await api.actionGithubPr(repo, pr.number, action, 'squash');
      if (res.success) {
        setActionFeedback({
          type: 'success',
          message: action === 'approve' 
            ? `PR #${pr.number} aprovada com sucesso no GitHub!` 
            : `PR #${pr.number} mesclada com sucesso no GitHub!`
        });
        setConfirmMergePrNumber(null);
        // Recarregar dados após ação
        loadData(true);
      }
    } catch (err) {
      console.error(`Erro ao executar ${action} na PR:`, err);
      setActionFeedback({
        type: 'error',
        message: (err as Error).message || `Falha ao executar ação na PR #${pr.number}`
      });
    } finally {
      setActioningPrNumber(null);
    }
  };

  // Submeter Revisão para Agente
  const handleSendReview = async (pr: GithubPullRequestItem) => {
    const comment = reviewComments[pr.number]?.trim();
    if (!comment) return;

    const repo = pr.repository?.nameWithOwner;
    if (!repo) return;

    setSubmittingReviewPrId(pr.number);
    setActionFeedback(null);

    try {
      const res = await api.reviewGithubPr({
        repo,
        prNumber: pr.number,
        prTitle: pr.title,
        prUrl: pr.url,
        branch: pr.headRefName,
        comment
      });

      if (res.success && res.conversationId) {
        setActionFeedback({
          type: 'success',
          message: res.isNewSession 
            ? `Nova sessão criada para revisar PR #${pr.number}! Abrindo chat...`
            : `Revisão direcionada para a conversa original da PR #${pr.number}!`
        });

        // Limpa comentário digitado
        setReviewComments(prev => ({ ...prev, [pr.number]: '' }));
        setExpandedReviewPrId(null);

        // Dispara transição para o chat
        onReviewPr({
          conversationId: res.conversationId,
          subproject: res.subproject,
          suggestedPrompt: res.suggestedPrompt
        });
      }
    } catch (err) {
      console.error('Erro ao enviar revisão:', err);
      setActionFeedback({
        type: 'error',
        message: (err as Error).message || 'Falha ao enviar revisão para o agente'
      });
    } finally {
      setSubmittingReviewPrId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-base-100">
      {/* Top Banner / Header do Dashboard */}
      <div className="p-4 sm:p-6 border-b border-base-300 bg-base-200/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Compass className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-base-content">
                What's Next & Central de Revisão
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-base-content/60">
              Backlog unificado de issues e fila de Pull Requests dos seus projetos com resolução inteligente
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {overview?.authenticatedUser && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-200 border border-base-300 text-xs">
                <svg className="w-3.5 h-3.5 fill-current text-base-content/70 shrink-0" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                <span className="text-base-content/60">GitHub:</span>
                <span className="font-semibold text-base-content">@{overview.authenticatedUser}</span>
              </div>
            )}

            <button
              onClick={() => loadData(true)}
              disabled={isLoading || isRefreshing}
              className="btn btn-sm btn-outline gap-1.5 border-base-300 hover:bg-base-200"
              title="Recarregar dados do GitHub"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {actionFeedback && (
          <div className={`mt-4 alert ${actionFeedback.type === 'success' ? 'alert-success' : 'alert-error'} text-xs py-2 px-3 shadow-sm`}>
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
            <button 
              onClick={() => setActionFeedback(null)} 
              className="btn btn-ghost btn-xs ml-auto"
            >
              ✕
            </button>
          </div>
        )}

        {/* Sub-Tabs de Navegação: Issues vs PRs */}
        <div className="flex items-center justify-between gap-2 mt-4 pt-2 border-t border-base-300/60">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubTab('issues')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeSubTab === 'issues'
                  ? 'bg-primary text-primary-content shadow-sm'
                  : 'bg-base-200 text-base-content/70 hover:text-base-content hover:bg-base-300'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>What's Next (Issues)</span>
              <span className={`badge badge-sm font-mono ${
                activeSubTab === 'issues' ? 'badge-neutral bg-black/20 text-white border-0' : 'badge-ghost'
              }`}>
                {filteredIssues.length}
              </span>
            </button>

            <button
              onClick={() => setActiveSubTab('prs')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeSubTab === 'prs'
                  ? 'bg-primary text-primary-content shadow-sm'
                  : 'bg-base-200 text-base-content/70 hover:text-base-content hover:bg-base-300'
              }`}
            >
              <GitPullRequest className="w-3.5 h-3.5" />
              <span>Central de Revisão (PRs)</span>
              <span className={`badge badge-sm font-mono ${
                activeSubTab === 'prs' ? 'badge-neutral bg-black/20 text-white border-0' : 'badge-ghost'
              }`}>
                {filteredPrs.length}
              </span>
            </button>
          </div>

          {/* Filtros: Repositório e Busca */}
          <div className="flex items-center gap-2">
            <div className="relative hidden md:block">
              <Filter className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
              <select
                value={selectedRepo}
                onChange={(e) => setSelectedRepo(e.target.value)}
                className="select select-bordered select-xs pl-8 pr-6 text-xs max-w-[200px] truncate"
              >
                <option value="all">Todos os Projetos</option>
                {repoOptions.map(([ownerRepo, label]) => (
                  <option key={ownerRepo} value={ownerRepo}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar por título, label ou #"
                className="input input-bordered input-xs pl-8 text-xs w-44 sm:w-60"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo Principal com Scroll */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-base-content/60">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Buscando repositórios, issues e PRs no GitHub...</p>
          </div>
        )}

        {/* Erro global */}
        {!isLoading && error && (
          <div className="alert alert-error text-xs max-w-xl mx-auto shadow-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
            <button onClick={() => loadData(true)} className="btn btn-xs btn-outline">
              Tentar novamente
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA 1: WHAT'S NEXT (ISSUES)                                               */}
        {/* ========================================================================= */}
        {!isLoading && !error && activeSubTab === 'issues' && (
          <>
            {filteredIssues.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-base-content/60">
                <div className="w-12 h-12 rounded-full bg-base-200 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-6 h-6 text-success" />
                </div>
                <h3 className="font-semibold text-base text-base-content">Nenhuma issue aberta encontrada</h3>
                <p className="text-xs max-w-md mt-1 text-base-content/50">
                  {searchQuery || selectedRepo !== 'all' 
                    ? 'Nenhum resultado corresponde aos filtros selecionados. Tente limpar os filtros de busca ou repositório.'
                    : 'Tudo em dia! Não há issues pendentes no momento nos repositórios verificados.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredIssues.map((issue) => {
                  const isResolving = resolvingIssueNumber === issue.number;

                  return (
                    <div
                      key={`${issue.repository?.nameWithOwner}#${issue.number}`}
                      className="card bg-base-200/50 hover:bg-base-200 border border-base-300 transition-all shadow-sm hover:shadow"
                    >
                      <div className="card-body p-4 sm:p-5">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                          {/* Detalhes da Issue */}
                          <div className="flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Tag do Repositório / Workspace */}
                              <span className="badge badge-sm badge-outline font-mono gap-1 text-[11px] py-1">
                                <FolderGit2 className="w-3 h-3" />
                                {issue.repository?.nameWithOwner}
                              </span>

                              {issue.subproject && (
                                <span className="badge badge-sm badge-primary badge-outline text-[10px]">
                                  workspace: {issue.subproject}
                                </span>
                              )}

                              <span className="text-xs text-base-content/50 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDate(issue.createdAt)}
                              </span>

                              {issue.author?.login && (
                                <span className="text-xs text-base-content/50 flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  @{issue.author.login}
                                </span>
                              )}
                            </div>

                            {/* Título & Link */}
                            <div className="flex items-start gap-2">
                              <h2 className="text-base sm:text-lg font-bold text-base-content leading-snug">
                                <span className="text-primary font-mono mr-1.5">#{issue.number}</span>
                                {issue.title}
                              </h2>
                              <a
                                href={issue.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-base-content/40 hover:text-primary transition-colors mt-1"
                                title="Abrir no GitHub"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </div>

                            {/* Labels */}
                            {issue.labels && issue.labels.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {issue.labels.map((lbl) => (
                                  <span
                                    key={lbl.name}
                                    className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-base-300/80"
                                    style={{
                                      backgroundColor: lbl.color ? `#${lbl.color}22` : undefined,
                                      color: lbl.color ? `#${lbl.color}` : undefined
                                    }}
                                  >
                                    {lbl.name}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Trecho do corpo */}
                            {issue.body && (
                              <p className="text-xs text-base-content/70 line-clamp-2 pt-1 font-sans">
                                {issue.body}
                              </p>
                            )}
                          </div>

                          {/* Botão de Ação: Resolver com Kraken */}
                          <div className="shrink-0 self-start md:self-center">
                            <button
                              onClick={() => handleResolveIssue(issue)}
                              disabled={isResolving}
                              className="btn btn-sm btn-primary gap-1.5 shadow-sm text-xs w-full sm:w-auto"
                            >
                              {isResolving ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="w-3.5 h-3.5 text-primary-content" />
                              )}
                              <span>Resolver com Kraken</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ========================================================================= */}
        {/* ABA 2: CENTRAL DE REVISÃO (PULL REQUESTS)                                  */}
        {/* ========================================================================= */}
        {!isLoading && !error && activeSubTab === 'prs' && (
          <>
            {filteredPrs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-base-content/60">
                <div className="w-12 h-12 rounded-full bg-base-200 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-6 h-6 text-success" />
                </div>
                <h3 className="font-semibold text-base text-base-content">Nenhuma Pull Request pendente de revisão</h3>
                <p className="text-xs max-w-md mt-1 text-base-content/50">
                  {searchQuery || selectedRepo !== 'all' 
                    ? 'Nenhuma PR corresponde aos filtros atuais.' 
                    : 'Todas as Pull Requests foram revisadas e integradas!'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredPrs.map((pr) => {
                  const isActioning = actioningPrNumber === pr.number;
                  const isReviewOpen = expandedReviewPrId === pr.number;
                  const isSubmittingReview = submittingReviewPrId === pr.number;
                  const hasLinkedConversation = !!pr.linkedConversation;

                  return (
                    <div
                      key={`${pr.repository?.nameWithOwner}#${pr.number}`}
                      className="card bg-base-200/50 hover:bg-base-200 border border-base-300 transition-all shadow-sm"
                    >
                      <div className="card-body p-4 sm:p-5 space-y-3">
                        {/* Header do Card */}
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                          <div className="space-y-1.5 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="badge badge-sm badge-outline font-mono gap-1 text-[11px] py-1">
                                <FolderGit2 className="w-3 h-3" />
                                {pr.repository?.nameWithOwner}
                              </span>

                              {pr.subproject && (
                                <span className="badge badge-sm badge-primary badge-outline text-[10px]">
                                  workspace: {pr.subproject}
                                </span>
                              )}

                              {pr.isDraft && (
                                <span className="badge badge-sm badge-warning badge-outline text-[10px]">
                                  Rascunho (Draft)
                                </span>
                              )}

                              <span className="text-xs text-base-content/50 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDate(pr.createdAt)}
                              </span>

                              {pr.author?.login && (
                                <span className="text-xs text-base-content/50 flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  @{pr.author.login}
                                </span>
                              )}
                            </div>

                            {/* Título & Link */}
                            <div className="flex items-start gap-2">
                              <h2 className="text-base sm:text-lg font-bold text-base-content leading-snug">
                                <span className="text-secondary font-mono mr-1.5">#{pr.number}</span>
                                {pr.title}
                              </h2>
                              <a
                                href={pr.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-base-content/40 hover:text-primary transition-colors mt-1"
                                title="Abrir Pull Request no GitHub"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </div>

                            {/* Branch info */}
                            {pr.headRefName && (
                              <div className="flex items-center gap-1.5 text-xs font-mono text-base-content/70">
                                <GitPullRequest className="w-3.5 h-3.5 text-base-content/40" />
                                <span className="px-1.5 py-0.5 rounded bg-base-300 text-[11px]">
                                  {pr.headRefName}
                                </span>
                                <span>→</span>
                                <span className="px-1.5 py-0.5 rounded bg-base-300 text-[11px]">
                                  {pr.baseRefName || 'main'}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Indicador de Sessão Vinculada do Kraken */}
                          <div className="shrink-0">
                            {hasLinkedConversation ? (
                              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-success/10 border border-success/30 text-success text-xs">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                <div className="flex flex-col">
                                  <span className="text-[10px] uppercase font-semibold tracking-wider text-success/80">
                                    Sessão Kraken Vinculada
                                  </span>
                                  <button
                                    onClick={() => onOpenConversation(pr.linkedConversation!.id)}
                                    className="font-medium hover:underline text-left text-xs truncate max-w-[200px]"
                                    title={pr.linkedConversation!.title}
                                  >
                                    {pr.linkedConversation!.title}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-base-300/40 text-base-content/50 text-[11px]">
                                <Bot className="w-3.5 h-3.5" />
                                <span>Sem sessão prévia (criará nova)</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Labels da PR */}
                        {pr.labels && pr.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {pr.labels.map((lbl) => (
                              <span
                                key={lbl.name}
                                className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-base-300/80"
                                style={{
                                  backgroundColor: lbl.color ? `#${lbl.color}22` : undefined,
                                  color: lbl.color ? `#${lbl.color}` : undefined
                                }}
                              >
                                {lbl.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Barra de Ações: Marcar como OK vs Mandar Revisar */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-base-300/70">
                          {/* Ações de Aprovação & Merge */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handlePrAction(pr, 'approve')}
                              disabled={isActioning}
                              className="btn btn-xs sm:btn-sm btn-outline btn-success gap-1 text-xs"
                              title="Aprovar Pull Request no GitHub"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Aprovar PR</span>
                            </button>

                            {confirmMergePrNumber === pr.number ? (
                              <div className="flex items-center gap-1.5 bg-warning/10 border border-warning/30 rounded-lg px-2 py-1">
                                <span className="text-[11px] font-medium text-warning">Confirmar merge?</span>
                                <button
                                  onClick={() => handlePrAction(pr, 'merge')}
                                  disabled={isActioning}
                                  className="btn btn-xs btn-warning gap-1"
                                >
                                  {isActioning ? <RefreshCw className="w-3 h-3 animate-spin" /> : <GitMerge className="w-3 h-3" />}
                                  Sim, mesclar
                                </button>
                                <button
                                  onClick={() => setConfirmMergePrNumber(null)}
                                  className="btn btn-ghost btn-xs text-xs"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmMergePrNumber(pr.number)}
                                disabled={isActioning}
                                className="btn btn-xs sm:btn-sm btn-outline gap-1 text-xs"
                                title="Fazer Merge (Squash) da PR"
                              >
                                <GitMerge className="w-3.5 h-3.5" />
                                <span>Mesclar (Squash)</span>
                              </button>
                            )}
                          </div>

                          {/* Botão para Mandar Revisar (Expande área de comentários) */}
                          <button
                            onClick={() => setExpandedReviewPrId(isReviewOpen ? null : pr.number)}
                            className={`btn btn-xs sm:btn-sm gap-1.5 text-xs transition-colors ${
                              isReviewOpen ? 'btn-primary' : 'btn-ghost text-primary hover:bg-primary/10'
                            }`}
                          >
                            <MessageSquarePlus className="w-3.5 h-3.5" />
                            <span>Mandar Revisar</span>
                            {isReviewOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        {/* Caixa Expansível de Comentários de Revisão */}
                        {isReviewOpen && (
                          <div className="mt-3 p-3 sm:p-4 rounded-xl bg-base-100 border border-primary/20 space-y-3 animate-fadeIn">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-base-content flex items-center gap-1.5">
                                <Bot className="w-4 h-4 text-primary" />
                                Instruções de Revisão para o Kraken
                              </span>
                              <span className="text-[11px] text-base-content/50">
                                {hasLinkedConversation 
                                  ? 'Será enviado para a sessão original' 
                                  : 'Uma nova sessão focada nesta PR será aberta'}
                              </span>
                            </div>

                            <textarea
                              rows={3}
                              value={reviewComments[pr.number] || ''}
                              onChange={(e) => setReviewComments(prev => ({ ...prev, [pr.number]: e.target.value }))}
                              placeholder="Descreva o que precisa ser ajustado (ex: 'Altere o nome da variável X, adicione validação no backend para Y e crie um teste unitário...')"
                              className="textarea textarea-bordered w-full text-xs font-sans focus:textarea-primary"
                            />

                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setExpandedReviewPrId(null)}
                                className="btn btn-xs btn-ghost text-xs"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => handleSendReview(pr)}
                                disabled={!reviewComments[pr.number]?.trim() || isSubmittingReview}
                                className="btn btn-xs sm:btn-sm btn-primary gap-1.5 text-xs shadow-sm"
                              >
                                {isSubmittingReview ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Send className="w-3.5 h-3.5" />
                                )}
                                <span>Enviar Revisão para Agente</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
export default WhatsNextView;
