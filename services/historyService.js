import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

// Garante que o diretório de dados existe
async function ensureDir() {
  try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
  } catch (err) {
    console.error('[HistoryService] Erro ao criar diretório de sessões:', err.message);
  }
}

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';
let cachedProjects = null;
let lastProjectsCheck = 0;

async function getAvailableProjects() {
  const now = Date.now();
  if (cachedProjects && now - lastProjectsCheck < 30000) {
    return cachedProjects;
  }
  try {
    const entries = await fs.readdir(WORKSPACE_DIR, { withFileTypes: true });
    cachedProjects = entries
      .filter(e => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.'))
      .map(e => ({ name: e.name, path: path.join(WORKSPACE_DIR, e.name) }));
    lastProjectsCheck = now;
    return cachedProjects;
  } catch {
    return [];
  }
}

function normalizeForMatch(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function detectProjectFromText(text, projects) {
  if (!text || !projects || projects.length === 0) return null;
  const lower = text.toLowerCase();
  const clean = normalizeForMatch(text);

  // 1. Verificação exata por nome de pasta como palavra completa (ou regex com hífens flexíveis)
  for (const proj of projects) {
    const pName = proj.name;
    const escaped = pName.toLowerCase().replace(/[-_]/g, '[-_]?');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(lower)) {
      return pName;
    }
  }

  // 2. Normalização sem caracteres especiais (mínimo 4 caracteres)
  for (const proj of projects) {
    const cleanProj = normalizeForMatch(proj.name);
    if (cleanProj.length >= 4 && clean.includes(cleanProj)) {
      return proj.name;
    }
  }

  // 3. Mapeamentos conhecidos e termos-chave comuns
  const aliases = {
    'gabot': 'G_aBot',
    'g-abot': 'G_aBot',
    'g_abot': 'G_aBot',
    'gamapper': 'G_aMapper',
    'g-amapper': 'G_aMapper',
    'supercook': 'receitas-estoque',
    'receitas': 'receitas-estoque',
    'compras': 'compras-em-dois-estoque'
  };

  for (const [alias, target] of Object.entries(aliases)) {
    if (new RegExp(`\\b${alias}\\b`, 'i').test(lower)) {
      const match = projects.find(p => p.name.toLowerCase() === target.toLowerCase());
      if (match) return match.name;
    }
  }

  return null;
}

export const historyService = {
  getAvailableProjects,
  detectProject: detectProjectFromText,

  async list() {
    await ensureDir();
    try {
      const files = await fs.readdir(SESSIONS_DIR);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      const list = [];
      const availableProjects = await getAvailableProjects();

      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(SESSIONS_DIR, file), 'utf8');
          const data = JSON.parse(content);
          let subproject = data.subproject || '';

          // Se a sessão não tiver subprojeto definido, tenta auto-detectar pela primeira mensagem
          if (!subproject && Array.isArray(data.messages) && data.messages.length > 0) {
            const firstUserMsg = data.messages.find(m => m.role === 'user');
            if (firstUserMsg && firstUserMsg.text) {
              const detected = detectProjectFromText(firstUserMsg.text, availableProjects);
              if (detected) {
                subproject = detected;
                data.subproject = detected;
                // Salvar em background para persistir no arquivo
                fs.writeFile(path.join(SESSIONS_DIR, file), JSON.stringify(data, null, 2), 'utf8').catch(() => {});
              }
            }
          }

          list.push({
            id: data.id,
            title: data.title || 'Conversa sem título',
            agent: data.agent || 'antigravity',
            model: data.model || '',
            effort: data.effort || 'high',
            mode: data.mode || 'default',
            subproject: subproject,
            agyConvId: data.agyConvId || null,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            messageCount: Array.isArray(data.messages) ? data.messages.length : 0
          });
        } catch (e) {
          console.warn(`[HistoryService] Erro ao ler sessão ${file}:`, e.message);
        }
      }

      // Ordenar por atualização mais recente
      list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      return list;
    } catch (err) {
      console.error('[HistoryService] Erro ao listar conversas:', err.message);
      return [];
    }
  },

  async get(id) {
    if (!id) return null;
    await ensureDir();
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      return null;
    }
  },

  async save(session) {
    if (!session || !session.id) return null;
    await ensureDir();
    const now = new Date().toISOString();
    const existing = await this.get(session.id);

    const record = {
      id: session.id,
      agyConvId: session.agyConvId || (existing && existing.agyConvId) || null,
      title: session.title || (existing && existing.title) || 'Nova Conversa',
      agent: session.agent || (existing && existing.agent) || 'antigravity',
      model: session.model || (existing && existing.model) || '',
      effort: session.effort || (existing && existing.effort) || 'high',
      mode: session.mode || (existing && existing.mode) || 'default',
      subproject: session.subproject || (existing && existing.subproject) || '',
      createdAt: (existing && existing.createdAt) || now,
      updatedAt: now,
      messages: session.messages || (existing && existing.messages) || []
    };

    const filePath = path.join(SESSIONS_DIR, `${session.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(record, null, 2), 'utf8');
    return record;
  },

  async addMessage(id, message, sessionMeta = {}) {
    let session = await this.get(id);
    if (!session) {
      session = {
        id,
        title: message.role === 'user' ? message.text.slice(0, 40) : 'Conversa',
        ...sessionMeta,
        messages: []
      };
    }
    session.messages.push(message);
    if (session.messages.length === 1 && message.role === 'user' && (!session.title || session.title === 'Nova Conversa')) {
      session.title = message.text.slice(0, 45);
    }
    return this.save(session);
  },

  async updateLastAssistantMessage(id, messageData) {
    let session = await this.get(id);
    if (!session) return null;
    const msgs = session.messages || [];
    const lastIdx = msgs.length - 1;

    if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
      msgs[lastIdx] = {
        ...msgs[lastIdx],
        ...messageData,
        timestamp: msgs[lastIdx].timestamp || new Date().toISOString()
      };
    } else {
      msgs.push({
        id: randomUUID(),
        role: 'assistant',
        ...messageData,
        timestamp: new Date().toISOString()
      });
    }

    session.messages = msgs;
    return this.save(session);
  },

  async delete(id) {
    await ensureDir();
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    try {
      await fs.unlink(filePath);
      return true;
    } catch (e) {
      return false;
    }
  },

  async rename(id, newTitle) {
    const session = await this.get(id);
    if (!session) return null;
    session.title = newTitle.trim();
    return this.save(session);
  },

  async update(id, updates = {}) {
    const session = await this.get(id);
    if (!session) return null;
    if (updates.title !== undefined) session.title = updates.title.trim();
    if (updates.subproject !== undefined) session.subproject = updates.subproject.trim();
    return this.save(session);
  }
};
