import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

import { execSync } from 'child_process';
import readline from 'readline';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const BRAIN_DIR = process.env.BRAIN_DIR || '/root/.gemini/antigravity-cli/brain';
const AGY_DB_PATH = process.env.AGY_DB_PATH || '/root/.gemini/antigravity-cli/conversation_summaries.db';

// Garante que o diretório de dados existe
async function ensureDir() {
  try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
  } catch (err) {
    console.error('[HistoryService] Erro ao criar diretório de sessões:', err.message);
  }
}

let lastAgySync = 0;

/**
 * Sincroniza automaticamente conversas nativas do Antigravity CLI para a interface web
 */
async function syncAntigravityConversations() {
  const now = Date.now();
  if (now - lastAgySync < 15000) return; // Debounce de 15s
  lastAgySync = now;

  try {
    const raw = execSync(`sqlite3 -json "${AGY_DB_PATH}" "SELECT conversation_id, title, preview, last_modified_time, workspace_uris FROM conversation_summaries ORDER BY last_modified_time ASC;"`, { encoding: 'utf8', timeout: 3000 });
    const summaries = JSON.parse(raw || '[]');

    for (const sum of summaries) {
      const convId = sum.conversation_id;
      const targetFile = path.join(SESSIONS_DIR, `${convId}.json`);

      let exists = false;
      try {
        await fs.access(targetFile);
        exists = true;
      } catch {}

      if (exists) continue; // Já sincronizado

      let subproject = '';
      try {
        const uris = JSON.parse(sum.workspace_uris || '[]');
        if (uris.length > 0) {
          const match = uris[0].match(/file:\/\/\/(?:workspace\/|DATA\/Projetos\/)([^/]+)/);
          if (match) subproject = match[1];
        }
      } catch {}

      const transcriptFile = path.join(BRAIN_DIR, convId, '.system_generated', 'logs', 'transcript.jsonl');
      const messages = [];

      try {
        await fs.access(transcriptFile);
        const fileStream = (await import('fs')).createReadStream(transcriptFile);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
        let currentAssistant = null;

        for await (const line of rl) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.type === 'USER_INPUT' && entry.content) {
              if (currentAssistant) {
                messages.push(currentAssistant);
                currentAssistant = null;
              }
              let userText = entry.content;
              const match = userText.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
              if (match) userText = match[1].trim();
              messages.push({
                id: `step-${entry.step_index}`,
                role: 'user',
                text: userText,
                timestamp: entry.created_at || sum.last_modified_time
              });
            } else if (entry.type === 'PLANNER_RESPONSE') {
              if (!currentAssistant) {
                currentAssistant = {
                  id: `step-${entry.step_index}`,
                  role: 'assistant',
                  text: '',
                  thinking: '',
                  toolCalls: [],
                  timestamp: entry.created_at || sum.last_modified_time
                };
              }
              if (entry.content) {
                currentAssistant.text += (currentAssistant.text ? '\n\n' : '') + entry.content;
              }
              if (entry.thinking) {
                currentAssistant.thinking += (currentAssistant.thinking ? '\n\n' : '') + entry.thinking;
              }
              if (Array.isArray(entry.tool_calls)) {
                for (const tc of entry.tool_calls) {
                  const args = tc.args || {};
                  let cmd = '';
                  if (args.CommandLine) {
                    cmd = args.CommandLine;
                  } else if (args.TargetFile) {
                    cmd = `${args.TargetFile}${args.Instruction ? ` (${args.Instruction})` : (args.Description ? ` (${args.Description})` : '')}`;
                  } else if (args.AbsolutePath) {
                    cmd = `${args.AbsolutePath}${args.StartLine ? ` [L${args.StartLine}-${args.EndLine || args.StartLine}]` : ''}`;
                  } else if (args.ServerName && args.ToolName) {
                    cmd = `${args.ServerName}:${args.ToolName}`;
                  } else if (args.query) {
                    cmd = args.query;
                  } else if (args.Url) {
                    cmd = args.Url;
                  } else if (args.toolAction) {
                    cmd = `${args.toolAction}${args.toolSummary ? `: ${args.toolSummary}` : ''}`;
                  }
                  currentAssistant.toolCalls.push({
                    step_index: entry.step_index,
                    name: tc.name || 'tool',
                    command: typeof cmd === 'string' ? cmd.replace(/^["']|["']$/g, '') : '',
                    parameters: args,
                    output: '',
                    state: 'DONE'
                  });
                }
              }
            } else if (entry.type === 'GENERIC' && entry.content && currentAssistant && currentAssistant.toolCalls.length > 0) {
              const lastTc = currentAssistant.toolCalls[currentAssistant.toolCalls.length - 1];
              if (lastTc && !lastTc.output) {
                lastTc.output = entry.content;
              }
            }
          } catch {}
        }
        if (currentAssistant) messages.push(currentAssistant);
      } catch {}

      const tags = extractContextualTags({
        messages,
        subproject,
        title: sum.title || sum.preview
      });

      const sessionData = {
        id: convId,
        agyConvId: convId,
        title: sum.title || sum.preview || 'Conversa Antigravity',
        agent: 'antigravity',
        model: 'gemini-3.8-flash-high',
        effort: 'high',
        mode: 'default',
        subproject,
        tags,
        createdAt: sum.last_modified_time,
        updatedAt: sum.last_modified_time,
        messages
      };

      await fs.writeFile(targetFile, JSON.stringify(sessionData, null, 2), 'utf8');
    }
  } catch {}
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

function cleanUserText(text) {
  if (!text) return '';
  let clean = text;
  // Remove diretivas de sistema injetadas para não poluir a análise contextual
  clean = clean.replace(/\[DIRETIVA_DO_SISTEMA[\s\S]*?\]:?\s*/gi, '');
  clean = clean.replace(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i, '$1');
  return clean;
}

/**
 * Analisa dinamicamente o contexto real da conversa (mensagens, chamadas de ferramentas, intenção)
 * para derivar tags inteligentes que representam o assunto real e não apenas a pasta do arquivo.
 */
function extractContextualTags({ messages = [], subproject = '', title = '', toolCalls = [] }) {
  let combined = (title + ' ' + (subproject || '') + ' ').toLowerCase();

  for (const m of messages) {
    if (m.role === 'user') {
      combined += ' ' + cleanUserText(m.text).slice(0, 1000);
    } else if (m.role === 'assistant') {
      combined += ' ' + (m.text || '').slice(0, 1000);
    }
  }

  for (const tc of toolCalls) {
    if (tc.name) combined += ' ' + tc.name;
    if (tc.command) combined += ' ' + tc.command.slice(0, 200);
    if (tc.parameters) {
      if (tc.parameters.CommandLine) combined += ' ' + tc.parameters.CommandLine.slice(0, 200);
      if (tc.parameters.TargetFile) combined += ' ' + tc.parameters.TargetFile;
    }
  }

  const tags = new Set();

  // 1. Domínios de Projetos e Negócio
  if (/(?:^|\W)(?:estoque|produtos|suprimento|compras|invent[aá]rio|barcode|meuestoque|receitas-estoque)(?:$|\W)/i.test(combined)) tags.add('estoque');
  if (/(?:^|\W)(?:homelab|zimaos|casaos|servidor|zima|nas|portainer)(?:$|\W)/i.test(combined)) tags.add('homelab');
  if (/(?:^|\W)(?:tfla|sponte|scheduling|agendamento)(?:$|\W)/i.test(combined)) tags.add('tfla');
  if (/(?:^|\W)(?:crawler|scraper|vagas|scraping|coletor|puppeteer|cheerio|querovagas)(?:$|\W)/i.test(combined)) tags.add('vagas');
  if (/(?:^|\W)(?:fiis|fundos|dividendos|querofiis)(?:$|\W)/i.test(combined)) tags.add('fiis');
  if (/(?:^|\W)(?:rea|reverse.?engineer|decompile|decompil|ghidra|apktool)(?:$|\W)/i.test(combined)) tags.add('reverse-eng');
  if (/(?:^|\W)(?:kraken|auto.evol|pod drain|self.reload|modifi.*si mesm)(?:$|\W)/i.test(combined)) tags.add('auto-evolução');
  if (/(?:^|\W)(?:bot|telegram|discord|g_abot|gamapper)(?:$|\W)/i.test(combined)) tags.add('bot');

  // 2. Stacks & Tecnologias
  if (/(?:^|\W)(?:docker|docker-compose|compose\.yml|container|dockerfile|daemon|podman)(?:$|\W)/i.test(combined)) tags.add('docker');
  if (/(?:^|\W)(?:supabase|postgres|postgresql|drizzle|migration|rls)(?:$|\W)/i.test(combined)) tags.add('supabase');
  if (/(?:^|\W)(?:react|vite|daisyui|tailwind|frontend|css|component)(?:$|\W)/i.test(combined)) tags.add('frontend');
  if (/(?:^|\W)(?:express|api|endpoint|rest|backend|rota|router)(?:$|\W)/i.test(combined)) tags.add('api');
  if (/(?:^|\W)(?:oauth|token|jwt|auth|senha|login|pin\b)(?:$|\W)/i.test(combined)) tags.add('auth');
  if (/(?:^|\W)(?:mcp|model context protocol|call_mcp)(?:$|\W)/i.test(combined)) tags.add('mcp');
  if (/(?:^|\W)(?:git\b|commit|pull request|rebase|branch|reposit[oó]rio)(?:$|\W)/i.test(combined)) tags.add('git');
  if (/(?:^|\W)(?:anytype|runbook|cat[aá]logo)(?:$|\W)/i.test(combined)) tags.add('anytype');

  // 3. Intenção & Natureza da Tarefa
  if (/(?:^|\W)(?:bug|fix|corrig|erro|falha|exception|problem|consert)(?:$|\W)/i.test(combined)) tags.add('bugfix');
  if (/(?:^|\W)(?:feature|implement|criad|nova funcionalidade|adicion)(?:$|\W)/i.test(combined)) tags.add('feature');
  if (/(?:^|\W)(?:refactor|refatora|reorganiz|limpar c[oó]digo|otimiz)(?:$|\W)/i.test(combined)) tags.add('refactor');
  if (/(?:^|\W)(?:infra|deploy|proxy|nginx|caddy|network|rede)(?:$|\W)/i.test(combined)) tags.add('infra');
  if (/(?:^|\W)(?:documenta|readme|manual)(?:$|\W)/i.test(combined)) tags.add('docs');

  return Array.from(tags).slice(0, 4);
}

export const historyService = {
  getAvailableProjects,
  detectProject: detectProjectFromText,
  extractContextualTags,

  async list() {
    await ensureDir();
    await syncAntigravityConversations().catch(() => {});
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
          let tags = Array.isArray(data.tags) ? data.tags : [];
          let hasMutated = false;

          // Se a sessão não tiver subprojeto definido, tenta auto-detectar pela primeira mensagem
          if (!subproject && Array.isArray(data.messages) && data.messages.length > 0) {
            const firstUserMsg = data.messages.find(m => m.role === 'user');
            if (firstUserMsg && firstUserMsg.text) {
              const detected = detectProjectFromText(firstUserMsg.text, availableProjects);
              if (detected) {
                subproject = detected;
                data.subproject = detected;
                hasMutated = true;
              }
            }
          }

          // Se não houver tags definidas, extrai dinamicamente a partir do contexto da conversa
          if (tags.length === 0 && Array.isArray(data.messages) && data.messages.length > 0) {
            const autoTags = extractContextualTags({
              messages: data.messages,
              subproject,
              title: data.title
            });
            if (autoTags.length > 0) {
              tags = autoTags;
              data.tags = autoTags;
              hasMutated = true;
            }
          }

          if (hasMutated) {
            // Salvar em background para persistir no arquivo
            fs.writeFile(path.join(SESSIONS_DIR, file), JSON.stringify(data, null, 2), 'utf8').catch(() => {});
          }

          list.push({
            id: data.id,
            title: data.title || 'Conversa sem título',
            agent: data.agent || 'antigravity',
            model: data.model || '',
            effort: data.effort || 'high',
            mode: data.mode || 'default',
            chatMode: data.chatMode || 'agent',
            subproject: subproject,
            tags: tags,
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
      chatMode: session.chatMode || (existing && existing.chatMode) || 'agent',
      subproject: session.subproject || (existing && existing.subproject) || '',
      tags: Array.isArray(session.tags) ? session.tags : (existing && Array.isArray(existing.tags) ? existing.tags : []),
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
    } else if (sessionMeta.chatMode) {
      session.chatMode = sessionMeta.chatMode;
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
    if (updates.tags !== undefined) {
      if (Array.isArray(updates.tags)) {
        session.tags = updates.tags.map(t => String(t).trim().replace(/^#/, '')).filter(Boolean);
      } else if (typeof updates.tags === 'string') {
        session.tags = updates.tags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);
      }
    }
    return this.save(session);
  },

  async getLatestAssistantFromTranscript(convId) {
    if (!convId) return null;
    const transcriptFile = path.join(BRAIN_DIR, convId, '.system_generated', 'logs', 'transcript.jsonl');
    try {
      await fs.access(transcriptFile);
      const fileStream = (await import('fs')).createReadStream(transcriptFile);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
      let lastAssistant = null;

      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'PLANNER_RESPONSE') {
            if (!lastAssistant) {
              lastAssistant = {
                text: '',
                thinking: '',
                toolCalls: []
              };
            }
            if (entry.content) {
              lastAssistant.text += (lastAssistant.text ? '\n\n' : '') + entry.content;
            }
            if (entry.thinking) {
              lastAssistant.thinking += (lastAssistant.thinking ? '\n\n' : '') + entry.thinking;
            }
            if (Array.isArray(entry.tool_calls)) {
              for (const tc of entry.tool_calls) {
                const args = tc.args || {};
                let cmd = args.CommandLine || args.TargetFile || args.AbsolutePath || '';
                lastAssistant.toolCalls.push({
                  name: tc.name || 'tool',
                  command: typeof cmd === 'string' ? cmd.replace(/^["']|["']$/g, '') : '',
                  parameters: args,
                  output: '',
                  state: 'DONE'
                });
              }
            }
          } else if (entry.type === 'GENERIC' && entry.content && lastAssistant && lastAssistant.toolCalls.length > 0) {
            const lastTc = lastAssistant.toolCalls[lastAssistant.toolCalls.length - 1];
            if (lastTc && !lastTc.output) lastTc.output = entry.content;
          } else if (entry.type === 'USER_INPUT') {
            // Reinicia para coletar o turno assistente após esse user input
            lastAssistant = null;
          }
        } catch {}
      }
      return lastAssistant;
    } catch {
      return null;
    }
  }
};

