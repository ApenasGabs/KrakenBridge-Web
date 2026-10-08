import { state } from '../state.js';
import { api } from '../api.js';
import { icons } from '../icons.js';

export class AuthModalComponent {
  constructor(modalEl) {
    this.modalEl = modalEl;
    this.activeTab = 'agy'; // 'agy' | 'keys'
    this.isOpen = false;

    state.subscribe((key) => {
      if (key === 'authStatus' && this.isOpen) {
        this.render();
      }
    });

    this.checkStatus();
  }

  async checkStatus() {
    try {
      const data = await api.getAuthStatus();
      state.set('authStatus', data);
    } catch (e) {
      console.warn('Erro ao verificar status de auth:', e);
    }
  }

  open() {
    this.isOpen = true;
    this.modalEl.classList.remove('hidden');
    this.checkStatus();
    this.render();
  }

  close() {
    this.isOpen = false;
    this.modalEl.classList.add('hidden');
  }

  render() {
    if (!this.isOpen) return;

    const auth = state.get('authStatus') || {};
    const isAgyAuth = auth.antigravity && auth.antigravity.authenticated;
    const hasClaude = auth.claude && auth.claude.hasKey;
    const hasAider = auth.aider && auth.aider.hasKey;

    this.modalEl.innerHTML = `
      <div class="max-w-md w-full bg-[#181a20] border border-[#2d3242] rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto custom-scroll select-none">
        <!-- Topo -->
        <div class="flex items-center justify-between border-b border-[#272a34] pb-3">
          <div class="flex items-center gap-2 text-white font-semibold text-sm">
            ${icons.key(16)}
            <span>Central de Autenticação</span>
          </div>
          <button id="btn-modal-close" class="p-1 rounded-lg hover:bg-[#22252f] text-gray-400 hover:text-white transition-colors">
            ${icons.x(14)}
          </button>
        </div>

        <!-- Abas -->
        <div class="flex border-b border-[#272a34] text-xs">
          <button id="tab-auth-agy" class="flex-1 py-2 font-medium text-center transition-colors border-b-2 ${
            this.activeTab === 'agy' ? 'border-sky-400 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
          }">
            Google Antigravity
          </button>
          <button id="tab-auth-keys" class="flex-1 py-2 font-medium text-center transition-colors border-b-2 ${
            this.activeTab === 'keys' ? 'border-sky-400 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
          }">
            Chaves de API (Claude & OpenAI)
          </button>
        </div>

        <!-- Conteúdo Aba 1: Google Antigravity -->
        ${this.activeTab === 'agy' ? `
          <div class="space-y-4 pt-1 text-xs">
            <!-- Status Badge -->
            <div class="flex items-center justify-between p-3 rounded-xl bg-[#0f1115] border border-[#272a34]">
              <span class="text-gray-400">Status da Sessão:</span>
              <span class="font-medium px-2 py-0.5 rounded text-[11px] ${
                isAgyAuth ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/40' : 'bg-amber-950/40 text-amber-300 border border-amber-800/40'
              }">
                ${isAgyAuth ? 'Conectado' : 'Não Autenticado'}
              </span>
            </div>

            <!-- Passo 1 -->
            <div class="space-y-2">
              <label class="block font-medium text-gray-300">1. Iniciar Sessão de Login:</label>
              <button id="btn-start-google-auth" class="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-medium shadow-md transition-all flex items-center justify-center gap-2">
                ${icons.external(14)}
                <span>Iniciar Login Google</span>
              </button>
            </div>

            <!-- Passo 2 & 3 (Oculto até iniciar) -->
            <div id="agy-step2" class="space-y-3 pt-2 border-t border-[#272a34] hidden">
              <div>
                <label class="block font-medium text-gray-300 mb-1">2. Autorizar Conta:</label>
                <a id="agy-link" href="#" target="_blank" class="w-full py-2 px-3 rounded-lg bg-[#0f1115] hover:bg-[#1e222d] border border-sky-500/40 text-sky-300 flex items-center justify-between font-mono text-[11px] transition-colors">
                  <span>Abrir página de autorização</span>
                  ${icons.external(12)}
                </a>
                <p class="text-[11px] text-gray-400 mt-1">Abra o link, autorize sua conta Google e copie o código retornado.</p>
              </div>

              <div>
                <label class="block font-medium text-gray-300 mb-1">3. Código de Autorização:</label>
                <input id="agy-code-input" type="text" placeholder="Cole o código retornado aqui..." class="w-full bg-[#0d0e12] border border-[#272a34] rounded-lg px-3 py-2 text-white outline-none focus:border-sky-500 font-mono text-xs">
              </div>

              <button id="btn-submit-agy-code" class="w-full py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow transition-colors flex items-center justify-center gap-2">
                ${icons.check(14)}
                <span>Concluir Login</span>
              </button>
            </div>

            <div id="agy-feedback" class="text-xs font-mono p-2.5 rounded hidden"></div>
          </div>
        ` : `
          <!-- Conteúdo Aba 2: Chaves de API -->
          <div class="space-y-3.5 pt-1 text-xs">
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="font-medium text-gray-300">Claude Code (ANTHROPIC_API_KEY)</label>
                <span class="text-[10px] ${hasClaude ? 'text-emerald-400' : 'text-gray-500'} font-mono">
                  ${hasClaude ? 'Configurada' : 'Não definida'}
                </span>
              </div>
              <input id="input-anthropic-key" type="password" placeholder="sk-ant-..." class="w-full bg-[#0d0e12] border border-[#272a34] rounded-lg px-3 py-2 text-white outline-none focus:border-purple-400 font-mono text-xs">
            </div>

            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="font-medium text-gray-300">OpenAI Codex / Aider (OPENAI_API_KEY)</label>
                <span class="text-[10px] ${hasAider ? 'text-emerald-400' : 'text-gray-500'} font-mono">
                  ${hasAider ? 'Configurada' : 'Não definida'}
                </span>
              </div>
              <input id="input-openai-key" type="password" placeholder="sk-..." class="w-full bg-[#0d0e12] border border-[#272a34] rounded-lg px-3 py-2 text-white outline-none focus:border-emerald-400 font-mono text-xs">
            </div>

            <button id="btn-save-keys" class="w-full py-2 px-4 rounded-xl bg-[#22252f] hover:bg-[#2b2f3b] border border-[#323644] text-white font-medium transition-colors">
              Salvar Chaves no Servidor (.env)
            </button>

            <div id="keys-feedback" class="text-xs font-mono p-2.5 rounded hidden"></div>
          </div>
        `}
      </div>
    `;

    // Eventos
    this.modalEl.querySelector('#btn-modal-close').onclick = () => this.close();
    
    this.modalEl.querySelector('#tab-auth-agy').onclick = () => {
      this.activeTab = 'agy';
      this.render();
    };

    this.modalEl.querySelector('#tab-auth-keys').onclick = () => {
      this.activeTab = 'keys';
      this.render();
    };

    if (this.activeTab === 'agy') {
      const startBtn = this.modalEl.querySelector('#btn-start-google-auth');
      const step2 = this.modalEl.querySelector('#agy-step2');
      const link = this.modalEl.querySelector('#agy-link');
      const feedback = this.modalEl.querySelector('#agy-feedback');

      startBtn.onclick = async () => {
        startBtn.disabled = true;
        startBtn.textContent = 'Gerando link de autorização...';
        feedback.classList.add('hidden');

        try {
          const res = await api.startAntigravityAuth();
          if (res.authUrl) {
            link.href = res.authUrl;
            step2.classList.remove('hidden');
            startBtn.textContent = 'Reiniciar Login';
          } else {
            feedback.classList.remove('hidden');
            feedback.className = 'text-xs font-mono p-2.5 rounded bg-red-950/40 border border-red-800/40 text-red-300';
            feedback.textContent = 'Erro: ' + (res.error || 'Falha ao gerar link');
            startBtn.textContent = 'Tentar Novamente';
          }
        } catch (e) {
          feedback.classList.remove('hidden');
          feedback.className = 'text-xs font-mono p-2.5 rounded bg-red-950/40 border border-red-800/40 text-red-300';
          feedback.textContent = 'Erro de conexão: ' + e.message;
          startBtn.textContent = 'Iniciar Login Google';
        } finally {
          startBtn.disabled = false;
        }
      };

      const submitBtn = this.modalEl.querySelector('#btn-submit-agy-code');
      const codeInput = this.modalEl.querySelector('#agy-code-input');

      submitBtn.onclick = async () => {
        const code = codeInput.value.trim();
        if (!code) return alert('Por favor, cole o código de autorização.');

        submitBtn.disabled = true;
        submitBtn.textContent = 'Validando...';
        feedback.classList.add('hidden');

        try {
          const res = await api.submitAntigravityCode(code);
          feedback.classList.remove('hidden');
          if (res.status === 'success' || res.status === 'completed') {
            feedback.className = 'text-xs font-mono p-2.5 rounded bg-emerald-950/40 border border-emerald-800/40 text-emerald-300';
            feedback.textContent = 'Login concluído com sucesso!';
            await this.checkStatus();
            setTimeout(() => this.render(), 1200);
          } else {
            feedback.className = 'text-xs font-mono p-2.5 rounded bg-red-950/40 border border-red-800/40 text-red-300';
            feedback.textContent = 'Erro: ' + (res.error || 'Código inválido');
          }
        } catch (e) {
          feedback.classList.remove('hidden');
          feedback.className = 'text-xs font-mono p-2.5 rounded bg-red-950/40 border border-red-800/40 text-red-300';
          feedback.textContent = 'Erro ao enviar código: ' + e.message;
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Concluir Login';
        }
      };
    } else {
      const saveBtn = this.modalEl.querySelector('#btn-save-keys');
      const inputAnthropic = this.modalEl.querySelector('#input-anthropic-key');
      const inputOpenai = this.modalEl.querySelector('#input-openai-key');
      const feedback = this.modalEl.querySelector('#keys-feedback');

      saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvando...';
        feedback.classList.add('hidden');

        try {
          const res = await api.saveApiKeys({
            anthropicApiKey: inputAnthropic.value,
            openaiApiKey: inputOpenai.value
          });
          feedback.classList.remove('hidden');
          if (res.status === 'saved') {
            feedback.className = 'text-xs font-mono p-2.5 rounded bg-emerald-950/40 border border-emerald-800/40 text-emerald-300';
            feedback.textContent = 'Chaves salvas com sucesso no servidor!';
            await this.checkStatus();
          } else {
            feedback.className = 'text-xs font-mono p-2.5 rounded bg-red-950/40 border border-red-800/40 text-red-300';
            feedback.textContent = 'Erro ao salvar: ' + (res.error || 'Desconhecido');
          }
        } catch (e) {
          feedback.classList.remove('hidden');
          feedback.className = 'text-xs font-mono p-2.5 rounded bg-red-950/40 border border-red-800/40 text-red-300';
          feedback.textContent = 'Erro: ' + e.message;
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Salvar Chaves no Servidor (.env)';
        }
      };
    }
  }
}
