import React, { useState, useEffect, useCallback } from 'react';
import { 
  Database, 
  Search, 
  BookOpen, 
  ArrowRightLeft, 
  PlusCircle, 
  RefreshCw, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  FileText,
  Pin,
  Clock,
  Layers,
  Sparkles
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../../services/api';
import type { MemoryStatus, MemorySearchResult, MemoryPage, MemoryHandoff } from '../../types';

export const MemoryView: React.FC = () => {
  const [status, setStatus] = useState<MemoryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'search' | 'briefing' | 'write'>('search');
  
  // Busca & Páginas
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemorySearchResult[]>([]);
  const [recentPages, setRecentPages] = useState<MemorySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  
  // Leitura de Página
  const [selectedPage, setSelectedPage] = useState<MemoryPage | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  
  // Briefing & Handoffs
  const [briefing, setBriefing] = useState<any>(null);
  const [handoffs, setHandoffs] = useState<MemoryHandoff[]>([]);
  const [loadingBriefing, setLoadingBriefing] = useState(false);

  // Nova Nota
  const [newPath, setNewPath] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newPinned, setNewPinned] = useState(false);
  const [savingPage, setSavingPage] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const data = await api.getMemoryStatus();
      setStatus(data);
    } catch (e) {
      console.warn('Erro ao carregar status do ai-memory:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecentPages = useCallback(async () => {
    try {
      const pages = await api.getRecentMemoryPages(15);
      setRecentPages(pages);
      if (pages.length > 0 && !selectedPage && !searchQuery) {
        loadPageContent(pages[0].path);
      }
    } catch (e) {
      console.warn('Erro ao carregar páginas recentes:', e);
    }
  }, [selectedPage, searchQuery]);

  const loadBriefing = useCallback(async () => {
    setLoadingBriefing(true);
    try {
      const [briefingData, handoffsData] = await Promise.all([
        api.getMemoryBriefing(),
        api.getMemoryHandoffs()
      ]);
      setBriefing(briefingData);
      setHandoffs(handoffsData);
    } catch (e) {
      console.warn('Erro ao carregar briefing:', e);
    } finally {
      setLoadingBriefing(false);
    }
  }, []);

  const loadPageContent = async (path: string) => {
    setLoadingPage(true);
    try {
      const page = await api.getMemoryPage(path);
      setSelectedPage(page);
    } catch (e) {
      console.warn(`Erro ao carregar página ${path}:`, e);
    } finally {
      setLoadingPage(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const hits = await api.searchMemory(searchQuery);
      setSearchResults(hits);
      if (hits.length > 0) {
        loadPageContent(hits[0].path);
      }
    } catch (e) {
      console.warn('Erro na busca da memória:', e);
    } finally {
      setSearching(false);
    }
  };

  const handleSavePage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPath.trim() || !newBody.trim()) {
      setSaveMessage({ text: 'Preencha o caminho e o conteúdo da página.', type: 'error' });
      return;
    }

    setSavingPage(true);
    setSaveMessage(null);
    try {
      const tags = newTags.split(',').map(t => t.trim()).filter(Boolean);
      const res = await api.saveMemoryPage({
        path: newPath.trim(),
        body: newBody,
        tags,
        pinned: newPinned
      });

      if (res.success) {
        setSaveMessage({ text: `Página salva com sucesso! (Checkpoint: ${res.checkpoint?.slice(0, 8) || 'ok'})`, type: 'success' });
        setNewPath('');
        setNewBody('');
        setNewTags('');
        setNewPinned(false);
        loadRecentPages();
        loadStatus();
      } else {
        setSaveMessage({ text: res.error || 'Falha ao gravar página.', type: 'error' });
      }
    } catch (err) {
      setSaveMessage({ text: (err as Error).message, type: 'error' });
    } finally {
      setSavingPage(false);
    }
  };

  useEffect(() => {
    loadStatus();
    loadRecentPages();
    loadBriefing();
  }, [loadStatus, loadRecentPages, loadBriefing]);

  const webUiUrl = status?.serverUrl 
    ? `${status.serverUrl.replace('172.17.0.1', window.location.hostname)}/web` 
    : 'http://localhost:49374/web';

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-base-100 p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-base-300">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Database className="w-7 h-7 text-primary" />
              Memória de Longo Prazo
            </h1>
            {status?.online ? (
              <span className="badge badge-success gap-1 text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" /> Online (v{status.version || '3.0.1'})
              </span>
            ) : (
              <span className="badge badge-error gap-1 text-xs font-semibold">
                <AlertCircle className="w-3.5 h-3.5" /> Offline
              </span>
            )}
          </div>
          <p className="text-sm text-base-content/70">
            Base de conhecimento viva em Markdown no Git com busca híbrida (FTS5 + Grafo + Embeddings) e handoffs entre sessões.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => { loadStatus(); loadRecentPages(); loadBriefing(); }} 
            className="btn btn-sm btn-ghost gap-2"
            title="Atualizar dados"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Recarregar
          </button>
          <a 
            href={webUiUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="btn btn-sm btn-outline btn-primary gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Abrir Web UI
          </a>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat bg-base-200/60 rounded-box p-4 border border-base-300">
          <div className="stat-figure text-primary">
            <FileText className="w-6 h-6 opacity-80" />
          </div>
          <div className="stat-title text-xs font-semibold">Páginas na Wiki</div>
          <div className="stat-value text-2xl text-primary">{status?.stats?.pagesLatest ?? 0}</div>
          <div className="stat-desc text-xs mt-1">Versões históricas: {status?.stats?.pagesAllVersions ?? 0}</div>
        </div>

        <div className="stat bg-base-200/60 rounded-box p-4 border border-base-300">
          <div className="stat-figure text-secondary">
            <Layers className="w-6 h-6 opacity-80" />
          </div>
          <div className="stat-title text-xs font-semibold">Sessões Gravadas</div>
          <div className="stat-value text-2xl text-secondary">{status?.stats?.sessions ?? 0}</div>
          <div className="stat-desc text-xs mt-1">Cross-session tracking</div>
        </div>

        <div className="stat bg-base-200/60 rounded-box p-4 border border-base-300">
          <div className="stat-figure text-accent">
            <Sparkles className="w-6 h-6 opacity-80" />
          </div>
          <div className="stat-title text-xs font-semibold">Observações</div>
          <div className="stat-value text-2xl text-accent">{status?.stats?.observations ?? 0}</div>
          <div className="stat-desc text-xs mt-1">Sanitizadas e indexadas</div>
        </div>

        <div className="stat bg-base-200/60 rounded-box p-4 border border-base-300">
          <div className="stat-figure text-info">
            <ArrowRightLeft className="w-6 h-6 opacity-80" />
          </div>
          <div className="stat-title text-xs font-semibold">Handoffs Abertos</div>
          <div className="stat-value text-2xl text-info">{handoffs.length}</div>
          <div className="stat-desc text-xs mt-1">Para as próximas sessões</div>
        </div>
      </div>

      {/* Navegação Secundária */}
      <div className="tabs tabs-box bg-base-200/50 p-1 rounded-box flex gap-1 border border-base-300">
        <button 
          onClick={() => setActiveTab('search')} 
          className={`tab flex items-center gap-2 ${activeTab === 'search' ? 'tab-active font-semibold' : ''}`}
        >
          <BookOpen className="w-4 h-4" />
          Explorar Wiki & Busca
        </button>
        <button 
          onClick={() => setActiveTab('briefing')} 
          className={`tab flex items-center gap-2 ${activeTab === 'briefing' ? 'tab-active font-semibold' : ''}`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          Briefing & Handoffs
        </button>
        <button 
          onClick={() => setActiveTab('write')} 
          className={`tab flex items-center gap-2 ${activeTab === 'write' ? 'tab-active font-semibold' : ''}`}
        >
          <PlusCircle className="w-4 h-4" />
          Nova Nota na Wiki
        </button>
      </div>

      {/* Conteúdo das Abas */}
      {activeTab === 'search' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-[500px]">
          {/* Coluna Esquerda: Busca e Lista de Páginas */}
          <div className="lg:col-span-4 flex flex-col space-y-4">
            <form onSubmit={handleSearch} className="relative">
              <input 
                type="text" 
                placeholder="Pesquisar memórias (FTS5 + semântico)..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input input-bordered w-full pr-10 text-sm"
              />
              <button 
                type="submit" 
                className="btn btn-ghost btn-sm btn-circle absolute right-1 top-1"
                disabled={searching}
              >
                <Search className={`w-4 h-4 ${searching ? 'animate-spin' : ''}`} />
              </button>
            </form>

            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">
                {searchQuery ? `Resultados (${searchResults.length})` : `Páginas Recentes (${recentPages.length})`}
              </span>
              {searchQuery && (
                <button 
                  onClick={() => { setSearchQuery(''); setSearchResults([]); }} 
                  className="text-xs link link-hover text-primary"
                >
                  Limpar busca
                </button>
              )}
            </div>

            <div className="overflow-y-auto space-y-2 max-h-[520px] pr-1">
              {(searchQuery ? searchResults : recentPages).map((item) => {
                const isSelected = selectedPage?.path === item.path;
                return (
                  <div 
                    key={item.path} 
                    onClick={() => loadPageContent(item.path)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-primary/10 border-primary text-primary-content shadow-sm' 
                        : 'bg-base-200/50 hover:bg-base-200 border-base-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-sm line-clamp-1">{item.title}</div>
                      {item.score !== undefined && (
                        <span className="badge badge-xs badge-ghost text-[10px]">
                          Rank {item.score.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-base-content/60 mt-0.5 font-mono line-clamp-1">
                      {item.path}
                    </div>
                    {item.snippet && (
                      <div 
                        className="text-xs text-base-content/70 mt-2 line-clamp-2 italic"
                        dangerouslySetInnerHTML={{ __html: item.snippet }}
                      />
                    )}
                  </div>
                );
              })}

              {(searchQuery ? searchResults : recentPages).length === 0 && (
                <div className="text-center py-10 text-base-content/50 text-sm">
                  {searchQuery ? 'Nenhum resultado encontrado.' : 'Nenhuma página wiki registrada ainda.'}
                </div>
              )}
            </div>
          </div>

          {/* Coluna Direita: Visualizador da Página Selecionada */}
          <div className="lg:col-span-8 bg-base-200/40 rounded-box border border-base-300 p-5 flex flex-col">
            {loadingPage ? (
              <div className="flex items-center justify-center h-full">
                <span className="loading loading-spinner loading-md text-primary"></span>
              </div>
            ) : selectedPage ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-base-300">
                  <div>
                    <h2 className="text-xl font-bold">{selectedPage.title}</h2>
                    <div className="flex items-center gap-3 text-xs text-base-content/60 font-mono mt-1">
                      <span>{selectedPage.path}</span>
                      {selectedPage.updatedAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(selectedPage.updatedAt).toLocaleString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="badge badge-outline text-xs">Markdown no Git</span>
                </div>

                <div className="prose prose-sm max-w-none text-base-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selectedPage.content}
                  </ReactMarkdown>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-base-content/50 py-16">
                <BookOpen className="w-12 h-12 mb-2 stroke-[1.5]" />
                <p className="text-sm">Selecione uma página ao lado para visualizar seu conteúdo.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Briefing & Handoffs */}
      {activeTab === 'briefing' && (
        <div className="space-y-6">
          {loadingBriefing ? (
            <div className="flex items-center justify-center py-12">
              <span className="loading loading-spinner loading-md text-primary"></span>
            </div>
          ) : (
            <>
              {/* Snapshot do Briefing */}
              <div className="card bg-base-200/50 border border-base-300 shadow-sm">
                <div className="card-body p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="card-title text-base flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      Snapshot de Briefing Automático
                    </h3>
                    <span className="badge badge-sm badge-outline">Escopo: {briefing?.scope?.workspace}/{briefing?.scope?.project}</span>
                  </div>
                  <p className="text-xs text-base-content/70">
                    Este é o briefing injetado nas sessões de IA para contextualização imediata sem consumo de tokens de raciocínio.
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                    <div className="p-3 bg-base-100 rounded-lg border border-base-300">
                      <div className="text-[11px] text-base-content/60 font-semibold uppercase">Atividade (7 dias)</div>
                      <div className="text-lg font-bold text-primary mt-1">{briefing?.activity_7d?.pages_updated ?? 0} edições</div>
                      <div className="text-[11px] text-base-content/50">{briefing?.activity_7d?.sessions ?? 0} sessões</div>
                    </div>
                    <div className="p-3 bg-base-100 rounded-lg border border-base-300">
                      <div className="text-[11px] text-base-content/60 font-semibold uppercase">Atividade (30 dias)</div>
                      <div className="text-lg font-bold text-secondary mt-1">{briefing?.activity_30d?.pages_updated ?? 0} edições</div>
                      <div className="text-[11px] text-base-content/50">{briefing?.activity_30d?.sessions ?? 0} sessões</div>
                    </div>
                    <div className="p-3 bg-base-100 rounded-lg border border-base-300">
                      <div className="text-[11px] text-base-content/60 font-semibold uppercase">Páginas Fixadas</div>
                      <div className="text-lg font-bold text-accent mt-1">{briefing?.pinned?.length ?? 0}</div>
                      <div className="text-[11px] text-base-content/50">Imunes ao esquecimento</div>
                    </div>
                    <div className="p-3 bg-base-100 rounded-lg border border-base-300">
                      <div className="text-[11px] text-base-content/60 font-semibold uppercase">Última Observação</div>
                      <div className="text-xs font-mono font-bold mt-2">
                        {briefing?.last_observation_at ? new Date(briefing.last_observation_at).toLocaleDateString('pt-BR') : 'Nenhuma'}
                      </div>
                    </div>
                  </div>

                  {briefing?.pinned && briefing.pinned.length > 0 && (
                    <div className="mt-4">
                      <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                        <Pin className="w-3.5 h-3.5 text-primary" />
                        Páginas Fixadas no Contexto:
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {briefing.pinned.map((p: any) => (
                          <span key={p.path} className="badge badge-sm badge-primary badge-outline gap-1">
                            {p.title || p.path}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Handoffs Entre Agentes */}
              <div className="card bg-base-200/50 border border-base-300 shadow-sm">
                <div className="card-body p-5">
                  <h3 className="card-title text-base flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4 text-info" />
                    Handoffs Entre Sessões e Agentes
                  </h3>
                  <p className="text-xs text-base-content/70">
                    Snapshots de transição gerados ao concluir trabalhos, para que o próximo agente retome o fluxo sem perda de contexto.
                  </p>

                  <div className="space-y-3 mt-3">
                    {handoffs.length > 0 ? (
                      handoffs.map((h) => (
                        <div key={h.id} className="p-4 bg-base-100 rounded-lg border border-base-300 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm">{h.title}</span>
                            <span className={`badge badge-xs ${h.status === 'open' ? 'badge-info' : 'badge-ghost'}`}>
                              {h.status}
                            </span>
                          </div>
                          <p className="text-xs text-base-content/80 whitespace-pre-line">{h.summary}</p>
                          <div className="text-[10px] text-base-content/50 font-mono">
                            {new Date(h.createdAt).toLocaleString('pt-BR')} • {h.authorAgent ? `De: ${h.authorAgent}` : 'Kraken'}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-sm text-base-content/50">
                        Nenhum handoff pendente no momento.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Formulário de Criação de Nota */}
      {activeTab === 'write' && (
        <div className="card bg-base-200/40 border border-base-300 shadow-sm max-w-3xl">
          <div className="card-body p-6">
            <h2 className="card-title text-lg flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-primary" />
              Adicionar Nova Página à Wiki de Memória
            </h2>
            <p className="text-xs text-base-content/70">
              A página será gravada e versionada automaticamente em Git no volume persistente do Homelab (`/DATA/AppData/ai-memory/wiki`).
            </p>

            <form onSubmit={handleSavePage} className="space-y-4 mt-4">
              {saveMessage && (
                <div className={`alert ${saveMessage.type === 'success' ? 'alert-success' : 'alert-error'} text-xs py-2`}>
                  <span>{saveMessage.text}</span>
                </div>
              )}

              <div>
                <label className="label text-xs font-semibold">Caminho da Página (Path relativo):</label>
                <input 
                  type="text" 
                  placeholder="ex: notes/regras-docker.md ou architecture/visao-geral.md" 
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  className="input input-bordered w-full font-mono text-sm"
                  required
                />
              </div>

              <div>
                <label className="label text-xs font-semibold">Conteúdo Markdown (Inicie com # Título):</label>
                <textarea 
                  rows={8}
                  placeholder="# Título da Nota&#10;&#10;Descreva as regras, decisões ou detalhes que devem ser lembrados..." 
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  className="textarea textarea-bordered w-full font-mono text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label text-xs font-semibold">Tags (separadas por vírgula):</label>
                  <input 
                    type="text" 
                    placeholder="ex: homelab, docker, regras, auth" 
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    className="input input-bordered w-full text-sm"
                  />
                </div>

                <div className="flex items-center gap-3 pt-6">
                  <label className="cursor-pointer label gap-2">
                    <input 
                      type="checkbox" 
                      checked={newPinned} 
                      onChange={(e) => setNewPinned(e.target.checked)} 
                      className="checkbox checkbox-primary checkbox-sm" 
                    />
                    <span className="label-text text-xs font-semibold flex items-center gap-1">
                      <Pin className="w-3.5 h-3.5" /> Fixar página (imune ao decay sweep)
                    </span>
                  </label>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button 
                  type="submit" 
                  disabled={savingPage}
                  className="btn btn-primary btn-sm gap-2"
                >
                  {savingPage ? <span className="loading loading-spinner loading-xs"></span> : <PlusCircle className="w-4 h-4" />}
                  Salvar na Wiki Git
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
