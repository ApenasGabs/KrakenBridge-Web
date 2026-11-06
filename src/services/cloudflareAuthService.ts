import fs from 'fs/promises';
import path from 'path';

const CLOUDFLARE_CONFIG_DIR = process.env.CLOUDFLARE_CONFIG_DIR || '/root/.config/.wrangler';
const CONFIG_FILE = path.join(CLOUDFLARE_CONFIG_DIR, 'kraken-auth.json');
const PROFILE_D_FILE = '/etc/profile.d/cloudflare.sh';

export interface CloudflareAuthStatus {
  authenticated: boolean;
  accountId?: string;
  accountName?: string;
  email?: string;
  username?: string;
  tokenStatus?: string;
  hasToken?: boolean;
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

class CloudflareAuthService {
  /**
   * Obtém o token atual em memória ou arquivo de configuração
   */
  private async getToken(): Promise<{ token?: string; accountId?: string }> {
    let token = process.env.CLOUDFLARE_API_TOKEN?.trim();
    let accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();

    if (!token) {
      try {
        const content = await fs.readFile(CONFIG_FILE, 'utf8');
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
   * Obtém o status da autenticação do Wrangler / Cloudflare
   */
  async getStatus(): Promise<CloudflareAuthStatus> {
    try {
      const { token, accountId: storedAccountId } = await this.getToken();

      if (!token) {
        return { authenticated: false, hasToken: false };
      }

      // 1. Valida o token diretamente na API oficial da Cloudflare
      const verifyRes = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'KrakenBridge-Web'
        }
      });

      if (!verifyRes.ok) {
        return {
          authenticated: false,
          hasToken: true,
          error: 'Token da Cloudflare expirado ou não autorizado.'
        };
      }

      const verifyData = (await verifyRes.json()) as CloudflareVerifyResponse;
      if (!verifyData.success || verifyData.result?.status !== 'active') {
        return {
          authenticated: false,
          hasToken: true,
          error: 'Token da Cloudflare inativo ou revogado.'
        };
      }

      const tokenStatus = verifyData.result?.status || 'active';
      let accountId = storedAccountId;
      let accountName: string | undefined;
      let email: string | undefined;
      let username: string | undefined;

      // 2. Tenta buscar contas associadas
      try {
        const accountsRes = await fetch('https://api.cloudflare.com/client/v4/accounts?page=1&per_page=20', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'KrakenBridge-Web'
          }
        });

        if (accountsRes.ok) {
          const accountsData = (await accountsRes.json()) as CloudflareAccountsResponse;
          if (accountsData.success && accountsData.result && accountsData.result.length > 0) {
            const matchedAccount = accountId
              ? accountsData.result.find((acc) => acc.id === accountId) || accountsData.result[0]
              : accountsData.result[0];

            accountId = matchedAccount.id;
            accountName = matchedAccount.name;
          }
        }
      } catch (err) {
        console.warn('[CloudflareAuthService] Aviso ao listar contas:', (err as Error).message);
      }

      // 3. Tenta buscar detalhes do usuário (se o token tiver escopo User:Read)
      try {
        const userRes = await fetch('https://api.cloudflare.com/client/v4/user', {
          headers: {
            'Authorization': `Bearer ${token}`,
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
      } catch {
        // Tokens restritos apenas a Workers/Pages podem não ter permissão de leitura de usuário
      }

      return {
        authenticated: true,
        hasToken: true,
        tokenStatus,
        accountId,
        accountName,
        email,
        username: username || accountName || 'Cloudflare User'
      };
    } catch (err) {
      console.warn('[CloudflareAuthService] Erro ao obter status:', (err as Error).message);
      return {
        authenticated: false,
        hasToken: false,
        error: (err as Error).message
      };
    }
  }

  /**
   * Salva e valida um API Token da Cloudflare
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

    // 2. Busca contas para resolver accountId e accountName
    let resolvedAccountId = cleanAccountId;
    let resolvedAccountName: string | undefined;

    try {
      const accountsRes = await fetch('https://api.cloudflare.com/client/v4/accounts?page=1&per_page=20', {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'User-Agent': 'KrakenBridge-Web'
        }
      });

      if (accountsRes.ok) {
        const accountsData = (await accountsRes.json()) as CloudflareAccountsResponse;
        if (accountsData.success && accountsData.result && accountsData.result.length > 0) {
          const matched = resolvedAccountId
            ? accountsData.result.find((a) => a.id === resolvedAccountId) || accountsData.result[0]
            : accountsData.result[0];

          resolvedAccountId = matched.id;
          resolvedAccountName = matched.name;
        }
      }
    } catch (err) {
      console.warn('[CloudflareAuthService] Aviso ao resolver conta:', (err as Error).message);
    }

    // 3. Busca usuário (se disponível)
    let email: string | undefined;
    let username: string | undefined;
    try {
      const userRes = await fetch('https://api.cloudflare.com/client/v4/user', {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
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
    } catch {
      // Ignora erro se token não tiver escopo de usuário
    }

    // 4. Grava em memória / variáveis de processo
    process.env.CLOUDFLARE_API_TOKEN = cleanToken;
    if (resolvedAccountId) {
      process.env.CLOUDFLARE_ACCOUNT_ID = resolvedAccountId;
    }

    // 5. Grava arquivo de configuração persistente
    try {
      await fs.mkdir(CLOUDFLARE_CONFIG_DIR, { recursive: true });
      const payload = {
        apiToken: cleanToken,
        accountId: resolvedAccountId,
        accountName: resolvedAccountName,
        email,
        username,
        updatedAt: new Date().toISOString()
      };
      await fs.writeFile(CONFIG_FILE, JSON.stringify(payload, null, 2), {
        encoding: 'utf8',
        mode: 0o600
      });
    } catch (err) {
      console.warn('[CloudflareAuthService] Aviso ao salvar arquivo de config:', (err as Error).message);
    }

    // 6. Atualiza /etc/profile.d/cloudflare.sh para sessões de terminal interativas
    try {
      const profileLines = [
        `export CLOUDFLARE_API_TOKEN="${cleanToken}"`,
        resolvedAccountId ? `export CLOUDFLARE_ACCOUNT_ID="${resolvedAccountId}"` : ''
      ].filter(Boolean).join('\n') + '\n';

      await fs.writeFile(PROFILE_D_FILE, profileLines, {
        encoding: 'utf8',
        mode: 0o644
      });
    } catch {
      // Ignora se o sistema de arquivos for somente leitura em /etc
    }

    // 7. Sincroniza também no .env local
    await this.syncEnvFile(cleanToken, resolvedAccountId).catch(() => {});

    console.log('[CloudflareAuthService] Credenciais da Cloudflare e Wrangler configuradas com sucesso.');

    return {
      success: true,
      accountId: resolvedAccountId,
      accountName: resolvedAccountName,
      email,
      username: username || resolvedAccountName || 'Cloudflare User'
    };
  }

  /**
   * Remove credenciais da Cloudflare e Wrangler
   */
  async logout(): Promise<{ success: boolean }> {
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;

    try {
      await fs.unlink(CONFIG_FILE).catch(() => {});
      await fs.unlink(PROFILE_D_FILE).catch(() => {});
      await this.removeEnvVars().catch(() => {});
    } catch {
      // Ignora erros ao desvincular arquivos
    }

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
