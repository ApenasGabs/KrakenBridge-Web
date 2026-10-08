import { useMemo, useState } from 'react';
import type { ConversationSession, ProjectWorkspace } from '../../types';
import { 
  Plus, 
  Search, 
  Trash2, 
  MessageSquare, 
  FolderGit2, 
  Clock, 
  X
} from 'lucide-react';

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
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredConversations = useMemo(() => {
    if (!searchTerm.trim()) return conversations;
    const term = searchTerm.toLowerCase();
    return conversations.filter(c => 
      c.title.toLowerCase().includes(term) ||
      (c.lastMessageSnippet && c.lastMessageSnippet.toLowerCase().includes(term))
    );
  }, [conversations, searchTerm]);

  // Agrupamento temporal
  const grouped = useMemo(() => {
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

    filteredConversations.forEach(c => {
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
  }, [filteredConversations]);

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
        w-80 h-full bg-base-100 border-r border-base-300
        flex flex-col transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
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
              placeholder="Buscar conversas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input input-sm input-bordered w-full pl-9 bg-base-200/50"
            />
          </div>
        </div>

        {/* Lista de Histórico */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
          {filteredConversations.length === 0 ? (
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
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <MessageSquare className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-base-content/40'}`} />
                        <span className="truncate">{item.title || 'Conversa sem título'}</span>
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
      </aside>
    </>
  );
};
