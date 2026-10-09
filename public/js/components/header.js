import { state } from '../state.js';
import { icons } from '../icons.js';

export class HeaderComponent {
  constructor(headerEl, { onOpenAuth, onOpenIdeExternal, onNewSession }) {
    this.headerEl = headerEl;
    this.onOpenAuth = onOpenAuth;
    this.onOpenIdeExternal = onOpenIdeExternal;
    this.onNewSession = onNewSession;

    state.subscribe((key) => {
      if (['viewMode', 'currentAgent', 'authStatus', 'config', 'sidebarOpen'].includes(key)) {
        this.render();
      }
    });

    this.render();
  }

  render() {
    const viewMode = state.get('viewMode');
    const agent = state.get('currentAgent');
    const auth = state.get('authStatus') || {};
    const isAgyAuth = auth.antigravity && auth.antigravity.authenticated;
    const config = state.get('config') || {};
    const sidebarOpen = state.get('sidebarOpen');

    this.headerEl.className = 'h-13 bg-[#14161d] border-b border-[#272a34] px-3 md:px-4 flex items-center justify-between flex-shrink-0 z-30 select-none';

    this.headerEl.innerHTML = `
      <!-- Esquerda: Toggle Sidebar + Logo + Workspace -->
      <div class="flex items-center gap-2.5">
        <button id="btn-toggle-sidebar" title="${sidebarOpen ? 'Ocultar Histórico' : 'Mostrar Histórico'}" class="p-1.5 rounded-lg hover:bg-[#20232e] text-gray-400 hover:text-white transition-colors">
          ${icons.sidebar(16)}
        </button>

        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            ${icons.logo(15)}
          </div>
          <div>
            <div class="font-semibold text-xs text-white flex items-center gap-1.5">
              <span>KrakenBridge Web</span>
              <span class="px-1.5 py-0.2 rounded text-[9px] bg-sky-950/50 text-sky-400 border border-sky-800/40 font-mono">v1.0</span>
            </div>
            <div class="text-[10px] text-gray-500 font-mono truncate max-w-[140px] md:max-w-xs">
              ${config.workspaceDir || '/workspace'}
            </div>
          </div>
        </div>
      </div>

      <!-- Centro: Modo Agente vs IDE -->
      <div class="flex items-center bg-[#0d0e12] p-0.5 rounded-lg border border-[#272a34]">
        <button id="btn-tab-agent" class="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
          viewMode === 'agent' ? 'bg-[#22252f] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
        }">
          ${icons.bot(13)}
          <span>Agente</span>
        </button>
        <button id="btn-tab-ide" class="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
          viewMode === 'ide' ? 'bg-[#22252f] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
        }">
          ${icons.code(13)}
          <span>IDE</span>
        </button>
      </div>

      <!-- Direita: Seletor de Motor, Autenticação, Nova Aba, Limpar -->
      <div class="flex items-center gap-1.5 md:gap-2">
        <!-- Seletor de Motor -->
        <select id="header-agent-select" class="bg-[#1a1c24] text-xs text-gray-200 border border-[#2d3242] rounded-lg px-2 py-1 outline-none hover:bg-[#22252f] transition-colors cursor-pointer font-sans">
          <option value="antigravity" ${agent === 'antigravity' ? 'selected' : ''}>Google Antigravity</option>
          <option value="claude" ${agent === 'claude' ? 'selected' : ''}>Claude Code</option>
          <option value="aider" ${agent === 'aider' ? 'selected' : ''}>Codex / Aider</option>
        </select>

        <!-- Botão Autenticação -->
        <button id="header-btn-auth" title="Central de Autenticação" class="px-2.5 py-1 rounded-lg bg-[#1a1c24] hover:bg-[#22252f] text-gray-300 hover:text-white border border-[#2d3242] text-xs flex items-center gap-1.5 transition-colors">
          <span class="w-2 h-2 rounded-full ${isAgyAuth ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}"></span>
          <span class="hidden sm:inline">Autenticação</span>
        </button>

        <!-- Abrir IDE em nova aba -->
        <button id="header-btn-ide-ext" title="Abrir VS Code em Nova Aba" class="p-1.5 rounded-lg bg-[#1a1c24] hover:bg-[#22252f] text-gray-400 hover:text-white border border-[#2d3242] text-xs flex items-center gap-1 transition-colors">
          ${icons.external(14)}
        </button>

        <!-- Limpar / Novo Chat -->
        <button id="header-btn-new-chat" title="Nova Sessão" class="p-1.5 rounded-lg bg-[#1a1c24] hover:bg-[#22252f] text-gray-400 hover:text-white border border-[#2d3242] text-xs flex items-center gap-1 transition-colors">
          ${icons.plus(14)}
        </button>
      </div>
    `;

    // Eventos
    this.headerEl.querySelector('#btn-toggle-sidebar').onclick = () => {
      state.set('sidebarOpen', !state.get('sidebarOpen'));
    };

    this.headerEl.querySelector('#btn-tab-agent').onclick = () => {
      state.set('viewMode', 'agent');
    };

    this.headerEl.querySelector('#btn-tab-ide').onclick = () => {
      state.set('viewMode', 'ide');
    };

    this.headerEl.querySelector('#header-agent-select').onchange = (e) => {
      state.set('currentAgent', e.target.value);
    };

    this.headerEl.querySelector('#header-btn-auth').onclick = () => {
      if (this.onOpenAuth) this.onOpenAuth();
    };

    this.headerEl.querySelector('#header-btn-ide-ext').onclick = () => {
      if (this.onOpenIdeExternal) this.onOpenIdeExternal();
    };

    this.headerEl.querySelector('#header-btn-new-chat').onclick = () => {
      if (this.onNewSession) this.onNewSession();
    };
  }
}
