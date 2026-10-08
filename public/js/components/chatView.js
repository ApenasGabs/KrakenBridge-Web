import { state } from '../state.js';
import { api } from '../api.js';
import { icons } from '../icons.js';

export class ChatViewComponent {
  constructor(containerEl, onConversationUpdated) {
    this.container = containerEl;
    this.onConversationUpdated = onConversationUpdated;
    this.messagesListEl = null;
    this.promptInputEl = null;
    this.sendBtnEl = null;
    this.stopBtnEl = null;
    this.abortController = null;
    this.activeTools = new Map();

    state.subscribe((key) => {
      if (key === 'activeConversationId' && !state.get('isGenerating')) {
        this.loadActiveConversation();
      }
    });

    this.renderSkeleton();
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div id="messages-container" class="flex-1 overflow-y-auto custom-scroll px-4 md:px-8 py-6 space-y-5">
        <div id="welcome-hero" class="max-w-xl mx-auto text-center pt-10 pb-6 space-y-4">
          <div class="w-12 h-12 mx-auto rounded-2xl bg-[#1e222d] border border-[#2d3242] text-sky-400 flex items-center justify-center shadow-lg">
            ${icons.logo(24)}
          </div>
          <div>
            <h1 class="text-xl font-bold text-white tracking-tight">KrakenBridge Web</h1>
            <p class="text-xs text-gray-400 mt-1 max-w-md mx-auto">
              Terminal e ambiente de agentes de código autônomos. Comandos e modificações executados diretamente no workspace.
            </p>
          </div>
          <div class="pt-2 flex flex-wrap justify-center gap-2 text-xs">
            <button class="suggest-btn px-3 py-1.5 rounded-lg bg-[#181a22] hover:bg-[#20232e] border border-[#272a34] text-gray-300 transition-colors">
              Listar arquivos do workspace
            </button>
            <button class="suggest-btn px-3 py-1.5 rounded-lg bg-[#181a22] hover:bg-[#20232e] border border-[#272a34] text-gray-300 transition-colors">
              Qual é o status do sistema e git?
            </button>
          </div>
        </div>
        <div id="messages-list" class="space-y-5 max-w-4xl mx-auto"></div>
      </div>

      <!-- Barra Inferior de Entrada de Prompt -->
      <div class="p-3 md:p-4 bg-[#14161d] border-t border-[#272a34] flex-shrink-0">
        <div class="max-w-4xl mx-auto">
          <div class="relative flex items-end bg-[#0d0e12] border border-[#272a34] rounded-xl focus-within:border-sky-500 shadow-lg p-2 transition-colors">
            <textarea
              id="prompt-input"
              rows="2"
              placeholder="Peça para codificar, analisar repositórios ou executar comandos..."
              class="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 outline-none resize-none px-2 py-1 max-h-36 custom-scroll font-sans"
            ></textarea>

            <div class="flex items-center gap-2 pl-2 flex-shrink-0 pb-0.5">
              <button
                id="btn-stop"
                title="Interromper geração"
                class="hidden p-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-700/40 transition-colors"
              >
                ${icons.stop(16)}
              </button>
              <button
                id="btn-send"
                title="Enviar (Enter)"
                class="p-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors shadow-md disabled:opacity-50"
              >
                ${icons.send(16)}
              </button>
            </div>
          </div>
          <div class="flex items-center justify-between text-[11px] text-gray-500 pt-1.5 px-1">
            <span>Enter envia • Shift+Enter quebra linha</span>
            <span id="prompt-char-count"></span>
          </div>
        </div>
      </div>
    `;

    this.messagesListEl = this.container.querySelector('#messages-list');
    this.promptInputEl = this.container.querySelector('#prompt-input');
    this.sendBtnEl = this.container.querySelector('#btn-send');
    this.stopBtnEl = this.container.querySelector('#btn-stop');
    const welcomeHero = this.container.querySelector('#welcome-hero');

    this.promptInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.submitPrompt();
      }
    });

    this.sendBtnEl.onclick = () => this.submitPrompt();
    this.stopBtnEl.onclick = () => this.stopGeneration();

    this.container.querySelectorAll('.suggest-btn').forEach((btn) => {
      btn.onclick = () => {
        this.promptInputEl.value = btn.innerText.trim();
        this.submitPrompt();
      };
    });

    if (state.get('activeConversationId')) {
      this.loadActiveConversation();
    }
  }

  async loadActiveConversation() {
    const id = state.get('activeConversationId');
    const welcomeHero = this.container.querySelector('#welcome-hero');

    if (!id) {
      if (this.messagesListEl) this.messagesListEl.innerHTML = '';
      if (welcomeHero) welcomeHero.classList.remove('hidden');
      return;
    }

    try {
      const session = await api.getConversation(id);
      if (session && session.messages && session.messages.length > 0) {
        if (welcomeHero) welcomeHero.classList.add('hidden');
        this.messagesListEl.innerHTML = '';

        for (const msg of session.messages) {
          if (msg.role === 'user') {
            this.appendUserMessage(msg.text);
          } else {
            const botEl = this.appendBotMessage(msg.agent || session.agent);
            const contentEl = botEl.querySelector('.bot-content');
            const timelineEl = botEl.querySelector('.bot-timeline');

            if (msg.toolCalls && msg.toolCalls.length > 0) {
              for (const tc of msg.toolCalls) {
                this.renderHistoricalToolCall(timelineEl, tc);
              }
            }

            contentEl.innerHTML = marked.parse(msg.text || '');
            this.highlightCodeBlocks(contentEl);
          }
        }

        const scrollContainer = this.container.querySelector('#messages-container');
        if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
      } else {
        if (this.messagesListEl) this.messagesListEl.innerHTML = '';
        if (welcomeHero) welcomeHero.classList.remove('hidden');
      }
    } catch (err) {
      console.warn('Erro ao carregar sessão ativa:', err);
    }
  }

  async submitPrompt() {
    const prompt = this.promptInputEl.value.trim();
    if (!prompt || state.get('isGenerating')) return;

    const welcomeHero = this.container.querySelector('#welcome-hero');
    if (welcomeHero) welcomeHero.classList.add('hidden');

    this.appendUserMessage(prompt);
    this.promptInputEl.value = '';

    state.set('isGenerating', true);
    this.sendBtnEl.classList.add('hidden');
    this.stopBtnEl.classList.remove('hidden');

    const agent = state.get('currentAgent');
    const model = state.get('currentModel');
    const effort = state.get('currentEffort');
    const mode = state.get('currentMode');
    const subproject = state.get('currentSubproject');
    const skipPermissions = state.get('skipPermissions');
    const sandbox = state.get('sandbox');
    const disableSlashCommands = state.get('disableSlashCommands');
    const currentConvId = state.get('activeConversationId');

    const botMessageEl = this.appendBotMessage(agent);
    const timelineEl = botMessageEl.querySelector('.bot-timeline');
    const contentEl = botMessageEl.querySelector('.bot-content');
    const metaEl = botMessageEl.querySelector('.bot-meta');
    contentEl.classList.add('typing-cursor');

    let accumulatedText = '';
    this.activeTools = new Map();
    this.abortController = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          conversationId: currentConvId,
          agent,
          model,
          effort,
          mode,
          subproject,
          skipPermissions,
          sandbox,
          disableSlashCommands
        }),
        signal: this.abortController.signal
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6);
          if (!jsonStr) continue;

          try {
            const payload = JSON.parse(jsonStr);

            if (payload.event === 'session_start' && payload.conversation_id) {
              if (state.get('activeConversationId') !== payload.conversation_id) {
                state.set('activeConversationId', payload.conversation_id);
                if (this.onConversationUpdated) this.onConversationUpdated();
              }
            }

            if (payload.event === 'auth_required' && payload.authUrl) {
              this.renderInlineAuthCard(timelineEl, payload.authUrl, payload.reqId);
            }

            if (payload.event === 'raw' && payload.text) {
              accumulatedText += payload.text + '\n';
              contentEl.innerHTML = marked.parse(accumulatedText);
              this.highlightCodeBlocks(contentEl);
              this.scrollToBottom();
            }

            if (payload.event === 'step_update' && payload.step_update) {
              const su = payload.step_update;

              if (su.step_type === 'tool') {
                this.handleToolEvent(timelineEl, su);
              }

              if (su.step_type === 'agent_response' && su.text_delta) {
                accumulatedText += su.text_delta;
                contentEl.innerHTML = marked.parse(accumulatedText);
                this.highlightCodeBlocks(contentEl);
                this.scrollToBottom();
              }

              if (su.usage && su.usage.thinking_tokens > 0) {
                this.addThinkingBadge(timelineEl, su.usage.thinking_tokens, su.duration_seconds);
              }
            }

            if (payload.event === 'stderr' && payload.text) {
              if (!payload.text.includes('accounts.google.com')) {
                this.addNotice(timelineEl, payload.text);
              }
            }

            if (payload.event === 'result' && payload.result) {
              const res = payload.result;
              if (res.response && !accumulatedText) {
                accumulatedText = res.response;
                contentEl.innerHTML = marked.parse(accumulatedText);
                this.highlightCodeBlocks(contentEl);
              }
              metaEl.textContent = `Executado em ${res.duration_seconds?.toFixed(1) || ''}s • ${res.usage?.total_tokens || 0} tokens`;
              metaEl.classList.remove('hidden');
            }
          } catch (e) {
            console.warn(e);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        contentEl.innerHTML = `<span class="text-red-400">Erro na comunicação: ${this.escape(err.message)}</span>`;
      }
    } finally {
      contentEl.classList.remove('typing-cursor');
      state.set('isGenerating', false);
      this.sendBtnEl.classList.remove('hidden');
      this.stopBtnEl.classList.add('hidden');
      if (this.onConversationUpdated) this.onConversationUpdated();
    }
  }

  async stopGeneration() {
    if (this.abortController) this.abortController.abort();
    try {
      await api.stopChat();
    } catch (e) {}
    state.set('isGenerating', false);
    this.sendBtnEl.classList.remove('hidden');
    this.stopBtnEl.classList.add('hidden');
  }

  appendUserMessage(text) {
    const d = document.createElement('div');
    d.className = 'flex justify-end';
    d.innerHTML = `
      <div class="max-w-[85%] bg-[#1e222d] text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm border border-[#2d3242] whitespace-pre-wrap leading-relaxed">
        ${this.escape(text)}
      </div>
    `;
    this.messagesListEl.appendChild(d);
    this.scrollToBottom();
  }

  appendBotMessage(agent) {
    const d = document.createElement('div');
    d.className = 'flex items-start gap-3';
    d.innerHTML = `
      <div class="w-7 h-7 rounded-lg bg-[#181a22] border border-[#272a34] flex items-center justify-center text-sky-400 flex-shrink-0 mt-0.5">
        ${icons.bot(14)}
      </div>
      <div class="flex-1 min-w-0 space-y-2">
        <div class="bot-timeline space-y-1"></div>
        <div class="bot-content markdown-body text-gray-200"></div>
        <div class="bot-meta text-[10px] text-gray-500 font-mono hidden pt-1"></div>
      </div>
    `;
    this.messagesListEl.appendChild(d);
    return d;
  }

  handleToolEvent(container, su) {
    const stepIdx = su.step_index;
    const toolName = su.tool_name || (su.tool_info && su.tool_info.name) || 'comando';
    const params = (su.tool_info && su.tool_info.parameters) || {};
    const output = (su.tool_info && su.tool_info.output) || '';

    let toolCard = this.activeTools.get(stepIdx);
    if (!toolCard) {
      toolCard = document.createElement('details');
      toolCard.open = true;
      toolCard.className = 'rounded-lg bg-[#12141a] border border-[#272a34] text-xs my-1.5 overflow-hidden';
      
      const cmd = params.CommandLine ? `<span class="text-emerald-400 font-mono">${this.escape(params.CommandLine)}</span>` : '';
      toolCard.innerHTML = `
        <summary class="flex items-center justify-between px-3 py-1.5 cursor-pointer bg-[#181a22] hover:bg-[#1e222d] gap-2">
          <div class="flex items-center gap-2 truncate">
            <span class="status-dot w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
            <span class="font-mono font-semibold text-sky-300 uppercase text-[11px]">${this.escape(toolName)}</span>
            <span class="truncate text-[11px]">${cmd}</span>
          </div>
          <span class="tool-dur text-[10px] text-gray-500 font-mono">executando...</span>
        </summary>
        <div class="p-2.5 bg-[#0b0d11] border-t border-[#272a34]/60 space-y-2">
          <div class="tool-out hidden"></div>
        </div>
      `;
      container.appendChild(toolCard);
      this.activeTools.set(stepIdx, toolCard);
    }

    if (su.state === 'DONE') {
      const dot = toolCard.querySelector('.status-dot');
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
      const dur = toolCard.querySelector('.tool-dur');
      if (dur) dur.textContent = su.duration_seconds ? su.duration_seconds.toFixed(2) + 's' : 'concluído';

      if (output) {
        const outBox = toolCard.querySelector('.tool-out');
        if (outBox) {
          outBox.classList.remove('hidden');
          outBox.innerHTML = `
            <div class="text-[10px] text-gray-500 font-mono uppercase mb-1">Saída:</div>
            <pre class="max-h-48 overflow-y-auto text-[11px] font-mono text-gray-300 bg-black/40 p-2 rounded border border-[#272a34]/40 whitespace-pre-wrap">${this.escape(output)}</pre>
          `;
        }
      }
    }
  }

  renderHistoricalToolCall(container, tc) {
    const card = document.createElement('div');
    card.className = 'rounded-lg bg-[#12141a] border border-[#272a34] text-xs my-1 p-2 flex items-center justify-between';
    card.innerHTML = `
      <div class="flex items-center gap-2 truncate font-mono text-[11px]">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        <span class="text-sky-300 uppercase">${this.escape(tc.name)}</span>
        <span class="text-gray-400 truncate">${this.escape(tc.command)}</span>
      </div>
      <span class="text-[10px] text-gray-500 font-mono flex-shrink-0">${tc.duration ? tc.duration.toFixed(2) + 's' : ''}</span>
    `;
    container.appendChild(card);
  }

  addThinkingBadge(container, tokens, dur) {
    const b = document.createElement('div');
    b.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-950/30 border border-purple-800/40 text-purple-300 text-[10px] font-mono my-1';
    b.innerHTML = `
      ${icons.cpu(11)}
      <span>Raciocínio concluído (${tokens} tokens • ${dur?.toFixed(1) || ''}s)</span>
    `;
    container.appendChild(b);
  }

  addNotice(container, text) {
    const b = document.createElement('div');
    b.className = 'p-2 rounded-lg bg-amber-950/20 border border-amber-800/30 text-amber-300 text-[11px] font-mono my-1 whitespace-pre-wrap';
    b.textContent = text;
    container.appendChild(b);
  }

  renderInlineAuthCard(container, authUrl, reqId) {
    const card = document.createElement('div');
    card.className = 'p-3.5 rounded-xl bg-[#141824] border border-sky-500/40 space-y-2.5 my-2 text-xs shadow-lg';
    card.innerHTML = `
      <div class="flex items-center gap-2 text-sky-300 font-semibold">
        ${icons.key(14)}
        <span>Autenticação Google Antigravity Necessária</span>
      </div>
      <p class="text-gray-300 text-[11px]">
        O motor Antigravity precisa de autorização da sua conta Google para continuar esta sessão.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <a href="${authUrl}" target="_blank" class="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center gap-1.5 shadow transition-colors">
          <span>Abrir Login Google em Nova Aba</span>
          ${icons.external(12)}
        </a>
      </div>
      <div class="flex items-center gap-2 pt-1">
        <input type="text" placeholder="Cole o código de autorização retornado..." class="inline-code flex-1 bg-[#0d0e12] border border-[#272a34] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-sky-500 font-mono">
        <button class="inline-submit px-3 py-1.5 rounded-lg bg-[#1e222d] hover:bg-[#282d3b] text-white border border-[#2d3242] font-medium flex items-center gap-1">
          <span>Concluir</span>
        </button>
      </div>
      <div class="inline-feedback text-[11px] font-mono hidden"></div>
    `;

    const codeInput = card.querySelector('.inline-code');
    const submitBtn = card.querySelector('.inline-submit');
    const feedback = card.querySelector('.inline-feedback');

    submitBtn.onclick = async () => {
      const code = codeInput.value.trim();
      if (!code) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
      try {
        const res = await api.submitInlineAuth(reqId, code);
        feedback.classList.remove('hidden');
        if (res.status === 'submitted') {
          feedback.className = 'inline-feedback text-[11px] font-mono text-emerald-400';
          feedback.textContent = 'Código enviado ao processo. Continuando...';
        } else {
          feedback.className = 'inline-feedback text-[11px] font-mono text-red-400';
          feedback.textContent = 'Erro ao enviar código';
        }
      } catch (e) {
        feedback.classList.remove('hidden');
        feedback.className = 'inline-feedback text-[11px] font-mono text-red-400';
        feedback.textContent = 'Erro: ' + e.message;
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Concluir';
      }
    };

    container.appendChild(card);
    this.scrollToBottom();
  }

  highlightCodeBlocks(container) {
    container.querySelectorAll('pre code').forEach((b) => {
      if (!b.getAttribute('data-highlighted')) {
        hljs.highlightElement(b);
        b.setAttribute('data-highlighted', 'yes');

        // Adicionar botão de copiar código
        const pre = b.parentElement;
        if (pre && !pre.querySelector('.btn-copy-code')) {
          const copyBtn = document.createElement('button');
          copyBtn.className = 'btn-copy-code absolute top-2 right-2 p-1.5 rounded bg-[#1e222d] hover:bg-[#2b303f] text-gray-400 hover:text-white border border-[#2d3242] text-[10px] transition-colors flex items-center gap-1';
          copyBtn.innerHTML = `${icons.copy(11)}<span>Copiar</span>`;
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(b.innerText);
            copyBtn.innerHTML = `${icons.check(11)}<span>Copiado!</span>`;
            setTimeout(() => {
              copyBtn.innerHTML = `${icons.copy(11)}<span>Copiar</span>`;
            }, 2000);
          };
          pre.appendChild(copyBtn);
        }
      }
    });
  }

  scrollToBottom() {
    const scrollContainer = this.container.querySelector('#messages-container');
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }

  escape(t) {
    const d = document.createElement('div');
    d.textContent = t || '';
    return d.innerHTML;
  }
}
