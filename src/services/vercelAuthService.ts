import fs from 'fs/promises';
import path from 'path';

const VERCEL_CONFIG_DIR = process.env.VERCEL_CONFIG_DIR || '/root/.config/com.vercel.cli';
const AUTH_FILE = path.join(VERCEL_CONFIG_DIR, 'auth.json');
const CLIENT_ID = 'cl_HYyOPBNtFMfHhaUn9L4QPfTZz6TP47bp'; // Client ID oficial da CLI da Vercel

export interface VercelAuthStatus {
  authenticated: boolean;
  username?: string;
  email?: string;
  name?: string;
  hasToken?: boolean;
  error?: string;
}

export interface VercelPendingSession {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  interval: number;
  expires_at: number;
}

export interface VercelDeviceFlowResult {
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  interval: number;
}

export interface VercelPollResult {
  status: 'pending' | 'slow_down' | 'expired' | 'denied' | 'error' | 'success' | 'no_session';
  username?: string;
  email?: string;
  error?: string;
}

interface VercelUserResponse {
  user?: {
    id: string;
    email: string;
    name?: string;
    username: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

class VercelAuthService {
  private pendingSession: VercelPendingSession | null = null;

  /**
   * Garante a estrutura de diretórios e o symlink com /root/.local/share/com.vercel.cli
   */
  private async ensureStorageLink(): Promise<void> {
    try {
      await fs.mkdir(VERCEL_CONFIG_DIR, { recursive: true });
      const localShareDir = '/root/.local/share/com.vercel.cli';
      await fs.mkdir('/root/.local/share', { recursive: true }).catch(() => {});
      const stat = await fs.lstat(localShareDir).catch(() => null);
      if (!stat) {
        await fs.symlink(VERCEL_CONFIG_DIR, localShareDir);
      }
    } catch (err) {
      console.warn('[VercelAuthService] Erro ao vincular diretório persistente:', (err as Error).message);
    }
  }

  /**
   * Obtém o status da autenticação do Vercel CLI
   */
  async getStatus(): Promise<VercelAuthStatus> {
    try {
      await this.ensureStorageLink();
      const exists = await fs.stat(AUTH_FILE).catch(() => null);
      if (!exists) {
        return { authenticated: false };
      }

      const content = await fs.readFile(AUTH_FILE, 'utf8');
      const authData = JSON.parse(content) as { token?: string };

      if (!authData.token || !authData.token.trim()) {
        return { authenticated: false };
      }

      const token = authData.token.trim();

      // Valida o token diretamente na API oficial da Vercel
      const userRes = await fetch('https://api.vercel.com/v2/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'KrakenBridge-Web'
        }
      });

      if (!userRes.ok) {
        return {
          authenticated: false,
          hasToken: true,
          error: 'Token da Vercel expirado ou não autorizado.'
        };
      }

      const data = (await userRes.json()) as VercelUserResponse;
      if (data.user) {
        return {
          authenticated: true,
          username: data.user.username || data.user.email,
          email: data.user.email,
          name: data.user.name,
          hasToken: true
        };
      }

      return { authenticated: false, hasToken: true };
    } catch (err) {
      console.warn('[VercelAuthService] Erro ao ler status:', (err as Error).message);
      return { authenticated: false, error: (err as Error).message };
    }
  }

  /**
   * Inicia o fluxo OAuth Device Code oficial da Vercel
   */
  async startDeviceFlow(): Promise<VercelDeviceFlowResult> {
    try {
      await this.ensureStorageLink();

      const response = await fetch('https://api.vercel.com/login/oauth/device-authorization', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'KrakenBridge-Web'
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          scope: 'openid offline_access'
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Falha ao solicitar código do dispositivo Vercel: ${errText}`);
      }

      const data = (await response.json()) as {
        device_code: string;
        user_code: string;
        verification_uri?: string;
        verification_uri_complete?: string;
        expires_in?: number;
        interval?: number;
      };

      this.pendingSession = {
        device_code: data.device_code,
        user_code: data.user_code,
        verification_uri: data.verification_uri || 'https://vercel.com/device',
        verification_uri_complete:
          data.verification_uri_complete ||
          `https://vercel.com/oauth/device?user_code=${encodeURIComponent(data.user_code)}`,
        interval: data.interval || 5,
        expires_at: Date.now() + (data.expires_in || 600) * 1000
      };

      return {
        userCode: this.pendingSession.user_code,
        verificationUri: this.pendingSession.verification_uri,
        verificationUriComplete: this.pendingSession.verification_uri_complete,
        interval: this.pendingSession.interval
      };
    } catch (err) {
      console.error('[VercelAuthService] Erro startDeviceFlow:', err);
      throw err;
    }
  }

  /**
   * Faz o polling do token OAuth para a sessão do dispositivo ativa
   */
  async pollToken(): Promise<VercelPollResult> {
    if (!this.pendingSession) {
      return { status: 'no_session', error: 'Nenhuma sessão de autenticação ativa.' };
    }

    if (Date.now() > this.pendingSession.expires_at) {
      this.pendingSession = null;
      return { status: 'expired', error: 'Código expirado. Por favor, inicie nova conexão.' };
    }

    try {
      const response = await fetch('https://api.vercel.com/login/oauth/token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'KrakenBridge-Web'
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: this.pendingSession.device_code
        })
      });

      const data = (await response.json()) as {
        error?: string;
        error_description?: string;
        access_token?: string;
      };

      if (data.error) {
        if (data.error === 'authorization_pending') {
          return { status: 'pending' };
        }
        if (data.error === 'slow_down') {
          return { status: 'slow_down' };
        }
        if (data.error === 'expired_token') {
          this.pendingSession = null;
          return { status: 'expired', error: 'Código expirado na Vercel.' };
        }
        if (data.error === 'access_denied') {
          this.pendingSession = null;
          return { status: 'denied', error: 'Login recusado pelo usuário.' };
        }
        return { status: 'error', error: data.error_description || data.error };
      }

      if (data.access_token) {
        const token = data.access_token;
        this.pendingSession = null;

        // Identifica informações do usuário autenticado
        const userRes = await fetch('https://api.vercel.com/v2/user', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'KrakenBridge-Web'
          }
        });

        let username = 'vercel-user';
        let email = '';
        if (userRes.ok) {
          const userData = (await userRes.json()) as VercelUserResponse;
          if (userData.user) {
            username = userData.user.username || userData.user.email;
            email = userData.user.email || '';
          }
        }

        await this.saveAuthConfig(token);
        return { status: 'success', username, email };
      }

      return { status: 'pending' };
    } catch (err) {
      console.error('[VercelAuthService] Erro pollToken:', err);
      return { status: 'error', error: (err as Error).message };
    }
  }

  /**
   * Salva diretamente um Personal Access Token (PAT)
   */
  async saveToken(token: string): Promise<{ success: boolean; username: string; email?: string }> {
    const cleanToken = token.trim();
    if (!cleanToken) throw new Error('Token inválido.');

    const userRes = await fetch('https://api.vercel.com/v2/user', {
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'User-Agent': 'KrakenBridge-Web'
      }
    });

    if (!userRes.ok) {
      throw new Error('Token da Vercel inválido ou não autorizado.');
    }

    const userData = (await userRes.json()) as VercelUserResponse;
    const username = userData.user?.username || userData.user?.email || 'vercel-user';
    const email = userData.user?.email;

    await this.saveAuthConfig(cleanToken);
    return { success: true, username, email };
  }

  /**
   * Grava as credenciais no formato oficial esperado pela CLI da Vercel (auth.json)
   */
  async saveAuthConfig(token: string): Promise<void> {
    await this.ensureStorageLink();

    const authPayload = {
      '// Note': 'This is your Vercel credentials file. DO NOT SHARE!',
      '// Docs': 'https://vercel.com/docs/projects/project-configuration/global-configuration#auth.json',
      token
    };

    await fs.writeFile(AUTH_FILE, JSON.stringify(authPayload, null, 2), {
      encoding: 'utf8',
      mode: 0o600
    });

    console.log('[VercelAuthService] auth.json da Vercel atualizado com sucesso.');
  }

  /**
   * Remove credenciais do Vercel CLI
   */
  async logout(): Promise<{ success: boolean }> {
    try {
      await fs.unlink(AUTH_FILE);
      return { success: true };
    } catch {
      return { success: true };
    }
  }
}

export const vercelAuthService = new VercelAuthService();
