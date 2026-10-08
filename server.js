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

// Sessão de autenticação dedicada ativa
let currentAuthSession = null;

// Endpoint de Status de Autenticação dos Agentes
app.get('/api/auth/status', async (req, res) => {
  const checkAgy = () => new Promise((resolve) => {
    const check = spawn('agy', ['models'], { env: { ...process.env, HOME: '/root' } });
    let output = '';
    check.stdout.on('data', d => output += d.toString());
    check.stderr.on('data', d => output += d.toString());
    check.on('close', (code) => {
      const isAuth = code === 0 && !output.includes('Please sign in');
      resolve({ authenticated: isAuth });
    });
    check.on('error', () => resolve({ authenticated: false }));
    setTimeout(() => { try { check.kill(); } catch (e) {}; resolve({ authenticated: false }); }, 4000);
  });

  const agyStatus = await checkAgy();

  res.json({
    antigravity: agyStatus,
    claude: { hasKey: !!process.env.ANTHROPIC_API_KEY },
    aider: { hasKey: !!process.env.OPENAI_API_KEY }
  });
});

// Endpoint para Iniciar Fluxo de Autenticação Google Antigravity
app.post('/api/auth/antigravity/start', (req, res) => {
  if (currentAuthSession && currentAuthSession.process) {
    try { currentAuthSession.process.kill(); } catch (e) {}
    currentAuthSession = null;
  }

  const isLinux = process.platform === 'linux';
  let child;
  if (isLinux) {
    child = spawn('script', ['-qec', 'agy -p "auth-login-check" --output-format stream-json --dangerously-skip-permissions', '/dev/null'], {
      cwd: WORKSPACE_DIR,
      env: { ...process.env, HOME: '/root' }
    });
  } else {
    child = spawn('agy', ['-p', 'auth-login-check', '--output-format', 'stream-json', '--dangerously-skip-permissions'], {
      cwd: WORKSPACE_DIR,
      env: { ...process.env, HOME: process.env.HOME || '/root' }
    });
  }

  let resolved = false;

  currentAuthSession = {
    process: child,
    authUrl: null,
    startedAt: Date.now()
  };

  const checkOutput = (data) => {
    const text = data.toString();
    const match = text.match(/(https:\/\/accounts\.google\.com\/o\/oauth2\/auth[^\s\r\n]+)/);
    if (match && !resolved) {
      resolved = true;
      currentAuthSession.authUrl = match[1];
      return res.json({ status: 'waiting_for_code', authUrl: match[1] });
    }
  };

  child.stdout.on('data', checkOutput);
  child.stderr.on('data', checkOutput);

  child.on('close', (code) => {
    if (!resolved) {
      resolved = true;
      res.status(500).json({ error: 'Processo encerrou sem emitir URL de autenticação.', code });
    }
  });

  child.on('error', (err) => {
    if (!resolved) {
      resolved = true;
      res.status(500).json({ error: err.message });
    }
  });

  setTimeout(() => {
    if (!resolved) {
      resolved = true;
      res.status(408).json({ error: 'Tempo limite ao aguardar link de autenticação do Google.' });
    }
  }, 15000);
});

// Endpoint para Submeter Código de Autorização Google Antigravity
app.post('/api/auth/antigravity/submit-code', (req, res) => {
  let { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Código de autorização não fornecido.' });
  }

  // Se o usuário colou a URL inteira retornada pelo Google
  if (code.includes('code=')) {
    const m = code.match(/[?&]code=([^&]+)/);
    if (m) code = decodeURIComponent(m[1]);
  }
  code = code.trim();

  if (!currentAuthSession || !currentAuthSession.process) {
    return res.status(400).json({ error: 'Nenhuma sessão de autenticação ativa. Clique em "Iniciar Login" novamente.' });
  }

  const child = currentAuthSession.process;
  let responseSent = false;

  const onData = (data) => {
    const text = data.toString();
    console.log('[Auth Response]', text);
    if (text.includes('error') || text.includes('failed')) {
      if (!responseSent) {
        responseSent = true;
        res.status(400).json({ status: 'error', error: text });
      }
    }
  };

  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('close', (exitCode) => {
    currentAuthSession = null;
    if (!responseSent) {
      responseSent = true;
      res.json({
        status: exitCode === 0 ? 'success' : 'completed',
        code: exitCode,
        message: exitCode === 0 ? 'Google Antigravity autenticado com sucesso!' : 'Código processado.'
      });
    }
  });

  child.stdin.write(code + '\n');
});

// Endpoint para Salvar Chaves de API (Claude / OpenAI / Gemini)
app.post('/api/auth/keys', async (req, res) => {
  const { anthropicApiKey, openaiApiKey } = req.body;
  if (anthropicApiKey) process.env.ANTHROPIC_API_KEY = anthropicApiKey.trim();
  if (openaiApiKey) process.env.OPENAI_API_KEY = openaiApiKey.trim();

  try {
    const envPath = path.join(WORKSPACE_DIR, '.env');
    let envContent = '';
    try { envContent = await fs.readFile(envPath, 'utf8'); } catch (e) {}

    if (anthropicApiKey) {
      if (envContent.includes('ANTHROPIC_API_KEY=')) {
        envContent = envContent.replace(/ANTHROPIC_API_KEY=.*/, `ANTHROPIC_API_KEY=${anthropicApiKey.trim()}`);
      } else {
        envContent += `\nANTHROPIC_API_KEY=${anthropicApiKey.trim()}\n`;
      }
    }
    if (openaiApiKey) {
      if (envContent.includes('OPENAI_API_KEY=')) {
        envContent = envContent.replace(/OPENAI_API_KEY=.*/, `OPENAI_API_KEY=${openaiApiKey.trim()}`);
      } else {
        envContent += `\nOPENAI_API_KEY=${openaiApiKey.trim()}\n`;
      }
    }
    await fs.writeFile(envPath, envContent.trim() + '\n', 'utf8');
  } catch (e) {
    console.error('Erro ao persistir .env:', e);
  }

  res.json({
    status: 'saved',
    claude: !!process.env.ANTHROPIC_API_KEY,
    aider: !!process.env.OPENAI_API_KEY
  });
});

// Envio de stdin / código diretamente para processo de chat ativo
app.post('/api/chat/submit-auth', (req, res) => {
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

  const isLinux = process.platform === 'linux';
  let child;
  if (agent === 'antigravity' && isLinux) {
    // Aloca pseudo-terminal (PTY) via script util para permitir interatividade e captura OAuth
    const fullCmd = `${driver.cmd} ${args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`;
    child = spawn('script', ['-qec', fullCmd, '/dev/null'], {
      cwd: WORKSPACE_DIR,
      env: driver.buildEnv(process.env)
    });
  } else {
    child = spawn(driver.cmd, args, {
      cwd: WORKSPACE_DIR,
      env: driver.buildEnv(process.env)
    });
  }

  activeProcesses.set(reqId, child);

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
      res.write(`data: ${JSON.stringify(parsed)}\n\n`);
    } catch {
      // Se não for JSON (ex: saída de terminal direta do claude ou aider), encapsula como evento de texto
      res.write(`data: ${JSON.stringify({ event: 'raw', text: trimmed })}\n\n`);
    }
  });

  // Repassar logs do stderr (saídas de comandos, diagnósticos e warnings)
  child.stderr.on('data', (data) => {
    const text = data.toString();
    const match = text.match(/(https:\/\/accounts\.google\.com\/o\/oauth2\/auth[^\s\r\n]+)/);
    if (match) {
      res.write(`data: ${JSON.stringify({ event: 'auth_required', authUrl: match[1], reqId })}\n\n`);
    }
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
