import { Router, type Request, type Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { accountService } from '../services/accountService.js';
import { quotaService } from '../services/quotaService.js';
import { githubAuthService } from '../services/githubAuthService.js';
import { vercelAuthService } from '../services/vercelAuthService.js';

export const authRouter = Router();

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';
const TOKEN_PATH = process.env.AGY_TOKEN_PATH || '/root/.gemini/antigravity-cli/antigravity-oauth-token';

interface CurrentAuthSession {
  authUrl: string;
  verifier: string;
  state: string;
  startedAt: number;
}

// Sessão de autenticação dedicada ativa
let currentAuthSession: CurrentAuthSession | null = null;

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
  return { authenticated: false, email: null, name: null, picture: null, expiry: null };
}

// Endpoint de Status de Autenticação dos Agentes
authRouter.get('/status', async (_req: Request, res: Response) => {
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
        resolve({ authenticated: isAuth, email: null, name: null, picture: null, expiry: null });
      });
      check.on('error', () => resolve({ authenticated: false, email: null, name: null, picture: null, expiry: null }));
      setTimeout(() => {
        try { check.kill(); } catch (e) {}
        resolve({ authenticated: false, email: null, name: null, picture: null, expiry: null });
      }, 6000);
    });
  }

  const isAuth = agyInfo.authenticated || !!process.env.GEMINI_API_KEY;
  const githubInfo = await githubAuthService.getStatus();
  const vercelInfo = await vercelAuthService.getStatus();

  res.json({
    authenticated: isAuth,
    email: agyInfo.email,
    name: agyInfo.name,
    picture: agyInfo.picture,
    hasApiKey: !!process.env.GEMINI_API_KEY,
    isKeyValid: isAuth,
    antigravity: agyInfo,
    github: githubInfo,
    vercel: vercelInfo,
    claude: { hasKey: !!process.env.ANTHROPIC_API_KEY },
    aider: { hasKey: !!process.env.OPENAI_API_KEY }
  });
});

// Endpoint para Listar Contas Conectadas
authRouter.get('/accounts', async (_req: Request, res: Response) => {
  try {
    const data = await accountService.listAccounts();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Endpoint para Alternar Conta Ativa (1 clique)
authRouter.post('/accounts/switch', async (req: Request, res: Response) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email não informado.' });

    const switched = await accountService.switchAccount(email);
    // Dispara atualização oficial ao vivo das cotas para a nova conta ativa
    quotaService.fetchLiveQuotaFromGoogle(true).catch(() => {});
    res.json({ success: true, account: switched, message: `Conta alternada para ${email} com sucesso!` });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Endpoint para Validar Status do PIN do App
authRouter.get('/pin/status', (req: Request, res: Response) => {
  const configuredPin = (process.env.KRAKEN_PIN || '').trim();
  if (!configuredPin) {
    return res.json({ required: false, authenticated: true });
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || (req.query.token as string | undefined);
  const secret = process.env.APP_SECRET || configuredPin;
  const expectedToken = crypto.createHmac('sha256', secret).update(`kraken_auth_${configuredPin}`).digest('hex');
  const authenticated = !!(token && token === expectedToken);

  res.json({
    required: true,
    authenticated
  });
});

// Endpoint para Login com PIN
authRouter.post('/pin/verify', (req: Request, res: Response) => {
  const configuredPin = (process.env.KRAKEN_PIN || '').trim();
  if (!configuredPin) {
    return res.json({ success: true, message: 'Nenhum PIN configurado.' });
  }

  const { pin } = req.body || {};
  if (!pin || String(pin).trim() !== configuredPin) {
    return res.status(401).json({ success: false, error: 'PIN incorreto. Tente novamente.' });
  }

  // Gera token de sessão assinado por hash HMAC
  const secret = process.env.APP_SECRET || configuredPin;
  const token = crypto.createHmac('sha256', secret).update(`kraken_auth_${configuredPin}`).digest('hex');

  res.json({
    success: true,
    token,
    message: 'Acesso liberado com sucesso!'
  });
});

// Endpoint para Remover uma Conta Salva
authRouter.delete('/accounts/:email', async (req: Request, res: Response) => {
  try {
    const email = String(req.params.email);
    const result = await accountService.removeAccount(email);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = 'https://antigravity.google/oauth-callback';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
  'https://www.googleapis.com/auth/aicode',
  'openid'
].join(' ');

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('base64url');
  return { verifier, challenge, state };
}

// Endpoint para Iniciar Fluxo de Autenticação Google Antigravity
authRouter.post('/antigravity/start', async (req: Request, res: Response) => {
  const { force } = req.body || {};
  const currentAuth = await getAntigravityAuthInfo();

  // Se já está autenticado e o usuário não pediu para forçar login de nova conta
  if (currentAuth.authenticated && !force) {
    return res.json({
      status: 'already_authenticated',
      alreadyAuthenticated: true,
      email: currentAuth.email,
      name: currentAuth.name,
      message: `Você já está conectado com a conta Google (${currentAuth.email || 'Autenticado'})!`
    });
  }

  const { verifier, challenge, state } = generatePKCE();

  // Monta a URL oficial do Google OAuth com PKCE exato utilizado pelo agy
  const params = new URLSearchParams({
    access_type: 'offline',
    client_id: GOOGLE_CLIENT_ID,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'consent',
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    state
  });

  const authUrl = `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;

  currentAuthSession = {
    authUrl,
    verifier,
    state,
    startedAt: Date.now()
  };

  return res.json({
    status: 'waiting_for_code',
    authUrl
  });
});

// Endpoint para Submeter Código de Autorização Google Antigravity
authRouter.post('/antigravity/submit-code', async (req: Request, res: Response) => {
  let { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: 'Código de autorização não fornecido.' });
  }

  // Sanitização rigorosa do código colado pelo usuário
  code = String(code).trim().replace(/^['"]|['"]$/g, '').trim();
  if (code.includes('code=')) {
    const m = code.match(/[?&]code=([^&]+)/);
    if (m) code = decodeURIComponent(m[1]);
  }
  code = code.trim();

  try {
    const verifier = currentAuthSession?.verifier;

    // 1. Troca direta de código por tokens no Google OAuth
    const tokenParams = new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    if (verifier) {
      tokenParams.set('code_verifier', verifier);
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString()
    });

    const tokenJson = await tokenRes.json() as {
      error?: string;
      error_description?: string;
      access_token?: string;
      token_type?: string;
      refresh_token?: string;
      expires_in?: number;
      id_token?: string;
    };

    if (!tokenRes.ok || tokenJson.error) {
      const errMsg = tokenJson.error_description || tokenJson.error || 'Código de autorização inválido ou expirado.';
      return res.status(400).json({
        success: false,
        status: 'error',
        error: `Google OAuth Error: ${errMsg}`
      });
    }

    // 2. Montar objeto no formato exato esperado pelo Antigravity CLI (agy)
    const expiresInSec = tokenJson.expires_in || 3600;
    const expiryDate = new Date(Date.now() + expiresInSec * 1000).toISOString();

    const agyTokenStructure = {
      token: {
        access_token: tokenJson.access_token,
        token_type: tokenJson.token_type || 'Bearer',
        refresh_token: tokenJson.refresh_token || '',
        expiry: expiryDate
      },
      auth_method: 'consumer',
      id_token: tokenJson.id_token || ''
    };

    // 3. Salvar no store multi-contas e definir como ativa
    const saved = await accountService.saveTokenData(agyTokenStructure, true);

    // 4. Disparar atualização ao vivo da cota para a nova conta
    quotaService.fetchLiveQuotaFromGoogle(true).catch(() => {});

    currentAuthSession = null;

    return res.json({
      success: true,
      status: 'success',
      email: saved?.email,
      name: saved?.name,
      message: `Conta ${saved?.email || 'Google'} autenticada e ativada com sucesso!`
    });
  } catch (err) {
    console.error('[Auth] Erro ao trocar código OAuth:', err);
    return res.status(500).json({
      success: false,
      status: 'error',
      error: `Erro ao comunicar com Google OAuth: ${(err as Error).message}`
    });
  }
});

// Endpoint para Salvar Chaves de API (Claude / OpenAI / Gemini)
authRouter.post('/keys', async (req: Request, res: Response) => {
  const { geminiApiKey, anthropicApiKey, openaiApiKey } = req.body || {};
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

// ==========================================
// ENDPOINTS GITHUB AUTH & CLI CONFIGURATION
// ==========================================

// Obter status do GitHub CLI
authRouter.get('/github/status', async (_req: Request, res: Response) => {
  try {
    const status = await githubAuthService.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Iniciar fluxo OAuth Device Code do GitHub
authRouter.post('/github/device/start', async (_req: Request, res: Response) => {
  try {
    const data = await githubAuthService.startDeviceFlow();
    res.json({
      success: true,
      userCode: data.userCode,
      verificationUri: data.verificationUri,
      interval: data.interval
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// Polling do código do dispositivo
authRouter.get('/github/device/poll', async (_req: Request, res: Response) => {
  try {
    const result = await githubAuthService.pollToken();
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', error: (err as Error).message });
  }
});

// Salvar PAT diretamente (opção alternativa)
authRouter.post('/github/token', async (req: Request, res: Response) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Token não informado.' });
    const result = await githubAuthService.saveToken(token);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Desconectar GitHub CLI
authRouter.post('/github/logout', async (_req: Request, res: Response) => {
  try {
    await githubAuthService.logout();
    res.json({ success: true, message: 'GitHub desconectado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ==========================================
// ENDPOINTS VERCEL AUTH & CLI CONFIGURATION
// ==========================================

// Obter status do Vercel CLI
authRouter.get('/vercel/status', async (_req: Request, res: Response) => {
  try {
    const status = await vercelAuthService.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Iniciar fluxo OAuth Device Code da Vercel
authRouter.post('/vercel/device/start', async (_req: Request, res: Response) => {
  try {
    const data = await vercelAuthService.startDeviceFlow();
    res.json({
      success: true,
      userCode: data.userCode,
      verificationUri: data.verificationUri,
      verificationUriComplete: data.verificationUriComplete,
      interval: data.interval
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// Polling do código do dispositivo Vercel
authRouter.get('/vercel/device/poll', async (_req: Request, res: Response) => {
  try {
    const result = await vercelAuthService.pollToken();
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', error: (err as Error).message });
  }
});

// Salvar PAT diretamente (opção alternativa)
authRouter.post('/vercel/token', async (req: Request, res: Response) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Token não informado.' });
    const result = await vercelAuthService.saveToken(token);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Desconectar Vercel CLI
authRouter.post('/vercel/logout', async (_req: Request, res: Response) => {
  try {
    await vercelAuthService.logout();
    res.json({ success: true, message: 'Vercel desconectada com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

