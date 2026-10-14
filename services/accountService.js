import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const ACCOUNTS_DIR = path.join(DATA_DIR, 'accounts');
const TOKEN_PATH = process.env.AGY_TOKEN_PATH || '/root/.gemini/antigravity-cli/antigravity-oauth-token';

function sanitizeEmail(email) {
  return (email || 'unknown').toLowerCase().replace(/[^a-z0-9._-]/g, '_');
}

export function parseJwtPayload(tokenStr) {
  if (!tokenStr) return null;
  try {
    const parts = tokenStr.split('.');
    if (parts.length >= 2) {
      const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = Buffer.from(payloadBase64, 'base64').toString('utf8');
      return JSON.parse(json);
    }
  } catch (e) {}
  return null;
}

class AccountService {
  constructor() {
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    try {
      await fs.mkdir(ACCOUNTS_DIR, { recursive: true });
      await this.discoverAndImportTokens();
    } catch (e) {
      console.warn('[AccountService] Erro ao inicializar diretório de contas:', e.message);
    }
    this.initialized = true;
  }

  /**
   * Importa automaticamente o token ativo atual e backups .bak_* existentes se houverem
   */
  async discoverAndImportTokens() {
    try {
      // 1. Verificar token principal
      const existsActive = await fs.access(TOKEN_PATH).then(() => true).catch(() => false);
      if (existsActive) {
        const raw = await fs.readFile(TOKEN_PATH, 'utf8');
        await this.saveTokenData(raw, true);
      }

      // 2. Verificar backups no diretório pai do token
      const parentDir = path.dirname(TOKEN_PATH);
      const parentFiles = await fs.readdir(parentDir).catch(() => []);
      for (const file of parentFiles) {
        if (file.startsWith('antigravity-oauth-token.bak_')) {
          const filePath = path.join(parentDir, file);
          try {
            const rawBak = await fs.readFile(filePath, 'utf8');
            await this.saveTokenData(rawBak, false);
          } catch (e) {}
        }
      }
    } catch (e) {
      console.warn('[AccountService] Erro ao sincronizar tokens existentes:', e.message);
    }
  }

  extractAccountInfo(rawJson) {
    try {
      const parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
      let email = null;
      let name = null;
      let picture = null;

      if (parsed.id_token) {
        const payload = parseJwtPayload(parsed.id_token);
        if (payload) {
          email = payload.email || null;
          name = payload.name || null;
          picture = payload.picture || null;
        }
      }

      const rawStr = typeof rawJson === 'string' ? rawJson : JSON.stringify(rawJson);
      if (!email) {
        const mEmail = rawStr.match(/"email"\s*:\s*"([^"]+)"/);
        if (mEmail) email = mEmail[1];
      }
      if (!name) {
        const mName = rawStr.match(/"name"\s*:\s*"([^"]+)"/);
        if (mName) name = mName[1];
      }
      if (!picture) {
        const mPic = rawStr.match(/"picture"\s*:\s*"([^"]+)"/);
        if (mPic) picture = mPic[1];
      }

      const expiry = parsed.token?.expiry || null;
      const hasToken = !!(parsed.token?.access_token || parsed.token?.refresh_token);

      return {
        email: email ? email.toLowerCase() : null,
        name: name || (email ? email.split('@')[0] : 'Usuário'),
        picture: picture || null,
        expiry,
        hasToken,
        data: parsed
      };
    } catch {
      return null;
    }
  }

  /**
   * Salva os dados de uma conta no store de múltiplas contas
   */
  async saveTokenData(rawJson, setActive = false) {
    await fs.mkdir(ACCOUNTS_DIR, { recursive: true });
    const info = this.extractAccountInfo(rawJson);
    if (!info || !info.email || !info.hasToken) return null;

    const fileName = `${sanitizeEmail(info.email)}.json`;
    const filePath = path.join(ACCOUNTS_DIR, fileName);

    const record = {
      email: info.email,
      name: info.name,
      picture: info.picture,
      expiry: info.expiry,
      updatedAt: new Date().toISOString(),
      raw: typeof rawJson === 'string' ? rawJson : JSON.stringify(rawJson, null, 2)
    };

    await fs.writeFile(filePath, JSON.stringify(record, null, 2), 'utf8');

    if (setActive) {
      await this.writeToActiveTokenFile(record.raw);
    }

    return record;
  }

  async writeToActiveTokenFile(rawTokenJson) {
    try {
      const parentDir = path.dirname(TOKEN_PATH);
      await fs.mkdir(parentDir, { recursive: true });
      await fs.writeFile(TOKEN_PATH, rawTokenJson, { encoding: 'utf8', mode: 0o600 });
    } catch (e) {
      console.error('[AccountService] Falha ao escrever em TOKEN_PATH:', e.message);
    }
  }

  /**
   * Identifica qual email está atualmente ativo em TOKEN_PATH
   */
  async getActiveEmail() {
    try {
      const raw = await fs.readFile(TOKEN_PATH, 'utf8');
      const info = this.extractAccountInfo(raw);
      return info?.email || null;
    } catch {
      return null;
    }
  }

  /**
   * Retorna lista de todas as contas conectadas
   */
  async listAccounts() {
    await this.init();
    const activeEmail = await this.getActiveEmail();
    const accounts = [];

    try {
      const files = await fs.readdir(ACCOUNTS_DIR);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const content = await fs.readFile(path.join(ACCOUNTS_DIR, file), 'utf8');
          const parsed = JSON.parse(content);
          accounts.push({
            email: parsed.email,
            name: parsed.name,
            picture: parsed.picture,
            expiry: parsed.expiry,
            updatedAt: parsed.updatedAt,
            isActive: activeEmail ? parsed.email?.toLowerCase() === activeEmail.toLowerCase() : false
          });
        } catch (e) {}
      }
    } catch (e) {
      console.warn('[AccountService] Erro ao listar contas:', e.message);
    }

    return {
      activeEmail,
      accounts: accounts.sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0))
    };
  }

  /**
   * Alterna a conta ativa com 1 clique
   */
  async switchAccount(email) {
    await this.init();
    if (!email) throw new Error('Email da conta não informado.');

    const targetFile = path.join(ACCOUNTS_DIR, `${sanitizeEmail(email)}.json`);
    const exists = await fs.access(targetFile).then(() => true).catch(() => false);
    if (!exists) {
      throw new Error(`Conta ${email} não encontrada no armazenamento local.`);
    }

    const content = await fs.readFile(targetFile, 'utf8');
    const record = JSON.parse(content);

    await this.writeToActiveTokenFile(record.raw);

    return {
      success: true,
      email: record.email,
      name: record.name,
      picture: record.picture
    };
  }

  /**
   * Remove uma conta do armazenamento
   */
  async removeAccount(email) {
    await this.init();
    if (!email) throw new Error('Email da conta não informado.');

    const targetFile = path.join(ACCOUNTS_DIR, `${sanitizeEmail(email)}.json`);
    try {
      await fs.unlink(targetFile);
    } catch (e) {}

    const activeEmail = await this.getActiveEmail();
    const wasActive = activeEmail && activeEmail.toLowerCase() === email.toLowerCase();

    return {
      success: true,
      wasActive
    };
  }

  /**
   * Prepara um diretório de HOME isolado para executar o agy sob uma conta específica
   * Retorna o caminho do HOME isolado para passar no env do spawn
   */
  async prepareAccountHome(email) {
    if (!email) return process.env.HOME || '/root';

    await this.init();
    const targetFile = path.join(ACCOUNTS_DIR, `${sanitizeEmail(email)}.json`);
    const exists = await fs.access(targetFile).then(() => true).catch(() => false);
    if (!exists) {
      console.warn(`[AccountService] Conta ${email} não encontrada para isolamento, usando HOME padrão.`);
      return process.env.HOME || '/root';
    }

    try {
      const content = await fs.readFile(targetFile, 'utf8');
      const record = JSON.parse(content);
      const safeDirName = sanitizeEmail(email);
      const accountHome = path.join(DATA_DIR, 'account_homes', safeDirName);
      const geminiDir = path.join(accountHome, '.gemini');
      const cliDir = path.join(geminiDir, 'antigravity-cli');

      await fs.mkdir(cliDir, { recursive: true });

      // Garante que o config e skills sejam linkados ou copiados
      const sourceConfig = path.join('/root', '.gemini', 'config');
      const targetConfig = path.join(geminiDir, 'config');
      try {
        await fs.access(targetConfig);
      } catch {
        try {
          await fs.symlink(sourceConfig, targetConfig, 'junction').catch(async () => {
            // Se symlink falhar, ignora ou cria vazio
          });
        } catch {}
      }

      // Escreve o token específico desta conta
      const isolatedTokenPath = path.join(cliDir, 'antigravity-oauth-token');
      await fs.writeFile(isolatedTokenPath, record.raw, { encoding: 'utf8', mode: 0o600 });

      return accountHome;
    } catch (e) {
      console.error(`[AccountService] Falha ao preparar HOME para ${email}:`, e.message);
      return process.env.HOME || '/root';
    }
  }
}

export const accountService = new AccountService();

