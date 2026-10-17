// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { mcpService } from '../../../../src/services/mcpService';

describe('McpService - SQLite MCP Provisioning (Issue #48)', () => {
  let testRoot: string;
  let configPath: string;
  let gabotDbPath: string;
  let aiMemoryDbPath: string;

  beforeEach(() => {
    testRoot = path.join(os.tmpdir(), `kraken-test-mcp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    configPath = path.join(testRoot, 'mcp_config.json');
    gabotDbPath = path.join(testRoot, 'bot.db');
    aiMemoryDbPath = path.join(testRoot, 'memory.sqlite');

    fs.mkdirSync(testRoot, { recursive: true });

    process.env.MCP_CONFIG_PATH = configPath;
    process.env.GABOT_DB_PATH = gabotDbPath;
    process.env.AI_MEMORY_DB_PATH = aiMemoryDbPath;
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testRoot)) {
        fs.rmSync(testRoot, { recursive: true, force: true });
      }
    } catch {}
    delete process.env.MCP_CONFIG_PATH;
    delete process.env.GABOT_DB_PATH;
    delete process.env.AI_MEMORY_DB_PATH;
  });

  it('não deve registrar servidores SQLite se os arquivos de banco não existirem', async () => {
    const res = await mcpService.ensureHomelabSqliteServers();
    expect(res.gabot).toBe(false);
    expect(res.aiMemory).toBe(false);

    const config = await mcpService.readConfig();
    expect(config.mcpServers?.['sqlite-gabot']).toBeUndefined();
    expect(config.mcpServers?.['sqlite-ai-memory']).toBeUndefined();
  });

  it('deve provisionar sqlite-gabot e sqlite-ai-memory automaticamente quando os bancos locais existirem', async () => {
    fs.writeFileSync(gabotDbPath, 'dummy-sqlite-data', 'utf8');
    fs.writeFileSync(aiMemoryDbPath, 'dummy-memory-data', 'utf8');

    const res = await mcpService.ensureHomelabSqliteServers();
    expect(res.gabot).toBe(true);
    expect(res.aiMemory).toBe(true);

    const config = await mcpService.readConfig();
    expect(config.mcpServers?.['sqlite-gabot']).toBeDefined();
    expect(config.mcpServers?.['sqlite-gabot'].command).toBe('npx');
    expect(config.mcpServers?.['sqlite-gabot'].args).toContain(gabotDbPath);

    expect(config.mcpServers?.['sqlite-ai-memory']).toBeDefined();
    expect(config.mcpServers?.['sqlite-ai-memory'].command).toBe('npx');
    expect(config.mcpServers?.['sqlite-ai-memory'].args).toContain(aiMemoryDbPath);
  });
});
