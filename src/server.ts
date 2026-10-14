import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

import { configRouter } from './routes/config.js';
import { conversationsRouter } from './routes/conversations.js';
import { authRouter } from './routes/auth.js';
import { chatRouter } from './routes/chat.js';
import { quotaRouter } from './routes/quota.js';
import { mcpRouter } from './routes/mcp.js';
import { systemRouter } from './routes/system.js';
import { evolutionService } from './services/evolutionService.js';

const PORT = parseInt(process.env.PORT || '8088', 10);
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';
const CODE_SERVER_PORT = process.env.CODE_SERVER_PORT || '8089';

const app = express();
app.use(cors());
app.use(express.json());

// Validador de Segurança do PIN
function getValidAuthToken(): string | null {
  const configuredPin = (process.env.KRAKEN_PIN || '').trim();
  if (!configuredPin) return null;
  const secret = process.env.APP_SECRET || configuredPin;
  return crypto.createHmac('sha256', secret).update(`kraken_auth_${configuredPin}`).digest('hex');
}

// Middleware de autenticação de PIN para APIs críticas
const pinAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const configuredPin = (process.env.KRAKEN_PIN || '').trim();
  // Se não houver KRAKEN_PIN configurado, acesso liberado
  if (!configuredPin) return next();

  const fullPath = (req.baseUrl || '') + (req.path || '');
  if (
    fullPath.endsWith('/health') ||
    fullPath.endsWith('/auth/pin/status') ||
    fullPath.endsWith('/auth/pin/verify')
  ) {
    return next();
  }

  // Verifica token via cabeçalho Authorization ou query param
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || (req.query.token as string | undefined);
  const expectedToken = getValidAuthToken();

  if (token && expectedToken && token === expectedToken) {
    return next();
  }

  return res.status(401).json({
    error: 'Acesso não autorizado. Digite o PIN de segurança para continuar.',
    requirePin: true
  });
};

// Servir frontend estático (prioriza build do Vite se existir, senão fallback para public/)
const distDir = [
  path.resolve('frontend/dist'),
  path.resolve('dist'),
  path.resolve('public')
].find(dir => fs.existsSync(dir)) || path.resolve('public');

// Servir arquivos estáticos na raiz e em /chat
app.use(express.static(distDir));
app.use('/chat', express.static(distDir));

// Aplicar middleware de autenticação nas APIs
app.use('/api', pinAuthMiddleware);
app.use('/chat/api', pinAuthMiddleware);

// Rotas da API Modular (registradas em /api e /chat/api para suporte a subcaminho)
const registerRoutes = (prefix: string) => {
  app.use(`${prefix}/config`, configRouter);
  app.use(`${prefix}/conversations`, conversationsRouter);
  app.use(`${prefix}/auth`, authRouter);
  app.use(`${prefix}/chat`, chatRouter);
  app.use(`${prefix}/quota`, quotaRouter);
  app.use(`${prefix}/mcp`, mcpRouter);
  app.use(`${prefix}/system`, systemRouter);

  app.post(`${prefix}/stop`, (_req: Request, res: Response) => res.redirect(307, `${prefix}/chat/stop`));
  app.get(`${prefix}/projects`, (_req: Request, res: Response) => res.redirect(`${prefix}/config/projects`));

  app.get(`${prefix}/health`, (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      app: 'KrakenBridge Web (TypeScript)',
      pinProtected: !!(process.env.KRAKEN_PIN && process.env.KRAKEN_PIN.trim()),
      uptime: process.uptime(),
      workspaceDir: WORKSPACE_DIR
    });
  });
};

registerRoutes('/api');
registerRoutes('/chat/api');

// Redirecionamento SPA para index.html (tanto para / quanto para /chat/*)
app.get('*', (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/chat/api')) return next();
  res.sendFile(path.join(distDir, 'index.html'));
});

// Função para registrar automaticamente o roteamento no ZimaOS Gateway
const registerZimaosGatewayRoute = async (): Promise<boolean> => {
  const gatewayCandidates = [
    'http://127.0.0.1:80/v1/gateway/routes',
    'http://host.docker.internal:80/v1/gateway/routes',
    'http://172.17.0.1:80/v1/gateway/routes'
  ];

  for (const url of gatewayCandidates) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: '/chat',
          target: `http://127.0.0.1:${PORT}`
        })
      });
      if (response.ok) {
        console.log(`[KrakenBridge] Rota /chat registrada com sucesso no ZimaOS Gateway (${url})`);
        return true;
      }
    } catch {
      // Ignora e tenta o próximo candidato
    }
  }
  return false;
};

app.listen(PORT, '0.0.0.0', () => {
  const pinSet = !!(process.env.KRAKEN_PIN && process.env.KRAKEN_PIN.trim());
  console.log(`[KrakenBridge] Servidor ativo (TypeScript) na porta ${PORT}`);
  console.log(`[KrakenBridge] Proteção por PIN: ${pinSet ? 'ATIVADA' : 'DESATIVADA'}`);
  console.log(`[KrakenBridge] Rotas prontas em http://0.0.0.0:${PORT} e http://0.0.0.0:${PORT}/chat`);
  console.log(`[KrakenBridge] Workspace montado em: ${WORKSPACE_DIR}`);
  console.log(`[KrakenBridge] Conexão IDE na porta: ${CODE_SERVER_PORT}`);

  // Registra no Gateway imediatamente e a cada 5 minutos
  registerZimaosGatewayRoute();
  setInterval(registerZimaosGatewayRoute, 5 * 60 * 1000);

  // Checa se este boot é decorrente de um ciclo de auto-evolução
  evolutionService.checkAndResumeAfterBoot();
});
