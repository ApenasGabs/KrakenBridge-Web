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
  Sparkles,
  Tag,
  X,
  SlidersHorizontal,
  Globe
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

  // Navegação e Filtros
  const [activeSubTab, setActiveSubTab] = useState<'issues' | 'prs'>('issues');
  const [selectedRepo, setSelectedRepo] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'local' | 'remote'>('all');
  const [authorFilter, setAuthorFilter] = useState<'all' | 'mine' | 'others'>('all');
  const [prStatusFilter, setPrStatusFilter] = useState<'all' | 'ready' | 'draft' | 'linked'>('all');
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'updated' | 'newest' | 'oldest' | 'number' | 'repo'>('updated');

  // Ações em Issues
  const [resolvingIssueNumber, setResolvingIssueNumber] = useState<number | null>(null);

  // Ações em PRs (usando prKey única: repo#number para evitar conflitos entre repositórios)
  const [actioningPrKey, setActioningPrKey] = useState<string | null>(null);
  const [confirmMergePrKey, setConfirmMergePrKey] = useState<string | null>(null);
  const [expandedReviewPrKey, setExpandedReviewPrKey] = useState<string | null>(null);
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [submittingReviewPrKey, setSubmittingReviewPrKey] = useState<string | null>(null);

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
      setPrs(prsData.prs || (prsData as any).pullRequests || []);
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
    const repos = new Map<string, { label: string; isLocal: boolean }>();
    if (overview?.repositories) {
      overview.repositories.forEach((r: GithubRepoInfo) => {
        repos.set(r.ownerRepo, {
          label: `${r.ownerRepo} [Workspace]`,
          isLocal: true
        });
      });
    }
    issues.forEach(i => {
      const name = i.repository?.nameWithOwner;
      if (name && !repos.has(name)) {
        repos.set(name, {
          label: `${name}${i.isLocalWorkspace ? ' [Workspace]' : ''}`,
          isLocal: !!i.isLocalWorkspace
        });
      }
    });
    prs.forEach(p => {
      const name = p.repository?.nameWithOwner;
      if (name && !repos.has(name)) {
        repos.set(name, {
          label: `${name}${p.isLocalWorkspace ? ' [Workspace]' : ''}`,
          isLocal: !!p.isLocalWorkspace
        });
      }
    });
    return Array.from(repos.entries());
  }, [overview, issues, prs]);

  // Contadores de escopo
  const counts = useMemo(() => {
    const activeList = activeSubTab === 'issues' ? issues : prs;
    const local = activeList.filter(item => item.isLocalWorkspace).length;
    return {
      total: activeList.length,
      local,
      remote: activeList.length - local
    };
  }, [activeSubTab, issues, prs]);

  // Nuvem das etiquetas mais frequentes no resultado atual
  const availableLabels = useMemo(() => {
    const list = activeSubTab === 'issues' ? issues : prs;
    const labelCounts = new Map<string, { name: string; color: string; count: number }>();
    for (const item of list) {
      if (Array.isArray(item.labels)) {
        for (const l of item.labels) {
          if (!l.name) continue;
          const key = l.name.toLowerCase();
          const existing = labelCounts.get(key);
          if (existing) {
            existing.count += 1;
          } else {
            labelCounts.set(key, { name: l.name, color: l.color, count: 1 });
          }
        }
      }
    }
    return Array.from(labelCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [activeSubTab, issues, prs]);

  // Checa se algum filtro está ativo
  const isAnyFilterActive = useMemo(() => {
    return (
      selectedRepo !== 'all' ||
      searchQuery.trim() !== '' ||
      scopeFilter !== 'all' ||
      authorFilter !== 'all' ||
      prStatusFilter !== 'all' ||
      selectedLabel !== null ||
      sortBy !== 'updated'
    );
  }, [selectedRepo, searchQuery, scopeFilter, authorFilter, prStatusFilter, selectedLabel, sortBy]);

  // Limpar todos os filtros
  const handleClearFilters = useCallback(() => {
    setSelectedRepo('all');
    setSearchQuery('');
    setScopeFilter('all');
    setAuthorFilter('all');
    setPrStatusFilter('all');
    setSelectedLabel(null);
    setSortBy('updated');
  }, []);

  // Filtragem e Ordenação de Issues
  const filteredIssues = useMemo(() => {
    const currentLogin = overview?.authenticatedUser?.toLowerCase();

    const result = issues.filter(issue => {
      // 1. Repositório
      if (selectedRepo !== 'all' && 
          issue.repository?.nameWithOwner !== selectedRepo && 
          issue.subproject !== selectedRepo) {
        return false;
      }
      // 2. Escopo (Local vs Remoto)
      if (scopeFilter === 'local' && !issue.isLocalWorkspace) return false;
      if (scopeFilter === 'remote' && issue.isLocalWorkspace) return false;

      // 3. Autor
      const authorLogin = issue.author?.login?.toLowerCase() || '';
      if (authorFilter === 'mine' && currentLogin && authorLogin !== currentLogin) return false;
      if (authorFilter === 'others' && currentLogin && authorLogin === currentLogin) return false;

      // 4. Label
      if (selectedLabel) {
        const hasLabel = issue.labels?.some(l => l.name.toLowerCase() === selectedLabel.toLowerCase());
        if (!hasLabel) return false;
      }

      // 5. Busca textual
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const matchesQuery = 
          issue.title.toLowerCase().includes(q) ||
          issue.number.toString().includes(q) ||
          issue.repository?.nameWithOwner.toLowerCase().includes(q) ||
          (issue.author?.login && issue.author.login.toLowerCase().includes(q)) ||
          issue.labels?.some(l => l.name.toLowerCase().includes(q));
        if (!matchesQuery) return false;
      }

      return true;
    });

    // Ordenação
    result.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === 'updated') return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
      if (sortBy === 'number') return b.number - a.number;
      if (sortBy === 'repo') return (a.repository?.nameWithOwner || '').localeCompare(b.repository?.nameWithOwner || '');
      return 0;
    });

    return result;
  }, [issues, selectedRepo, scopeFilter, authorFilter, selectedLabel, searchQuery, sortBy, overview]);

  // Filtragem e Ordenação de PRs
  const filteredPrs = useMemo(() => {
    const currentLogin = overview?.authenticatedUser?.toLowerCase();

    const result = prs.filter(pr => {
      // 1. Repositório
      if (selectedRepo !== 'all' && 
          pr.repository?.nameWithOwner !== selectedRepo && 
          pr.subproject !== selectedRepo) {
        return false;
      }
      // 2. Escopo
      if (scopeFilter === 'local' && !pr.isLocalWorkspace) return false;
      if (scopeFilter === 'remote' && pr.isLocalWorkspace) return false;

      // 3. Autor
      const authorLogin = pr.author?.login?.toLowerCase() || '';
      if (authorFilter === 'mine' && currentLogin && authorLogin !== currentLogin) return false;
      if (authorFilter === 'others' && currentLogin && authorLogin === currentLogin) return false;

      // 4. Status de PR
      if (prStatusFilter === 'ready' && pr.isDraft) return false;
      if (prStatusFilter === 'draft' && !pr.isDraft) return false;
      if (prStatusFilter === 'linked' && !pr.linkedConversation) return false;

      // 5. Label
      if (selectedLabel) {
        const hasLabel = pr.labels?.some(l => l.name.toLowerCase() === selectedLabel.toLowerCase());
        if (!hasLabel) return false;
      }

      // 6. Busca textual
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const matchesQuery = 
          pr.title.toLowerCase().includes(q) ||
          pr.number.toString().includes(q) ||
          pr.repository?.nameWithOwner.toLowerCase().includes(q) ||
          (pr.headRefName && pr.headRefName.toLowerCase().includes(q)) ||
          (pr.author?.login && pr.author.login.toLowerCase().includes(q)) ||
          pr.labels?.some(l => l.name.toLowerCase().includes(q));
        if (!matchesQuery) return false;
      }

      return true;
    });

    // Ordenação
    result.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === 'updated') return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
      if (sortBy === 'number') return b.number - a.number;
      if (sortBy === 'repo') return (a.repository?.nameWithOwner || '').localeCompare(b.repository?.nameWithOwner || '');
      return 0;
    });

    return result;
  }, [prs, selectedRepo, scopeFilter, authorFilter, prStatusFilter, selectedLabel, searchQuery, sortBy, overview]);

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
    const prKey = `${repo}#${pr.number}`;

    setActioningPrKey(prKey);
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
        setConfirmMergePrKey(null);
        loadData(true);
      }
    } catch (err) {
      console.error(`Erro ao executar ${action} na PR:`, err);
      setActionFeedback({
        type: 'error',
        message: (err as Error).message || `Falha ao executar ação na PR #${pr.number}`
      });
    } finally {
      setActioningPrKey(null);
    }
  };

  // Submeter Revisão para Agente
  const handleSendReview = async (pr: GithubPullRequestItem) => {
    const repo = pr.repository?.nameWithOwner;
    if (!repo) return;
    const prKey = `${repo}#${pr.number}`;

    const comment = reviewComments[prKey]?.trim();
    if (!comment) return;

    setSubmittingReviewPrKey(prKey);
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

        setReviewComments(prev => ({ ...prev, [prKey]: '' }));
        setExpandedReviewPrKey(null);

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
      setSubmittingReviewPrKey(null);
    }
  };

  // Aprovar diretamente para o Kraken e abrir chat para merge/execução
  const handleApproveForKraken = async (pr: GithubPullRequestItem) => {
    const repo = pr.repository?.nameWithOwner;
    if (!repo) return;
    const prKey = `${repo}#${pr.number}`;

    setActioningPrKey(prKey);
    setActionFeedback(null);

    try {
      // 1. Tentar registrar aprovação ou comentário no GitHub
      await api.actionGithubPr(repo, pr.number, 'approve').catch(() => null);

      // 2. Despachar instrução de aprovação para o Kraken
      const res = await api.reviewGithubPr({
        repo,
        prNumber: pr.number,
        prTitle: pr.title,
        prUrl: pr.url,
        branch: pr.headRefName,
        comment: `O PR #${pr.number} está aprovado! Pode seguir com o merge e aplicar as alterações.`
      });

      if (res.success && res.conversationId) {
        setActionFeedback({
          type: 'success',
          message: `PR #${pr.number} aprovada para o Kraken! Abrindo sessão no chat para merge...`
        });

        onReviewPr({
          conversationId: res.conversationId,
          subproject: res.subproject,
          suggestedPrompt: res.suggestedPrompt
        });
      }
    } catch (err) {
      console.error('Erro ao aprovar para Kraken:', err);
      setActionFeedback({
        type: 'error',
        message: (err as Error).message || `Falha ao aprovar PR #${pr.number} para o Kraken`
      });
    } finally {
      setActioningPrKey(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-base-100">
      {/* Top Banner / Header do Dashboard */}
      <div className="p-4 sm:p-5 border-b border-base-300 bg-base-200/40 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Compass className="w-4 h-4 text-primary" />
              </div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-base-content">
                What's Next & Central de Revisão
              </h1>
            </div>
            <p className="text-xs text-base-content/60">
              Backlog unificado de issues e fila de Pull Requests/MRs com resolução inteligente e auto-descoberta
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {overview?.authenticatedUser && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-base-200 border border-base-300 text-xs">
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
              className="btn btn-xs sm:btn-sm btn-outline gap-1.5 border-base-300 hover:bg-base-200"
              title="Sincronizar dados do GitHub"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Sincronizar</span>
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {actionFeedback && (
          <div className={`alert ${actionFeedback.type === 'success' ? 'alert-success' : 'alert-error'} text-xs py-2 px-3 shadow-sm`}>
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

        {/* Sub-Tabs: Issues vs PRs */}
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
            <span>Central de Revisão (PRs/MRs)</span>
            <span className={`badge badge-sm font-mono ${
              activeSubTab === 'prs' ? 'badge-neutral bg-black/20 text-white border-0' : 'badge-ghost'
            }`}>
              {filteredPrs.length}
            </span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* BARRA DE FILTROS AVANÇADOS E CONTROLE                                      */}
        {/* ========================================================================= */}
        <div className="p-3 rounded-xl bg-base-100 border border-base-300 shadow-sm space-y-2.5">
          {/* Linha 1 de Filtros: Escopo (Origem), Seletor de Repositório e Busca */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Seletor de Escopo: Todos / Workspace Local / GitHub Remoto */}
            <div className="inline-flex items-center bg-base-200 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setScopeFilter('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  scopeFilter === 'all'
                    ? 'bg-primary text-primary-content shadow-xs'
                    : 'text-base-content/70 hover:text-base-content'
                }`}
                title="Exibir todos os repositórios"
              >
                Todos ({counts.total})
              </button>
              <button
                onClick={() => setScopeFilter('local')}
                className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition-all ${
                  scopeFilter === 'local'
                    ? 'bg-primary text-primary-content shadow-xs'
                    : 'text-base-content/70 hover:text-base-content'
                }`}
                title="Apenas projetos presentes na pasta /workspace ou /app"
              >
                <FolderGit2 className="w-3 h-3" />
                <span>Workspace ({counts.local})</span>
              </button>
              <button
                onClick={() => setScopeFilter('remote')}
                className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition-all ${
                  scopeFilter === 'remote'
                    ? 'bg-primary text-primary-content shadow-xs'
                    : 'text-base-content/70 hover:text-base-content'
                }`}
                title="Projetos remotos no GitHub fora do workspace local"
              >
                <Globe className="w-3 h-3" />
                <span>Remotos ({counts.remote})</span>
              </button>
            </div>

            {/* Repositório e Busca */}
            <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
              <div className="relative">
                <Filter className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
                <select
                  value={selectedRepo}
                  onChange={(e) => setSelectedRepo(e.target.value)}
                  className="select select-bordered select-xs pl-8 pr-6 text-xs max-w-[210px] truncate"
                >
                  <option value="all">Todos os Projetos</option>
                  {repoOptions.map(([ownerRepo, info]) => (
                    <option key={ownerRepo} value={ownerRepo}>
                      {info.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative flex-1 sm:flex-initial">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar título, label, # ou autor..."
                  className="input input-bordered input-xs pl-8 text-xs w-full sm:w-56"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Linha 2 de Filtros: Autor, Status (para PRs), Ordenação e Botão Limpar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-base-200 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {/* Filtro de Autor */}
              <div className="flex items-center gap-1 text-base-content/60">
                <User className="w-3.5 h-3.5" />
                <select
                  value={authorFilter}
                  onChange={(e) => setAuthorFilter(e.target.value as any)}
                  className="select select-ghost select-xs text-xs font-normal px-1"
                >
                  <option value="all">Todos os autores</option>
                  <option value="mine">Criados por mim</option>
                  <option value="others">Criados por terceiros / bots</option>
                </select>
              </div>

              {/* Filtro de Status (específico para PRs) */}
              {activeSubTab === 'prs' && (
                <div className="flex items-center gap-1 text-base-content/60 border-l border-base-300 pl-2">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <select
                    value={prStatusFilter}
                    onChange={(e) => setPrStatusFilter(e.target.value as any)}
                    className="select select-ghost select-xs text-xs font-normal px-1"
                  >
                    <option value="all">Todos os status</option>
                    <option value="ready">Prontos para revisão</option>
                    <option value="draft">Rascunhos (Draft)</option>
                    <option value="linked">Com sessão Kraken vinculada</option>
                  </select>
                </div>
              )}

              {/* Ordenação */}
              <div className="flex items-center gap-1 text-base-content/60 border-l border-base-300 pl-2">
                <Clock className="w-3.5 h-3.5" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="select select-ghost select-xs text-xs font-normal px-1"
                >
                  <option value="updated">Atualizadas recentemente (Padrão)</option>
                  <option value="newest">Mais recentes (Criação)</option>
                  <option value="oldest">Mais antigas</option>
                  <option value="number">Número (#ID)</option>
                  <option value="repo">Repositório (A-Z)</option>
                </select>
              </div>
            </div>

            {/* Contador de itens e Botão de Limpar Filtros */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[11px] text-base-content/50">
                Exibindo <strong className="text-base-content font-mono">{activeSubTab === 'issues' ? filteredIssues.length : filteredPrs.length}</strong> de <strong className="font-mono">{counts.total}</strong>
              </span>

              {isAnyFilterActive && (
                <button
                  onClick={handleClearFilters}
                  className="btn btn-ghost btn-xs text-error gap-1 hover:bg-error/10 h-6 min-h-0 text-[11px]"
                  title="Restaurar todos os filtros"
                >
                  <X className="w-3 h-3" />
                  <span>Limpar filtros</span>
                </button>
              )}
            </div>
          </div>

          {/* Linha 3: Nuvem de Etiquetas (Tags / Labels) Dinâmicas */}
          {availableLabels.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-base-200">
              <span className="text-[10px] text-base-content/50 uppercase font-semibold tracking-wider flex items-center gap-1 mr-1">
                <Tag className="w-3 h-3" />
                Labels:
              </span>

              {availableLabels.map((lbl) => {
                const isSelected = selectedLabel?.toLowerCase() === lbl.name.toLowerCase();
                return (
                  <button
                    key={lbl.name}
                    onClick={() => setSelectedLabel(isSelected ? null : lbl.name)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all flex items-center gap-1 border ${
                      isSelected 
                        ? 'ring-2 ring-primary ring-offset-1 font-bold' 
                        : 'hover:opacity-80'
                    }`}
                    style={{
                      backgroundColor: lbl.color ? `#${lbl.color}22` : undefined,
                      borderColor: lbl.color ? `#${lbl.color}66` : undefined,
                      color: lbl.color ? `#${lbl.color}` : undefined
                    }}
                    title={`Filtrar por label "${lbl.name}"`}
                  >
                    <span>{lbl.name}</span>
                    <span className="text-[9px] opacity-70">({lbl.count})</span>
                    {isSelected && <X className="w-2.5 h-2.5 ml-0.5" />}
                  </button>
                );
              })}

              {selectedLabel && (
                <button
                  onClick={() => setSelectedLabel(null)}
                  className="text-[10px] text-primary hover:underline ml-1"
                >
                  (remover filtro de label)
                </button>
              )}
            </div>
          )}
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
                <h3 className="font-semibold text-base text-base-content">Nenhuma issue encontrada</h3>
                <p className="text-xs max-w-md mt-1 text-base-content/50">
                  {isAnyFilterActive 
                    ? 'Nenhum resultado corresponde aos filtros selecionados. Clique em "Limpar filtros" para ver todas as issues.'
                    : 'Tudo em dia! Não há issues abertas no momento.'}
                </p>
                {isAnyFilterActive && (
                  <button onClick={handleClearFilters} className="btn btn-sm btn-outline mt-4 gap-1.5 text-xs">
                    <X className="w-3.5 h-3.5" />
                    Limpar filtros
                  </button>
                )}
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
                              {/* Tag do Repositório */}
                              <span className="badge badge-sm badge-outline font-mono gap-1 text-[11px] py-1">
                                <FolderGit2 className="w-3 h-3" />
                                {issue.repository?.nameWithOwner}
                              </span>

                              {/* Distinção Workspace Local vs Remoto */}
                              {issue.isLocalWorkspace ? (
                                <span className="badge badge-sm badge-primary badge-outline text-[10px]">
                                  workspace: {issue.subproject}
                                </span>
                              ) : (
                                <span className="badge badge-sm badge-ghost text-[10px] text-base-content/60">
                                  GitHub remoto
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

                            {/* Labels clicáveis para filtro rápido */}
                            {issue.labels && issue.labels.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {issue.labels.map((lbl) => (
                                  <button
                                    key={lbl.name}
                                    onClick={() => setSelectedLabel(selectedLabel === lbl.name ? null : lbl.name)}
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border border-base-300/80 cursor-pointer hover:opacity-80 transition-all ${
                                      selectedLabel === lbl.name ? 'ring-2 ring-primary ring-offset-1 font-bold' : ''
                                    }`}
                                    style={{
                                      backgroundColor: lbl.color ? `#${lbl.color}22` : undefined,
                                      color: lbl.color ? `#${lbl.color}` : undefined
                                    }}
                                    title={`Filtrar por "${lbl.name}"`}
                                  >
                                    {lbl.name}
                                  </button>
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
        {/* ABA 2: CENTRAL DE REVISÃO (PULL REQUESTS / MRS)                            */}
        {/* ========================================================================= */}
        {!isLoading && !error && activeSubTab === 'prs' && (
          <>
            {filteredPrs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-base-content/60">
                <div className="w-12 h-12 rounded-full bg-base-200 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-6 h-6 text-success" />
                </div>
                <h3 className="font-semibold text-base text-base-content">Nenhuma Pull Request / MR encontrada</h3>
                <p className="text-xs max-w-md mt-1 text-base-content/50">
                  {isAnyFilterActive 
                    ? 'Nenhuma PR corresponde aos filtros atuais. Clique em "Limpar filtros" para ver todas as PRs.'
                    : 'Todas as Pull Requests foram revisadas e integradas!'}
                </p>
                {isAnyFilterActive && (
                  <button onClick={handleClearFilters} className="btn btn-sm btn-outline mt-4 gap-1.5 text-xs">
                    <X className="w-3.5 h-3.5" />
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredPrs.map((pr) => {
                  const prKey = `${pr.repository?.nameWithOwner}#${pr.number}`;
                  const isActioning = actioningPrKey === prKey;
                  const isReviewOpen = expandedReviewPrKey === prKey;
                  const isSubmittingReview = submittingReviewPrKey === prKey;
                  const hasLinkedConversation = !!pr.linkedConversation;

                  return (
                    <div
                      key={prKey}
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

                              {/* Distinção Workspace Local vs Remoto */}
                              {pr.isLocalWorkspace ? (
                                <span className="badge badge-sm badge-primary badge-outline text-[10px]">
                                  workspace: {pr.subproject}
                                </span>
                              ) : (
                                <span className="badge badge-sm badge-ghost text-[10px] text-base-content/60">
                                  GitHub remoto
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

                        {/* Labels da PR com clique para filtrar */}
                        {pr.labels && pr.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {pr.labels.map((lbl) => (
                              <button
                                key={lbl.name}
                                onClick={() => setSelectedLabel(selectedLabel === lbl.name ? null : lbl.name)}
                                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border border-base-300/80 cursor-pointer hover:opacity-80 transition-all ${
                                  selectedLabel === lbl.name ? 'ring-2 ring-primary ring-offset-1 font-bold' : ''
                                }`}
                                style={{
                                  backgroundColor: lbl.color ? `#${lbl.color}22` : undefined,
                                  color: lbl.color ? `#${lbl.color}` : undefined
                                }}
                                title={`Filtrar por "${lbl.name}"`}
                              >
                                {lbl.name}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Barra de Ações: Marcar como OK vs Mandar Revisar */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-base-300/70">
                          {/* Ações de Aprovação & Merge */}
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => handlePrAction(pr, 'approve')}
                              disabled={isActioning}
                              className="btn btn-xs sm:btn-sm btn-outline btn-success gap-1 text-xs"
                              title="Aprovar Pull Request no GitHub (ou registrar validação oficial se for PR próprio)"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Aprovar no GitHub</span>
                            </button>

                            <button
                              onClick={() => handleApproveForKraken(pr)}
                              disabled={isActioning}
                              className="btn btn-xs sm:btn-sm btn-primary gap-1.5 text-xs shadow-xs"
                              title="Aprovar diretamente para o Kraken e abrir chat para merge e implementação"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-primary-content" />
                              <span>Aprovar para Kraken</span>
                            </button>

                            {confirmMergePrKey === prKey ? (
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
                                  onClick={() => setConfirmMergePrKey(null)}
                                  className="btn btn-ghost btn-xs text-xs"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmMergePrKey(prKey)}
                                disabled={isActioning}
                                className="btn btn-xs sm:btn-sm btn-outline gap-1 text-xs"
                                title="Fazer Merge (Squash) da PR"
                              >
                                <GitMerge className="w-3.5 h-3.5" />
                                <span>Mesclar (Squash)</span>
                              </button>
                            )}
                          </div>

                          {/* Botão para Mandar Revisar */}
                          <button
                            onClick={() => setExpandedReviewPrKey(isReviewOpen ? null : prKey)}
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
                              value={reviewComments[prKey] || ''}
                              onChange={(e) => setReviewComments(prev => ({ ...prev, [prKey]: e.target.value }))}
                              placeholder="Descreva o que precisa ser ajustado (ex: 'Altere o nome da variável X, adicione validação no backend para Y e crie um teste unitário...')"
                              className="textarea textarea-bordered w-full text-xs font-sans focus:textarea-primary"
                            />

                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setExpandedReviewPrKey(null)}
                                className="btn btn-xs btn-ghost text-xs"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => handleSendReview(pr)}
                                disabled={!reviewComments[prKey]?.trim() || isSubmittingReview}
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
