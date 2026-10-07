import express from 'express';
import cors from 'cors';
import path from 'path';
import { spawn } from 'child_process';
import readline from 'readline';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';

const PORT = parseInt(process.env.PORT || '8088', 10);
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';
const CODE_SERVER_PORT = process.env.CODE_SERVER_PORT || '8089';

const app = express();
app.use(cors());
app.use(express.json());

// Servir frontend estático
const publicDir = path.resolve('public');
app.use(express.static(publicDir));

app.get(['/', '/chat'], (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Endpoint de configuração dinâmica para o frontend
app.get('/api/config', (req, res) => {
  res.json({
    appName: 'KrakenBridge Web',
    workspaceDir: WORKSPACE_DIR,
    codeServerPort: CODE_SERVER_PORT,
    supportedAgents: [
      { id: 'antigravity', name: 'Google Antigravity (agy)', icon: '✨' },
      { id: 'claude', name: 'Claude Code (claude)', icon: '🟣' },
      { id: 'aider', name: 'OpenAI Codex / Aider', icon: '🟢' }
    ]
  });
});

// Health check para contêineres Docker
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', app: 'KrakenBridge Web', uptime: process.uptime() });
});

// Mapa de processos ativos para cancelamento gracioso
const activeProcesses = new Map();

// Configuração dos motores / drivers de execução de agentes CLI
const AGENT_DRIVERS = {
  antigravity: {
    cmd: 'agy',
    buildArgs: (prompt, continueSession, conversationId) => {
      const args = ['-p', prompt, '--output-format', 'stream-json', '--dangerously-skip-permissions'];
      if (continueSession) args.push('--continue');
      else if (conversationId) args.push('--conversation', conversationId);
      return args;
    },
    buildEnv: (env) => ({ ...env, HOME: env.HOME || '/root' })
  },
  claude: {
    cmd: 'claude',
    buildArgs: (prompt) => ['-p', prompt, '--dangerously-skip-permissions'],
    buildEnv: (env) => ({ ...env, HOME: env.HOME || '/root', ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY })
  },
  aider: {
    cmd: 'aider',
    buildArgs: (prompt) => ['--message', prompt, '--yes-always', '--no-auto-commits'],
    buildEnv: (env) => ({ ...env, HOME: env.HOME || '/root', OPENAI_API_KEY: env.OPENAI_API_KEY })
  }
};

// Endpoint de Chat com Streaming SSE
app.post('/api/chat', (req, res) => {
  const { prompt, continueSession, conversationId, agent = 'antigravity' } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt é obrigatório' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const driver = AGENT_DRIVERS[agent] || AGENT_DRIVERS.antigravity;
  const args = driver.buildArgs(prompt, continueSession, conversationId);
  const reqId = randomUUID();

  console.log(`[KrakenBridge] Motor: ${agent} | PID (${reqId}) | Prompt: "${prompt.slice(0, 60)}..."`);

  const child = spawn(driver.cmd, args, {
    cwd: WORKSPACE_DIR,
    env: driver.buildEnv(process.env)
  });

  activeProcesses.set(reqId, child);

  const rl = readline.createInterface({ input: child.stdout });

  // Stream de eventos JSON emitidos pelo CLI do Agente
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed);
      res.write(`data: ${JSON.stringify(parsed)}\n\n`);
    } catch {
      // Se não for JSON (ex: saída de terminal direta do claude ou aider), encapsula como evento de texto
      res.write(`data: ${JSON.stringify({ event: 'raw', text: trimmed })}\n\n`);
    }
  });

  // Repassar logs do stderr (saídas de comandos, diagnósticos e warnings)
  child.stderr.on('data', (data) => {
    const text = data.toString();
    res.write(`data: ${JSON.stringify({ event: 'stderr', text })}\n\n`);
  });

  child.on('close', (code) => {
    activeProcesses.delete(reqId);
    res.write(`data: ${JSON.stringify({ event: 'done', code })}\n\n`);
    res.end();
  });

  child.on('error', (err) => {
    activeProcesses.delete(reqId);
    res.write(`data: ${JSON.stringify({ event: 'error', error: err.message })}\n\n`);
    res.end();
  });

  // Cancelar se o navegador fechar a conexão
  res.on('close', () => {
    if (!res.writableEnded && activeProcesses.has(reqId)) {
      const proc = activeProcesses.get(reqId);
      proc.kill('SIGTERM');
      activeProcesses.delete(reqId);
    }
  });
});

// Interromper geração ativa
app.post('/api/stop', (req, res) => {
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

// Listar subprojetos no workspace
app.get('/api/projects', async (req, res) => {
  try {
    const entries = await fs.readdir(WORKSPACE_DIR, { withFileTypes: true });
    const projects = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => ({ name: e.name, path: path.join(WORKSPACE_DIR, e.name) }));
    res.json({ projects, count: projects.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🦑 KrakenBridge Web ativo na porta ${PORT}`);
  console.log(`📂 Workspace montado em: ${WORKSPACE_DIR}`);
  console.log(`💻 Conexão IDE configurada para a porta: ${CODE_SERVER_PORT}`);
});
