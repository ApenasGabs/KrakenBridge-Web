import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { execSync } from 'child_process';
import type { ChatMessage, ToolCall } from '../types/chat.js';
import type { ConversationSession } from '../types/session.js';

const DB_PATH = '/root/.gemini/antigravity-cli/conversation_summaries.db';
const BRAIN_DIR = '/root/.gemini/antigravity-cli/brain';
const SESSIONS_DIR = process.env.DATA_DIR 
  ? path.join(process.env.DATA_DIR, 'sessions') 
  : '/app/data/sessions';

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

interface SummaryItem {
  conversation_id: string;
  title?: string;
  preview?: string;
  last_modified_time: string | number;
  workspace_uris?: string;
}

let summaries: SummaryItem[] = [];
try {
  try {
    // @ts-ignore
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(DB_PATH, { open: true, readOnly: true });
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
    const sql = 'SELECT conversation_id, title, preview, last_modified_time, workspace_uris FROM conversation_summaries ORDER BY last_modified_time ASC;';
    const raw = execSync(`sqlite3 -json "${DB_PATH}" "${sql}" 2>/dev/null`, { encoding: 'utf8' });
    summaries = JSON.parse(raw);
  }
} catch (e) {
  console.error('Erro ao ler conversation_summaries.db:', (e as Error).message);
}

console.log(`Encontradas ${summaries.length} conversas no Antigravity CLI.`);

async function runSync() {
  for (const sum of summaries) {
    const convId = sum.conversation_id;
    const targetFile = path.join(SESSIONS_DIR, `${convId}.json`);

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

    if (fs.existsSync(transcriptFile)) {
      try {
        const fileStream = fs.createReadStream(transcriptFile);
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
                  let cmd = '';
                  if (tc.args) {
                    cmd = tc.args.CommandLine || (tc.args.toolAction ? `${tc.args.toolAction}: ${tc.args.toolSummary || ''}` : '') || tc.args.AbsolutePath || tc.args.TargetFile || '';
                  }
                  if (!currentAssistant.toolCalls) currentAssistant.toolCalls = [];
                  currentAssistant.toolCalls.push({
                    name: tc.name || 'tool',
                    command: typeof cmd === 'string' ? cmd.replace(/^["']|["']$/g, '') : '',
                    parameters: tc.args || {},
                    output: '',
                    state: 'DONE'
                  });
                }
              }
            }
          } catch {}
        }
        if (currentAssistant) {
          messages.push(currentAssistant);
        }
      } catch (e) {
        console.warn(`Erro ao ler transcript de ${convId}:`, (e as Error).message);
      }
    }

    const sessionData: ConversationSession = {
      id: convId,
      agyConvId: convId,
      title: sum.title || sum.preview || 'Conversa Antigravity',
      agent: 'antigravity',
      model: 'gemini-3.8-flash-high',
      effort: 'high',
      mode: 'default',
      subproject: subproject,
      createdAt: sum.last_modified_time,
      updatedAt: sum.last_modified_time,
      messages
    };

    fs.writeFileSync(targetFile, JSON.stringify(sessionData, null, 2), 'utf8');
    console.log(`Sessão importada: ${convId} | "${sessionData.title}" | Mensagens: ${messages.length} | Subprojeto: ${subproject}`);
  }
}

runSync().catch(console.error);
