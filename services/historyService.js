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

ensureDir();

export const historyService = {
  async list() {
    await ensureDir();
    try {
      const files = await fs.readdir(SESSIONS_DIR);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      const list = [];

      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(SESSIONS_DIR, file), 'utf8');
          const data = JSON.parse(content);
          list.push({
            id: data.id,
            title: data.title || 'Conversa sem título',
            agent: data.agent || 'antigravity',
            model: data.model || '',
            effort: data.effort || 'high',
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
  }
};
