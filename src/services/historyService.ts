import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import readline from 'readline';
import type { ChatMessage, ToolCall } from '../types/chat.js';
import type { ConversationSession, SessionListItem, UpdateSessionPayload } from '../types/session.js';
import type { ProjectItem } from '../types/config.js';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const BRAIN_DIR = process.env.BRAIN_DIR || '/root/.gemini/antigravity-cli/brain';
const AGY_DB_PATH = process.env.AGY_DB_PATH || '/root/.gemini/antigravity-cli/conversation_summaries.db';

// Garante que o diretório de dados existe
async function ensureDir(): Promise<void> {
  try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
  } catch (err) {
    console.error('[HistoryService] Erro ao criar diretório de sessões:', (err as Error).message);
  }
}

let lastAgySync = 0;

interface AgyDbSummary {
  conversation_id: string;
  title?: string;
  preview?: string;
  last_modified_time: string | number;
  workspace_uris?: string;
}

/**
 * Sincroniza automaticamente conversas nativas do Antigravity CLI para a interface web
 */
async function syncAntigravityConversations(): Promise<void> {
  const now = Date.now();
  if (now - lastAgySync < 15000) return; // Debounce de 15s
  lastAgySync = now;

  try {
    let summaries: AgyDbSummary[] = [];
    try {
      // Usar sqlite3 embutido nativo do Node 22 (DatabaseSync) sem spawning de shell
      // @ts-ignore
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(AGY_DB_PATH, { open: true, readOnly: true });
      const rows = db.prepare('SELECT conversation_id, title, preview, last_modified_time, workspace_uris FROM conversation_summaries ORDER BY last_modified_time ASC;').all() as any[];
      summaries = rows.map((r: any) => ({
        conversation_id: String(r.conversation_id),
        title: r.title ? String(r.title) : undefined,
        preview: r.preview ? String(r.preview) : undefined,
        last_modified_time: r.last_modified_time,
        workspace_uris: r.workspace_uris ? String(r.workspace_uris) : undefined
      }));
      db.close();
    } catch {
      // Fallback silencioso caso sqlite3 CLI esteja presente ou falhe sem poluir stderr
      try {
        const raw = execSync(`sqlite3 -json "${AGY_DB_PATH}" "SELECT conversation_id, title, preview, last_modified_time, workspace_uris FROM conversation_summaries ORDER BY last_modified_time ASC;" 2>/dev/null`, { encoding: 'utf8', timeout: 3000 });
        summaries = JSON.parse(raw || '[]') as AgyDbSummary[];
      } catch {
        return;
      }
    }

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
        const uris = JSON.parse(sum.workspace_uris || '[]') as string[];
        if (uris.length > 0) {
          const match = uris[0].match(/file:\/\/\/(?:workspace\/|DATA\/Projetos\/)([^/]+)/);
          if (match) subproject = match[1];
        }
      } catch {}

      const transcriptFile = path.join(BRAIN_DIR, convId, '.system_generated', 'logs', 'transcript.jsonl');
      const messages: ChatMessage[] = [];

      try {
        await fs.access(transcriptFile);
        const fileStream = createReadStream(transcriptFile);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
        let currentAssistant: ChatMessage | null = null;

        for await (const line of rl) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line) as {
              type?: string;
              content?: string;
              thinking?: string;
              step_index?: number;
              created_at?: string;
              tool_calls?: { name?: string; args?: Record<string, any> }[];
            };

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
                content: userText,
                timestamp: entry.created_at || sum.last_modified_time
              });
            } else if (entry.type === 'PLANNER_RESPONSE') {
              if (!currentAssistant) {
                currentAssistant = {
                  id: `step-${entry.step_index}`,
                  role: 'assistant',
                  text: '',
                  content: '',
                  thinking: '',
                  toolCalls: [],
                  timestamp: entry.created_at || sum.last_modified_time
                };
              }
              if (entry.content) {
                currentAssistant.text += (currentAssistant.text ? '\n\n' : '') + entry.content;
                currentAssistant.content = currentAssistant.text;
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

                  if (!currentAssistant.toolCalls) currentAssistant.toolCalls = [];
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
            } else if (entry.type === 'GENERIC' && entry.content && currentAssistant && currentAssistant.toolCalls && currentAssistant.toolCalls.length > 0) {
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
        title: sum.title || sum.preview || ''
      });

      const sessionData: ConversationSession = {
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
let cachedProjects: ProjectItem[] | null = null;
let lastProjectsCheck = 0;

async function getAvailableProjects(): Promise<ProjectItem[]> {
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

function normalizeForMatch(str?: string | null): string {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function detectProjectFromText(text: string, projects: ProjectItem[]): string | null {
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
  const aliases: Record<string, string> = {
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

function cleanUserText(text?: string | null): string {
  if (!text) return '';
  let clean = text;
  // Extrai conteúdo de <USER_REQUEST> se existir
  const reqMatch = clean.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i);
  if (reqMatch) clean = reqMatch[1];

  // Remove [DIRETIVA_DO_SISTEMA...] até a linha onde começa o texto real do usuário
  clean = clean.replace(/\[DIRETIVA_DO_SISTEMA[\s\S]*?\n(?=[a-zA-ZÀ-ÿ\?][^\n]*\n?$|\n[a-zA-ZÀ-ÿ\?])/i, '');
  clean = clean.replace(/\[DIRETIVA_DO_SISTEMA[\s\S]*?(?=\n[a-z0-9À-ÿ])/i, '');
  clean = clean.replace(/\[DIRETIVA_DO_SISTEMA[\s\S]*?\]:?\s*/gi, '');
  return clean.trim();
}

export interface ExtractTagsOptions {
  messages?: ChatMessage[];
  subproject?: string;
  title?: string;
  toolCalls?: ToolCall[];
}

/**
 * Analisa dinamicamente o contexto real da conversa (mensagens, chamadas de ferramentas, intenção)
 * para derivar tags inteligentes que representam o assunto real e não apenas a pasta do arquivo.
 */
function extractContextualTags({ messages = [], subproject = '', title = '', toolCalls = [] }: ExtractTagsOptions): string[] {
  let combined = (title + ' ' + (subproject || '') + ' ').toLowerCase();

  for (const m of messages) {
    const textContent = m.text || m.content || '';
    if (m.role === 'user') {
      combined += ' ' + cleanUserText(textContent).slice(0, 1000);
    } else if (m.role === 'assistant') {
      combined += ' ' + textContent.slice(0, 1000);
    }
  }

  for (const tc of toolCalls) {
    if (tc.name) combined += ' ' + tc.name;
    if (tc.command) combined += ' ' + tc.command.slice(0, 200);
    if (tc.parameters) {
      const p = tc.parameters as Record<string, any>;
      if (p.CommandLine) combined += ' ' + String(p.CommandLine).slice(0, 200);
      if (p.TargetFile) combined += ' ' + String(p.TargetFile);
    }
  }

  const tags = new Set<string>();

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

export function normalizeSearchText(str?: string | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function extractSnippet(text: string, query: string, maxLength = 110): string {
  if (!text) return '';
  const normText = normalizeSearchText(text);
  const normQuery = normalizeSearchText(query);
  const terms = normQuery.split(/\s+/).filter(Boolean);

  let matchIndex = -1;
  let matchLen = 0;

  if (normQuery && normText.includes(normQuery)) {
    matchIndex = normText.indexOf(normQuery);
    matchLen = normQuery.length;
  } else {
    for (const term of terms) {
      const idx = normText.indexOf(term);
      if (idx !== -1) {
        matchIndex = idx;
        matchLen = term.length;
        break;
      }
    }
  }

  if (matchIndex === -1) {
    return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
  }

  const half = Math.floor((maxLength - matchLen) / 2);
  let start = Math.max(0, matchIndex - half);
  let end = Math.min(text.length, matchIndex + matchLen + half);

  if (start > 0) {
    const spaceBefore = text.indexOf(' ', start);
    if (spaceBefore !== -1 && spaceBefore < matchIndex) start = spaceBefore + 1;
  }
  if (end < text.length) {
    const spaceAfter = text.lastIndexOf(' ', end);
    if (spaceAfter !== -1 && spaceAfter > matchIndex + matchLen) end = spaceAfter;
  }

  const snippet = text.slice(start, end).trim();
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${snippet}${suffix}`;
}

export function calculateRelevance(item: SessionListItem, rawQuery: string): { score: number; matchedSnippet?: string } {
  const normQuery = normalizeSearchText(rawQuery);
  if (!normQuery) return { score: 0 };
  const terms = normQuery.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return { score: 0 };

  const normTitle = normalizeSearchText(item.title);
  const normSubproject = normalizeSearchText(item.subproject);
  const normTags = (item.tags || []).map(t => normalizeSearchText(t));
  const userQueries = item.userQueries || [];
  const normSearchable = normalizeSearchText(item.searchableText);

  let score = 0;
  let matchedSnippet: string | undefined = undefined;

  // 1. Diálogos falados diretamente pelo usuário (role: 'user') - PRIORIDADE MÁXIMA
  for (const uq of userQueries) {
    const normUq = normalizeSearchText(uq);
    if (normUq.includes(normQuery)) {
      score += 160; // Usuário falou exatamente o termo/frase pesquisada!
      if (!matchedSnippet) matchedSnippet = extractSnippet(uq, normQuery);
      break;
    } else {
      const matchedTermCount = terms.filter(t => normUq.includes(t)).length;
      if (matchedTermCount === terms.length && terms.length > 1) {
        score += 100;
        if (!matchedSnippet) matchedSnippet = extractSnippet(uq, terms[0]);
        break;
      } else if (matchedTermCount > 0) {
        score += matchedTermCount * 30;
        if (!matchedSnippet) matchedSnippet = extractSnippet(uq, terms[0]);
      }
    }
  }

  // 2. Título da conversa
  if (normTitle === normQuery) {
    score += 200;
  } else if (normTitle.includes(normQuery)) {
    score += 100;
  } else {
    const titleMatchedCount = terms.filter(t => normTitle.includes(t)).length;
    if (titleMatchedCount === terms.length && terms.length > 1) {
      score += 60;
    } else {
      score += titleMatchedCount * 20;
    }
  }

  // 3. Subprojeto ativo
  if (normSubproject === normQuery) {
    score += 120;
  } else if (normSubproject.includes(normQuery)) {
    score += 80;
  } else {
    const subprojectMatched = terms.some(t => normSubproject.includes(t));
    if (subprojectMatched) score += 40;
  }

  // 4. Tags contextuais
  for (const tag of normTags) {
    if (tag === normQuery) {
      score += 50;
    } else if (tag.includes(normQuery)) {
      score += 30;
    } else {
      const tagMatched = terms.some(t => tag.includes(t));
      if (tagMatched) score += 15;
    }
  }

  // 5. Demais conteúdos (respostas do assistente, ferramentas)
  if (normSearchable.includes(normQuery)) {
    score += 30;
    if (!matchedSnippet) matchedSnippet = extractSnippet(item.searchableText || '', normQuery);
  } else {
    const searchMatched = terms.some(t => normSearchable.includes(t));
    if (searchMatched) {
      score += 15;
      if (!matchedSnippet) matchedSnippet = extractSnippet(item.searchableText || '', terms[0]);
    }
  }

  // Bônus suave de recência para desempate
  if (score > 0) {
    const time = new Date(item.updatedAt || item.createdAt || 0).getTime();
    if (time > 0) {
      const daysOld = Math.max(0, (Date.now() - time) / (1000 * 60 * 60 * 24));
      score += Math.max(0, 5 - Math.min(5, daysOld * 0.2));
    }
  }

  return { score: Math.round(score * 10) / 10, matchedSnippet };
}

export const historyService = {
  getAvailableProjects,
  detectProject: detectProjectFromText,
  extractContextualTags,
  normalizeSearchText,
  extractSnippet,
  calculateRelevance,

  async list(query?: string): Promise<SessionListItem[]> {
    await ensureDir();
    await syncAntigravityConversations().catch(() => {});
    try {
      const files = await fs.readdir(SESSIONS_DIR);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      const list: SessionListItem[] = [];
      const availableProjects = await getAvailableProjects();

      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(SESSIONS_DIR, file), 'utf8');
          const data = JSON.parse(content) as ConversationSession & { chatMode?: string };
          let subproject = data.subproject || '';
          let tags = Array.isArray(data.tags) ? data.tags : [];
          let hasMutated = false;

          // Se a sessão não tiver subprojeto definido, tenta auto-detectar pela primeira mensagem
          if (!subproject && Array.isArray(data.messages) && data.messages.length > 0) {
            const firstUserMsg = data.messages.find(m => m.role === 'user');
            const userMsgText = firstUserMsg ? (firstUserMsg.text || firstUserMsg.content) : null;
            if (userMsgText) {
              const detected = detectProjectFromText(userMsgText, availableProjects);
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
            fs.writeFile(path.join(SESSIONS_DIR, file), JSON.stringify(data, null, 2), 'utf8').catch(() => {});
          }

          const msgs = Array.isArray(data.messages) ? data.messages : [];
          const userQueries: string[] = [];
          const assistantSnippets: string[] = [];

          for (const m of msgs) {
            const textContent = m.text || m.content || '';
            if (m.role === 'user') {
              const clean = cleanUserText(textContent).trim();
              if (clean) userQueries.push(clean.slice(0, 600));
            } else if (m.role === 'assistant') {
              const clean = textContent.trim();
              if (clean) assistantSnippets.push(clean.slice(0, 250));
            }
          }

          const searchableText = `${data.title || ''} ${subproject} ${(tags || []).join(' ')} ${userQueries.join(' ')} ${assistantSnippets.slice(0, 10).join(' ')}`;
          const lastMsg = msgs[msgs.length - 1];
          const lastSnippet = lastMsg ? (lastMsg.text || lastMsg.content || '').slice(0, 100) : '';

          list.push({
            id: data.id,
            title: data.title || 'Conversa sem título',
            agent: data.agent || 'antigravity',
            model: data.model || '',
            effort: data.effort || 'high',
            mode: data.mode || 'default',
            subproject: subproject,
            tags: tags,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            messageCount: msgs.length,
            lastMessageSnippet: lastSnippet,
            userQueries,
            searchableText
          });
        } catch (e) {
          console.warn(`[HistoryService] Erro ao ler sessão ${file}:`, (e as Error).message);
        }
      }

      // Se houver parâmetro de busca, filtra e ordena por relevância
      if (query && query.trim()) {
        const scored = list
          .map(item => {
            const { score, matchedSnippet } = calculateRelevance(item, query);
            return {
              ...item,
              relevanceScore: score,
              matchedSnippet
            };
          })
          .filter(item => (item.relevanceScore || 0) > 0);

        scored.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
        return scored;
      }

      // Caso contrário, ordenar por atualização mais recente
      list.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
      return list;
    } catch (err) {
      console.error('[HistoryService] Erro ao listar conversas:', (err as Error).message);
      return [];
    }
  },

  async get(id: string): Promise<ConversationSession | null> {
    if (!id) return null;
    await ensureDir();
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content) as ConversationSession;
    } catch (err) {
      return null;
    }
  },

  async save(session: Partial<ConversationSession> & { id: string }): Promise<ConversationSession | null> {
    if (!session || !session.id) return null;
    await ensureDir();
    const now = new Date().toISOString();
    const existing = await this.get(session.id);

    const record: ConversationSession = {
      id: session.id,
      agyConvId: session.agyConvId || existing?.agyConvId || undefined,
      title: session.title || existing?.title || 'Nova Conversa',
      agent: session.agent || existing?.agent || 'antigravity',
      model: session.model || existing?.model || '',
      effort: session.effort || existing?.effort || 'high',
      mode: session.mode || existing?.mode || 'default',
      subproject: session.subproject || existing?.subproject || '',
      tags: Array.isArray(session.tags) ? session.tags : (existing && Array.isArray(existing.tags) ? existing.tags : []),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      messages: session.messages || existing?.messages || []
    };

    const filePath = path.join(SESSIONS_DIR, `${session.id}.json`);
    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify(record, null, 2), 'utf8');
    await fs.rename(tmpPath, filePath);
    return record;
  },

  async addMessage(id: string, message: ChatMessage, sessionMeta: Record<string, any> = {}): Promise<ConversationSession | null> {
    let session = await this.get(id);
    const msgText = message.text || message.content || '';

    if (!session) {
      session = {
        id,
        title: message.role === 'user' ? msgText.slice(0, 40) : 'Conversa',
        agent: 'antigravity',
        model: 'gemini-3.8-flash-high',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...sessionMeta,
        messages: []
      };
    }

    if (!message.content && message.text) message.content = message.text;
    if (!message.text && message.content) message.text = message.content;

    session.messages.push(message);

    if (session.messages.length === 1 && message.role === 'user' && (!session.title || session.title === 'Nova Conversa')) {
      session.title = msgText.slice(0, 45);
    }

    return this.save(session);
  },

  async updateLastAssistantMessage(id: string, messageData: Partial<ChatMessage>): Promise<ConversationSession | null> {
    const session = await this.get(id);
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
        content: messageData.content || messageData.text || '',
        text: messageData.text || messageData.content || '',
        ...messageData,
        timestamp: new Date().toISOString()
      });
    }

    session.messages = msgs;
    return this.save(session);
  },

  async delete(id: string): Promise<boolean> {
    await ensureDir();
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    try {
      await fs.unlink(filePath);
      return true;
    } catch (e) {
      return false;
    }
  },

  async rename(id: string, newTitle: string): Promise<ConversationSession | null> {
    const session = await this.get(id);
    if (!session) return null;
    session.title = newTitle.trim();
    return this.save(session);
  },

  async update(id: string, updates: UpdateSessionPayload = {}): Promise<ConversationSession | null> {
    const session = await this.get(id);
    if (!session) return null;
    if (updates.title !== undefined) session.title = updates.title.trim();
    if (updates.subproject !== undefined) session.subproject = updates.subproject.trim();
    if (updates.tags !== undefined) {
      if (Array.isArray(updates.tags)) {
        session.tags = updates.tags.map(t => String(t).trim().replace(/^#/, '')).filter(Boolean);
      }
    }
    return this.save(session);
  },

  async getLatestAssistantFromTranscript(convId: string): Promise<{ text: string; thinking: string; toolCalls: ToolCall[] } | null> {
    if (!convId) return null;
    const transcriptFile = path.join(BRAIN_DIR, convId, '.system_generated', 'logs', 'transcript.jsonl');
    try {
      await fs.access(transcriptFile);
      const fileStream = createReadStream(transcriptFile);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
      let lastAssistant: { text: string; thinking: string; toolCalls: ToolCall[] } | null = null;

      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as {
            type?: string;
            content?: string;
            thinking?: string;
            tool_calls?: { name?: string; args?: Record<string, any> }[];
          };

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
                const cmd = args.CommandLine || args.TargetFile || args.AbsolutePath || '';
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
