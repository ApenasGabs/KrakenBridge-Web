import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Provisiona os guardrails do Claude Code (Issue #184) em $CLAUDE_CONFIG_DIR:
 *  - kraken-guardrails/kraken-guard.cjs  (script dos hooks)
 *  - settings.json                       (registro dos hooks, mesclado sem apagar config do usuário)
 *  - CLAUDE.md                           (bloco gerenciado com as diretivas)
 *
 * Idempotente e barato: só escreve quando o conteúdo muda. É chamado no boot e antes
 * de cada execução do Claude, então se a config for apagada ela volta sozinha.
 */

export const GUARD_SCRIPT_NAME = 'kraken-guard.cjs';
export const CLAUDE_MD_BEGIN = '<!-- KRAKEN-GUARDRAILS:BEGIN (gerenciado pelo KrakenBridge — não edite este bloco) -->';
export const CLAUDE_MD_END = '<!-- KRAKEN-GUARDRAILS:END -->';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

const templatesDir = (): string => {
  const candidates = [
    path.resolve(MODULE_DIR, '../templates/claude-guardrails'),
    path.resolve('src/templates/claude-guardrails'),
    path.resolve('dist-server/templates/claude-guardrails')
  ];
  return candidates.find((c) => fsSync.existsSync(path.join(c, GUARD_SCRIPT_NAME))) || candidates[0];
};

type HookCommand = { type: 'command'; command: string; timeout?: number };
type HookGroup = { matcher?: string; hooks: HookCommand[] };
type HooksConfig = Record<string, HookGroup[]>;

/** Gera a configuração de hooks do Kraken Guard para o script informado. */
export const buildGuardHooks = (scriptPath: string): HooksConfig => {
  const cmd = (mode: string): HookCommand => ({ type: 'command', command: `node "${scriptPath}" ${mode}`, timeout: 10 });
  return {
    UserPromptSubmit: [{ hooks: [cmd('user-prompt')] }],
    PreToolUse: [{ matcher: 'Bash|Write|Edit|MultiEdit|NotebookEdit', hooks: [cmd('pre-tool')] }],
    PostToolUse: [{ matcher: 'Bash', hooks: [cmd('post-tool')] }],
    Stop: [{ hooks: [cmd('stop')] }]
  };
};

/** Mescla os hooks do guard em um settings.json existente, substituindo só entradas antigas do guard. */
export const mergeGuardHooks = (settings: Record<string, any>, scriptPath: string): Record<string, any> => {
  const next = { ...settings };
  const hooks: HooksConfig = { ...(settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {}) };
  const isGuard = (g: HookGroup) => Array.isArray(g?.hooks) && g.hooks.some((h) => typeof h?.command === 'string' && h.command.includes(GUARD_SCRIPT_NAME));
  for (const [event, groups] of Object.entries(buildGuardHooks(scriptPath))) {
    const existing = Array.isArray(hooks[event]) ? hooks[event].filter((g) => !isGuard(g)) : [];
    hooks[event] = [...existing, ...groups];
  }
  next.hooks = hooks;
  return next;
};

/** Insere ou substitui o bloco gerenciado no CLAUDE.md, preservando o resto do arquivo. */
export const upsertManagedBlock = (current: string, block: string): string => {
  const managed = `${CLAUDE_MD_BEGIN}\n${block.trim()}\n${CLAUDE_MD_END}`;
  const start = current.indexOf(CLAUDE_MD_BEGIN);
  const end = current.indexOf(CLAUDE_MD_END);
  if (start >= 0 && end > start) {
    return current.slice(0, start) + managed + current.slice(end + CLAUDE_MD_END.length);
  }
  return current.trim() ? `${current.replace(/\s*$/, '')}\n\n${managed}\n` : `${managed}\n`;
};

const writeIfChanged = async (file: string, content: string, mode: number): Promise<boolean> => {
  try {
    if ((await fs.readFile(file, 'utf8')) === content) return false;
  } catch {}
  await fs.writeFile(file, content, { encoding: 'utf8', mode });
  return true;
};

class ClaudeGuardrailsService {
  configDir(): string {
    return process.env.CLAUDE_CONFIG_DIR || '/root/.claude';
  }

  async ensureProvisioned(): Promise<boolean> {
    const cfg = this.configDir();
    const tpl = templatesDir();
    const guardDir = path.join(cfg, 'kraken-guardrails');
    const scriptPath = path.join(guardDir, GUARD_SCRIPT_NAME);

    await fs.mkdir(guardDir, { recursive: true });

    // 1. Script dos hooks
    const script = await fs.readFile(path.join(tpl, GUARD_SCRIPT_NAME), 'utf8');
    await writeIfChanged(scriptPath, script, 0o755);

    // 2. settings.json — nunca sobrescreve um arquivo com JSON inválido
    const settingsPath = path.join(cfg, 'settings.json');
    let settings: Record<string, any> = {};
    let settingsOk = true;
    if (fsSync.existsSync(settingsPath)) {
      try {
        settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
      } catch (err) {
        settingsOk = false;
        console.error(`[ClaudeGuardrails] ${settingsPath} tem JSON inválido; hooks NÃO registrados para não destruir a config:`, (err as Error).message);
      }
    }
    if (settingsOk) {
      await writeIfChanged(settingsPath, JSON.stringify(mergeGuardHooks(settings, scriptPath), null, 2) + '\n', 0o644);
    }

    // 3. CLAUDE.md global (bloco gerenciado)
    const claudeMdPath = path.join(cfg, 'CLAUDE.md');
    const block = await fs.readFile(path.join(tpl, 'CLAUDE.md'), 'utf8');
    let current = '';
    try {
      current = await fs.readFile(claudeMdPath, 'utf8');
    } catch {}
    await writeIfChanged(claudeMdPath, upsertManagedBlock(current, block), 0o644);

    return settingsOk;
  }
}

export const claudeGuardrailsService = new ClaudeGuardrailsService();
