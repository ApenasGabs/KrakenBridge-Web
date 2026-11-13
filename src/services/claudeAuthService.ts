import fs from 'fs/promises';
import path from 'path';
import { spawn, execFile, type ChildProcess } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';
const CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || '/root/.claude';
const CREDENTIALS_FILE = path.join(CLAUDE_CONFIG_DIR, '.credentials.json');

export interface ClaudeAuthStatus {
  authenticated: boolean;
  email?: string | null;
  name?: string | null;
  authMethod?: string;
  hasToken?: boolean;
  hasKey?: boolean;
  loginExpiresAt?: string | null;
  configDirectory?: string;
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

class ClaudeAuthService {
  private pendingSession: PendingClaudeSession | null = null;
  private sessionTimeout: NodeJS.Timeout | null = null;

  /**
   * Obtém o status de autenticação do Claude Code
   */
  async getStatus(): Promise<ClaudeAuthStatus> {
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
    const hasOAuthTokenEnv = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;

    // 1. Tenta verificar status diretamente via CLI do Claude
    try {
      const { stdout } = await execFileAsync('claude', ['auth', 'status', '--json'], {
        env: {
          ...process.env,
          HOME: process.env.HOME || '/root',
          CLAUDE_CONFIG_DIR
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
              configDirectory: parsed.configDirectory || CLAUDE_CONFIG_DIR
            };
          }
        } catch {}
      }
    } catch {}

    // 2. Fallback: verificar arquivo de credenciais ~/.claude/.credentials.json
    try {
      const exists = await fs.stat(CREDENTIALS_FILE).catch(() => null);
      if (exists) {
        const raw = await fs.readFile(CREDENTIALS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.claudeAiOauth && (parsed.claudeAiOauth.accessToken || parsed.claudeAiOauth.refreshToken)) {
          return {
            authenticated: true,
            authMethod: 'oauth',
            hasToken: true,
            hasKey: hasApiKey,
            loginExpiresAt: parsed.claudeAiOauth.expiresAt ? new Date(parsed.claudeAiOauth.expiresAt).toISOString() : null,
            configDirectory: CLAUDE_CONFIG_DIR
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
        configDirectory: CLAUDE_CONFIG_DIR
      };
    }

    return {
      authenticated: false,
      authMethod: 'none',
      hasToken: false,
      hasKey: false,
      configDirectory: CLAUDE_CONFIG_DIR
    };
  }

  /**
   * Inicia o fluxo de login interativo capturando a URL de autorização OAuth
   */
  async startAuth(force = false): Promise<ClaudeStartAuthResult> {
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

      const cp = spawn('claude', ['auth', 'login'], {
        env: {
          ...process.env,
          DISPLAY: '',
          HOME: process.env.HOME || '/root',
          CLAUDE_CONFIG_DIR
        }
      });

      const session: PendingClaudeSession = {
        cp,
        authUrl: '',
        startedAt: Date.now(),
        stdoutBuffer: '',
        stderrBuffer: ''
      };

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
        const urlMatch = text.match(/https:\/\/[^\s]+/);
        if (urlMatch && !session.authUrl) {
          session.authUrl = urlMatch[0];
          this.pendingSession = session;

          // Timeout de 10 minutos para o usuário colar o código
          this.sessionTimeout = setTimeout(() => {
            this.cleanupSession();
          }, 10 * 60 * 1000);

          finishResolve({
            status: 'waiting_for_code',
            authUrl: session.authUrl,
            message: 'URL de autenticação gerada! Abra no navegador e copie o código.'
          });
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

      // Timeout de segurança para captura da URL (8 segundos)
      setTimeout(() => {
        if (!resolved && !session.authUrl) {
          this.cleanupSession();
          finishResolve({
            status: 'error',
            error: 'Tempo limite excedido ao aguardar a URL de autenticação do Claude Code.'
          });
        }
      }, 8000);
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

    // Caso 1: Existe uma sessão ativa do CLI aguardando o código via stdin
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
            const updatedStatus = await this.getStatus();
            resolve({
              success: true,
              status: 'success',
              email: updatedStatus.email,
              name: updatedStatus.name,
              message: 'Conta Claude conectada e ativada com sucesso!'
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
          if (str.toLowerCase().includes('logged in') || str.toLowerCase().includes('success') || str.toLowerCase().includes('welcome')) {
            setTimeout(() => complete(true), 500);
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

        // Timeout de resposta de 15 segundos
        setTimeout(async () => {
          if (!finished) {
            // Verifica se o status mudou para logado antes de falhar
            const st = await this.getStatus();
            if (st.authenticated) {
              complete(true);
            } else {
              complete(false, 'Tempo limite esgotado ao aguardar validação do código pelo Claude CLI.');
            }
          }
        }, 15000);
      });
    }

    // Caso 2: O usuário colou um Setup Token (sk-ant-oat01-...) diretamente
    if (code.startsWith('sk-ant-oat01-') || code.includes('"claudeAiOauth"')) {
      try {
        await fs.mkdir(CLAUDE_CONFIG_DIR, { recursive: true });
        let tokenPayload: unknown;

        if (code.startsWith('{')) {
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

        await fs.writeFile(CREDENTIALS_FILE, JSON.stringify(tokenPayload, null, 2), 'utf8');
        process.env.CLAUDE_CODE_OAUTH_TOKEN = typeof tokenPayload === 'string' ? tokenPayload : JSON.stringify(tokenPayload);

        const updated = await this.getStatus();
        return {
          success: true,
          status: 'success',
          email: updated.email,
          message: 'Setup Token do Claude Code salvo e ativado com sucesso!'
        };
      } catch (err) {
        return {
          success: false,
          status: 'error',
          error: `Erro ao salvar token do Claude: ${(err as Error).message}`
        };
      }
    }

    // Caso 3: O usuário colou uma API Key Anthropic (sk-ant-api03-...)
    if (code.startsWith('sk-ant-api03-') || code.startsWith('sk-ant-')) {
      process.env.ANTHROPIC_API_KEY = code;
      try {
        const envPath = path.join(WORKSPACE_DIR, '.env');
        let envContent = '';
        try { envContent = await fs.readFile(envPath, 'utf8'); } catch {}

        const rx = /^ANTHROPIC_API_KEY=.*$/m;
        if (rx.test(envContent)) {
          envContent = envContent.replace(rx, `ANTHROPIC_API_KEY=${code}`);
        } else {
          envContent += `\nANTHROPIC_API_KEY=${code}\n`;
        }
        await fs.writeFile(envPath, envContent, 'utf8');

        return {
          success: true,
          status: 'success',
          email: 'Anthropic API Key',
          message: 'Anthropic API Key configurada com sucesso!'
        };
      } catch (err) {
        return {
          success: true,
          status: 'success',
          email: 'Anthropic API Key',
          message: 'Anthropic API Key ativa em memória nesta sessão!'
        };
      }
    }

    return {
      success: false,
      status: 'error',
      error: 'Sessão de autorização expirada ou não encontrada. Por favor, clique em "Iniciar Login Claude Code" para gerar um novo link antes de colar o código.'
    };
  }

  /**
   * Desconecta o Claude Code (logout via CLI e remoção de credenciais)
   */
  async logout(): Promise<{ success: boolean; message: string }> {
    this.cleanupSession();

    try {
      await execFileAsync('claude', ['auth', 'logout'], {
        env: {
          ...process.env,
          HOME: process.env.HOME || '/root',
          CLAUDE_CONFIG_DIR
        },
        timeout: 5000
      }).catch(() => {});
    } catch {}

    try {
      await fs.unlink(CREDENTIALS_FILE).catch(() => {});
    } catch {}

    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      const envPath = path.join(WORKSPACE_DIR, '.env');
      let envContent = await fs.readFile(envPath, 'utf8').catch(() => '');
      if (envContent.includes('ANTHROPIC_API_KEY=')) {
        envContent = envContent.replace(/^ANTHROPIC_API_KEY=.*$/m, '');
        await fs.writeFile(envPath, envContent, 'utf8');
      }
    } catch {}

    return {
      success: true,
      message: 'Claude Code desconectado com sucesso.'
    };
  }

  private cleanupSession() {
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      this.sessionTimeout = null;
    }
    if (this.pendingSession?.cp) {
      try {
        this.pendingSession.cp.kill();
      } catch {}
      this.pendingSession = null;
    }
  }
}

export const claudeAuthService = new ClaudeAuthService();
