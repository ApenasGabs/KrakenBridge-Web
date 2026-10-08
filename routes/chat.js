import { Router } from 'express';
import { spawn } from 'child_process';
import readline from 'readline';
import { randomUUID } from 'crypto';
import path from 'path';
import { historyService } from '../services/historyService.js';

export const chatRouter = Router();

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';

// Mapa de processos ativos por reqId
const activeProcesses = new Map();

// Construtor flexível de argumentos para os drivers CLI dos agentes
const AGENT_DRIVERS = {
  antigravity: {
    cmd: 'agy',
    buildArgs: ({ prompt, conversationId, agyConvId, continueSession, model, effort, mode, sandbox, skipPermissions, disableSlashCommands }) => {
      const args = ['-p', prompt, '--output-format', 'stream-json'];

      if (skipPermissions !== false) {
        args.push('--dangerously-skip-permissions');
      }
      if (model) {
        args.push('--model', model);
      }
      if (effort && effort !== 'default') {
        args.push('--effort', effort);
      }
      if (mode && mode !== 'default') {
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
    subproject
  } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt é obrigatório' });
  }

  const existingSession = clientConvId ? await historyService.get(clientConvId) : null;
  const conversationId = clientConvId || randomUUID();
  const agyConvId = existingSession?.agyConvId || null;
  const reqId = randomUUID();

  // Configuração do diretório de trabalho
  const workDir = subproject ? path.join(WORKSPACE_DIR, subproject) : WORKSPACE_DIR;

  // Salvar mensagem do usuário no histórico
  await historyService.addMessage(conversationId, {
    id: randomUUID(),
    role: 'user',
    text: prompt,
    timestamp: new Date().toISOString()
  }, { agent, model, effort, mode, subproject, agyConvId });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const driver = AGENT_DRIVERS[agent] || AGENT_DRIVERS.antigravity;
  const args = driver.buildArgs({
    prompt,
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

  console.log(`[KrakenBridge] Motor: ${agent} | Conv: ${conversationId} | Cwd: ${workDir} | Prompt: "${prompt.slice(0, 50)}..."`);

  const isLinux = process.platform === 'linux';
  let child;
  if (agent === 'antigravity' && isLinux) {
    // Aloca pseudo-terminal (PTY) via script util para permitir interatividade e captura OAuth
    const fullCmd = `${driver.cmd} ${args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`;
    child = spawn('script', ['-qec', fullCmd, '/dev/null'], {
      cwd: workDir,
      env: driver.buildEnv(process.env)
    });
  } else {
    child = spawn(driver.cmd, args, {
      cwd: workDir,
      env: driver.buildEnv(process.env)
    });
  }

  activeProcesses.set(reqId, child);

  // Enviar evento de início com os IDs
  res.write(`data: ${JSON.stringify({ event: 'session_start', conversation_id: conversationId, reqId })}\n\n`);

  let accumulatedText = '';
  let toolCalls = [];

  // Monitora stdout bruto para detectar solicitações de autenticação inline
  child.stdout.on('data', (data) => {
    const text = data.toString();
    const match = text.match(/(https:\/\/accounts\.google\.com\/o\/oauth2\/auth[^\s\r\n]+)/);
    if (match) {
      res.write(`data: ${JSON.stringify({ event: 'auth_required', authUrl: match[1], reqId })}\n\n`);
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
        if (su.step_type === 'agent_response' && su.text_delta) {
          accumulatedText += su.text_delta;
        }
        if (su.step_type === 'tool' && su.state === 'DONE') {
          toolCalls.push({
            name: su.tool_name || 'tool',
            command: su.tool_info?.CommandLine || '',
            duration: su.duration_seconds
          });
        }
      } else if (parsed.event === 'result' && parsed.result?.response) {
        if (!accumulatedText) accumulatedText = parsed.result.response;
      }

      res.write(`data: ${JSON.stringify(parsed)}\n\n`);
    } catch {
      // Linhas não-JSON (saída terminal direta do Claude ou Aider)
      accumulatedText += trimmed + '\n';
      res.write(`data: ${JSON.stringify({ event: 'raw', text: trimmed })}\n\n`);
    }
  });

  // Repassar logs do stderr
  child.stderr.on('data', (data) => {
    const text = data.toString();
    const match = text.match(/(https:\/\/accounts\.google\.com\/o\/oauth2\/auth[^\s\r\n]+)/);
    if (match) {
      res.write(`data: ${JSON.stringify({ event: 'auth_required', authUrl: match[1], reqId })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ event: 'stderr', text })}\n\n`);
  });

  child.on('close', async (code) => {
    activeProcesses.delete(reqId);

    // Salvar resposta do assistente no histórico
    if (accumulatedText.trim()) {
      await historyService.addMessage(conversationId, {
        id: randomUUID(),
        role: 'assistant',
        text: accumulatedText,
        agent,
        model,
        toolCalls,
        timestamp: new Date().toISOString()
      });
    }

    res.write(`data: ${JSON.stringify({ event: 'done', code, conversation_id: conversationId })}\n\n`);
    res.end();
  });

  child.on('error', (err) => {
    activeProcesses.delete(reqId);
    res.write(`data: ${JSON.stringify({ event: 'error', error: err.message })}\n\n`);
    res.end();
  });

  // Cancelar se a conexão for encerrada pelo cliente
  res.on('close', () => {
    if (!res.writableEnded && activeProcesses.has(reqId)) {
      const proc = activeProcesses.get(reqId);
      proc.kill('SIGTERM');
      activeProcesses.delete(reqId);
    }
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

// Interromper geração ativa
chatRouter.post('/stop', (req, res) => {
  let count = 0;
  for (const [id, proc] of activeProcesses.entries()) {
    try {
      proc.kill('SIGTERM');
      count++;
    } catch (e) {
      console.error(`Erro ao finalizar processo ${id}:`, e);
    }
  }
  activeProcesses.clear();
  res.json({ status: 'stopped', terminated: count });
});
