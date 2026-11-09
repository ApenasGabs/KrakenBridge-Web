import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import fsSync from 'fs';
import { historyService } from './historyService.js';
import { aiMemoryService } from './aiMemoryService.js';

export function getAllowedDirectories(): string[] {
  const isTest = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
  const dirs = [
    process.env.WORKSPACE_DIR || '/workspace',
    process.env.DATA_DIR || '/DATA',
    '/root/.gemini',
    ...(isTest ? [] : ['/app']),
    os.tmpdir(),
    '/tmp'
  ];

  const home = os.homedir();
  if (home) {
    dirs.push(path.join(home, '.gemini'));
    dirs.push(path.join(home, '.gemini', 'antigravity'));
  }

  if (process.env.CUSTOM_ALLOWED_FILE_DIR) {
    dirs.push(process.env.CUSTOM_ALLOWED_FILE_DIR);
  }

  // Permite o diretório atual de execução para dev/testes
  dirs.push(process.cwd());

  return dirs.map(d => path.resolve(d).toLowerCase());
}

export function isPathAllowed(targetPath: string): boolean {
  if (!targetPath || typeof targetPath !== 'string') return false;
  try {
    // Bloquear caminhos absolutos do Windows em sistemas POSIX (ex: C:\Windows)
    if (process.platform !== 'win32' && /^[a-zA-Z]:[/\\]/.test(targetPath)) {
      return false;
    }
    const resolved = path.resolve(targetPath).toLowerCase();
    const allowed = getAllowedDirectories();
    return allowed.some(base => {
      const normalizedBase = path.resolve(base).toLowerCase();
      return (
        resolved === normalizedBase ||
        resolved.startsWith(normalizedBase + path.sep) ||
        resolved.startsWith(normalizedBase + '/') ||
        resolved.startsWith(normalizedBase + '\\')
      );
    });
  } catch {
    return false;
  }
}

/**
 * Limpa parâmetros de caminho de arquivo (remove âncoras #L... e esquemas file://).
 * Preserva a barra raiz para caminhos absolutos POSIX (ex: file:///workspace -> /workspace).
 */
export function cleanRawPath(rawPath: string): string {
  if (!rawPath) return '';
  const withoutAnchor = rawPath.split('#')[0].trim();
  if (withoutAnchor.startsWith('file://')) {
    return withoutAnchor.slice(7);
  }
  if (withoutAnchor.startsWith('file:')) {
    return withoutAnchor.slice(5);
  }
  return withoutAnchor;
}

/**
 * Identifica se uma rota solicitada refere-se a uma página do AI Memory.
 * Trata padrões como:
 * - .agents/memory/homelab/anytype-formatting-audit.md
 * - /workspace/.agents/memory/...
 * - ai-memory:homelab/...
 * - memory/...
 */
export function extractMemoryPagePath(rawPath: string): string | null {
  if (!rawPath) return null;
  const cleaned = cleanRawPath(rawPath);
  const memoryPrefixMatch = cleaned.match(/(?:^|[/\\])(?:\.agents[/\\]memory|ai-memory|memory)[/\\](.+)$/i);
  if (memoryPrefixMatch) {
    return memoryPrefixMatch[1].replace(/^[/\\]+/, '');
  }
  if (rawPath.startsWith('ai-memory:')) {
    return rawPath.slice(10).replace(/^[/\\]+/, '').split('#')[0].trim();
  }
  return null;
}

/**
 * Gera candidatos de caminhos em disco para busca determinística e resiliente.
 */
export function resolveCandidatePaths(cleanPath: string, subproject?: string): string[] {
  if (!cleanPath) return [];

  const candidates: string[] = [];
  const workspaceBase = process.env.WORKSPACE_DIR || '/workspace';
  const cleanNoLeadingSlash = cleanPath.replace(/^[/\\]+/, '');

  // 1. Se for caminho absoluto POSIX ou com drive
  if (cleanPath.startsWith('/') || cleanPath.startsWith('\\') || /^[a-zA-Z]:/.test(cleanPath)) {
    candidates.push(path.resolve(cleanPath));

    // Se houver subprojeto e o caminho apontar genericamente para /workspace/... (ex: /workspace/src/index.ts)
    if (subproject && cleanPath.startsWith('/workspace/')) {
      const subRel = cleanPath.replace(/^\/workspace\/?/, '');
      if (!subRel.startsWith(subproject + '/') && subRel !== subproject) {
        candidates.push(path.resolve(workspaceBase, subproject, subRel));
      }
    }

    // Se o caminho absoluto foi forçado a partir de um relativo (ex: /server/services/config.ts)
    if (subproject) {
      candidates.push(path.resolve(workspaceBase, subproject, cleanNoLeadingSlash));
    }
    candidates.push(path.resolve(workspaceBase, cleanNoLeadingSlash));
  } else {
    // 2. Se for relativo
    if (subproject) {
      candidates.push(path.resolve(workspaceBase, subproject, cleanPath));
    }
    candidates.push(path.resolve(workspaceBase, cleanPath));
    candidates.push(path.resolve('/app', cleanPath));
    candidates.push(path.resolve(process.cwd(), cleanPath));
    candidates.push(path.resolve('/root/.gemini/antigravity-cli/brain', cleanPath));
  }

  // Deduplicação preservando a ordem de prioridade
  return Array.from(new Set(candidates));
}

/**
 * Realiza busca direta no repositório wiki do AI Memory em disco (/DATA/AppData/ai-memory/wiki).
 */
export async function findMemoryPageInWiki(memoryPath: string): Promise<{ path: string; content: string } | null> {
  const wikiBase = process.env.AI_MEMORY_WIKI_DIR || '/DATA/AppData/ai-memory/wiki';
  if (!fsSync.existsSync(wikiBase)) return null;

  try {
    const normPage = memoryPath.replace(/^[/\\]+/, '');
    const candidateExtensions = normPage.endsWith('.md') ? [normPage] : [normPage, `${normPage}.md`];

    const workspaces = await fs.readdir(wikiBase);
    for (const ws of workspaces) {
      if (ws === '.git') continue;
      const wsDir = path.join(wikiBase, ws);
      const wsStat = await fs.stat(wsDir).catch(() => null);
      if (!wsStat || !wsStat.isDirectory()) continue;

      const projects = await fs.readdir(wsDir);
      for (const prj of projects) {
        const prjDir = path.join(wsDir, prj);
        const prjStat = await fs.stat(prjDir).catch(() => null);
        if (!prjStat || !prjStat.isDirectory()) continue;

        for (const candidate of candidateExtensions) {
          const target = path.join(prjDir, candidate);
          if (fsSync.existsSync(target)) {
            const stat = await fs.stat(target).catch(() => null);
            if (stat && stat.isFile()) {
              const content = await fs.readFile(target, 'utf8');
              return { path: candidate, content };
            }
          }
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

export interface ConversationHistoryFileResult {
  path: string;
  filename: string;
  content: string;
  source: 'history' | 'ai-memory-history';
}

/**
 * Fallback resiliente: busca o conteúdo gerado em chamadas de ferramentas (write_file, edit_file, memory_write_page)
 * na conversa ativa quando o arquivo físico ou página não está persistida no disco.
 */
export async function findContentInConversationHistory(
  conversationId: string,
  targetPath: string,
  memoryPath?: string | null
): Promise<ConversationHistoryFileResult | null> {
  try {
    const session = await historyService.get(conversationId);
    if (!session || !session.messages || session.messages.length === 0) return null;

    const clean = cleanRawPath(targetPath);
    const targetBase = path.basename(clean).toLowerCase();
    const normTarget = clean.toLowerCase();
    const normMemTarget = memoryPath ? memoryPath.toLowerCase().replace(/^[/\\]+/, '') : null;

    for (let i = session.messages.length - 1; i >= 0; i--) {
      const msg = session.messages[i];
      if (!msg.toolCalls || msg.toolCalls.length === 0) continue;

      for (let j = msg.toolCalls.length - 1; j >= 0; j--) {
        const tc = msg.toolCalls[j];
        const name = tc.name || tc.command || '';

        // 1. memory_write_page
        if (name === 'call_mcp_tool' && tc.parameters?.ToolName === 'memory_write_page') {
          const args = (tc.parameters?.Arguments || {}) as Record<string, any>;
          const memPath = String(args.path || '');
          const body = args.body;
          if (body && typeof body === 'string') {
            const normMem = memPath.toLowerCase().replace(/^[/\\]+/, '');
            if (
              (normMemTarget && (normMem === normMemTarget || normMem.endsWith('/' + normMemTarget))) ||
              normMem === normTarget ||
              normMem.endsWith('/' + normTarget) ||
              path.basename(memPath).toLowerCase() === targetBase
            ) {
              return {
                path: `ai-memory:${memPath}`,
                filename: path.basename(memPath),
                content: body,
                source: 'ai-memory-history'
              };
            }
          }
        }

        // 2. write_file ou edit_file
        if (name === 'write_file' || name === 'edit_file') {
          const params = (tc.parameters || {}) as Record<string, any>;
          let p = String(params.Path || params.path || '').replace(/^["']|["']$/g, '').trim();
          let rawContent = params.Content ?? params.content;

          if (rawContent !== undefined && rawContent !== null) {
            let content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);

            if (content.startsWith('"') && content.endsWith('"') && content.includes('\\n')) {
              try {
                content = JSON.parse(content);
              } catch {}
            }

            const pNorm = p.toLowerCase();
            const pBase = path.basename(p).toLowerCase();

            if (
              pNorm === normTarget ||
              pNorm.endsWith('/' + normTarget) ||
              pBase === targetBase ||
              (normMemTarget && (pNorm.endsWith(normMemTarget) || pBase === path.basename(normMemTarget).toLowerCase()))
            ) {
              return {
                path: p,
                filename: path.basename(p),
                content,
                source: 'history'
              };
            }
          }
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}
