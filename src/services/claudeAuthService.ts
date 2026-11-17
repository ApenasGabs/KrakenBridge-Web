import fs from 'fs/promises';
import path from 'path';
import { spawn, execFile, type ChildProcess } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';
export const getClaudeConfigDir = () => process.env.CLAUDE_CONFIG_DIR || '/root/.claude';
export const getCredentialsFile = () => process.env.CLAUDE_CREDENTIALS_FILE || path.join(getClaudeConfigDir(), '.credentials.json');
export const getCredentialsVaultFile = () => process.env.CREDENTIALS_VAULT_FILE || path.join(getClaudeConfigDir(), '.credentials.json.vault');
export const getDataVaultFile = () => process.env.DATA_VAULT_FILE || '/DATA/.claude/.credentials.json.vault';
export const getPaperclipCredentialsFile = () => process.env.PAPERCLIP_CREDENTIALS_FILE || '/DATA/AppData/paperclip/data/.claude/.credentials.json';
export const getClaudeUserConfigFile = () => process.env.CLAUDE_USER_CONFIG_FILE || '/root/.claude.json';
export const getPersistentClaudeUserConfigFile = () => process.env.PERSISTENT_CLAUDE_USER_CONFIG_FILE || '/DATA/.claude.json';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Mescla o .claude.json local no arquivo persistente sem sobrescrever servidores MCP ou campos existentes.
 */
const mergeClaudeUserJsonFiles = async (sourcePath: string, targetPath: string): Promise<void> => {
  const sourceRaw = await fs.readFile(sourcePath, 'utf8').catch(() => '');
  const targetRaw = await fs.readFile(targetPath, 'utf8').catch(() => '');

  if (!targetRaw.trim()) {
    await fs.writeFile(targetPath, sourceRaw.trim() ? sourceRaw : '{}', { mode: 0o600 }).catch(() => {});
    return;
  }

  try {
    const targetObj: unknown = JSON.parse(targetRaw);
    if (!isPlainObject(targetObj)) return;
    if (!sourceRaw.trim()) return;

    const sourceObj: unknown = JSON.parse(sourceRaw);
    if (!isPlainObject(sourceObj)) return;

    const targetServers = isPlainObject(targetObj.mcpServers) ? { ...targetObj.mcpServers } : {};
    const sourceServers = isPlainObject(sourceObj.mcpServers) ? sourceObj.mcpServers : {};
    let changed = false;

    for (const [name, serverConf] of Object.entries(sourceServers)) {
      if (!(name in targetServers)) {
        targetServers[name] = serverConf;
        changed = true;
      }
    }

    if (changed) {
      targetObj.mcpServers = targetServers;
      await fs.writeFile(targetPath, JSON.stringify(targetObj, null, 2) + '\n', { mode: 0o600 }).catch(() => {});
    }
  } catch {
    // Nunca sobrescreve um JSON existente potencialmente customizado se houver erro de parse
  }
};

/**
 * Garante o symlink de ~/.claude.json apontando para o volume persistente sem corromper JSON existente.
 */
export const ensureClaudeJsonSymlink = async (userJsonPath: string, dataJsonPath: string): Promise<void> => {
  await fs.mkdir(path.dirname(dataJsonPath), { recursive: true }).catch(() => {});
  await fs.mkdir(path.dirname(userJsonPath), { recursive: true }).catch(() => {});

  const dataStat = await fs.stat(dataJsonPath).catch(() => null);
  const ensureDataJsonInitialized = async () => {
    if (!dataStat || dataStat.size === 0) {
      await fs.writeFile(dataJsonPath, '{}', { mode: 0o600 }).catch(() => {});
    }
  };

  const userLstat = await fs.lstat(userJsonPath).catch(() => null);
  if (!userLstat) {
    await ensureDataJsonInitialized();
    await fs.symlink(dataJsonPath, userJsonPath).catch(() => {});
    return;
  }

  if (!userLstat.isSymbolicLink()) {
    if (!dataStat || dataStat.size === 0) {
      await fs.copyFile(userJsonPath, dataJsonPath).catch(() => {});
    } else {
      await mergeClaudeUserJsonFiles(userJsonPath, dataJsonPath);
    }
    await fs.rm(userJsonPath, { force: true }).catch(() => {});
    await fs.symlink(dataJsonPath, userJsonPath).catch(() => {});
    return;
  }

  await ensureDataJsonInitialized();
};

const updateEnvFile = async (key: string, value?: string | null): Promise<void> => {
  try {
    const envPath = path.join(WORKSPACE_DIR, '.env');
    let envContent = await fs.readFile(envPath, 'utf8').catch(() => '');
    const rx = new RegExp(`^${key}=.*$`, 'm');
    if (value && value.trim()) {
      const cleanVal = value.trim();
      if (rx.test(envContent)) {
        envContent = envContent.replace(rx, `${key}=${cleanVal}`);
      } else {
        envContent += `\n${key}=${cleanVal}\n`;
      }
    } else {
      envContent = envContent.replace(rx, '');
    }
    await fs.writeFile(envPath, envContent.trim() + '\n', { mode: 0o600 });
  } catch {}
};

export interface ClaudeAuthStatus {
  authenticated: boolean;
  email?: string | null;
  name?: string | null;
  authMethod?: string;
  hasToken?: boolean;
  hasKey?: boolean;
  loginExpiresAt?: string | null;
  configDirectory?: string;
  subscriptionType?: string | null;
  planTier?: string | null;
  orgName?: string | null;
  error?: string;
}

export interface ClaudeStartAuthResult {
  status: 'waiting_for_code' | 'already_authenticated' | 'error';
  alreadyAuthenticated?: boolean;
  authUrl?: string;
  email?: string | null;
  name?: string | null;
  message?: string;
  error?: string;
}

export interface ClaudeSubmitCodeResult {
  success: boolean;
  status: 'success' | 'error';
  email?: string | null;
  name?: string | null;
  message?: string;
  error?: string;
}

interface PendingClaudeSession {
  cp: ChildProcess;
  authUrl: string;
  startedAt: number;
  stdoutBuffer: string;
  stderrBuffer: string;
}

/**
 * Valida se um payload de credenciais possui tokens reais não vazios
 */
export const isValidClaudeCredentials = (raw: string): boolean => {
  if (!raw || !raw.trim()) return false;
  try {
    const parsed = JSON.parse(raw);
    const oauth = parsed.claudeAiOauth;
    if (oauth) {
      const hasAccess = typeof oauth.accessToken === 'string' && oauth.accessToken.trim().length > 10;
      const hasRefresh = typeof oauth.refreshToken === 'string' && oauth.refreshToken.trim().length > 10;
      return hasAccess || hasRefresh;
    }
    if (typeof parsed.accessToken === 'string' && parsed.accessToken.trim().length > 10) return true;
    return false;
  } catch {
    return false;
  }
};

class ClaudeAuthService {
  private pendingSession: PendingClaudeSession | null = null;
  private sessionTimeout: NodeJS.Timeout | null = null;

  /**
   * Garante a persistência duradoura em /DATA/.claude e auto-cura contra remoção acidental
   */
  async ensurePersistentStorage(): Promise<void> {
    try {
      const dataDir = process.env.PERSISTENT_DATA_DIR || '/DATA/.claude';
      const configDir = getClaudeConfigDir();
      // Isolamento estrito de testes unitários para não afetar /DATA/.claude
      const isDefaultConfig = configDir === '/root/.claude';
      const dataExists = await fs.stat('/DATA').then(() => true).catch(() => false);
      if (dataExists && isDefaultConfig) {
        await fs.mkdir(dataDir, { recursive: true });

        // Symlink configDir -> dataDir
        const rootClaudeLstat = await fs.lstat(configDir).catch(() => null);
        if (!rootClaudeLstat) {
          await fs.symlink(dataDir, configDir).catch(() => {});
        } else if (!rootClaudeLstat.isSymbolicLink()) {
          // Copia recursivamente preservando subdiretórios (projects, plugins, statsig)
          await fs.cp(configDir, dataDir, { recursive: true, force: true }).catch(() => {});
          await fs.rm(configDir, { recursive: true, force: true }).catch(() => {});
          await fs.symlink(dataDir, configDir).catch(() => {});
        }

        // Symlink /root/.claude.json -> /DATA/.claude.json sem corromper conteúdo pré-existente
        await ensureClaudeJsonSymlink(getClaudeUserConfigFile(), getPersistentClaudeUserConfigFile());
      } else if (process.env.CLAUDE_USER_CONFIG_FILE && process.env.PERSISTENT_CLAUDE_USER_CONFIG_FILE) {
        await ensureClaudeJsonSymlink(getClaudeUserConfigFile(), getPersistentClaudeUserConfigFile());
      }

      const credsFile = getCredentialsFile();
      const vaultFile = getCredentialsVaultFile();
      const dataVaultFile = getDataVaultFile();
      const paperclipFile = getPaperclipCredentialsFile();

      // Auto-cura do Vault de credenciais com validação estrita
      const credsRaw = await fs.readFile(credsFile, 'utf8').catch(() => '');
      const vaultRaw = await fs.readFile(vaultFile, 'utf8').catch(() => '');
      const dataVaultRaw = await fs.readFile(dataVaultFile, 'utf8').catch(() => '');
      const paperclipRaw = await fs.readFile(paperclipFile, 'utf8').catch(() => '');

      const isCredsValid = isValidClaudeCredentials(credsRaw);
      const isVaultValid = isValidClaudeCredentials(vaultRaw);
      const isDataVaultValid = isValidClaudeCredentials(dataVaultRaw);
      const isPaperclipValid = isValidClaudeCredentials(paperclipRaw);

      if (isCredsValid) {
        // Credenciais atuais em disco são saudáveis: atualiza o cofre de backup
        await this.backupCredentials();
      } else if (isVaultValid) {
        await fs.writeFile(credsFile, vaultRaw, { mode: 0o600 });
        await this.syncToPaperclip(vaultRaw);
      } else if (isDataVaultValid) {
        await fs.writeFile(credsFile, dataVaultRaw, { mode: 0o600 });
        await fs.writeFile(vaultFile, dataVaultRaw, { mode: 0o600 });
        await this.syncToPaperclip(dataVaultRaw);
      } else if (isPaperclipValid) {
        await fs.writeFile(credsFile, paperclipRaw, { mode: 0o600 });
        await fs.writeFile(vaultFile, paperclipRaw, { mode: 0o600 });
      } else if (process.env.CLAUDE_CODE_OAUTH_TOKEN && process.env.CLAUDE_CODE_OAUTH_TOKEN.trim().startsWith('sk-ant-oat01-')) {
        const token = process.env.CLAUDE_CODE_OAUTH_TOKEN.trim();
        const payload = JSON.stringify({
          claudeAiOauth: {
            accessToken: token,
            refreshToken: '',
            expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000
          }
        }, null, 2);
        await fs.writeFile(credsFile, payload, { mode: 0o600 });
        await fs.writeFile(vaultFile, payload, { mode: 0o600 });
        await this.syncToPaperclip(payload);
      }
    } catch (err) {
      console.warn('[ClaudeAuthService] Aviso ao inicializar armazenamento persistente do Claude:', (err as Error).message);
    }
  }

  async backupCredentials(): Promise<void> {
    try {
      const credsFile = getCredentialsFile();
      const raw = await fs.readFile(credsFile, 'utf8').catch(() => '');
      if (isValidClaudeCredentials(raw)) {
        await fs.writeFile(getCredentialsVaultFile(), raw, { mode: 0o600 }).catch(() => {});
        await fs.writeFile(getDataVaultFile(), raw, { mode: 0o600 }).catch(() => {});
        await this.syncToPaperclip(raw);
      }
    } catch {}
  }

  async syncToPaperclip(rawContent: string): Promise<void> {
    try {
      if (!isValidClaudeCredentials(rawContent)) return;
      const pcFile = getPaperclipCredentialsFile();
      const pcDir = path.dirname(pcFile);
      await fs.mkdir(pcDir, { recursive: true }).catch(() => {});
      await fs.writeFile(pcFile, rawContent, { mode: 0o600 }).catch(() => {});
      await fs.chmod(pcFile, 0o600).catch(() => {});
      if (typeof process.getuid === 'function' && process.getuid() === 0) {
        await fs.chown(pcFile, 1000, 1000).catch(() => {});
      }
    } catch {}
  }

  /**
   * Obtém o status de autenticação do Claude Code
   */
  async getStatus(): Promise<ClaudeAuthStatus> {
    await this.ensurePersistentStorage();

    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
    const hasOAuthTokenEnv = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
    const configDir = getClaudeConfigDir();

    // 1. Tenta verificar status diretamente via CLI do Claude
    try {
      const { stdout } = await execFileAsync('claude', ['auth', 'status', '--json'], {
        env: {
          ...process.env,
          HOME: process.env.HOME || '/root',
          CLAUDE_CONFIG_DIR: configDir
        },
        timeout: 5000
      }).catch((err: { stdout?: string; stderr?: string }) => ({ stdout: err.stdout || '', stderr: err.stderr || '' }));

      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as {
            loggedIn?: boolean;
            authMethod?: string;
            configDirectory?: string;
            loginExpiresAt?: string | null;
            email?: string | null;
            subscriptionType?: string | null;
            planTier?: string | null;
            orgName?: string | null;
          };

          const isCliLoggedIn = Boolean(parsed.loggedIn);
          const authMethod = parsed.authMethod || (hasApiKey ? 'apikey' : hasOAuthTokenEnv ? 'oauth_token' : 'none');

          if (isCliLoggedIn || hasApiKey || hasOAuthTokenEnv) {
            return {
              authenticated: isCliLoggedIn || hasApiKey || hasOAuthTokenEnv,
              email: parsed.email || (hasApiKey ? 'Anthropic API Key' : null),
              authMethod,
              hasToken: isCliLoggedIn || hasOAuthTokenEnv,
              hasKey: hasApiKey,
              loginExpiresAt: parsed.loginExpiresAt || null,
              configDirectory: parsed.configDirectory || configDir,
              subscriptionType: parsed.subscriptionType || null,
              planTier: parsed.planTier || null,
              orgName: parsed.orgName || null
            };
          }
        } catch {}
      }
    } catch {}

    // 2. Fallback: verificar arquivo de credenciais
    try {
      const credsFile = getCredentialsFile();
      const exists = await fs.stat(credsFile).catch(() => null);
      if (exists) {
        const raw = await fs.readFile(credsFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.claudeAiOauth && (parsed.claudeAiOauth.accessToken || parsed.claudeAiOauth.refreshToken)) {
          return {
            authenticated: true,
            authMethod: 'oauth',
            hasToken: true,
            hasKey: hasApiKey,
            loginExpiresAt: parsed.claudeAiOauth.expiresAt ? new Date(parsed.claudeAiOauth.expiresAt).toISOString() : null,
            configDirectory: configDir
          };
        }
      }
    } catch {}

    // 3. Fallback se apenas chave de API estiver configurada
    if (hasApiKey) {
      return {
        authenticated: true,
        email: 'Anthropic API Key',
        authMethod: 'apikey',
        hasToken: false,
        hasKey: true,
        configDirectory: configDir
      };
    }

    return {
      authenticated: false,
      authMethod: 'none',
      hasToken: false,
      hasKey: false,
      configDirectory: configDir
    };
  }

  /**
   * Obtém o token OAuth ativo do Claude Code (quando autenticado via OAuth)
   */
  async getOAuthAccessToken(): Promise<string | null> {
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN && process.env.CLAUDE_CODE_OAUTH_TOKEN.trim().length > 10) {
      return process.env.CLAUDE_CODE_OAUTH_TOKEN.trim();
    }
    try {
      await this.ensurePersistentStorage();
      const raw = await fs.readFile(getCredentialsFile(), 'utf8');
      const parsed = JSON.parse(raw);
      const token = parsed?.claudeAiOauth?.accessToken || parsed?.accessToken;
      if (typeof token === 'string' && token.trim().length > 10) {
        return token.trim();
      }
    } catch {}
    return null;
  }

  /**
   * Inicia o fluxo de login interativo capturando a URL de autorização OAuth
   * Por padrão usa `claude auth login` que é 100% plain text (não usa TTY/Ink),
   * funcionando de forma instantânea e confiável em containers headless.
   */
  async startAuth(force = false, mode: 'login' | 'setup-token' = 'login'): Promise<ClaudeStartAuthResult> {
    const currentStatus = await this.getStatus();
    if (currentStatus.authenticated && !force) {
      return {
        status: 'already_authenticated',
        alreadyAuthenticated: true,
        email: currentStatus.email,
        name: currentStatus.name,
        message: `Claude Code já está conectado (${currentStatus.email || currentStatus.authMethod || 'Autenticado'})!`
      };
    }

    // Limpa sessão pendente anterior se houver
    this.cleanupSession();

    return new Promise((resolve) => {
      let resolved = false;
      const cmdArgs = mode === 'setup-token' ? ['setup-token'] : ['auth', 'login'];

      const cp = spawn('claude', cmdArgs, {
        env: {
          ...process.env,
          DISPLAY: '',
          HOME: process.env.HOME || '/root',
          CLAUDE_CONFIG_DIR: getClaudeConfigDir(),
          COLUMNS: '1000'
        }
      });

      const session: PendingClaudeSession = {
        cp,
        authUrl: '',
        startedAt: Date.now(),
        stdoutBuffer: '',
        stderrBuffer: ''
      };

      // Registra a sessão imediatamente para que qualquer timeout, erro ou cancelamento execute SIGKILL no cp
      this.pendingSession = session;

      const finishResolve = (result: ClaudeStartAuthResult) => {
        if (!resolved) {
          resolved = true;
          resolve(result);
        }
      };

      cp.stdout?.on('data', (chunk) => {
        const text = chunk.toString();
        session.stdoutBuffer += text;

        // Procura por URL de autorização emitida pelo Claude Code CLI
        if (!session.authUrl) {
          const buf = session.stdoutBuffer;
          // Regex robusta que captura a URL direta do Claude Code ignorando caracteres de escape ANSI ou duplicatas
          const urlMatch = buf.match(/https:\/\/(?:claude\.com\/cai\/oauth\/authorize|auth\.anthropic\.com)[^\s>\x1b\x07\x00-\x1f'"]+/);
          if (urlMatch) {
            session.authUrl = urlMatch[0];
          }

          if (session.authUrl) {
            // Timeout de 30 minutos para o usuário colar o código
            this.sessionTimeout = setTimeout(() => {
              this.cleanupSession();
            }, 30 * 60 * 1000);

            finishResolve({
              status: 'waiting_for_code',
              authUrl: session.authUrl,
              message: 'URL de autenticação do Claude Code gerada! Abra no navegador e copie o código.'
            });
          }
        }
      });

      cp.stderr?.on('data', (chunk) => {
        session.stderrBuffer += chunk.toString();
      });

      cp.on('close', (code) => {
        if (!session.authUrl) {
          finishResolve({
            status: 'error',
            error: `Claude CLI encerrou com código ${code} antes de gerar URL: ${session.stderrBuffer || session.stdoutBuffer}`
          });
        }
      });

      cp.on('error', (err) => {
        finishResolve({
          status: 'error',
          error: `Erro ao iniciar Claude CLI: ${err.message}`
        });
      });

      // Timeout de segurança para captura da URL (25 segundos)
      setTimeout(() => {
        if (!resolved && !session.authUrl) {
          this.cleanupSession();
          finishResolve({
            status: 'error',
            error: 'Tempo limite excedido ao aguardar a URL de autenticação do Claude Code.'
          });
        }
      }, 25000);
    });
  }

  /**
   * Envia o código de autorização para o Claude CLI (ou processa tokens diretos)
   */
  async submitCode(rawCode: string): Promise<ClaudeSubmitCodeResult> {
    if (!rawCode || !rawCode.trim()) {
      return {
        success: false,
        status: 'error',
        error: 'Código de autorização não informado.'
      };
    }

    let code = rawCode.trim().replace(/^['"]|['"]$/g, '').trim();
    if (code.includes('code=')) {
      const match = code.match(/[?&]code=([^&]+)/);
      if (match) code = decodeURIComponent(match[1]);
    }
    code = code.trim();

    // Caso 1: O usuário colou um Setup Token (sk-ant-oat01-...) diretamente
    if (code.startsWith('sk-ant-oat01-') || code.includes('"claudeAiOauth"')) {
      this.cleanupSession();
      try {
        await fs.mkdir(getClaudeConfigDir(), { recursive: true });
        let tokenPayload: unknown;

        if (code.startsWith('{')) {
          if (!isValidClaudeCredentials(code)) {
            return {
              success: false,
              status: 'error',
              error: 'JSON de credenciais inválido ou sem tokens reconhecidos.'
            };
          }
          tokenPayload = JSON.parse(code);
        } else {
          tokenPayload = {
            claudeAiOauth: {
              accessToken: code,
              refreshToken: '',
              expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000
            }
          };
        }

        const rawJson = JSON.stringify(tokenPayload, null, 2);
        await fs.writeFile(getCredentialsFile(), rawJson, { encoding: 'utf8', mode: 0o600 });
        await this.backupCredentials();

        if (typeof code === 'string' && code.startsWith('sk-ant-oat01-')) {
          process.env.CLAUDE_CODE_OAUTH_TOKEN = code;
          await updateEnvFile('CLAUDE_CODE_OAUTH_TOKEN', code);
        }

        const updated = await this.getStatus();
        return {
          success: true,
          status: 'success',
          email: updated.email,
          message: 'Setup Token duradouro (1 ano) do Claude Code salvo e ativado no cofre com sucesso!'
        };
      } catch (err) {
        return {
          success: false,
          status: 'error',
          error: `Erro ao salvar token do Claude: ${(err as Error).message}`
        };
      }
    }

    // Caso 2: O usuário colou uma API Key Anthropic (sk-ant-api03-...)
    if (code.startsWith('sk-ant-api03-') || code.startsWith('sk-ant-')) {
      this.cleanupSession();
      process.env.ANTHROPIC_API_KEY = code;
      await updateEnvFile('ANTHROPIC_API_KEY', code);

      return {
        success: true,
        status: 'success',
        email: 'Anthropic API Key',
        message: 'Anthropic API Key configurada com sucesso!'
      };
    }

    // Caso 3: Existe uma sessão ativa do CLI aguardando o código de autorização OAuth via stdin
    if (this.pendingSession && this.pendingSession.cp && !this.pendingSession.cp.killed) {
      const cp = this.pendingSession.cp;

      return new Promise<ClaudeSubmitCodeResult>((resolve) => {
        let finished = false;
        let responseOutput = '';
        let errorOutput = '';

        const complete = async (success: boolean, errorMsg?: string) => {
          if (finished) return;
          finished = true;
          this.cleanupSession();

          if (success) {
            // Verifica se o setup-token emitiu um token explícito na saída
            const tokenMatch = responseOutput.match(/sk-ant-oat01-[a-zA-Z0-9_-]+/);
            if (tokenMatch) {
              const extractedToken = tokenMatch[0];
              process.env.CLAUDE_CODE_OAUTH_TOKEN = extractedToken;
              await updateEnvFile('CLAUDE_CODE_OAUTH_TOKEN', extractedToken);
            }

            // Garante backup imediato no cofre persistente
            await this.backupCredentials();
            const updatedStatus = await this.getStatus();
            resolve({
              success: true,
              status: 'success',
              email: updatedStatus.email,
              name: updatedStatus.name,
              message: 'Conta Claude conectada e credenciais salvas no cofre com sucesso!'
            });
          } else {
            resolve({
              success: false,
              status: 'error',
              error: errorMsg || 'Falha ao validar código no Claude Code.'
            });
          }
        };

        cp.stdout?.on('data', (d) => {
          const str = d.toString();
          responseOutput += str;
          if (
            str.toLowerCase().includes('logged in') ||
            str.toLowerCase().includes('success') ||
            str.toLowerCase().includes('welcome') ||
            str.toLowerCase().includes('your oauth token') ||
            str.toLowerCase().includes('token setup complete')
          ) {
            setTimeout(() => complete(true), 1000);
          }
        });

        cp.stderr?.on('data', (d) => {
          const str = d.toString();
          errorOutput += str;
          if (str.toLowerCase().includes('invalid code') || str.toLowerCase().includes('failed') || str.toLowerCase().includes('error')) {
            setTimeout(() => complete(false, str.trim()), 500);
          }
        });

        cp.on('close', async (exitCode) => {
          if (exitCode === 0) {
            await complete(true);
          } else {
            const err = errorOutput || responseOutput || `CLI encerrou com código ${exitCode}`;
            await complete(false, err);
          }
        });

        cp.on('error', (err) => {
          complete(false, err.message);
        });

        // Escreve o código no stdin do processo
        try {
          cp.stdin?.write(`${code}\n`);
        } catch (err) {
          complete(false, (err as Error).message);
        }

        // Timeout de resposta de 20 segundos
        setTimeout(async () => {
          if (!finished) {
            const st = await this.getStatus();
            if (st.authenticated) {
              complete(true);
            } else {
              complete(false, 'Tempo limite esgotado ao aguardar validação do código pelo Claude CLI.');
            }
          }
        }, 20000);
      });
    }

    return {
      success: false,
      status: 'error',
      error: 'Sessão de autorização expirada ou não encontrada. Por favor, clique em "Iniciar Login Claude Code" para gerar um novo link antes de colar o código.'
    };
  }

  /**
   * Desconecta o Claude Code (logout via CLI e remoção de credenciais de todos os cofres)
   */
  async logout(): Promise<{ success: boolean; message: string }> {
    this.cleanupSession();

    try {
      await execFileAsync('claude', ['auth', 'logout'], {
        env: {
          ...process.env,
          HOME: process.env.HOME || '/root',
          CLAUDE_CONFIG_DIR: getClaudeConfigDir()
        },
        timeout: 5000
      }).catch(() => {});
    } catch {}

    try {
      await fs.unlink(getCredentialsFile()).catch(() => {});
      await fs.unlink(getCredentialsVaultFile()).catch(() => {});
      await fs.unlink(getDataVaultFile()).catch(() => {});
      await fs.unlink(getPaperclipCredentialsFile()).catch(() => {});
    } catch {}

    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;

    await updateEnvFile('ANTHROPIC_API_KEY', null);
    await updateEnvFile('CLAUDE_CODE_OAUTH_TOKEN', null);

    return {
      success: true,
      message: 'Claude Code desconectado com sucesso.'
    };
  }

  /**
   * Encerramento determinístico de processos filhos com SIGKILL em cleanupSession
   */
  private cleanupSession() {
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      this.sessionTimeout = null;
    }
    if (this.pendingSession?.cp) {
      const pid = this.pendingSession.cp.pid;
      try {
        this.pendingSession.cp.kill('SIGKILL');
      } catch {}
      if (pid) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {}
      }
      this.pendingSession = null;
    }
  }
}

export const claudeAuthService = new ClaudeAuthService();
