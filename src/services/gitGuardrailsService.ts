import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const GEMINI_CONFIG_DIR = process.env.GEMINI_CONFIG_DIR || '/root/.gemini/config';
const HOOKS_PATH = path.join(GEMINI_CONFIG_DIR, 'hooks.json');
const GUARDRAIL_SCRIPT_PATH = path.join(GEMINI_CONFIG_DIR, 'git-guardrail.cjs');
const GIT_TEMPLATES_DIR = '/root/.git-templates/hooks';
const PRE_PUSH_HOOK_PATH = path.join(GIT_TEMPLATES_DIR, 'pre-push');
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';

// Diretório de templates internos empacotados com o backend
const TEMPLATES_DIR = path.resolve(
  fsSync.existsSync(path.resolve('src/templates'))
    ? path.resolve('src/templates')
    : path.resolve('dist-server/templates')
);

export interface GuardrailValidationResult {
  blocked: boolean;
  reason?: string;
  command?: string;
}

export class GitGuardrailsService {
  private initialized = false;

  /**
   * Garante que os guardrails (PreToolUse e Git Pre-Push Hook) estejam provisionados
   */
  public ensureGuardrailsProvisioned = async (): Promise<boolean> => {
    if (this.initialized) return true;

    try {
      // 1. Garantir diretórios de configuração e templates git
      await fs.mkdir(GEMINI_CONFIG_DIR, { recursive: true });
      await fs.mkdir(GIT_TEMPLATES_DIR, { recursive: true });

      // 2. Provisionar script interceptador PreToolUse (git-guardrail.cjs)
      const templateCjs = path.join(TEMPLATES_DIR, 'git-guardrail.cjs');
      if (fsSync.existsSync(templateCjs)) {
        const cjsContent = await fs.readFile(templateCjs, 'utf8');
        await fs.writeFile(GUARDRAIL_SCRIPT_PATH, cjsContent, { encoding: 'utf8', mode: 0o755 });
      }

      // 3. Provisionar hook nativo do Git pre-push (/root/.git-templates/hooks/pre-push)
      const templateHook = path.join(TEMPLATES_DIR, 'pre-push-hook.sh');
      if (fsSync.existsSync(templateHook)) {
        const hookContent = await fs.readFile(templateHook, 'utf8');
        await fs.writeFile(PRE_PUSH_HOOK_PATH, hookContent, { encoding: 'utf8', mode: 0o755 });
      }

      // 4. Configurar Git globalmente para utilizar os hooks e templates padronizados
      try {
        execSync(`git config --global core.hooksPath "${GIT_TEMPLATES_DIR}"`, { stdio: 'ignore' });
        execSync(`git config --global init.templateDir "/root/.git-templates"`, { stdio: 'ignore' });
      } catch (err) {
        console.warn('[GitGuardrailsService] Aviso ao definir git config global:', (err as Error).message);
      }

      // 5. Injetar hook pre-push em repositórios existentes em WORKSPACE_DIR
      await this.injectHooksIntoWorkspaces();

      // 6. Atualizar /root/.gemini/config/hooks.json para incluir PreToolUse interceptor
      let hooksConfig: Record<string, any> = {};
      try {
        if (fsSync.existsSync(HOOKS_PATH)) {
          const raw = await fs.readFile(HOOKS_PATH, 'utf8');
          hooksConfig = JSON.parse(raw);
        }
      } catch (err) {
        console.warn('[GitGuardrailsService] Erro ao ler hooks.json, reiniciando base:', (err as Error).message);
        hooksConfig = {};
      }

      // Adicionar ou atualizar a seção git-guardrails com PreToolUse
      hooksConfig['git-guardrails'] = {
        PreToolUse: [
          {
            matcher: 'run_command|Bash',
            hooks: [
              {
                type: 'command',
                command: `node "${GUARDRAIL_SCRIPT_PATH}"`
              }
            ]
          }
        ]
      };

      await fs.writeFile(HOOKS_PATH, JSON.stringify(hooksConfig, null, 2), { encoding: 'utf8', mode: 0o644 });

      // 7. Garantir permissões de execução
      try {
        await fs.chmod(GUARDRAIL_SCRIPT_PATH, 0o755);
        await fs.chmod(PRE_PUSH_HOOK_PATH, 0o755);
      } catch {}

      this.initialized = true;
      console.log('[GitGuardrailsService] 🛡️ Git Guardrails (PreToolUse + Git Pre-Push Hook) provisionados com sucesso!');
      return true;
    } catch (err) {
      console.error('[GitGuardrailsService] Falha ao provisionar Git Guardrails:', (err as Error).message);
      return false;
    }
  };

  /**
   * Injeta o hook pre-push nos repositórios git existentes no diretório de workspace
   */
  private injectHooksIntoWorkspaces = async (): Promise<void> => {
    try {
      if (!fsSync.existsSync(WORKSPACE_DIR)) return;

      const entries = await fs.readdir(WORKSPACE_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const repoHooksDir = path.join(WORKSPACE_DIR, entry.name, '.git', 'hooks');
          if (fsSync.existsSync(repoHooksDir)) {
            const targetHook = path.join(repoHooksDir, 'pre-push');
            const templateHook = path.join(TEMPLATES_DIR, 'pre-push-hook.sh');
            if (fsSync.existsSync(templateHook)) {
              const hookContent = await fs.readFile(templateHook, 'utf8');
              await fs.writeFile(targetHook, hookContent, { encoding: 'utf8', mode: 0o755 });
            }
          }
        }
      }
    } catch (err) {
      console.warn('[GitGuardrailsService] Aviso ao injetar hooks nos repositórios:', (err as Error).message);
    }
  };

  /**
   * Valida deterministicamente se um comando bash contém operações git proibidas em branches protegidas
   */
  public validateCommand = (command: string, cwd: string = process.cwd()): GuardrailValidationResult => {
    if (!command || typeof command !== 'string') return { blocked: false };

    const gitRegex = /(?:^|[;&|]\s*|\$\(|\`)\s*git\s+([^\n;&|`]+)/g;
    let match: RegExpExecArray | null;

    while ((match = gitRegex.exec(command)) !== null) {
      const gitArgs = match[1].trim();

      // Bloquear git push direto
      if (/^push\b/.test(gitArgs)) {
        if (
          /\b(?:origin\s+)?(?:main|master)\b/.test(gitArgs) ||
          /:main\b/.test(gitArgs) ||
          /:master\b/.test(gitArgs)
        ) {
          return {
            blocked: true,
            reason: 'Tentativa explícita de push direto na branch protegida (main/master).',
            command: match[0].trim(),
          };
        }

        const hasExplicitFeatureBranch =
          /\b(?:feat|fix|docs|chore|refactor|test|bugfix|hotfix|feature)\/[^\s]+/i.test(gitArgs) ||
          /\bHEAD:[^\s]+/.test(gitArgs);

        if (!hasExplicitFeatureBranch) {
          try {
            const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
              cwd,
              encoding: 'utf8',
              stdio: ['pipe', 'pipe', 'pipe'],
            }).trim();

            if (currentBranch === 'main' || currentBranch === 'master') {
              return {
                blocked: true,
                reason: `Tentativa de push enquanto a branch ativa é protegida ("${currentBranch}").`,
                command: match[0].trim(),
              };
            }
          } catch {
            // Continua caso não seja repo git
          }
        }
      }

      // Bloquear git reset --hard direto na main/master
      if (/^reset\s+--hard\b/.test(gitArgs)) {
        try {
          const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
          }).trim();

          if (currentBranch === 'main' || currentBranch === 'master') {
            return {
              blocked: true,
              reason: `Tentativa de reset destrutivo (--hard) na branch protegida ("${currentBranch}").`,
              command: match[0].trim(),
            };
          }
        } catch {}
      }
    }

    return { blocked: false };
  };

  /**
   * Retorna o status operacional do Git Guardrails
   */
  public getStatus = async (): Promise<{
    provisioned: boolean;
    scriptExists: boolean;
    hooksConfigured: boolean;
    prePushHookExists: boolean;
  }> => {
    const scriptExists = fsSync.existsSync(GUARDRAIL_SCRIPT_PATH);
    const prePushHookExists = fsSync.existsSync(PRE_PUSH_HOOK_PATH);
    let hooksConfigured = false;

    try {
      if (fsSync.existsSync(HOOKS_PATH)) {
        const raw = await fs.readFile(HOOKS_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        hooksConfigured = !!parsed['git-guardrails'];
      }
    } catch {}

    return {
      provisioned: this.initialized && scriptExists && hooksConfigured && prePushHookExists,
      scriptExists,
      hooksConfigured,
      prePushHookExists,
    };
  };
}

export const gitGuardrailsService = new GitGuardrailsService();
