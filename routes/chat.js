import { Router } from 'express';
import { spawn } from 'child_process';
import readline from 'readline';
import { randomUUID } from 'crypto';
import path from 'path';
import { historyService } from '../services/historyService.js';
import { quotaService } from '../services/quotaService.js';
import { accountService } from '../services/accountService.js';
import { identityService } from '../services/identityService.js';

export const chatRouter = Router();

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';

// Mapa de processos e sessões ativas
const activeProcesses = new Map();
export const activeSessions = new Map();

// Construtor flexível de argumentos para os drivers CLI dos agentes
const AGENT_DRIVERS = {
  antigravity: {
    cmd: 'agy',
    buildArgs: ({ prompt, conversationId, agyConvId, continueSession, model, effort, mode, sandbox, skipPermissions, disableSlashCommands }) => {
      const args = ['-p', prompt, '--output-format', 'stream-json'];

      if (skipPermissions !== false) {
        args.push('--dangerously-skip-permissions');
      }

      // Validar modelo suportado pelo Antigravity CLI
      const validAgyModels = [
        'gemini-3.8-flash-high', 'gemini-3.8-flash-medium', 'gemini-3.8-flash-low',
        'gemini-3.7-flash-high', 'gemini-3.7-flash-medium', 'gemini-3.7-flash-low',
        'gemini-3.6-flash-high', 'gemini-3.6-flash-medium', 'gemini-3.6-flash-low',
        'gemini-3.1-pro-high', 'gemini-3.1-pro-low',
        'claude-opus-5-5-low', 'claude-opus-5-5-medium', 'claude-opus-5-5-high',
        'claude-sonnet-5-5-low', 'claude-sonnet-5-5-medium', 'claude-sonnet-5-5-high',
        'gpt-oss-120b-medium'
      ];
      const safeModel = (model && validAgyModels.includes(model)) ? model : 'gemini-3.8-flash-high';
      args.push('--model', safeModel);

      // agy só aceita esforço válido (low, medium, high, xhigh, max)
      if (effort && effort !== 'default' && ['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) {
        args.push('--effort', effort);
      }

      // agy só aceita --mode accept-edits ou --mode plan
      if (mode && (mode === 'accept-edits' || mode === 'plan')) {
        args.push('--mode', mode);
      }

      if (sandbox) {
        args.push('--sandbox');
      }
      if (continueSession) {
        args.push('--continue');
      } else if (agyConvId) {
        args.push('--conversation', agyConvId);
      }

      return args;
    },
    buildEnv: (env) => ({ ...env, HOME: env.HOME || '/root' })
  },

  claude: {
    cmd: 'claude',
    buildArgs: ({ prompt, model, skipPermissions }) => {
      const args = ['-p', prompt];
      if (skipPermissions !== false) {
        args.push('--dangerously-skip-permissions');
      }
      if (model) {
        args.push('--model', model);
      }
      return args;
    },
    buildEnv: (env) => ({ ...env, HOME: env.HOME || '/root', ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY })
  },

  aider: {
    cmd: 'aider',
    buildArgs: ({ prompt, model }) => {
      const args = ['--message', prompt, '--yes-always', '--no-auto-commits'];
      if (model) {
        args.push('--model', model);
      }
      return args;
    },
    buildEnv: (env) => ({ ...env, HOME: env.HOME || '/root', OPENAI_API_KEY: env.OPENAI_API_KEY })
  }
};

// Endpoint principal de Chat com SSE Streaming
chatRouter.post('/', async (req, res) => {
  const {
    prompt,
    conversationId: clientConvId,
    continueSession,
    agent = 'antigravity',
    model,
    effort,
    mode,
    sandbox,
    skipPermissions,
    disableSlashCommands,
    subproject,
    chatMode = 'agent',
    accountEmail,
    force = false
  } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt é obrigatório' });
  }

  if (clientConvId && activeSessions.has(clientConvId)) {
    const existing = activeSessions.get(clientConvId);
    const isAlreadyDead = existing?.child && (existing.child.killed || existing.child.exitCode !== null);

    if (force || isAlreadyDead) {
      console.log(`[KrakenBridge] ${force ? 'Forçando envio' : 'Limpando processo encerrado'} na conversa ${clientConvId}.`);
      if (existing) {
        try {
          existing.child.kill('SIGTERM');
          setTimeout(() => {
            try {
              if (!existing.child.killed && existing.child.exitCode === null) {
                existing.child.kill('SIGKILL');
              }
            } catch {}
          }, 200);
        } catch (e) {
          console.warn('[KrakenBridge] Erro ao encerrar processo anterior:', e.message);
        }
        activeSessions.delete(clientConvId);
        activeProcesses.delete(existing.reqId);
        try {
          if (existing.res && !existing.res.writableEnded && !existing.res.destroyed) {
            existing.res.write(`data: ${JSON.stringify({ event: 'interrupted', message: 'Interrompido por envio forçado' })}\n\n`);
            existing.res.end();
          }
        } catch {}
      }
    } else {
      return res.status(409).json({ 
        error: 'Esta conversa já possui uma tarefa em execução. Aguarde a conclusão, use "Forçar Envio" ou clique em Parar.' 
      });
    }
  }

  const existingSession = clientConvId ? await historyService.get(clientConvId) : null;
  const conversationId = clientConvId || randomUUID();
  const agyConvId = existingSession?.agyConvId || null;
  const activeChatMode = chatMode || existingSession?.chatMode || 'agent';
  const activeAccountEmail = accountEmail || existingSession?.accountEmail || null;
  const reqId = randomUUID();

  // Determinação inteligente do subprojeto / workspace
  let activeSubproject = subproject || existingSession?.subproject || '';
  if (!activeSubproject) {
    try {
      const availableProjects = await historyService.getAvailableProjects();
      const detected = historyService.detectProject(prompt, availableProjects);
      if (detected) {
        activeSubproject = detected;
        console.log(`[KrakenBridge] Subprojeto auto-detectado a partir do prompt: "${activeSubproject}"`);
      }
    } catch (e) {
      console.warn('[KrakenBridge] Falha ao auto-detectar subprojeto:', e.message);
    }
  }

  // Configuração do diretório de trabalho
  const workDir = activeSubproject ? path.join(WORKSPACE_DIR, activeSubproject) : WORKSPACE_DIR;

  // Salvar mensagem do usuário no histórico com accountEmail
  await historyService.addMessage(conversationId, {
    id: randomUUID(),
    role: 'user',
    text: prompt,
    timestamp: new Date().toISOString()
  }, { agent, model, effort, mode, chatMode: activeChatMode, subproject: activeSubproject, agyConvId, accountEmail: activeAccountEmail });

  // Criar entrada inicial do assistente para permitir persistência contínua
  const assistantMsgId = randomUUID();
  await historyService.updateLastAssistantMessage(conversationId, {
    id: assistantMsgId,
    role: 'assistant',
    text: '',
    agent,
    model,
    toolCalls: [],
    timestamp: new Date().toISOString()
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Diretiva de Identidade (Kraken) e Modo Operacional
  const systemDirective = await identityService.buildSystemDirective({
    conversationId,
    activeChatMode
  });

  const effectivePrompt = `${systemDirective}${prompt}`;

  const driver = AGENT_DRIVERS[agent] || AGENT_DRIVERS.antigravity;
  const args = driver.buildArgs({
    prompt: effectivePrompt,
    conversationId,
    agyConvId,
    continueSession,
    model,
    effort,
    mode,
    sandbox,
    skipPermissions,
    disableSlashCommands
  });

  // Prepara HOME isolado caso uma conta específica tenha sido selecionada
  let processEnv = { ...process.env };
  if (agent === 'antigravity' && activeAccountEmail) {
    try {
      const isolatedHome = await accountService.prepareAccountHome(activeAccountEmail);
      processEnv.HOME = isolatedHome;
      console.log(`[KrakenBridge] Executando Antigravity sob conta isolada: ${activeAccountEmail} (HOME: ${isolatedHome})`);
    } catch (err) {
      console.warn(`[KrakenBridge] Erro ao isolar conta ${activeAccountEmail}:`, err.message);
    }
  }

  console.log(`[KrakenBridge] Motor: ${agent} | Conta: ${activeAccountEmail || 'padrão'} | Conv: ${conversationId} | Cwd: ${workDir} | Prompt: "${prompt.slice(0, 50)}..."`);

  const child = spawn(driver.cmd, args, {
    cwd: workDir,
    env: driver.buildEnv(processEnv)
  });

  activeProcesses.set(reqId, child);
  activeSessions.set(conversationId, {
    reqId,
    child,
    res,
    startTime: Date.now()
  });

  // Função para envio seguro de SSE (não quebra caso o cliente desconecte)
  const safeWrite = (chunk) => {
    try {
      const sess = activeSessions.get(conversationId);
      const targetRes = sess?.res || res;
      if (targetRes && !targetRes.writableEnded && !targetRes.destroyed) {
        targetRes.write(chunk);
      }
    } catch {
      // Conexão encerrada pelo cliente, ignorar
    }
  };

  // Enviar evento de início com os IDs e subprojeto resolvido
  safeWrite(`data: ${JSON.stringify({ event: 'session_start', conversation_id: conversationId, reqId, subproject: activeSubproject, chatMode: activeChatMode })}\n\n`);

  // Keep-alive heartbeat para conexões de longa duração
  const pingInterval = setInterval(() => {
    safeWrite(': ping\n\n');
  }, 15000);

  let accumulatedText = '';
  let thinkingText = '';
  let toolCalls = [];
  let lastUsage = null;
  let saveTimeout = null;

  // Persistência contínua com debounce
  const scheduleSave = () => {
    if (saveTimeout) return;
    saveTimeout = setTimeout(async () => {
      saveTimeout = null;
      try {
        await historyService.updateLastAssistantMessage(conversationId, {
          text: accumulatedText,
          thinking: thinkingText,
          agent,
          model,
          toolCalls
        });
      } catch (err) {
        console.warn('[KrakenBridge] Erro no auto-save do histórico:', err.message);
      }
    }, 400);
  };

  // Monitora stdout bruto para detectar solicitações de autenticação inline
  child.stdout.on('data', (data) => {
    const text = data.toString();
    const match = text.match(/(https:\/\/accounts\.google\.com\/o\/oauth2\/auth[^\s\r\n]+)/);
    if (match) {
      safeWrite(`data: ${JSON.stringify({ event: 'auth_required', authUrl: match[1], reqId })}\n\n`);
    }
  });

  const rl = readline.createInterface({ input: child.stdout });

  // Stream de eventos JSON emitidos pelo CLI do Agente
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed);

      // Salva ID interno do agy para continuações futuras
      if (parsed.event === 'init' && parsed.conversation_id) {
        historyService.save({ id: conversationId, agyConvId: parsed.conversation_id });
      }

      // Coleta respostas para persistência no histórico
      if (parsed.event === 'step_update' && parsed.step_update) {
        const su = parsed.step_update;
        if (su.step_type === 'agent_response') {
          if (su.text_delta) {
            accumulatedText += su.text_delta;
          }
          if (su.thinking_delta) {
            thinkingText += su.thinking_delta;
          }
          scheduleSave();
        }
        if (su.usage) {
          lastUsage = su.usage;
        }
        if (su.step_type === 'tool') {
          const params = su.tool_info?.parameters || {};
          const cmd = params.CommandLine 
            || (params.toolAction ? `${params.toolAction}: ${params.toolSummary || ''}` : '')
            || params.AbsolutePath 
            || params.TargetFile 
            || '';
          const out = su.tool_info?.output || '';
          const stepIdx = su.step_index;
          const existingIdx = toolCalls.findIndex(t => t.step_index !== undefined && t.step_index === stepIdx);

          if (existingIdx >= 0) {
            toolCalls[existingIdx] = {
              ...toolCalls[existingIdx],
              name: su.tool_name || toolCalls[existingIdx].name,
              command: cmd || toolCalls[existingIdx].command,
              output: out || toolCalls[existingIdx].output,
              duration: su.duration_seconds || toolCalls[existingIdx].duration,
              state: su.state
            };
          } else {
            toolCalls.push({
              step_index: stepIdx,
              name: su.tool_name || 'tool',
              command: cmd,
              output: out,
              duration: su.duration_seconds,
              state: su.state
            });
          }
          scheduleSave();
        }
      } else if (parsed.event === 'result') {
        if (parsed.result?.response && !accumulatedText) {
          accumulatedText = parsed.result.response;
        }
        if (parsed.result?.usage) {
          lastUsage = parsed.result.usage;
        }
        scheduleSave();
      }

      safeWrite(`data: ${JSON.stringify(parsed)}\n\n`);
    } catch {
      // Linhas não-JSON (saída terminal direta do Claude ou Aider)
      accumulatedText += trimmed + '\n';
      scheduleSave();
      safeWrite(`data: ${JSON.stringify({ event: 'raw', text: trimmed })}\n\n`);
    }
  });

  // Repassar logs do stderr
  child.stderr.on('data', (data) => {
    const text = data.toString();
    const match = text.match(/(https:\/\/accounts\.google\.com\/o\/oauth2\/auth[^\s\r\n]+)/);
    if (match) {
      safeWrite(`data: ${JSON.stringify({ event: 'auth_required', authUrl: match[1], reqId })}\n\n`);
    }
    safeWrite(`data: ${JSON.stringify({ event: 'stderr', text })}\n\n`);
  });

  child.on('close', async (code) => {
    clearInterval(pingInterval);
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    activeProcesses.delete(reqId);
    activeSessions.delete(conversationId);

    // Salvar estado final do assistente no histórico
    try {
      await historyService.updateLastAssistantMessage(conversationId, {
        text: accumulatedText,
        thinking: thinkingText,
        agent,
        model,
        toolCalls,
        tokens: lastUsage
      });
    } catch (err) {
      console.warn('[KrakenBridge] Erro ao finalizar gravação do histórico:', err.message);
    }

    // Salvar métricas de consumo de tokens para a cota horária e semanal
    if (lastUsage) {
      try {
        await quotaService.recordUsage({
          model: model || 'gemini-3.8-flash-high',
          agent: agent || 'antigravity',
          input_tokens: lastUsage.input_tokens,
          output_tokens: lastUsage.output_tokens,
          thinking_tokens: lastUsage.thinking_tokens,
          total_tokens: lastUsage.total_tokens
        });
      } catch (err) {
        console.warn('[KrakenBridge] Falha ao registrar cota:', err.message);
      }
    }

    safeWrite(`data: ${JSON.stringify({ event: 'done', code, conversation_id: conversationId })}\n\n`);
    try {
      if (res && !res.writableEnded && !res.destroyed) {
        res.end();
      }
    } catch {}
  });

  child.on('error', async (err) => {
    clearInterval(pingInterval);
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    activeProcesses.delete(reqId);
    activeSessions.delete(conversationId);

    try {
      await historyService.updateLastAssistantMessage(conversationId, {
        text: (accumulatedText ? accumulatedText + '\n\n' : '') + `⚠️ Erro de execução: ${err.message}`,
        thinking: thinkingText,
        agent,
        model,
        toolCalls
      });
    } catch {}

    safeWrite(`data: ${JSON.stringify({ event: 'error', error: err.message })}\n\n`);
    try {
      if (res && !res.writableEnded && !res.destroyed) {
        res.end();
      }
    } catch {}
  });

  // Quando o cliente desconecta (fecha aba, muda de tela ou recarrega a página)
  // O processo NÃO é finalizado: ele continua executando em background até o fim!
  res.on('close', () => {
    clearInterval(pingInterval);
    const session = activeSessions.get(conversationId);
    if (session && session.res === res) {
      session.res = null;
    }
    console.log(`[KrakenBridge] SSE desconectado pelo cliente para conv: ${conversationId} (processo ${child.pid} segue rodando em segundo plano)`);
  });
});

// Envio de stdin / código diretamente para processo de chat ativo
chatRouter.post('/submit-auth', (req, res) => {
  let { reqId, code } = req.body;
  if (!reqId || !code) return res.status(400).json({ error: 'reqId e code são obrigatórios' });
  if (code.includes('code=')) {
    const m = code.match(/[?&]code=([^&]+)/);
    if (m) code = decodeURIComponent(m[1]);
  }
  const proc = activeProcesses.get(reqId);
  if (!proc) return res.status(404).json({ error: 'Processo não encontrado ou já finalizado' });
  proc.stdin.write(code.trim() + '\n');
  res.json({ status: 'submitted' });
});

// Interromper geração ativa (específica de uma conversa ou todas)
chatRouter.post('/stop', (req, res) => {
  const { conversationId } = req.body || {};
  let count = 0;

  const terminateSession = (session, convId) => {
    try {
      session.child.kill('SIGTERM');
      setTimeout(() => {
        try {
          if (!session.child.killed && session.child.exitCode === null) {
            session.child.kill('SIGKILL');
          }
        } catch {}
      }, 250);
      count++;
    } catch (e) {
      console.error(`Erro ao finalizar processo da conversa ${convId}:`, e);
    }
    try {
      if (session.res && !session.res.writableEnded && !session.res.destroyed) {
        session.res.write(`data: ${JSON.stringify({ event: 'done', code: 130, interrupted: true, conversation_id: convId })}\n\n`);
        session.res.end();
      }
    } catch {}
  };

  if (conversationId && activeSessions.has(conversationId)) {
    const session = activeSessions.get(conversationId);
    terminateSession(session, conversationId);
    activeSessions.delete(conversationId);
    activeProcesses.delete(session.reqId);
  } else {
    for (const [convId, session] of activeSessions.entries()) {
      terminateSession(session, convId);
    }
    for (const [id, proc] of activeProcesses.entries()) {
      try {
        proc.kill('SIGTERM');
        count++;
      } catch (e) {
        console.error(`Erro ao finalizar processo ${id}:`, e);
      }
    }
    activeProcesses.clear();
    activeSessions.clear();
  }

  res.json({ status: 'stopped', terminated: count });
});
