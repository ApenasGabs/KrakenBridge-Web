import { useMemo, useState } from 'react';
import type { ConversationSession, ProjectWorkspace, AuthStatus } from '../../types';
import { 
  Plus, 
  Search, 
  Trash2, 
  MessageSquare, 
  FolderGit2, 
  Clock, 
  X,
  KeyRound,
  Sparkles
} from 'lucide-react';
import { filterAndRankConversations, highlightMatches } from '../../utils/searchUtils';

interface SidebarProps {
  conversations: ConversationSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  projects: ProjectWorkspace[];
  selectedProject: string;
  onSelectProject: (proj: string) => void;
  isOpen: boolean;
  onClose: () => void;
  authStatus?: AuthStatus | null;
  onOpenAuth?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
  projects,
  selectedProject,
  onSelectProject,
  isOpen,
  onClose,
  authStatus,
  onOpenAuth
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const isSearching = searchTerm.trim().length > 0;

  // Conversas filtradas e ranqueadas por relevância no modo busca
  const rankedConversations = useMemo(() => {
    if (!isSearching) return [];
    return filterAndRankConversations(conversations, searchTerm);
  }, [conversations, searchTerm, isSearching]);

  // Agrupamento temporal para quando NÃO estiver em modo de busca
  const grouped = useMemo(() => {
    if (isSearching) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const groups: { label: string; items: ConversationSession[] }[] = [
      { label: 'Hoje', items: [] },
      { label: 'Ontem', items: [] },
      { label: 'Últimos 7 dias', items: [] },
      { label: 'Mais antigos', items: [] }
    ];

    conversations.forEach(c => {
      const date = new Date(c.updatedAt || c.createdAt);
      if (date >= today) {
        groups[0].items.push(c);
      } else if (date >= yesterday) {
        groups[1].items.push(c);
      } else if (date >= lastWeek) {
        groups[2].items.push(c);
      } else {
        groups[3].items.push(c);
      }
    });

    return groups.filter(g => g.items.length > 0);
  }, [conversations, isSearching]);

  return (
    <>
      {/* Backdrop para mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed lg:static top-0 left-0 z-40
        h-[100dvh] lg:h-full bg-base-100 border-r border-base-300
        flex flex-col transition-all duration-300 ease-in-out shrink-0
        ${isOpen ? 'w-[85vw] sm:w-80 max-w-80 translate-x-0 shadow-2xl lg:shadow-none' : '-translate-x-full lg:w-0 lg:border-none lg:overflow-hidden'}
      `}>
        {/* Cabeçalho da Sidebar */}
        <div className="p-4 border-b border-base-300 flex items-center justify-between">
          <button
            onClick={onNewChat}
            className="btn btn-primary btn-sm flex-1 gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Conversa</span>
          </button>
          <button 
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-square lg:hidden ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Campo de Busca */}
        <div className="px-4 py-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-base-content/40" />
            <input
              type="text"
              placeholder="Buscar por título, tag ou assunto falado..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input input-sm input-bordered w-full pl-9 pr-8 bg-base-200/50"
            />
            {isSearching && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="btn btn-ghost btn-xs btn-circle absolute right-1.5 top-1.5 h-6 w-6 text-base-content/50 hover:text-base-content"
                title="Limpar busca"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Lista de Histórico */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
          {isSearching ? (
            /* Modo de Busca Ativa: Lista Ordenada por Relevância Ponderada */
            rankedConversations.length === 0 ? (
              <div className="text-center py-8 text-base-content/50 text-sm px-4">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Nenhuma conversa encontrada para <span className="font-semibold text-base-content/80 font-mono">"{searchTerm}"</span></p>
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="btn btn-ghost btn-xs text-primary mt-2"
                >
                  Limpar busca
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="px-3 text-xs font-semibold text-primary uppercase tracking-wider flex items-center justify-between pt-2">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-primary animate-pulse" />
                    Resultados ({rankedConversations.length})
                  </span>
                  <span className="badge badge-primary/15 text-primary badge-xs text-[9px] font-mono border-primary/25">
                    Por Relevância
                  </span>
                </div>
                {rankedConversations.map(item => {
                  const isActive = item.id === activeId;
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        onSelect(item.id);
                        if (window.innerWidth < 1024) onClose();
                      }}
                      className={`
                        group flex items-start justify-between px-3 py-2 rounded-lg cursor-pointer
                        transition-all text-sm
                        ${isActive 
                          ? 'bg-primary/10 text-primary font-medium border-l-4 border-primary' 
                          : 'hover:bg-base-200 text-base-content/80'
                        }
                      `}
                    >
                      <div className="flex flex-col min-w-0 flex-1 gap-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <MessageSquare className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${isActive ? 'text-primary' : 'text-base-content/40'}`} />
                          <span className="truncate">
                            {highlightMatches(item.title || 'Conversa sem título', searchTerm)}
                          </span>
                          {item.isRunning && (
                            <span className="relative flex h-2 w-2 shrink-0 ml-1" title="Executando em segundo plano">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                            </span>
                          )}
                        </div>

                        {/* Snippet Contextual com Trecho Falado */}
                        {item.matchedSnippet && (
                          <div className="text-[11px] text-base-content/70 bg-base-200/90 rounded px-2 py-1 ml-5 border-l-2 border-primary/60 line-clamp-2 font-sans">
                            <span className="opacity-60 mr-1 text-[10px]">💬</span>
                            {highlightMatches(item.matchedSnippet, searchTerm)}
                          </div>
                        )}

                        {((item.tags && item.tags.length > 0) || item.subproject) && (
                          <div className="flex items-center gap-1 overflow-x-hidden pl-5 flex-wrap">
                            {item.subproject && (
                              <span className="badge badge-ghost badge-xs text-[9px] opacity-70 shrink-0 font-mono border-base-300">
                                {highlightMatches(item.subproject, searchTerm)}
                              </span>
                            )}
                            {item.tags?.slice(0, 3).map(tag => (
                              <span key={tag} className="badge badge-primary/15 text-primary border-primary/25 badge-xs text-[8.5px] font-mono shrink-0">
                                #{highlightMatches(tag, searchTerm)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Deseja excluir esta conversa?')) {
                            onDelete(item.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 hover:text-error transition-opacity p-1 rounded shrink-0 ml-1 mt-0.5"
                        title="Excluir conversa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* Modo Padrão: Agrupamento Temporal */
            grouped.length === 0 ? (
              <div className="text-center py-8 text-base-content/50 text-sm">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nenhuma conversa encontrada
              </div>
            ) : (
              grouped.map(group => (
                <div key={group.label} className="space-y-1">
                  <div className="px-3 text-xs font-semibold text-base-content/50 uppercase tracking-wider flex items-center gap-1.5 pt-2">
                    <Clock className="w-3 h-3" />
                    {group.label}
                  </div>
                  {group.items.map(item => {
                    const isActive = item.id === activeId;
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          onSelect(item.id);
                          if (window.innerWidth < 1024) onClose();
                        }}
                        className={`
                          group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer
                          transition-all text-sm
                          ${isActive 
                            ? 'bg-primary/10 text-primary font-medium border-l-4 border-primary' 
                            : 'hover:bg-base-200 text-base-content/80'
                          }
                        `}
                      >
                        <div className="flex flex-col min-w-0 flex-1 gap-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-base-content/40'}`} />
                            <span className="truncate">{item.title || 'Conversa sem título'}</span>
                            {item.isRunning && (
                              <span className="relative flex h-2 w-2 shrink-0 ml-1" title="Executando em segundo plano">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                              </span>
                            )}
                          </div>
                          {((item.tags && item.tags.length > 0) || item.subproject) && (
                            <div className="flex items-center gap-1 overflow-x-hidden pl-5 flex-wrap">
                              {item.subproject && (
                                <span className="badge badge-ghost badge-xs text-[9px] opacity-70 shrink-0 font-mono border-base-300">
                                  {item.subproject}
                                </span>
                              )}
                              {item.tags?.slice(0, 3).map(tag => (
                                <span key={tag} className="badge badge-primary/15 text-primary border-primary/25 badge-xs text-[8.5px] font-mono shrink-0">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Deseja excluir esta conversa?')) {
                              onDelete(item.id);
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 hover:text-error transition-opacity p-1 rounded"
                          title="Excluir conversa"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))
            )
          )}
        </div>

        {/* Seletor de Workspace / Subprojeto */}
        <div className="p-3 border-t border-base-300 bg-base-200/40">
          <label className="text-xs font-medium text-base-content/60 flex items-center gap-1.5 mb-1.5">
            <FolderGit2 className="w-3.5 h-3.5 text-primary" />
            Workspace Ativo
          </label>
          <select
            value={selectedProject}
            onChange={(e) => onSelectProject(e.target.value)}
            className="select select-bordered select-xs w-full bg-base-100"
          >
            <option value="">Raiz (/workspace)</option>
            {projects.map(proj => (
              <option key={proj.name} value={proj.name}>
                {proj.name} {proj.isGit ? '(git)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Gerenciador de Conta no Rodapé da Sidebar (Acesso rápido no Mobile) */}
        {onOpenAuth && (
          <div className="p-3 border-t border-base-300 bg-base-200/60">
            <div 
              onClick={() => { onOpenAuth(); if (window.innerWidth < 1024) onClose(); }}
              className="p-2 rounded-xl bg-base-100 border border-base-300 hover:border-primary/50 transition-all cursor-pointer flex items-center justify-between gap-2 group shadow-sm active:scale-95"
              title="Clique para alternar ou gerenciar contas do Google"
            >
              <div className="flex items-center gap-2 min-w-0">
                {authStatus?.picture ? (
                  <img src={authStatus.picture} alt="" className="w-7 h-7 rounded-full shrink-0 border border-base-300" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                    <KeyRound className="w-3.5 h-3.5" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-base-content truncate flex items-center gap-1">
                    <span>{authStatus?.email ? authStatus.email.split('@')[0] : 'Conta Google'}</span>
                    <span className="badge badge-xs badge-success">Online</span>
                  </div>
                  <div className="text-[10px] text-base-content/50 font-mono truncate">
                    {authStatus?.email || 'Nenhuma conta'}
                  </div>
                </div>
              </div>
              <button 
                className="btn btn-xs btn-outline btn-primary shrink-0 group-hover:btn-active text-[10px] px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenAuth();
                  if (window.innerWidth < 1024) onClose();
                }}
              >
                Trocar
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
