import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { accountService } from '../services/accountService.js';

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
    const info = accountService.extractAccountInfo(raw);
    if (info && info.hasToken) {
      return {
        authenticated: true,
        email: info.email,
        name: info.name,
        picture: info.picture,
        expiry: info.expiry
      };
    }
  } catch {}
  return { authenticated: false, email: null, name: null, picture: null };
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
        resolve({ authenticated: isAuth, email: null, name: null, picture: null });
      });
      check.on('error', () => resolve({ authenticated: false, email: null, name: null, picture: null }));
      setTimeout(() => { 
        try { check.kill(); } catch (e) {}
        resolve({ authenticated: false, email: null, name: null, picture: null }); 
      }, 6000);
    });
  }

  const isAuth = agyInfo.authenticated || !!process.env.GEMINI_API_KEY;

  res.json({
    authenticated: isAuth,
    email: agyInfo.email,
    name: agyInfo.name,
    picture: agyInfo.picture,
    hasApiKey: !!process.env.GEMINI_API_KEY,
    isKeyValid: isAuth,
    antigravity: agyInfo,
    claude: { hasKey: !!process.env.ANTHROPIC_API_KEY },
    aider: { hasKey: !!process.env.OPENAI_API_KEY }
  });
});

// Endpoint para Listar Contas Conectadas
authRouter.get('/accounts', async (req, res) => {
  try {
    const data = await accountService.listAccounts();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para Alternar Conta Ativa (1 clique)
authRouter.post('/accounts/switch', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email não informado.' });

    const switched = await accountService.switchAccount(email);
    res.json({ success: true, account: switched, message: `Conta alternada para ${email} com sucesso!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para Remover uma Conta Salva
authRouter.delete('/accounts/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const result = await accountService.removeAccount(email);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para Iniciar Fluxo de Autenticação Google Antigravity
authRouter.post('/antigravity/start', async (req, res) => {
  const { force } = req.body || {};
  const currentAuth = await getAntigravityAuthInfo();

  // Se já está autenticado e o usuário não pediu para forçar re-login / nova conta
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

  // Se pediu force=true para conectar nova conta, preserva a atual no store e faz backup do token principal
  if (force) {
    try {
      const currentRaw = await fs.readFile(TOKEN_PATH, 'utf8').catch(() => null);
      if (currentRaw) {
        await accountService.saveTokenData(currentRaw, false);
        await fs.rename(TOKEN_PATH, `${TOKEN_PATH}.bak_${Date.now()}`);
      }
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
  let lastOutput = '';

  child.stdout.on('data', (d) => { lastOutput += d.toString(); });
  child.stderr.on('data', (d) => { lastOutput += d.toString(); });

  child.on('close', async (exitCode) => {
    currentAuthSession = null;
    if (responseSent) return;
    responseSent = true;

    // Verificar se o arquivo do token foi criado ou atualizado
    try {
      const rawToken = await fs.readFile(TOKEN_PATH, 'utf8');
      const saved = await accountService.saveTokenData(rawToken, true);

      return res.json({
        success: true,
        status: 'success',
        code: exitCode,
        email: saved?.email,
        name: saved?.name,
        message: 'Google Antigravity autenticado com sucesso!'
      });
    } catch (e) {
      if (exitCode === 0) {
        return res.json({
          success: true,
          status: 'success',
          code: 0,
          message: 'Código processado com sucesso.'
        });
      }
      return res.status(400).json({
        success: false,
        status: 'error',
        error: lastOutput || 'Falha ao processar código de autenticação.'
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
