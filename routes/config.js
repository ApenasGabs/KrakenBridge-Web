import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';

export const configRouter = Router();

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';
const CODE_SERVER_PORT = process.env.CODE_SERVER_PORT || '8089';

// Cache em memória para lista de modelos disponíveis
let cachedModels = null;
let lastModelsCheck = 0;

// Configuração geral
configRouter.get('/', (req, res) => {
  res.json({
    appName: 'KrakenBridge Web',
    workspaceDir: WORKSPACE_DIR,
    codeServerPort: CODE_SERVER_PORT,
    supportedAgents: [
      { id: 'antigravity', name: 'Google Antigravity', cmd: 'agy' },
      { id: 'claude', name: 'Claude Code', cmd: 'claude' },
      { id: 'aider', name: 'Codex / Aider', cmd: 'aider' }
    ],
    effortLevels: [
      { id: 'low', name: 'Baixo (Rápido)' },
      { id: 'medium', name: 'Médio' },
      { id: 'high', name: 'Alto (Padrão)' },
      { id: 'xhigh', name: 'Extra Alto' },
      { id: 'max', name: 'Máximo' }
    ],
    modes: [
      { id: 'default', name: 'Execução Normal', description: 'Executa comandos e aplica edições diretamente' },
      { id: 'plan', name: 'Modo Planejamento', description: 'Gera plano detalhado antes de efetuar alterações' },
      { id: 'accept-edits', name: 'Aceitar Edições', description: 'Aplica modificações nos arquivos com aprovação ágil' }
    ]
  });
});

// Listagem de projetos / subpastas do workspace
configRouter.get('/projects', async (req, res) => {
  try {
    const entries = await fs.readdir(WORKSPACE_DIR, { withFileTypes: true });
    const projects = entries
      .filter((e) => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.'))
      .map((e) => ({ name: e.name, path: path.join(WORKSPACE_DIR, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ projects, count: projects.length });
  } catch (err) {
    res.json({ projects: [], count: 0, error: err.message });
  }
});

// Listagem dinâmica de modelos suportados por cada agente
configRouter.get('/models', async (req, res) => {
  const now = Date.now();
  // Se o cache tiver menos de 60 segundos, retorna direto
  if (cachedModels && now - lastModelsCheck < 60000) {
    return res.json(cachedModels);
  }

  // Tenta consultar modelos nativos via agy models
  const agyModels = await new Promise((resolve) => {
    const child = spawn('agy', ['models'], { env: { ...process.env, HOME: '/root' } });
    let output = '';
    child.stdout.on('data', (d) => output += d.toString());
    child.stderr.on('data', (d) => output += d.toString());
    child.on('close', (code) => {
      if (code === 0 && !output.includes('Please sign in')) {
        const lines = output.split('\n');
        const list = [];
        for (const line of lines) {
          const parts = line.split('\t');
          if (parts.length >= 2 && parts[0].trim()) {
            list.push({ id: parts[0].trim(), name: parts[1].trim() });
          }
        }
        if (list.length > 0) return resolve(list);
      }
      // Modelos padrão caso não esteja autenticado no momento
      resolve([
        { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)' },
        { id: 'gemini-3.7-flash-high', name: 'Gemini 3.7 Flash (High)' },
        { id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (High)' },
        { id: 'claude-opus-5-5-high', name: 'Claude Opus 5.5 (High)' },
        { id: 'claude-sonnet-5-5-high', name: 'Claude Sonnet 5.5 (High)' },
        { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)' }
      ]);
    });
    child.on('error', () => {
      resolve([
        { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)' },
        { id: 'gemini-3.7-flash-high', name: 'Gemini 3.7 Flash (High)' }
      ]);
    });
    setTimeout(() => { try { child.kill(); } catch (e) {}; resolve([]); }, 4000);
  });

  cachedModels = {
    antigravity: agyModels,
    claude: [
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet (Recomendado)' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' }
    ],
    aider: [
      { id: 'gpt-4o', name: 'OpenAI GPT-4o' },
      { id: 'o3-mini', name: 'OpenAI o3-mini' },
      { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
      { id: 'deepseek-chat', name: 'DeepSeek V3' }
    ]
  };

  lastModelsCheck = now;
  res.json(cachedModels);
});
