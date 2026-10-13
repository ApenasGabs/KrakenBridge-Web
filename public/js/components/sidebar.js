import { state } from '../state.js';
import { api } from '../api.js';
import { icons } from '../icons.js';

export class SidebarComponent {
  constructor(containerEl, onSelectConversation, onNewConversation) {
    this.container = containerEl;
    this.onSelectConversation = onSelectConversation;
    this.onNewConversation = onNewConversation;
    this.searchQuery = '';

    state.subscribe((key) => {
      if (key === 'conversations' || key === 'activeConversationId' || key === 'sidebarOpen') {
        this.render();
      }
    });

    this.render();
    this.loadConversations();
  }

  async loadConversations() {
    try {
      const list = await api.getConversations();
      state.set('conversations', list);
    } catch (err) {
      console.warn('Erro ao carregar conversas:', err);
    }
  }

  groupConversations(list) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const groups = {
      'Hoje': [],
      'Ontem': [],
      'Últimos 7 dias': [],
      'Mais antigas': []
    };

    for (const item of list) {
      if (this.searchQuery && !item.title.toLowerCase().includes(this.searchQuery.toLowerCase())) {
        continue;
      }
      const itemDate = new Date(item.updatedAt || item.createdAt);
      if (itemDate >= today) {
        groups['Hoje'].push(item);
      } else if (itemDate >= yesterday) {
        groups['Ontem'].push(item);
      } else if (itemDate >= lastWeek) {
        groups['Últimos 7 dias'].push(item);
      } else {
        groups['Mais antigas'].push(item);
      }
    }

    return groups;
  }

  render() {
    const isOpen = state.get('sidebarOpen');
    const activeId = state.get('activeConversationId');
    const conversations = state.get('conversations') || [];

    if (!isOpen) {
      this.container.className = 'w-0 overflow-hidden border-r border-[#272a34] bg-[#14161d] transition-sidebar flex-shrink-0';
      this.container.innerHTML = '';
      return;
    }

    this.container.className = 'w-64 md:w-72 border-r border-[#272a34] bg-[#14161d] flex flex-col flex-shrink-0 transition-sidebar h-full select-none z-20';

    const groups = this.groupConversations(conversations);

    let listHtml = '';
    let totalRendered = 0;

    for (const [groupName, items] of Object.entries(groups)) {
      if (items.length === 0) continue;
      totalRendered += items.length;
      listHtml += `
        <div class="px-3 pt-3 pb-1">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-gray-500">${groupName}</div>
        </div>
      `;

      for (const item of items) {
        const isActive = item.id === activeId;
        const agentBadge = item.agent === 'claude' ? 'Claude' : (item.agent === 'aider' ? 'Aider' : 'Agy');
        const badgeColor = item.agent === 'claude' ? 'text-purple-400 bg-purple-950/40 border-purple-800/40' : (item.agent === 'aider' ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40' : 'text-sky-400 bg-sky-950/40 border-sky-800/40');

        listHtml += `
          <div data-id="${item.id}" class="conv-item group mx-2 my-0.5 px-2.5 py-2 rounded-lg cursor-pointer flex items-center justify-between text-xs transition-colors ${
            isActive ? 'bg-[#22252f] text-white font-medium border border-[#323644]' : 'text-gray-300 hover:bg-[#1a1c24] hover:text-white border border-transparent'
          }">
            <div class="flex items-center gap-2 truncate flex-1 min-w-0 pr-1">
              <span class="text-gray-500 flex-shrink-0">${icons.message(13)}</span>
              <span class="truncate">${this.escape(item.title)}</span>
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <span class="text-[9px] px-1 py-0.2 rounded border font-mono ${badgeColor}">${agentBadge}</span>
              <button data-delete="${item.id}" title="Excluir conversa" class="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-gray-500 rounded transition-opacity">
                ${icons.trash(12)}
              </button>
            </div>
          </div>
        `;
      }
    }

    if (totalRendered === 0) {
      listHtml = `
        <div class="px-4 py-8 text-center text-xs text-gray-500">
          ${this.searchQuery ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa no histórico'}
        </div>
      `;
    }

    this.container.innerHTML = `
      <!-- Topo da Sidebar: Nova Conversa -->
      <div class="p-3 border-b border-[#272a34]/80 space-y-2">
        <div class="flex items-center justify-between">
          <div class="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
            ${icons.history(14)}
            <span>Histórico de Sessões</span>
          </div>
          <button id="btn-close-sidebar" class="md:hidden text-gray-400 hover:text-white p-1">
            ${icons.x(14)}
          </button>
        </div>
        <button id="btn-new-chat" class="w-full py-2 px-3 rounded-lg bg-[#22252f] hover:bg-[#2b2f3b] border border-[#323644] text-xs font-medium text-white flex items-center justify-center gap-2 transition-colors">
          ${icons.plus(14)}
          <span>Nova Conversa</span>
        </button>
        <div class="relative">
          <input id="input-search-conv" type="text" value="${this.escape(this.searchQuery)}" placeholder="Buscar conversas..." class="w-full bg-[#0d0e12] border border-[#272a34] rounded-lg pl-7 pr-2 py-1.5 text-xs text-gray-200 outline-none focus:border-sky-500 font-sans">
          <span class="absolute left-2 top-2 text-gray-500">${icons.search(12)}</span>
        </div>
      </div>

      <!-- Lista de Conversas -->
      <div class="flex-1 overflow-y-auto custom-scroll py-1">
        ${listHtml}
      </div>

      <!-- Rodapé da Sidebar: Info de Armazenamento -->
      <div class="p-2.5 border-t border-[#272a34]/80 text-[11px] text-gray-500 flex items-center justify-between">
        <span>${conversations.length} conversas salvas</span>
        <button id="btn-refresh-history" title="Atualizar" class="hover:text-gray-300 p-1">
          ${icons.terminal(12)}
        </button>
      </div>
    `;

    // Eventos
    const newChatBtn = this.container.querySelector('#btn-new-chat');
    if (newChatBtn) {
      newChatBtn.onclick = () => {
        if (this.onNewConversation) this.onNewConversation();
      };
    }

    const searchInput = this.container.querySelector('#input-search-conv');
    if (searchInput) {
      searchInput.oninput = (e) => {
        this.searchQuery = e.target.value;
        this.render();
      };
    }

    const refreshBtn = this.container.querySelector('#btn-refresh-history');
    if (refreshBtn) {
      refreshBtn.onclick = () => this.loadConversations();
    }

    const closeBtn = this.container.querySelector('#btn-close-sidebar');
    if (closeBtn) {
      closeBtn.onclick = () => state.set('sidebarOpen', false);
    }

    this.container.querySelectorAll('.conv-item').forEach((el) => {
      el.onclick = (e) => {
        if (e.target.closest('button[data-delete]')) return;
        const id = el.getAttribute('data-id');
        if (id && this.onSelectConversation) {
          this.onSelectConversation(id);
        }
      };
    });

    this.container.querySelectorAll('button[data-delete]').forEach((btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-delete');
        if (confirm('Deseja excluir esta conversa do histórico?')) {
          await api.deleteConversation(id);
          const current = state.get('activeConversationId');
          if (current === id) {
            state.set('activeConversationId', null);
            if (this.onNewConversation) this.onNewConversation();
          }
          this.loadConversations();
        }
      };
    });
  }

  escape(t) {
    const d = document.createElement('div');
    d.textContent = t || '';
    return d.innerHTML;
  }
}
