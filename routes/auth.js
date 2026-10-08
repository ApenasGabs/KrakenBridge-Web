import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

export const authRouter = Router();

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';
const TOKEN_PATH = process.env.AGY_TOKEN_PATH || '/root/.gemini/antigravity-cli/antigravity-oauth-token';

// Sessão de autenticação dedicada ativa
let currentAuthSession = null;

/**
 * Lê diretamente as credenciais salvas do Google Antigravity
 */
async function getAntigravityAuthInfo() {
  try {
    const raw = await fs.readFile(TOKEN_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    let email = null;
    let name = null;

    if (parsed.id_token) {
      try {
        const payload = JSON.parse(Buffer.from(parsed.id_token.split('.')[1], 'base64').toString('utf8'));
        email = payload.email || null;
        name = payload.name || null;
      } catch (e) {}
    }

    if (!email) {
      const matchEmail = raw.match(/"email"\s*:\s*"([^"]+)"/);
      if (matchEmail) email = matchEmail[1];
      const matchName = raw.match(/"name"\s*:\s*"([^"]+)"/);
      if (matchName) name = matchName[1];
    }

    const hasToken = !!(parsed.token?.access_token || parsed.token?.refresh_token);
    return {
      authenticated: hasToken,
      email,
      name,
      expiry: parsed.token?.expiry || null
    };
  } catch {
    return { authenticated: false, email: null, name: null };
  }
}

// Endpoint de Status de Autenticação dos Agentes
authRouter.get('/status', async (req, res) => {
  let agyInfo = await getAntigravityAuthInfo();

  // Fallback para agy models se o arquivo não existir
  if (!agyInfo.authenticated) {
    agyInfo = await new Promise((resolve) => {
      const check = spawn('agy', ['models'], { env: { ...process.env, HOME: '/root' } });
      let output = '';
      check.stdout.on('data', d => output += d.toString());
      check.stderr.on('data', d => output += d.toString());
      check.on('close', (code) => {
        const isAuth = code === 0 && !output.includes('Please sign in');
        resolve({ authenticated: isAuth, email: null, name: null });
      });
      check.on('error', () => resolve({ authenticated: false, email: null, name: null }));
      setTimeout(() => { 
        try { check.kill(); } catch (e) {}
        resolve({ authenticated: false, email: null, name: null }); 
      }, 6000);
    });
  }

  const isAuth = agyInfo.authenticated || !!process.env.GEMINI_API_KEY;

  res.json({
    authenticated: isAuth,
    email: agyInfo.email,
    name: agyInfo.name,
    hasApiKey: !!process.env.GEMINI_API_KEY,
    isKeyValid: isAuth,
    antigravity: agyInfo,
    claude: { hasKey: !!process.env.ANTHROPIC_API_KEY },
    aider: { hasKey: !!process.env.OPENAI_API_KEY }
  });
});

// Endpoint para Iniciar Fluxo de Autenticação Google Antigravity
authRouter.post('/antigravity/start', async (req, res) => {
  const { force } = req.body || {};
  const currentAuth = await getAntigravityAuthInfo();

  // Se já está autenticado e o usuário não pediu para forçar re-login
  if (currentAuth.authenticated && !force) {
    return res.json({
      status: 'already_authenticated',
      alreadyAuthenticated: true,
      email: currentAuth.email,
      name: currentAuth.name,
      message: `Você já está conectado com a conta Google (${currentAuth.email || 'Autenticado'})!`
    });
  }

  // Cancelar sessão anterior se houver
  if (currentAuthSession && currentAuthSession.process) {
    try { currentAuthSession.process.kill(); } catch (e) {}
    currentAuthSession = null;
  }

  // Se pediu force=true, renomeia o token para backup para gerar nova URL
  if (force) {
    try {
      await fs.rename(TOKEN_PATH, `${TOKEN_PATH}.bak_${Date.now()}`);
    } catch (e) {}
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
authRouter.post('/antigravity/submit-code', (req, res) => {
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
authRouter.post('/keys', async (req, res) => {
  const { geminiApiKey, anthropicApiKey, openaiApiKey } = req.body;
  if (geminiApiKey) process.env.GEMINI_API_KEY = geminiApiKey.trim();
  if (anthropicApiKey) process.env.ANTHROPIC_API_KEY = anthropicApiKey.trim();
  if (openaiApiKey) process.env.OPENAI_API_KEY = openaiApiKey.trim();

  try {
    const envPath = path.join(WORKSPACE_DIR, '.env');
    let envContent = '';
    try { envContent = await fs.readFile(envPath, 'utf8'); } catch (e) {}

    if (geminiApiKey) {
      if (envContent.includes('GEMINI_API_KEY=')) {
        envContent = envContent.replace(/GEMINI_API_KEY=.*/, `GEMINI_API_KEY=${geminiApiKey.trim()}`);
      } else {
        envContent += `\nGEMINI_API_KEY=${geminiApiKey.trim()}\n`;
      }
    }
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
    gemini: !!process.env.GEMINI_API_KEY,
    claude: !!process.env.ANTHROPIC_API_KEY,
    aider: !!process.env.OPENAI_API_KEY
  });
});
