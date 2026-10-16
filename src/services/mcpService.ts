import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import type { McpConfigFile, McpServerItem, McpAuthUrlResponse, McpExchangeResponse } from '../types/mcp.js';

const execAsync = promisify(exec);

function getConfigPath(): string {
  return process.env.MCP_CONFIG_PATH || '/root/.gemini/config/mcp_config.json';
}

function extractAuthCodeOrToken(input: unknown): string {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim();

  // Caso 1: Usuário colou uma URL completa (ex: de redirecionamento ou callback)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const code = url.searchParams.get('code') || url.searchParams.get('token') || url.searchParams.get('access_token');
      if (code) return code.trim();
    } catch {
      // Fallback via regex
      const match = trimmed.match(/[?&](?:code|token|access_token)=([^&#\s]+)/);
      if (match) return decodeURIComponent(match[1]).trim();
    }
  }

  // Caso 2: Se foi colado no formato "Bearer <token>"
  if (trimmed.toLowerCase().startsWith('bearer ')) {
    return trimmed.slice(7).trim();
  }

  // Caso 3: Token puro ou PIN
  return trimmed;
}

class McpService {
  async readConfig(): Promise<McpConfigFile> {
    const configPath = getConfigPath();
    try {
      const exists = await fs.access(configPath).then(() => true).catch(() => false);
      if (exists) {
        const raw = await fs.readFile(configPath, 'utf8');
        return JSON.parse(raw) as McpConfigFile;
      }
    } catch (e) {
      console.warn('[McpService] Erro ao ler mcp_config.json:', (e as Error).message);
    }
    return { mcpServers: {} };
  }

  async writeConfig(config: McpConfigFile): Promise<boolean> {
    const configPath = getConfigPath();
    try {
      const dir = path.dirname(configPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error('[McpService] Erro ao salvar mcp_config.json:', (e as Error).message);
      throw e;
    }
  }

  async list(): Promise<McpServerItem[]> {
    let servers: McpServerItem[] = [];

    // Fallback: ler mcp_config.json diretamente para extrair detalhes ricos de autenticação
    const config = await this.readConfig();
    const mcpServers = config.mcpServers || {};

    try {
      // Tentar via 'agy mcp list'
      const { stdout } = await execAsync('agy mcp list');
      const lines = stdout.trim().split('\n');

      if (lines.length > 1 && lines[0].includes('NAME')) {
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const parts = line.split(/\s+/);
          if (parts.length >= 4) {
            const name = parts[0];
            const conf = mcpServers[name] || {};
            const isHttp = parts[1] === 'http' || !!conf.serverUrl || !!conf.url;
            const hasAuth = !!(conf.headers?.Authorization || conf.env?.SUPABASE_ACCESS_TOKEN || conf.token);

            servers.push({
              name,
              type: parts[1],
              status: parts[2] === 'enabled' ? 'enabled' : 'disabled',
              commandOrUrl: parts.slice(3).join(' '),
              authStatus: hasAuth ? 'authenticated' : (isHttp ? 'unauthenticated' : 'none')
            });
          }
        }
      }
    } catch {
      // Falha no agy mcp list, continua com config
    }

    if (servers.length === 0) {
      servers = Object.entries(mcpServers).map(([name, conf]) => {
        const isHttp = !!(conf.serverUrl || conf.url);
        const hasAuth = !!(conf.headers?.Authorization || conf.env?.SUPABASE_ACCESS_TOKEN || conf.token);

        return {
          name,
          type: isHttp ? 'http' : 'stdio',
          status: 'enabled',
          commandOrUrl: conf.serverUrl || conf.url || (conf.command ? `${conf.command} ${(conf.args || []).join(' ')}` : ''),
          authStatus: hasAuth ? 'authenticated' : (isHttp ? 'unauthenticated' : 'none')
        };
      });
    }

    return servers;
  }

  async toggle(name: string, enable: boolean): Promise<{ success: boolean; error?: string }> {
    const action = enable ? 'enable' : 'disable';
    try {
      await execAsync(`agy mcp ${action} ${name}`);
      return { success: true };
    } catch (e) {
      console.warn(`[McpService] Falha ao executar agy mcp ${action}:`, (e as Error).message);
      return { success: false, error: (e as Error).message };
    }
  }

  async getAuthUrl(name: string): Promise<McpAuthUrlResponse> {
    const config = await this.readConfig();
    const conf = config.mcpServers?.[name] || {};
    const serverUrl = conf.serverUrl || conf.url || '';

    if (name.toLowerCase() === 'supabase' || serverUrl.includes('supabase.com')) {
      return {
        server: name,
        authUrl: 'https://supabase.com/dashboard/account/tokens',
        instructions: 'Gere um Personal Access Token (PAT) no painel do Supabase com o botão "Generate new token" ou informe o código de autorização OAuth.'
      };
    }

    if (name.toLowerCase() === 'crawl4ai' || serverUrl.includes('11235')) {
      return {
        server: name,
        authUrl: 'http://gabisa.local:11235/playground',
        instructions: 'O Crawl4AI roda localmente no Homelab na porta 11235. O token de API padrão configurado no Docker Compose é "kraken-crawl4ai-homelab-2026".'
      };
    }

    if (name.toLowerCase() === 'github' || serverUrl.includes('github.com')) {
      return {
        server: name,
        authUrl: 'https://github.com/settings/tokens',
        instructions: 'Gere um Personal Access Token no GitHub com escopo de repositório ou informe o código.'
      };
    }

    return {
      server: name,
      authUrl: serverUrl || undefined,
      instructions: 'Informe a chave de API, Bearer Token ou código de autorização para conectar este servidor MCP.'
    };
  }

  async exchangeCode(name: string, rawInput: unknown): Promise<McpExchangeResponse> {
    if (!name) throw new Error('Nome do servidor é obrigatório');
    const token = extractAuthCodeOrToken(rawInput);
    if (!token) throw new Error('Código ou token de autenticação não foi informado ou é inválido');

    const config = await this.readConfig();
    if (!config.mcpServers) config.mcpServers = {};
    if (!config.mcpServers[name]) {
      config.mcpServers[name] = {};
    }

    const serverConf = config.mcpServers[name];

    // Configurar headers Authorization Bearer
    if (!serverConf.headers) serverConf.headers = {};
    serverConf.headers['Authorization'] = `Bearer ${token}`;

    // Para o Supabase, também injetar variável de ambiente caso o MCP use env
    if (name.toLowerCase() === 'supabase' || (serverConf.serverUrl && serverConf.serverUrl.includes('supabase'))) {
      if (!serverConf.env) serverConf.env = {};
      serverConf.env['SUPABASE_ACCESS_TOKEN'] = token;
    }

    await this.writeConfig(config);

    return {
      success: true,
      message: `Servidor MCP "${name}" autenticado com sucesso!`,
      tokenSet: true
    };
  }

  async ensureHomelabSqliteServers(): Promise<{ gabot: boolean; aiMemory: boolean }> {
    const GABOT_DB = process.env.GABOT_DB_PATH || '/DATA/AppData/gabot/data/bot.db';
    const AI_MEMORY_DB = process.env.AI_MEMORY_DB_PATH || '/DATA/AppData/ai-memory/db/memory.sqlite';

    const gabotExists = fsSync.existsSync(GABOT_DB);
    const aiMemoryExists = fsSync.existsSync(AI_MEMORY_DB);

    if (!gabotExists && !aiMemoryExists) {
      return { gabot: false, aiMemory: false };
    }

    const config = await this.readConfig();
    if (!config.mcpServers) config.mcpServers = {};
    let changed = false;

    if (gabotExists && !config.mcpServers['sqlite-gabot']) {
      config.mcpServers['sqlite-gabot'] = {
        command: 'npx',
        args: ['-y', 'mcp-server-sqlite-npx', GABOT_DB],
        disabled: false
      };
      changed = true;
    }

    if (aiMemoryExists && !config.mcpServers['sqlite-ai-memory']) {
      config.mcpServers['sqlite-ai-memory'] = {
        command: 'npx',
        args: ['-y', 'mcp-server-sqlite-npx', AI_MEMORY_DB],
        disabled: false
      };
      changed = true;
    }

    if (changed) {
      await this.writeConfig(config);
      console.log('[McpService] Servidores MCP SQLite Homelab (sqlite-gabot / sqlite-ai-memory) provisionados com sucesso!');
    }

    return {
      gabot: gabotExists && !!config.mcpServers['sqlite-gabot'],
      aiMemory: aiMemoryExists && !!config.mcpServers['sqlite-ai-memory']
    };
  }
}

export const mcpService = new McpService();
