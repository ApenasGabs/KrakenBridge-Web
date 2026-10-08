import express from 'express';
import cors from 'cors';
import path from 'path';

import { configRouter } from './routes/config.js';
import { conversationsRouter } from './routes/conversations.js';
import { authRouter } from './routes/auth.js';
import { chatRouter } from './routes/chat.js';

const PORT = parseInt(process.env.PORT || '8088', 10);
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';
const CODE_SERVER_PORT = process.env.CODE_SERVER_PORT || '8089';

const app = express();
app.use(cors());
app.use(express.json());

// Servir frontend estático
const publicDir = path.resolve('public');
app.use(express.static(publicDir));

// Rotas da API Modular
app.use('/api/config', configRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);

// Compatibilidade de rotas diretas
app.post('/api/stop', (req, res) => res.redirect(307, '/api/chat/stop'));
app.get('/api/projects', (req, res) => res.redirect('/api/config/projects'));

// Health check para contêineres Docker / CasaOS
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    app: 'KrakenBridge Web',
    uptime: process.uptime(),
    workspaceDir: WORKSPACE_DIR
  });
});

// Redirecionamento SPA para index.html
app.get(['/', '/chat'], (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[KrakenBridge] Servidor ativo na porta ${PORT}`);
  console.log(`[KrakenBridge] Workspace montado em: ${WORKSPACE_DIR}`);
  console.log(`[KrakenBridge] Conexão IDE na porta: ${CODE_SERVER_PORT}`);
});
