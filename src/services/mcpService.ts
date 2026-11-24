import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import path from 'path';
import type { McpConfigFile, McpServerConfig, McpServerItem, McpAuthUrlResponse, McpExchangeResponse } from '../types/mcp.js';

const execAsync = promisify(exec);

const DEFAULT_ANYTYPE_CLI_PATH = '/workspace/anytype-mcp/bin/cli.mjs';
const DEFAULT_ANYTYPE_BASE_URL = 'http://192.168.31.5:31009';
const DEFAULT_AI_MEMORY_URL = 'http://192.168.31.5:49374/mcp?flavor=claude';
const DEFAULT_AI_MEMORY_TOKEN_FILE = '/DATA/AppData/ai-memory/auth-tokens/default';

export interface AnytypeProvisionResult {
  cliExists: boolean;
  mcpConfigUpdated: boolean;
  claudeConfigUpdated: boolean;
}

export interface AiMemoryProvisionResult {
  configured: boolean;
  claudeConfigUpdated: boolean;
}

export interface ClaudeCoreMcpProvisionResult {
  anytype: AnytypeProvisionResult;
  aiMemory: AiMemoryProvisionResult;
}

const getConfigPath = (): string => process.env.MCP_CONFIG_PATH || '/root/.gemini/config/mcp_config.json';

const getAnytypeCliPath = (): string => process.env.ANYTYPE_MCP_CLI_PATH || DEFAULT_ANYTYPE_CLI_PATH;

const getClaudeUserConfigPath = (): string => {
  if (process.env.CLAUDE_USER_CONFIG_FILE) return process.env.CLAUDE_USER_CONFIG_FILE;
  if (process.env.CLAUDE_USER_CONFIG_PATH) return process.env.CLAUDE_USER_CONFIG_PATH;
  return path.join(process.env.HOME || os.homedir() || '/root', '.claude.json');
};

/**
 * Retorna os arquivos `.claude.json` onde o Claude Code CLI pode ler `mcpServers`:
 * - `~/.claude.json` (quando `CLAUDE_CONFIG_DIR` não está definido)
 * - `$CLAUDE_CONFIG_DIR/.claude.json` (quando `CLAUDE_CONFIG_DIR` está definido, como em `chat.ts`)
 *
 * Mantém isolamento em testes quando apenas `CLAUDE_USER_CONFIG_FILE`/`CLAUDE_USER_CONFIG_PATH`
 * é sobrescrito sem `CLAUDE_CONFIG_DIR`.
 */
export const getClaudeUserConfigPaths = async (): Promise<string[]> => {
  const candidates: string[] = [getClaudeUserConfigPath()];
  const hasExplicitUserOverride = Boolean(
    process.env.CLAUDE_USER_CONFIG_FILE || process.env.CLAUDE_USER_CONFIG_PATH
  );

  if (process.env.CLAUDE_CONFIG_DIR?.trim()) {
    candidates.push(path.join(process.env.CLAUDE_CONFIG_DIR.trim(), '.claude.json'));
  } else if (!hasExplicitUserOverride) {
    const homeDir = process.env.HOME || os.homedir() || '/root';
    candidates.push(path.join(homeDir, '.claude', '.claude.json'));
  }

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const resolved = await fs.realpath(candidate).catch(() => path.resolve(candidate));
    if (!seen.has(resolved)) {
      seen.add(resolved);
      unique.push(candidate);
    }
  }
  return unique;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const resolveAnytypeEnv = (existingEnv?: Record<string, string>): Record<string, string> => {
  const baseUrl =
    process.env.ANYTYPE_API_BASE_URL?.trim() ||
    existingEnv?.ANYTYPE_API_BASE_URL?.trim() ||
    DEFAULT_ANYTYPE_BASE_URL;

  const envVars: Record<string, string> = {
    ANYTYPE_API_BASE_URL: baseUrl
  };

  const apiKey = process.env.ANYTYPE_API_KEY?.trim();
  const headers =
    process.env.OPENAPI_MCP_HEADERS?.trim() ||
    existingEnv?.OPENAPI_MCP_HEADERS?.trim() ||
    (apiKey ? JSON.stringify({ Authorization: `Bearer ${apiKey}`, 'Anytype-Version': '2025-11-08' }) : '');

  if (headers) {
    envVars.OPENAPI_MCP_HEADERS = headers;
  }

  return envVars;
};

/**
 * Mescla a entrada do servidor MCP Anytype em um objeto `.claude.json` preservando configurações existentes.
 */
export const upsertAnytypeInClaudeConfig = (
  config: Record<string, unknown>,
  cliPath: string,
  desiredEnv: Record<string, string>
): { nextConfig: Record<string, unknown>; changed: boolean } => {
  const existingServers = isPlainRecord(config.mcpServers) ? { ...config.mcpServers } : {};
  const existingEntry = existingServers.anytype;

  if (!isPlainRecord(existingEntry)) {
    existingServers.anytype = {
      type: 'stdio',
      command: 'node',
      args: [cliPath],
      env: { ...desiredEnv }
    };
    return {
      nextConfig: { ...config, mcpServers: existingServers },
      changed: true
    };
  }

  let entryChanged = false;
  const nextEntry: Record<string, unknown> = { ...existingEntry };

  if (!nextEntry.type) {
    nextEntry.type = 'stdio';
    entryChanged = true;
  }
  if (typeof nextEntry.command !== 'string' || !nextEntry.command.trim()) {
    nextEntry.command = 'node';
    nextEntry.args = [cliPath];
    entryChanged = true;
  } else if (!Array.isArray(nextEntry.args)) {
    nextEntry.args = nextEntry.command === 'node' ? [cliPath] : [];
    entryChanged = true;
  }

  const currentEnv = isPlainRecord(nextEntry.env) ? { ...nextEntry.env } : {};
  if (!currentEnv.ANYTYPE_API_BASE_URL && desiredEnv.ANYTYPE_API_BASE_URL) {
    currentEnv.ANYTYPE_API_BASE_URL = desiredEnv.ANYTYPE_API_BASE_URL;
    entryChanged = true;
  }
  if (!currentEnv.OPENAPI_MCP_HEADERS && desiredEnv.OPENAPI_MCP_HEADERS) {
    currentEnv.OPENAPI_MCP_HEADERS = desiredEnv.OPENAPI_MCP_HEADERS;
    entryChanged = true;
  }

  if (!entryChanged) {
    return { nextConfig: config, changed: false };
  }

  nextEntry.env = currentEnv;
  existingServers.anytype = nextEntry;
  return {
    nextConfig: { ...config, mcpServers: existingServers },
    changed: true
  };
};

/**
 * Normaliza a URL do servidor MCP `ai-memory` para o flavor do Claude Code (`flavor=claude`).
 */
export const normalizeAiMemoryUrlForClaude = (rawUrl: string): string => {
  const trimmed = rawUrl.trim();
  if (!trimmed) return DEFAULT_AI_MEMORY_URL;
  try {
    const parsed = new URL(trimmed);
    const currentFlavor = parsed.searchParams.get('flavor');
    if (!currentFlavor || currentFlavor.toLowerCase() === 'gemini') {
      parsed.searchParams.set('flavor', 'claude');
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
};

const resolveAiMemoryConfig = async (
  existingMcpServer?: McpServerConfig
): Promise<{ url: string; headers?: Record<string, string> }> => {
  const rawUrl =
    process.env.AI_MEMORY_CLAUDE_URL?.trim() ||
    process.env.AI_MEMORY_URL?.trim() ||
    existingMcpServer?.url?.trim() ||
    (existingMcpServer as (McpServerConfig & { serverUrl?: string }) | undefined)?.serverUrl?.trim() ||
    DEFAULT_AI_MEMORY_URL;

  const url = normalizeAiMemoryUrlForClaude(rawUrl);

  let authHeader =
    process.env.AI_MEMORY_TOKEN?.trim()
      ? (process.env.AI_MEMORY_TOKEN.trim().toLowerCase().startsWith('bearer ')
        ? process.env.AI_MEMORY_TOKEN.trim()
        : `Bearer ${process.env.AI_MEMORY_TOKEN.trim()}`)
      : existingMcpServer?.headers?.Authorization?.trim() || '';

  if (!authHeader) {
    const tokenFile = process.env.AI_MEMORY_TOKEN_FILE || DEFAULT_AI_MEMORY_TOKEN_FILE;
    const rawToken = await fs.readFile(tokenFile, 'utf8').catch(() => '');
    const cleanToken = rawToken.trim();
    if (cleanToken) {
      authHeader = cleanToken.toLowerCase().startsWith('bearer ')
        ? cleanToken
        : `Bearer ${cleanToken}`;
    }
  }

  return authHeader
    ? { url, headers: { Authorization: authHeader } }
    : { url };
};

/**
 * Mescla a entrada do servidor MCP `ai-memory` (HTTP) em um objeto `.claude.json`
 * preservando configurações existentes.
 */
export const upsertAiMemoryInClaudeConfig = (
  config: Record<string, unknown>,
  desiredUrl: string,
  desiredHeaders?: Record<string, string>
): { nextConfig: Record<string, unknown>; changed: boolean } => {
  const existingServers = isPlainRecord(config.mcpServers) ? { ...config.mcpServers } : {};
  const existingEntry = existingServers['ai-memory'];

  if (!isPlainRecord(existingEntry)) {
    const newEntry: Record<string, unknown> = {
      type: 'http',
      url: desiredUrl
    };
    if (desiredHeaders && Object.keys(desiredHeaders).length > 0) {
      newEntry.headers = { ...desiredHeaders };
    }
    existingServers['ai-memory'] = newEntry;
    return {
      nextConfig: { ...config, mcpServers: existingServers },
      changed: true
    };
  }

  let entryChanged = false;
  const nextEntry: Record<string, unknown> = { ...existingEntry };

  if (!nextEntry.type) {
    nextEntry.type = 'http';
    entryChanged = true;
  }
  if (typeof nextEntry.url !== 'string' || !nextEntry.url.trim()) {
    nextEntry.url = desiredUrl;
    entryChanged = true;
  }

  if (desiredHeaders && Object.keys(desiredHeaders).length > 0) {
    const currentHeaders = isPlainRecord(nextEntry.headers) ? { ...nextEntry.headers } : {};
    let headersChanged = false;
    for (const [k, v] of Object.entries(desiredHeaders)) {
      if (!currentHeaders[k] && v) {
        currentHeaders[k] = v;
        headersChanged = true;
      }
    }
    if (headersChanged) {
      nextEntry.headers = currentHeaders;
      entryChanged = true;
    }
  }

  if (!entryChanged) {
    return { nextConfig: config, changed: false };
  }

  existingServers['ai-memory'] = nextEntry;
  return {
    nextConfig: { ...config, mcpServers: existingServers },
    changed: true
  };
};

const updateClaudeUserConfigFile = async (
  claudeUserConfigPath: string,
  updater: (current: Record<string, unknown>) => { nextConfig: Record<string, unknown>; changed: boolean },
  label: string
): Promise<boolean> => {
  let claudeObj: Record<string, unknown> = {};
  const exists = await fs.stat(claudeUserConfigPath).then(() => true).catch(() => false);

  if (exists) {
    try {
      const raw = await fs.readFile(claudeUserConfigPath, 'utf8');
      if (raw.trim()) {
        const parsed: unknown = JSON.parse(raw);
        if (!isPlainRecord(parsed)) {
          console.error(`[McpService] ${claudeUserConfigPath} não contém um objeto JSON válido; servidor ${label} não foi gravado.`);
          return false;
        }
        claudeObj = parsed;
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.error(`[McpService] Erro ao ler ${claudeUserConfigPath} (JSON inválido); preservando arquivo original:`, (err as Error).message);
        return false;
      }
    }
  }

  const { nextConfig, changed } = updater(claudeObj);
  if (!changed) return false;

  const linkTarget = await fs.readlink(claudeUserConfigPath).catch(() => null);
  const targetPath = linkTarget
    ? path.resolve(path.dirname(claudeUserConfigPath), linkTarget)
    : await fs.realpath(claudeUserConfigPath).catch(() => claudeUserConfigPath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(nextConfig, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  return true;
};

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

  async ensureHomelabCrawl4AiServer(): Promise<boolean> {
    const CRAWL4AI_URL = process.env.CRAWL4AI_URL || 'http://gabisa.local:11235/mcp';
    const CRAWL4AI_TOKEN = process.env.CRAWL4AI_TOKEN || 'kraken-crawl4ai-homelab-2026';

    const config = await this.readConfig();
    if (!config.mcpServers) config.mcpServers = {};

    if (!config.mcpServers['crawl4ai']) {
      config.mcpServers['crawl4ai'] = {
        url: CRAWL4AI_URL,
        description: 'Motor de extração estruturada e conversão de páginas para Markdown limpo (Crawl4AI)',
        headers: {
          Authorization: `Bearer ${CRAWL4AI_TOKEN}`
        },
        disabled: false
      };
      await this.writeConfig(config);
      console.log('[McpService] Servidor MCP Crawl4AI provisionado com sucesso!');
      return true;
    }
    return false;
  }

  /**
   * Garante que o servidor MCP `anytype` esteja configurado em `mcp_config.json` e
   * sincronizado em todos os arquivos `.claude.json` do Claude Code (`~/.claude.json`
   * e `$CLAUDE_CONFIG_DIR/.claude.json`).
   */
  async ensureAnytypeMcpServer(): Promise<AnytypeProvisionResult> {
    const cliPath = getAnytypeCliPath();
    if (!fsSync.existsSync(cliPath)) {
      return { cliExists: false, mcpConfigUpdated: false, claudeConfigUpdated: false };
    }

    const mcpConfig = await this.readConfig();
    if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};

    const desiredEnv = resolveAnytypeEnv(mcpConfig.mcpServers.anytype?.env);
    let mcpConfigUpdated = false;

    if (!mcpConfig.mcpServers.anytype) {
      mcpConfig.mcpServers.anytype = {
        command: 'node',
        args: [cliPath],
        env: { ...desiredEnv },
        disabled: false
      };
      await this.writeConfig(mcpConfig);
      mcpConfigUpdated = true;
    }

    const claudePaths = await getClaudeUserConfigPaths();
    let claudeConfigUpdated = false;
    for (const claudeUserConfigPath of claudePaths) {
      const updated = await updateClaudeUserConfigFile(
        claudeUserConfigPath,
        (claudeObj) => upsertAnytypeInClaudeConfig(claudeObj, cliPath, desiredEnv),
        'Anytype'
      );
      if (updated) claudeConfigUpdated = true;
    }

    return { cliExists: true, mcpConfigUpdated, claudeConfigUpdated };
  }

  /**
   * Garante que o servidor MCP `ai-memory` (HTTP) esteja sincronizado em todos os
   * arquivos `.claude.json` do Claude Code (`~/.claude.json` e `$CLAUDE_CONFIG_DIR/.claude.json`).
   */
  async ensureAiMemoryMcpServer(): Promise<AiMemoryProvisionResult> {
    const mcpConfig = await this.readConfig();
    const { url, headers } = await resolveAiMemoryConfig(mcpConfig.mcpServers?.['ai-memory']);

    const claudePaths = await getClaudeUserConfigPaths();
    let claudeConfigUpdated = false;
    for (const claudeUserConfigPath of claudePaths) {
      const updated = await updateClaudeUserConfigFile(
        claudeUserConfigPath,
        (claudeObj) => upsertAiMemoryInClaudeConfig(claudeObj, url, headers),
        'AI Memory'
      );
      if (updated) claudeConfigUpdated = true;
    }

    return { configured: Boolean(url), claudeConfigUpdated };
  }

  /**
   * Provisiona os servidores MCP essenciais do Homelab (`anytype` e `ai-memory`)
   * para o Claude Code (tanto `~/.claude.json` quanto `$CLAUDE_CONFIG_DIR/.claude.json`).
   */
  async ensureClaudeCoreMcpServers(): Promise<ClaudeCoreMcpProvisionResult> {
    const anytype = await this.ensureAnytypeMcpServer();
    const aiMemory = await this.ensureAiMemoryMcpServer();
    return { anytype, aiMemory };
  }
}

export const mcpService = new McpService();
