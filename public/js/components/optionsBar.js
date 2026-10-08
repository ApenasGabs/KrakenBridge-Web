import { state } from '../state.js';
import { icons } from '../icons.js';

export class OptionsBarComponent {
  constructor(containerEl) {
    this.container = containerEl;

    state.subscribe((key) => {
      if (['currentAgent', 'currentModel', 'currentEffort', 'currentMode', 'currentSubproject', 'models', 'projects', 'optionsOpen', 'skipPermissions', 'sandbox', 'disableSlashCommands'].includes(key)) {
        this.render();
      }
    });

    this.render();
  }

  render() {
    const agent = state.get('currentAgent');
    const model = state.get('currentModel');
    const effort = state.get('currentEffort');
    const mode = state.get('currentMode');
    const subproject = state.get('currentSubproject');
    const skipPerm = state.get('skipPermissions');
    const sandbox = state.get('sandbox');
    const disableSlash = state.get('disableSlashCommands');
    const isOpen = state.get('optionsOpen');

    const modelsList = state.get('models')[agent] || [];
    const projectsList = state.get('projects') || [];

    // Barra compacta quando fechada
    if (!isOpen) {
      this.container.innerHTML = `
        <div class="px-4 py-2 border-b border-[#272a34]/60 bg-[#12141a]/90 flex items-center justify-between text-xs select-none">
          <div class="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            <span class="text-gray-500 flex items-center gap-1">
              ${icons.sliders(13)}
              <span class="hidden sm:inline">Opções CLI:</span>
            </span>

            <!-- Badge Modelo -->
            <span class="px-2 py-0.5 rounded bg-[#1e222d] border border-[#2d3242] text-gray-300 font-mono text-[11px] flex items-center gap-1">
              <span class="text-gray-500">model:</span>
              <span class="text-sky-300">${this.escape(model || 'default')}</span>
            </span>

            <!-- Badge Esforço (se Antigravity) -->
            ${agent === 'antigravity' ? `
            <span class="px-2 py-0.5 rounded bg-[#1e222d] border border-[#2d3242] text-gray-300 font-mono text-[11px] flex items-center gap-1">
              <span class="text-gray-500">effort:</span>
              <span class="text-amber-300">${effort}</span>
            </span>` : ''}

            <!-- Badge Modo -->
            ${mode !== 'default' ? `
            <span class="px-2 py-0.5 rounded bg-[#1e222d] border border-[#2d3242] text-purple-300 font-mono text-[11px]">
              mode: ${mode}
            </span>` : ''}

            <!-- Badge Subprojeto -->
            ${subproject ? `
            <span class="px-2 py-0.5 rounded bg-[#1e222d] border border-[#2d3242] text-emerald-300 font-mono text-[11px] flex items-center gap-1">
              ${icons.folder(11)}
              ${this.escape(subproject)}
            </span>` : ''}
          </div>

          <button id="btn-toggle-options" class="px-2.5 py-1 rounded bg-[#1c1f28] hover:bg-[#252936] text-gray-300 hover:text-white border border-[#2d3242] text-xs flex items-center gap-1 flex-shrink-0 transition-colors">
            <span>Configurar</span>
            <span class="text-gray-500">▼</span>
          </button>
        </div>
      `;

      this.container.querySelector('#btn-toggle-options').onclick = () => {
        state.set('optionsOpen', true);
      };
      return;
    }

    // Painel expandido com todas as opções avançadas do terminal
    this.container.innerHTML = `
      <div class="p-3.5 border-b border-[#272a34] bg-[#14161d] text-xs select-none space-y-3">
        <div class="flex items-center justify-between border-b border-[#272a34]/60 pb-2">
          <div class="font-semibold text-gray-200 flex items-center gap-2">
            ${icons.sliders(14)}
            <span>Parâmetros de Execução do Terminal CLI</span>
          </div>
          <button id="btn-close-options" class="p-1 text-gray-400 hover:text-white rounded hover:bg-[#20232e]">
            ${icons.x(14)}
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <!-- Opção 1: Modelo do Agente -->
          <div>
            <label class="block text-[11px] font-medium text-gray-400 mb-1 flex items-center gap-1">
              ${icons.cpu(12)}
              <span>Modelo (--model)</span>
            </label>
            <select id="opt-model" class="w-full bg-[#0d0e12] border border-[#272a34] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-sky-500 font-mono">
              ${modelsList.map(m => `
                <option value="${m.id}" ${m.id === model ? 'selected' : ''}>${this.escape(m.name || m.id)}</option>
              `).join('')}
              ${modelsList.length === 0 ? `<option value="${model}">${model || 'Padrão do motor'}</option>` : ''}
            </select>
          </div>

          <!-- Opção 2: Esforço de Raciocínio (para agy) -->
          <div>
            <label class="block text-[11px] font-medium text-gray-400 mb-1">
              Esforço de Raciocínio (--effort)
            </label>
            <select id="opt-effort" class="w-full bg-[#0d0e12] border border-[#272a34] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-sky-500 font-sans" ${agent !== 'antigravity' ? 'disabled' : ''}>
              <option value="low" ${effort === 'low' ? 'selected' : ''}>Baixo (Mais rápido)</option>
              <option value="medium" ${effort === 'medium' ? 'selected' : ''}>Médio</option>
              <option value="high" ${effort === 'high' ? 'selected' : ''}>Alto (Recomendado)</option>
              <option value="xhigh" ${effort === 'xhigh' ? 'selected' : ''}>Extra Alto</option>
              <option value="max" ${effort === 'max' ? 'selected' : ''}>Máximo (Deep Thinking)</option>
            </select>
          </div>

          <!-- Opção 3: Modo de Execução -->
          <div>
            <label class="block text-[11px] font-medium text-gray-400 mb-1">
              Modo de Ação (--mode)
            </label>
            <select id="opt-mode" class="w-full bg-[#0d0e12] border border-[#272a34] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-sky-500 font-sans">
              <option value="default" ${mode === 'default' ? 'selected' : ''}>Padrão (Executa e edita)</option>
              <option value="plan" ${mode === 'plan' ? 'selected' : ''}>Modo Planejamento (--plan)</option>
              <option value="accept-edits" ${mode === 'accept-edits' ? 'selected' : ''}>Aceitar Edições Diretas</option>
            </select>
          </div>

          <!-- Opção 4: Subprojeto de Foco -->
          <div>
            <label class="block text-[11px] font-medium text-gray-400 mb-1 flex items-center gap-1">
              ${icons.folder(12)}
              <span>Foco no Projeto (Cwd)</span>
            </label>
            <select id="opt-subproject" class="w-full bg-[#0d0e12] border border-[#272a34] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-sky-500 font-sans">
              <option value="">Raiz do Workspace (/workspace)</option>
              ${projectsList.map(p => `
                <option value="${p.name}" ${p.name === subproject ? 'selected' : ''}>${this.escape(p.name)}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- Toggles de Segurança e Comportamento -->
        <div class="flex flex-wrap items-center gap-4 pt-1 text-xs border-t border-[#272a34]/40">
          <label class="flex items-center gap-2 cursor-pointer text-gray-300 hover:text-white">
            <input id="opt-skip-perm" type="checkbox" ${skipPerm ? 'checked' : ''} class="rounded bg-[#0d0e12] border-[#272a34] text-sky-500 focus:ring-0">
            <span>Aprovar Ferramentas Auto (--dangerously-skip-permissions)</span>
          </label>

          <label class="flex items-center gap-2 cursor-pointer text-gray-300 hover:text-white">
            <input id="opt-sandbox" type="checkbox" ${sandbox ? 'checked' : ''} class="rounded bg-[#0d0e12] border-[#272a34] text-sky-500 focus:ring-0">
            <span>Sandbox Restrito (--sandbox)</span>
          </label>

          <label class="flex items-center gap-2 cursor-pointer text-gray-300 hover:text-white">
            <input id="opt-disable-slash" type="checkbox" ${disableSlash ? 'checked' : ''} class="rounded bg-[#0d0e12] border-[#272a34] text-sky-500 focus:ring-0">
            <span>Desativar Slash Commands (--disable-slash-commands)</span>
          </label>
        </div>
      </div>
    `;

    // Eventos
    this.container.querySelector('#btn-close-options').onclick = () => {
      state.set('optionsOpen', false);
    };

    this.container.querySelector('#opt-model').onchange = (e) => {
      state.set('currentModel', e.target.value);
    };

    this.container.querySelector('#opt-effort').onchange = (e) => {
      state.set('currentEffort', e.target.value);
    };

    this.container.querySelector('#opt-mode').onchange = (e) => {
      state.set('currentMode', e.target.value);
    };

    this.container.querySelector('#opt-subproject').onchange = (e) => {
      state.set('currentSubproject', e.target.value);
    };

    this.container.querySelector('#opt-skip-perm').onchange = (e) => {
      state.set('skipPermissions', e.target.checked);
    };

    this.container.querySelector('#opt-sandbox').onchange = (e) => {
      state.set('sandbox', e.target.checked);
    };

    this.container.querySelector('#opt-disable-slash').onchange = (e) => {
      state.set('disableSlashCommands', e.target.checked);
    };
  }

  escape(t) {
    const d = document.createElement('div');
    d.textContent = t || '';
    return d.innerHTML;
  }
}
