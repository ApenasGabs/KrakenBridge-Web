import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const GH_CONFIG_DIR = process.env.GH_CONFIG_DIR || '/root/.config/gh';
const HOSTS_FILE = path.join(GH_CONFIG_DIR, 'hosts.yml');
const CLIENT_ID = '178c6fc778ccc68e1d6a'; // Client ID oficial da CLI do GitHub

class GithubAuthService {
  constructor() {
    this.pendingSession = null; // { device_code, user_code, verification_uri, interval, expires_at }
  }

  /**
   * Obtém o status da autenticação do GitHub CLI
   */
  async getStatus() {
    try {
      const exists = await fs.stat(HOSTS_FILE).catch(() => null);
      if (!exists) {
        return { authenticated: false };
      }
      const content = await fs.readFile(HOSTS_FILE, 'utf8');
      const userMatch = content.match(/user:\s*([^\r\n]+)/);
      const tokenMatch = content.match(/oauth_token:\s*([^\r\n]+)/);

      if (userMatch && tokenMatch) {
        const username = userMatch[1].trim();
        return {
          authenticated: true,
          username,
          hasToken: true
        };
      }
    } catch (err) {
      console.warn('[GithubAuthService] Erro ao ler status:', err.message);
    }
    return { authenticated: false };
  }

  /**
   * Inicia o fluxo OAuth Device Code do GitHub
   */
  async startDeviceFlow() {
    try {
      const response = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          scope: 'repo,read:org,workflow'
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Falha ao solicitar código do dispositivo: ${errText}`);
      }

      const data = await response.json();
      // data: { device_code, user_code, verification_uri, expires_in, interval }
      this.pendingSession = {
        device_code: data.device_code,
        user_code: data.user_code,
        verification_uri: data.verification_uri || 'https://github.com/login/device',
        interval: data.interval || 5,
        expires_at: Date.now() + (data.expires_in || 900) * 1000
      };

      return {
        userCode: data.user_code,
        verificationUri: data.verification_uri || 'https://github.com/login/device',
        interval: data.interval || 5
      };
    } catch (err) {
      console.error('[GithubAuthService] Erro startDeviceFlow:', err);
      throw err;
    }
  }

  /**
   * Faz a verificação/polling do token para a sessão ativa
   */
  async pollToken() {
    if (!this.pendingSession) {
      return { status: 'no_session', error: 'Nenhuma sessão de autenticação ativa.' };
    }

    if (Date.now() > this.pendingSession.expires_at) {
      this.pendingSession = null;
      return { status: 'expired', error: 'Código expirado. Por favor, tente novamente.' };
    }

    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          device_code: this.pendingSession.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        })
      });

      const data = await response.json();

      if (data.error) {
        if (data.error === 'authorization_pending') {
          return { status: 'pending' };
        }
        if (data.error === 'slow_down') {
          return { status: 'slow_down' };
        }
        if (data.error === 'expired_token') {
          this.pendingSession = null;
          return { status: 'expired', error: 'Código expirado no GitHub.' };
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

        // Identifica o username da conta
        const userRes = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'KrakenBridge-Web'
          }
        });

        let username = 'user';
        if (userRes.ok) {
          const userData = await userRes.json();
          if (userData.login) username = userData.login;
        }

        await this.saveHostsConfig(username, token);
        return { status: 'success', username };
      }

      return { status: 'pending' };
    } catch (err) {
      console.error('[GithubAuthService] Erro pollToken:', err);
      return { status: 'error', error: err.message };
    }
  }

  /**
   * Salva diretamente um Personal Access Token (PAT)
   */
  async saveToken(token) {
    const cleanToken = token.trim();
    if (!cleanToken) throw new Error('Token inválido.');

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'User-Agent': 'KrakenBridge-Web'
      }
    });

    if (!userRes.ok) {
      throw new Error('Token do GitHub inválido ou não autorizado.');
    }

    const userData = await userRes.json();
    const username = userData.login || 'user';

    await this.saveHostsConfig(username, cleanToken);
    return { success: true, username };
  }

  /**
   * Grava a configuração no formato oficial do gh CLI
   */
  async saveHostsConfig(username, token) {
    await fs.mkdir(GH_CONFIG_DIR, { recursive: true });

    const hostsYaml = `github.com:
    user: ${username}
    oauth_token: ${token}
    git_protocol: https
    users:
        ${username}:
            oauth_token: ${token}
`;
    await fs.writeFile(HOSTS_FILE, hostsYaml, 'utf8');
    console.log(`[GithubAuthService] hosts.yml atualizado com sucesso para @${username}`);
  }

  /**
   * Remove credenciais do GitHub CLI
   */
  async logout() {
    try {
      await fs.unlink(HOSTS_FILE);
      return { success: true };
    } catch {
      return { success: true };
    }
  }
}

export const githubAuthService = new GithubAuthService();
