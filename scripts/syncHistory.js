import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { execSync } from 'child_process';

const DB_PATH = '/root/.gemini/antigravity-cli/conversation_summaries.db';
const BRAIN_DIR = '/root/.gemini/antigravity-cli/brain';
const SESSIONS_DIR = process.env.DATA_DIR 
  ? path.join(process.env.DATA_DIR, 'sessions') 
  : '/app/data/sessions';

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

let summaries = [];
try {
  const sql = 'SELECT conversation_id, title, preview, last_modified_time, workspace_uris FROM conversation_summaries ORDER BY last_modified_time ASC;';
  const raw = execSync(`sqlite3 -json "${DB_PATH}" "${sql}"`, { encoding: 'utf8' });
  summaries = JSON.parse(raw);
} catch (e) {
  console.error('Erro ao ler conversation_summaries.db:', e.message);
}

console.log(`Encontradas ${summaries.length} conversas no Antigravity CLI.`);

for (const sum of summaries) {
  const convId = sum.conversation_id;
  const targetFile = path.join(SESSIONS_DIR, `${convId}.json`);

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

  if (fs.existsSync(transcriptFile)) {
    try {
      const fileStream = fs.createReadStream(transcriptFile);
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
                let cmd = '';
                if (tc.args) {
                  cmd = tc.args.CommandLine || (tc.args.toolAction ? `${tc.args.toolAction}: ${tc.args.toolSummary || ''}` : '') || tc.args.AbsolutePath || tc.args.TargetFile || '';
                }
                currentAssistant.toolCalls.push({
                  name: tc.name || 'tool',
                  command: typeof cmd === 'string' ? cmd.replace(/^["']|["']$/g, '') : '',
                  state: 'done'
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
      console.warn(`Erro ao ler transcript de ${convId}:`, e.message);
    }
  }

  const sessionData = {
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
