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
            const metaEl = botEl.querySelector('.bot-meta');

            // 1. Renderiza Bloco de Raciocínio & Pensamento (se disponível)
            if (msg.thinking && msg.thinking.trim()) {
              this.renderThinkingCard(timelineEl, msg.thinking, msg.tokens?.thinking_tokens);
            }

            // 2. Renderiza Grupo de Ferramentas / Terminal (com saídas completas e expansíveis)
            if (msg.toolCalls && msg.toolCalls.length > 0) {
              this.renderToolGroup(timelineEl, msg.toolCalls);
            }

            // 3. Renderiza Conteúdo da Resposta
            const displayText = msg.text || (msg.toolCalls?.length > 0 ? '*(Tarefas e modificações executadas no ambiente pelo agente)*' : '');
            contentEl.innerHTML = marked.parse(displayText);
            this.highlightCodeBlocks(contentEl);

            // 4. Metadados de Execução (tempo / tokens)
            if (msg.tokens || msg.duration) {
              const dur = msg.duration ? `${msg.duration.toFixed(1)}s` : '';
              const tok = msg.tokens?.total_tokens ? `${msg.tokens.total_tokens.toLocaleString()} tokens` : '';
              const parts = [dur, tok].filter(Boolean);
              if (parts.length > 0) {
                metaEl.textContent = `Executado em ${parts.join(' • ')}`;
                metaEl.classList.remove('hidden');
              }
            }
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

    // Banner de status ativo em tempo real
    const liveStatusBar = document.createElement('div');
    liveStatusBar.className = 'live-status-bar flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#161a24] border border-[#272a34] text-xs text-sky-300 font-mono my-1.5 animate-pulse';
    liveStatusBar.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-sky-400"></span>
      <span class="status-text truncate">Kraken analisando solicitação...</span>
    `;
    timelineEl.appendChild(liveStatusBar);

    let accumulatedText = '';
    let accumulatedThinking = '';
    let liveThinkingCard = null;
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
                const statusSpan = liveStatusBar.querySelector('.status-text');
                const tName = su.tool_name || (su.tool_info && su.tool_info.name) || 'ferramenta';
                if (statusSpan) {
                  statusSpan.textContent = `Executando ${tName}...`;
                }
                this.handleToolEvent(timelineEl, su, liveStatusBar);
              }

              if (su.step_type === 'agent_response') {
                if (su.text_delta) {
                  accumulatedText += su.text_delta;
                  contentEl.innerHTML = marked.parse(accumulatedText);
                  this.highlightCodeBlocks(contentEl);
                  this.scrollToBottom();
                }
                if (su.thinking_delta || su.thinking) {
                  accumulatedThinking += (su.thinking_delta || su.thinking || '');
                  if (!liveThinkingCard && accumulatedThinking.trim()) {
                    liveThinkingCard = this.renderThinkingCard(timelineEl, accumulatedThinking, null, true);
                    timelineEl.insertBefore(liveThinkingCard, liveStatusBar);
                  } else if (liveThinkingCard) {
                    const bodyEl = liveThinkingCard.querySelector('.thinking-body');
                    if (bodyEl) bodyEl.innerHTML = marked.parse(accumulatedThinking);
                  }
                }
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
              if (res.response && (!accumulatedText || res.response.length > accumulatedText.length || accumulatedText.trim() === '')) {
                accumulatedText = res.response;
                contentEl.innerHTML = marked.parse(accumulatedText);
                this.highlightCodeBlocks(contentEl);
              }
              const countTools = this.activeTools.size;
              const toolsText = countTools > 0 ? ` • ${countTools} ferramentas` : '';
              metaEl.textContent = `Executado em ${res.duration_seconds?.toFixed(1) || ''}s${toolsText} • ${res.usage?.total_tokens || 0} tokens`;
              metaEl.classList.remove('hidden');
            }

            if (payload.event === 'done') {
              liveStatusBar.remove();
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
      if (liveStatusBar && liveStatusBar.parentNode) {
        liveStatusBar.remove();
      }
      contentEl.classList.remove('typing-cursor');

      // Se por algum motivo o texto acumulado estiver vazio, tentar recarregar da API do servidor
      if (!accumulatedText.trim()) {
        try {
          const currentId = state.get('activeConversationId');
          if (currentId) {
            const updatedSession = await api.getConversation(currentId);
            const lastMsg = updatedSession?.messages?.[updatedSession.messages.length - 1];
            if (lastMsg && lastMsg.role === 'assistant' && lastMsg.text && lastMsg.text.trim()) {
              accumulatedText = lastMsg.text;
              contentEl.innerHTML = marked.parse(accumulatedText);
              this.highlightCodeBlocks(contentEl);
            }
          }
        } catch {}
      }

      // Se ainda estiver vazio mas houve ferramentas executadas, dar retorno claro ao usuário
      if (!accumulatedText.trim() && this.activeTools.size > 0) {
        contentEl.innerHTML = marked.parse(`✅ **Ações concluídas.** O agente finalizou a execução de **${this.activeTools.size} ferramentas** no seu ambiente com sucesso.`);
      }

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
      <div class="max-w-[85%] bg-[#1e222d] text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm border border-[#2d3242] whitespace-pre-wrap leading-relaxed shadow-md">
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
      <div class="w-7 h-7 rounded-lg bg-[#181a22] border border-[#272a34] flex items-center justify-center text-sky-400 flex-shrink-0 mt-0.5 shadow">
        ${icons.bot(14)}
      </div>
      <div class="flex-1 min-w-0 space-y-2">
        <div class="bot-timeline space-y-1.5"></div>
        <div class="bot-content markdown-body text-gray-200"></div>
        <div class="bot-meta text-[11px] text-gray-500 font-mono hidden pt-1"></div>
      </div>
    `;
    this.messagesListEl.appendChild(d);
    return d;
  }

  // Agrupador visual de ferramentas para conversas históricas com múltiplos comandos
  renderToolGroup(container, toolCalls) {
    if (!toolCalls || toolCalls.length === 0) return;

    if (toolCalls.length === 1) {
      this.renderToolCard(container, toolCalls[0], false, false);
      return;
    }

    const groupWrapper = document.createElement('div');
    groupWrapper.className = 'my-2 rounded-xl bg-[#101217] border border-[#232733] overflow-hidden text-xs';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between px-3.5 py-2 bg-[#14171f] border-b border-[#232733] text-gray-300 select-none';
    header.innerHTML = `
      <div class="flex items-center gap-2 font-mono text-[11px]">
        <span class="text-sky-400">${icons.terminal(13)}</span>
        <span class="font-semibold text-white">${toolCalls.length} operações no Homelab</span>
        <span class="text-gray-500 text-[10px]">(Terminal, Docker e Arquivos)</span>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn-toggle-all text-[11px] font-mono text-sky-400 hover:text-sky-300 hover:underline">
          Expandir todas
        </button>
      </div>
    `;

    const listContainer = document.createElement('div');
    listContainer.className = 'p-2 space-y-1.5 bg-[#0b0d11]/50';

    for (const tc of toolCalls) {
      this.renderToolCard(listContainer, tc, false, false);
    }

    const toggleBtn = header.querySelector('.btn-toggle-all');
    let allExpanded = false;
    toggleBtn.onclick = () => {
      allExpanded = !allExpanded;
      listContainer.querySelectorAll('.tool-card').forEach(details => {
        details.open = allExpanded;
      });
      toggleBtn.textContent = allExpanded ? 'Recolher todas' : 'Expandir todas';
    };

    groupWrapper.appendChild(header);
    groupWrapper.appendChild(listContainer);
    container.appendChild(groupWrapper);
  }

  // Renderiza um cartão detalhado de ferramenta (com saída completa do terminal)
  renderToolCard(container, tc, isLive = false, initiallyOpen = false) {
    const card = document.createElement('details');
    card.open = initiallyOpen;
    card.className = 'tool-card rounded-lg bg-[#12141a] border border-[#272a34] text-xs overflow-hidden';

    const name = (tc.name || 'tool').toLowerCase();
    let badgeClass = 'text-sky-300 bg-sky-950/40 border-sky-800/40';
    let label = tc.name || 'TOOL';
    let iconSvg = icons.terminal(12);

    if (name.includes('command')) {
      badgeClass = 'text-emerald-300 bg-emerald-950/40 border-emerald-800/40';
      label = 'BASH';
      iconSvg = icons.terminal(12);
    } else if (name.includes('replace') || name.includes('sed')) {
      badgeClass = 'text-amber-300 bg-amber-950/40 border-amber-800/40';
      label = 'EDIT';
      iconSvg = icons.code(12);
    } else if (name.includes('write')) {
      badgeClass = 'text-purple-300 bg-purple-950/40 border-purple-800/40';
      label = 'WRITE';
      iconSvg = icons.fileText(12);
    } else if (name.includes('view') || name.includes('read')) {
      badgeClass = 'text-sky-300 bg-sky-950/40 border-sky-800/40';
      label = 'READ';
      iconSvg = icons.fileText(12);
    } else if (name.includes('mcp')) {
      badgeClass = 'text-indigo-300 bg-indigo-950/40 border-indigo-800/40';
      label = 'MCP';
      iconSvg = icons.cpu(12);
    }

    const commandText = tc.command || '';
    const hasOutput = tc.output && tc.output.trim().length > 0;
    const durationText = tc.duration ? (tc.duration.toFixed(2) + 's') : '';

    card.innerHTML = `
      <summary class="flex items-center justify-between px-3 py-2 cursor-pointer bg-[#161820] hover:bg-[#1c1f2a] gap-2 select-none transition-colors">
        <div class="flex items-center gap-2 min-w-0 truncate">
          <span class="tool-chevron text-gray-500">${icons.chevronRight(11)}</span>
          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${badgeClass}">
            ${iconSvg}
            <span>${label}</span>
          </span>
          <span class="truncate font-mono text-[11px] text-gray-300">${this.escape(commandText)}</span>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0 text-[10px] font-mono text-gray-500">
          ${durationText ? `<span>${durationText}</span>` : ''}
          <span class="status-badge ${tc.state === 'DONE' ? 'text-emerald-400' : 'text-sky-400'}">
            ${tc.state === 'DONE' ? icons.check(12) : '...'}
          </span>
        </div>
      </summary>
      <div class="p-3 bg-[#0a0c10] border-t border-[#232733] space-y-2.5">
        ${commandText ? `
          <div>
            <div class="text-[10px] text-gray-500 font-mono uppercase mb-1">Comando / Ação:</div>
            <div class="p-2 bg-black/60 rounded border border-[#272a34] font-mono text-xs text-sky-300 break-all">${this.escape(commandText)}</div>
          </div>
        ` : ''}
        ${hasOutput ? `
          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-[10px] text-gray-500 font-mono uppercase tracking-wider">Saída do Terminal (stdout/stderr):</span>
              <button class="btn-copy-tool-out text-[10px] font-mono text-gray-400 hover:text-white flex items-center gap-1 transition-colors">
                ${icons.copy(10)}
                <span>Copiar</span>
              </button>
            </div>
            <pre class="terminal-pre max-h-56 overflow-y-auto text-[11px] text-gray-300 p-2.5 rounded border border-[#272a34]/60 whitespace-pre-wrap">${this.escape(tc.output)}</pre>
          </div>
        ` : `
          <div class="text-[11px] text-gray-500 italic font-mono py-0.5 flex items-center gap-1.5">
            <span class="text-emerald-400">${icons.check(11)}</span>
            <span>Comando executado com sucesso no host (sem saída de texto no terminal)</span>
          </div>
        `}
      </div>
    `;

    const copyBtn = card.querySelector('.btn-copy-tool-out');
    if (copyBtn) {
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(tc.output || '');
        copyBtn.innerHTML = `${icons.check(10)}<span>Copiado!</span>`;
        setTimeout(() => {
          copyBtn.innerHTML = `${icons.copy(10)}<span>Copiar</span>`;
        }, 1800);
      };
    }

    container.appendChild(card);
    return card;
  }

  // Bloco de Raciocínio & Pensamento (Thinking) da IA
  renderThinkingCard(container, thinkingText, tokens, initiallyOpen = false) {
    const card = document.createElement('details');
    card.open = initiallyOpen;
    card.className = 'thinking-card rounded-xl bg-purple-950/20 border border-purple-800/40 text-xs my-2 overflow-hidden shadow';

    const tokenLabel = tokens ? `${tokens.toLocaleString()} tokens` : '';

    card.innerHTML = `
      <summary class="flex items-center justify-between px-3.5 py-2 cursor-pointer bg-purple-950/30 hover:bg-purple-950/40 text-purple-300 gap-2 select-none transition-colors">
        <div class="flex items-center gap-2">
          <span class="thinking-chevron text-purple-400">${icons.chevronRight(12)}</span>
          <span class="text-purple-400">${icons.brain(14)}</span>
          <span class="font-semibold text-purple-200 text-xs">Processo de Pensamento da IA</span>
        </div>
        <div class="flex items-center gap-2 text-[10px] font-mono text-purple-400/80">
          ${tokenLabel ? `<span>${tokenLabel}</span>` : ''}
          <span class="px-1.5 py-0.5 rounded bg-purple-900/40 border border-purple-800/40">Raciocínio</span>
        </div>
      </summary>
      <div class="p-3.5 bg-[#0c0a14] border-t border-purple-900/30 text-gray-300 font-sans text-xs thinking-body leading-relaxed max-h-72 overflow-y-auto custom-scroll">
        ${marked.parse(thinkingText || '')}
      </div>
    `;

    container.appendChild(card);
    return card;
  }

  handleToolEvent(container, su, liveStatusBar) {
    const stepIdx = su.step_index;
    const toolName = su.tool_name || (su.tool_info && su.tool_info.name) || 'comando';
    const params = (su.tool_info && su.tool_info.parameters) || {};
    const output = (su.tool_info && su.tool_info.output) || '';

    let cmd = params.CommandLine;
    if (!cmd) {
      if (params.TargetFile) {
        cmd = `${params.TargetFile}${params.Instruction ? ` (${params.Instruction})` : ''}`;
      } else if (params.AbsolutePath) {
        cmd = `${params.AbsolutePath}${params.StartLine ? ` [L${params.StartLine}-${params.EndLine || params.StartLine}]` : ''}`;
      } else if (params.ServerName && params.ToolName) {
        cmd = `${params.ServerName}:${params.ToolName}`;
      } else if (params.query) {
        cmd = params.query;
      } else if (params.Url) {
        cmd = params.Url;
      } else if (params.toolAction) {
        cmd = `${params.toolAction}${params.toolSummary ? `: ${params.toolSummary}` : ''}`;
      } else {
        cmd = '';
      }
    }

    let toolCard = this.activeTools.get(stepIdx);
    if (!toolCard) {
      const tcData = {
        name: toolName,
        command: cmd,
        output: output,
        duration: su.duration_seconds,
        state: su.state || 'ACTIVE'
      };
      toolCard = this.renderToolCard(container, tcData, true, true);
      this.activeTools.set(stepIdx, toolCard);
      if (liveStatusBar && liveStatusBar.parentNode === container) {
        container.appendChild(liveStatusBar);
      }
    }

    if (su.state === 'DONE') {
      const statusBadge = toolCard.querySelector('.status-badge');
      if (statusBadge) {
        statusBadge.className = 'status-badge text-emerald-400';
        statusBadge.innerHTML = icons.check(12);
      }
      if (output) {
        let pre = toolCard.querySelector('.terminal-pre');
        if (!pre) {
          const body = toolCard.querySelector('div.p-3');
          if (body) {
            const outBox = document.createElement('div');
            outBox.className = 'space-y-1';
            outBox.innerHTML = `
              <div class="flex items-center justify-between">
                <span class="text-[10px] text-gray-500 font-mono uppercase tracking-wider">Saída do Terminal:</span>
                <button class="btn-copy-tool-out text-[10px] font-mono text-gray-400 hover:text-white flex items-center gap-1 transition-colors">
                  ${icons.copy(10)}
                  <span>Copiar</span>
                </button>
              </div>
              <pre class="terminal-pre max-h-56 overflow-y-auto text-[11px] text-gray-300 p-2.5 rounded border border-[#272a34]/60 whitespace-pre-wrap">${this.escape(output)}</pre>
            `;
            body.appendChild(outBox);
            const copyBtn = outBox.querySelector('.btn-copy-tool-out');
            if (copyBtn) {
              copyBtn.onclick = () => {
                navigator.clipboard.writeText(output);
                copyBtn.innerHTML = `${icons.check(10)}<span>Copiado!</span>`;
                setTimeout(() => {
                  copyBtn.innerHTML = `${icons.copy(10)}<span>Copiar</span>`;
                }, 1800);
              };
            }
          }
        }
      }
    }
  }

  addThinkingBadge(container, tokens, dur) {
    const b = document.createElement('div');
    b.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-950/30 border border-purple-800/40 text-purple-300 text-[10px] font-mono my-1';
    b.innerHTML = `
      ${icons.brain(12)}
      <span>Raciocínio concluído (${tokens.toLocaleString()} tokens • ${dur?.toFixed(1) || ''}s)</span>
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
