import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const CONFIG_PATH = process.env.MCP_CONFIG_PATH || '/root/.gemini/config/mcp_config.json';

class McpService {
  async list() {
    try {
      // Tentar via 'agy mcp list'
      const { stdout } = await execAsync('agy mcp list');
      const lines = stdout.trim().split('\n');
      
      if (lines.length > 1 && lines[0].includes('NAME')) {
        const servers = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const parts = line.split(/\s+/);
          if (parts.length >= 4) {
            servers.push({
              name: parts[0],
              type: parts[1],
              status: parts[2] === 'enabled' ? 'enabled' : 'disabled',
              commandOrUrl: parts.slice(3).join(' ')
            });
          }
        }
        if (servers.length > 0) return servers;
      }
    } catch {
      // Fallback para leitura direta do mcp_config.json
    }

    // Fallback: ler mcp_config.json
    try {
      const exists = await fs.access(CONFIG_PATH).then(() => true).catch(() => false);
      if (exists) {
        const raw = await fs.readFile(CONFIG_PATH, 'utf8');
        const json = JSON.parse(raw);
        const mcpServers = json.mcpServers || {};
        return Object.entries(mcpServers).map(([name, conf]) => ({
          name,
          type: conf.serverUrl || conf.url ? 'http' : 'stdio',
          status: 'enabled',
          commandOrUrl: conf.serverUrl || conf.url || (conf.command ? `${conf.command} ${(conf.args || []).join(' ')}` : '')
        }));
      }
    } catch (e) {
      console.warn('[McpService] Erro ao ler mcp_config.json:', e.message);
    }

    return [];
  }

  async toggle(name, enable) {
    const action = enable ? 'enable' : 'disable';
    try {
      await execAsync(`agy mcp ${action} ${name}`);
      return { success: true };
    } catch (e) {
      console.warn(`[McpService] Falha ao executar agy mcp ${action}:`, e.message);
      return { success: false, error: e.message };
    }
  }
}

export const mcpService = new McpService();
