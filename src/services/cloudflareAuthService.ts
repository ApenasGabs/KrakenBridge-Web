import fs from 'fs/promises';
import path from 'path';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const CLOUDFLARE_CONFIG_DIR = process.env.CLOUDFLARE_CONFIG_DIR || '/root/.config/.wrangler';
const CONFIG_FILE = path.join(CLOUDFLARE_CONFIG_DIR, 'kraken-auth.json');
const PROFILE_D_FILE = '/etc/profile.d/cloudflare.sh';
const WRANGLER_CLIENT_ID = '54d11594-84e4-41aa-b438-e81b8fa78ee7';

export type CloudflareAuthMethod = 'oauth' | 'token' | 'none';

export interface CloudflareAuthStatus {
  authenticated: boolean;
  authMethod: CloudflareAuthMethod;
  accountId?: string;
  accountName?: string;
  email?: string;
  username?: string;
  tokenStatus?: string;
  hasToken?: boolean;
  isOAuth?: boolean;
  keyringEnabled?: boolean;
  configPath?: string;
  error?: string;
}

export interface CloudflareDeviceFlowResult {
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  interval: number;
  expiresIn: number;
}

export interface CloudflareDevicePollResult {
  status: 'pending' | 'slow_down' | 'expired' | 'denied' | 'error' | 'success' | 'no_session';
  authMethod?: CloudflareAuthMethod;
  email?: string;
  accountName?: string;
  accountId?: string;
  error?: string;
}

interface CloudflareVerifyResponse {
  result?: {
    id: string;
    status: string;
  };
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  messages?: Array<{ code: number; message: string }>;
}

interface CloudflareAccountsResponse {
  result?: Array<{
    id: string;
    name: string;
  }>;
  success: boolean;
}

interface CloudflareUserResponse {
  result?: {
    id: string;
    email: string;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  success: boolean;
}

interface StoredOAuthData {
  oauth_token?: string;
  refresh_token?: string;
  expiration_time?: string;
  scopes?: string[];
}

interface PendingDeviceSession {
  child?: ReturnType<typeof spawn>;
  userCode?: string;
  verificationUri?: string;
  verificationUriComplete?: string;
  expiresIn?: number;
  interval?: number;
  status: 'pending' | 'success' | 'expired' | 'denied' | 'error';
  email?: string;
  accountName?: string;
  accountId?: string;
  error?: string;
  startedAt: number;
  useKeyring?: boolean;
}

class CloudflareAuthService {
  private pendingSession: PendingDeviceSession | null = null;

  private getConfigDir(): string {
    return process.env.CLOUDFLARE_CONFIG_DIR || CLOUDFLARE_CONFIG_DIR;
  }

  private getWranglerTomlPath(): string {
    return path.join(this.getConfigDir(), 'config', 'default.toml');
  }

  private getWranglerPreferencesPath(): string {
    return path.join(this.getConfigDir(), 'config', 'preferences.json');
  }

  private getWranglerEncryptedPath(): string {
    return path.join(this.getConfigDir(), 'config', 'default.toml.encrypted');
  }

  /**
   * Lê as credenciais OAuth do arquivo default.toml do Wrangler
   */
  async getStoredOAuthData(): Promise<StoredOAuthData | null> {
    const tomlPath = this.getWranglerTomlPath();
    try {
      const content = await fs.readFile(tomlPath, 'utf8');
      const tokenMatch = content.match(/oauth_token\s*=\s*["']([^"']+)["']/);
      const refreshMatch = content.match(/refresh_token\s*=\s*["']([^"']+)["']/);
      const expiryMatch = content.match(/expiration_time\s*=\s*["']([^"']+)["']/);

      if (!tokenMatch || !tokenMatch[1]) return null;

      return {
        oauth_token: tokenMatch[1].trim(),
        refresh_token: refreshMatch ? refreshMatch[1].trim() : undefined,
        expiration_time: expiryMatch ? expiryMatch[1].trim() : undefined
      };
    } catch {
      return null;
    }
  }

  /**
   * Salva credenciais OAuth diretamente no default.toml do Wrangler
   */
  async saveOAuthData(data: {
    oauth_token: string;
    refresh_token?: string;
    expiration_time?: string;
    scopes?: string[];
  }): Promise<void> {
    const configDir = path.join(this.getConfigDir(), 'config');
    await fs.mkdir(configDir, { recursive: true });
    const tomlPath = this.getWranglerTomlPath();

    const scopesList = data.scopes && data.scopes.length > 0
      ? data.scopes
      : [
          'account:read',
          'user:read',
          'workers:write',
          'workers_kv:write',
          'workers_routes:write',
          'workers_scripts:write',
          'workers_tail:read',
          'd1:write',
          'pages:write',
          'zone:read',
          'ssl_certs:write',
          'constellation:write',
          'ai:write',
          'queues:write',
          'pipelines:write',
          'secrets_store:write',
          'vectorize:write',
          'hyperdrive:write',
          'r2:write',
          'browser:write',
          'artifacts:write',
          'containers:write',
          'offline_access'
        ];

    const scopesFormatted = scopesList.map((s) => `  "${s}"`).join(',\n');
    const tomlContent = [
      `oauth_token = "${data.oauth_token}"`,
      `refresh_token = "${data.refresh_token || ''}"`,
      `expiration_time = "${data.expiration_time || new Date(Date.now() + 3600 * 1000).toISOString()}"`,
      `scopes = [\n${scopesFormatted}\n]`
    ].join('\n') + '\n';

    await fs.writeFile(tomlPath, tomlContent, { encoding: 'utf8', mode: 0o600 });
  }

  /**
   * Verifica se a preferência de keyring está habilitada
   */
  async isKeyringEnabled(): Promise<boolean> {
    try {
      const prefPath = this.getWranglerPreferencesPath();
      const content = await fs.readFile(prefPath, 'utf8');
      const parsed = JSON.parse(content) as { keyring_enabled?: boolean };
      return parsed.keyring_enabled === true;
    } catch {
      return false;
    }
  }

  /**
   * Altera a preferência de keyring do Wrangler
   */
  async setKeyringPreference(enabled: boolean): Promise<void> {
    try {
      const configDir = path.join(this.getConfigDir(), 'config');
      await fs.mkdir(configDir, { recursive: true });
      const prefPath = this.getWranglerPreferencesPath();
      let current: Record<string, unknown> = {};
      try {
        const content = await fs.readFile(prefPath, 'utf8');
        current = JSON.parse(content);
      } catch {}
      current.keyring_enabled = enabled;
      await fs.writeFile(prefPath, JSON.stringify(current, null, 2), { encoding: 'utf8', mode: 0o600 });
    } catch (err) {
      console.warn('[CloudflareAuthService] Aviso ao salvar preferência de keyring:', (err as Error).message);
    }
  }

  /**
   * Obtém token de API tradicional (caso exista em memória ou arquivo)
   */
  private async getToken(): Promise<{ token?: string; accountId?: string }> {
    let token = process.env.CLOUDFLARE_API_TOKEN?.trim();
    let accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();

    if (!token) {
      try {
        const configFile = path.join(this.getConfigDir(), 'kraken-auth.json');
        const content = await fs.readFile(configFile, 'utf8');
        const parsed = JSON.parse(content) as { apiToken?: string; accountId?: string };
        if (parsed.apiToken?.trim()) {
          token = parsed.apiToken.trim();
          process.env.CLOUDFLARE_API_TOKEN = token;
        }
        if (parsed.accountId?.trim() && !accountId) {
          accountId = parsed.accountId.trim();
          process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
        }
      } catch {
        // Arquivo de configuração ainda não existe
      }
    }

    return { token, accountId };
  }

  /**
   * Executa `wrangler whoami --json` via CLI
   */
  private async queryWranglerWhoami(): Promise<{
    loggedIn: boolean;
    authType?: string;
    email?: string;
    accounts?: Array<{ id: string; name: string }>;
  } | null> {
    try {
      const { stdout } = await execFileAsync('npx', ['wrangler', 'whoami', '--json'], {
        timeout: 4000,
        env: { ...process.env, HOME: '/root' }
      });
      const parsed = JSON.parse(stdout.trim());
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Obtém o status da autenticação do Wrangler / Cloudflare
   */
  async getStatus(): Promise<CloudflareAuthStatus> {
    const keyringEnabled = await this.isKeyringEnabled();
    const configPath = this.getWranglerTomlPath();

    try {
      // 1. Prioridade para token de API se explicitamente configurado no ambiente
      const { token: apiToken, accountId: storedAccountId } = await this.getToken();

      if (apiToken) {
        // Valida o token de API diretamente na API oficial
        const verifyRes = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'User-Agent': 'KrakenBridge-Web'
          }
        });

        if (verifyRes.ok) {
          const verifyData = (await verifyRes.json()) as CloudflareVerifyResponse;
          if (verifyData.success && verifyData.result?.status === 'active') {
            const tokenDetails = await this.fetchAccountAndUserDetails(apiToken, storedAccountId);
            return {
              authenticated: true,
              authMethod: 'token',
              hasToken: true,
              isOAuth: false,
              keyringEnabled,
              tokenStatus: 'active',
              configPath: path.join(this.getConfigDir(), 'kraken-auth.json'),
              accountId: tokenDetails.accountId,
              accountName: tokenDetails.accountName,
              email: tokenDetails.email,
              username: tokenDetails.username
            };
          }
        }
      }

      // 2. Verificação de credenciais OAuth armazenadas no default.toml do Wrangler
      const oauthData = await this.getStoredOAuthData();
      if (oauthData?.oauth_token) {
        const verifyRes = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
          headers: {
            'Authorization': `Bearer ${oauthData.oauth_token}`,
            'User-Agent': 'KrakenBridge-Web'
          }
        });

        if (verifyRes.ok) {
          const verifyData = (await verifyRes.json()) as CloudflareVerifyResponse;
          if (verifyData.success && verifyData.result?.status === 'active') {
            const details = await this.fetchAccountAndUserDetails(oauthData.oauth_token, storedAccountId);
            return {
              authenticated: true,
              authMethod: 'oauth',
              hasToken: true,
              isOAuth: true,
              keyringEnabled,
              tokenStatus: 'active',
              configPath,
              accountId: details.accountId,
              accountName: details.accountName,
              email: details.email,
              username: details.username
            };
          }
        }

        // Se expirou e temos refresh_token, tenta renovar
        if (oauthData.refresh_token) {
          const refreshed = await this.refreshOAuthToken(oauthData.refresh_token);
          if (refreshed.success && refreshed.accessToken) {
            const details = await this.fetchAccountAndUserDetails(refreshed.accessToken, storedAccountId);
            return {
              authenticated: true,
              authMethod: 'oauth',
              hasToken: true,
              isOAuth: true,
              keyringEnabled,
              tokenStatus: 'active',
              configPath,
              accountId: details.accountId,
              accountName: details.accountName,
              email: details.email,
              username: details.username
            };
          }
        }
      }

      // 3. Verificação com keyring ativo ou credenciais encriptadas
      if (keyringEnabled) {
        const whoami = await this.queryWranglerWhoami();
        if (whoami && whoami.loggedIn) {
          const isOAuth = whoami.authType?.toLowerCase().includes('oauth') ?? true;
          return {
            authenticated: true,
            authMethod: isOAuth ? 'oauth' : 'token',
            hasToken: true,
            isOAuth,
            keyringEnabled: true,
            tokenStatus: 'active',
            configPath: 'OS Keyring',
            accountId: whoami.accounts?.[0]?.id,
            accountName: whoami.accounts?.[0]?.name,
            email: whoami.email,
            username: whoami.email || 'Cloudflare User'
          };
        }
      }

      return {
        authenticated: false,
        authMethod: 'none',
        hasToken: false,
        isOAuth: false,
        keyringEnabled,
        configPath
      };
    } catch (err) {
      console.warn('[CloudflareAuthService] Erro ao obter status:', (err as Error).message);
      return {
        authenticated: false,
        authMethod: 'none',
        hasToken: false,
        isOAuth: false,
        keyringEnabled,
        configPath,
        error: (err as Error).message
      };
    }
  }

  /**
   * Busca contas e detalhes de usuário para um token válido
   */
  private async fetchAccountAndUserDetails(
    bearerToken: string,
    fallbackAccountId?: string
  ): Promise<{ accountId?: string; accountName?: string; email?: string; username?: string }> {
    let accountId = fallbackAccountId;
    let accountName: string | undefined;
    let email: string | undefined;
    let username: string | undefined;

    try {
      const accountsRes = await fetch('https://api.cloudflare.com/client/v4/accounts?page=1&per_page=20', {
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
          'User-Agent': 'KrakenBridge-Web'
        }
      });

      if (accountsRes.ok) {
        const accountsData = (await accountsRes.json()) as CloudflareAccountsResponse;
        if (accountsData.success && accountsData.result && accountsData.result.length > 0) {
          const matched = accountId
            ? accountsData.result.find((a) => a.id === accountId) || accountsData.result[0]
            : accountsData.result[0];

          accountId = matched.id;
          accountName = matched.name;
        }
      }
    } catch {}

    try {
      const userRes = await fetch('https://api.cloudflare.com/client/v4/user', {
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
          'User-Agent': 'KrakenBridge-Web'
        }
      });

      if (userRes.ok) {
        const userData = (await userRes.json()) as CloudflareUserResponse;
        if (userData.success && userData.result) {
          email = userData.result.email;
          username = userData.result.username || userData.result.email;
        }
      }
    } catch {}

    return {
      accountId,
      accountName,
      email,
      username: username || accountName || 'Cloudflare User'
    };
  }

  /**
   * Inicia o fluxo Device Authorization Grant do Cloudflare Wrangler (`wrangler login --device`)
   */
  async startDeviceFlow(useKeyring = false): Promise<CloudflareDeviceFlowResult> {
    // Se houver uma sessão pendente antiga, finaliza o processo anterior
    if (this.pendingSession?.child) {
      try {
        this.pendingSession.child.kill();
      } catch {}
      this.pendingSession = null;
    }

    const args = ['login', '--device', '--browser=false'];
    if (useKeyring) {
      args.push('--use-keyring');
    } else {
      args.push('--no-use-keyring');
    }

    const child = spawn('npx', ['wrangler', ...args], {
      env: { ...process.env, HOME: '/root' }
    });

    const sessionState: PendingDeviceSession = {
      child,
      status: 'pending',
      startedAt: Date.now(),
      useKeyring,
      expiresIn: 300,
      interval: 5
    };
    this.pendingSession = sessionState;

    return new Promise<CloudflareDeviceFlowResult>((resolve, reject) => {
      let resolved = false;
      let outputBuffer = '';

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          sessionState.status = 'error';
          sessionState.error = 'Timeout ao aguardar código de verificação do Wrangler CLI.';
          reject(new Error(sessionState.error));
        }
      }, 15000);

      child.stdout?.on('data', (data) => {
        const chunk = data.toString();
        outputBuffer += chunk;

        // Procura URL e código gerados pelo Wrangler
        const urlMatch = outputBuffer.match(/https:\/\/dash\.cloudflare\.com\/oauth2\/device[^\s]*/);
        const codeMatch = outputBuffer.match(/enter the code:\s*\n*\s*([A-Za-z0-9_-]+)/i);

        if (urlMatch && codeMatch && !resolved) {
          resolved = true;
          clearTimeout(timeoutId);

          const verificationUri = urlMatch[0].trim();
          const userCode = codeMatch[1].trim();
          const verificationUriComplete = `${verificationUri}?user_code=${encodeURIComponent(userCode)}`;

          sessionState.userCode = userCode;
          sessionState.verificationUri = verificationUri;
          sessionState.verificationUriComplete = verificationUriComplete;

          resolve({
            userCode,
            verificationUri,
            verificationUriComplete,
            interval: sessionState.interval || 5,
            expiresIn: sessionState.expiresIn || 300
          });
        }
      });

      child.stderr?.on('data', (data) => {
        const errChunk = data.toString();
        if (errChunk.includes('Error') && !resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          sessionState.status = 'error';
          sessionState.error = errChunk;
          reject(new Error(errChunk));
        }
      });

      child.on('close', async (code) => {
        clearTimeout(timeoutId);
        if (code === 0) {
          sessionState.status = 'success';
          // Garante remoção de CLOUDFLARE_API_TOKEN para que o Wrangler passe a usar o OAuth recém-criado
          await this.switchToOAuth().catch(() => {});
          const status = await this.getStatus().catch(() => null);
          if (status) {
            sessionState.email = status.email;
            sessionState.accountName = status.accountName;
            sessionState.accountId = status.accountId;
          }
        } else if (sessionState.status === 'pending') {
          sessionState.status = 'error';
          sessionState.error = `Wrangler login encerrou com código ${code}`;
          if (!resolved) {
            resolved = true;
            reject(new Error(sessionState.error));
          }
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeoutId);
        sessionState.status = 'error';
        sessionState.error = err.message;
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });
    });
  }

  /**
   * Consulta o andamento do Device Flow em andamento
   */
  async pollDeviceFlow(): Promise<CloudflareDevicePollResult> {
    if (!this.pendingSession) {
      return { status: 'no_session' };
    }

    if (this.pendingSession.status === 'success') {
      const email = this.pendingSession.email;
      const accountName = this.pendingSession.accountName;
      const accountId = this.pendingSession.accountId;
      this.pendingSession = null;
      return {
        status: 'success',
        authMethod: 'oauth',
        email,
        accountName,
        accountId
      };
    }

    if (this.pendingSession.status === 'error') {
      const error = this.pendingSession.error || 'Erro na autenticação OAuth.';
      this.pendingSession = null;
      return { status: 'error', error };
    }

    // Verifica se expirou o tempo limite de 5 minutos
    const elapsed = (Date.now() - this.pendingSession.startedAt) / 1000;
    if (elapsed > (this.pendingSession.expiresIn || 300)) {
      if (this.pendingSession.child) {
        try { this.pendingSession.child.kill(); } catch {}
      }
      this.pendingSession = null;
      return { status: 'expired', error: 'Código de autorização expirado. Gere um novo código.' };
    }

    return { status: 'pending' };
  }

  /**
   * Renova o token OAuth utilizando o refresh_token
   */
  async refreshOAuthToken(refreshToken: string): Promise<{ success: boolean; accessToken?: string }> {
    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: WRANGLER_CLIENT_ID
      });

      const response = await fetch('https://dash.cloudflare.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'KrakenBridge-Web'
        },
        body: params.toString()
      });

      if (!response.ok) {
        return { success: false };
      }

      const data = (await response.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };

      if (data.access_token) {
        await this.saveOAuthData({
          oauth_token: data.access_token,
          refresh_token: data.refresh_token || refreshToken,
          expiration_time: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
        });
        return { success: true, accessToken: data.access_token };
      }

      return { success: false };
    } catch {
      return { success: false };
    }
  }

  /**
   * Alterna explicitamente para o modo OAuth, limpando tokens manuais de variáveis de ambiente
   */
  async switchToOAuth(): Promise<{ success: boolean; message: string }> {
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;

    try {
      await fs.unlink(path.join(this.getConfigDir(), 'kraken-auth.json')).catch(() => {});
      await fs.unlink(PROFILE_D_FILE).catch(() => {});
      await this.removeEnvVars().catch(() => {});
    } catch {}

    return {
      success: true,
      message: 'Modo OAuth ativado. Variáveis manuais removidas para priorizar credenciais OAuth do Wrangler.'
    };
  }

  /**
   * Salva e valida um API Token da Cloudflare (mantido para compatibilidade e escolha do usuário)
   */
  async saveToken(
    token: string,
    accountId?: string
  ): Promise<{ success: boolean; accountId?: string; accountName?: string; email?: string; username?: string }> {
    const cleanToken = token.trim();
    if (!cleanToken) {
      throw new Error('Token da Cloudflare não informado.');
    }

    const cleanAccountId = accountId?.trim();

    // 1. Valida o token contra a API da Cloudflare
    const verifyRes = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'User-Agent': 'KrakenBridge-Web'
      }
    });

    if (!verifyRes.ok) {
      throw new Error('Token da Cloudflare inválido ou não autorizado.');
    }

    const verifyData = (await verifyRes.json()) as CloudflareVerifyResponse;
    if (!verifyData.success || verifyData.result?.status !== 'active') {
      throw new Error('Token da Cloudflare inativo ou sem permissões suficientes.');
    }

    // 2. Busca contas e usuário
    const details = await this.fetchAccountAndUserDetails(cleanToken, cleanAccountId);

    // 3. Grava em memória / variáveis de processo
    process.env.CLOUDFLARE_API_TOKEN = cleanToken;
    if (details.accountId) {
      process.env.CLOUDFLARE_ACCOUNT_ID = details.accountId;
    }

    // 4. Grava arquivo de configuração persistente
    try {
      await fs.mkdir(this.getConfigDir(), { recursive: true });
      const payload = {
        apiToken: cleanToken,
        accountId: details.accountId,
        accountName: details.accountName,
        email: details.email,
        username: details.username,
        updatedAt: new Date().toISOString()
      };
      await fs.writeFile(path.join(this.getConfigDir(), 'kraken-auth.json'), JSON.stringify(payload, null, 2), {
        encoding: 'utf8',
        mode: 0o600
      });
    } catch (err) {
      console.warn('[CloudflareAuthService] Aviso ao salvar arquivo de config:', (err as Error).message);
    }

    // 5. Atualiza /etc/profile.d/cloudflare.sh para sessões de terminal interativas
    try {
      const profileLines = [
        `export CLOUDFLARE_API_TOKEN="${cleanToken}"`,
        details.accountId ? `export CLOUDFLARE_ACCOUNT_ID="${details.accountId}"` : ''
      ].filter(Boolean).join('\n') + '\n';

      await fs.writeFile(PROFILE_D_FILE, profileLines, {
        encoding: 'utf8',
        mode: 0o644
      });
    } catch {}

    // 6. Sincroniza também no .env local
    await this.syncEnvFile(cleanToken, details.accountId).catch(() => {});

    console.log('[CloudflareAuthService] Credenciais da Cloudflare e Wrangler configuradas com sucesso.');

    return {
      success: true,
      accountId: details.accountId,
      accountName: details.accountName,
      email: details.email,
      username: details.username || details.accountName || 'Cloudflare User'
    };
  }

  /**
   * Remove credenciais da Cloudflare e Wrangler (OAuth e Token)
   */
  async logout(): Promise<{ success: boolean }> {
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;

    // Cancela device session pendente se existir
    if (this.pendingSession?.child) {
      try { this.pendingSession.child.kill(); } catch {}
      this.pendingSession = null;
    }

    try {
      await fs.unlink(path.join(this.getConfigDir(), 'kraken-auth.json')).catch(() => {});
      await fs.unlink(this.getWranglerTomlPath()).catch(() => {});
      await fs.unlink(this.getWranglerEncryptedPath()).catch(() => {});
      await fs.unlink(PROFILE_D_FILE).catch(() => {});
      await this.removeEnvVars().catch(() => {});
    } catch {}

    // Executa wrangler logout em background caso a CLI esteja disponível
    try {
      await execFileAsync('npx', ['wrangler', 'logout'], {
        timeout: 4000,
        env: { ...process.env, HOME: '/root' }
      }).catch(() => {});
    } catch {}

    return { success: true };
  }

  /**
   * Sincroniza credenciais no arquivo .env
   */
  private async syncEnvFile(token: string, accountId?: string): Promise<void> {
    const envPath = path.resolve('.env');
    let content = '';
    try {
      content = await fs.readFile(envPath, 'utf8');
    } catch {
      return;
    }

    const updates: Record<string, string> = {
      CLOUDFLARE_API_TOKEN: token
    };
    if (accountId) {
      updates.CLOUDFLARE_ACCOUNT_ID = accountId;
    }

    const lines = content.split('\n');
    for (const [key, val] of Object.entries(updates)) {
      const idx = lines.findIndex((l) => l.trim().startsWith(`${key}=`));
      if (idx >= 0) {
        lines[idx] = `${key}=${val}`;
      } else {
        lines.push(`${key}=${val}`);
      }
    }

    await fs.writeFile(envPath, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
  }

  /**
   * Remove variáveis da Cloudflare do arquivo .env
   */
  private async removeEnvVars(): Promise<void> {
    const envPath = path.resolve('.env');
    let content = '';
    try {
      content = await fs.readFile(envPath, 'utf8');
    } catch {
      return;
    }

    const lines = content.split('\n').filter((l) => {
      const trimmed = l.trim();
      return !trimmed.startsWith('CLOUDFLARE_API_TOKEN=') && !trimmed.startsWith('CLOUDFLARE_ACCOUNT_ID=');
    });

    await fs.writeFile(envPath, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
  }
}

export const cloudflareAuthService = new CloudflareAuthService();
