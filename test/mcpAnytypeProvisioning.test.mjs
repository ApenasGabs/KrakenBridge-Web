import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

import {
  mcpService,
  upsertAnytypeInClaudeConfig,
  upsertAiMemoryInClaudeConfig,
  normalizeAiMemoryUrlForClaude
} from '../dist-server/services/mcpService.js';
import { ensureClaudeJsonSymlink, claudeAuthService } from '../dist-server/services/claudeAuthService.js';

const withIsolatedEnv = async (envOverrides, fn) => {
  const saved = {};
  for (const [k, v] of Object.entries(envOverrides)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

test('mcpService.ensureAnytypeMcpServer: sincroniza anytype em ~/.claude.json e mcp_config.json preservando dados existentes', async () => {
  const tmpDir = path.join(os.tmpdir(), `mcp-anytype-test-${randomUUID()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const mcpConfigPath = path.join(tmpDir, 'mcp_config.json');
  const claudeUserPath = path.join(tmpDir, '.claude.json');
  const fakeCliPath = path.join(tmpDir, 'cli.mjs');
  await fs.writeFile(fakeCliPath, '#!/usr/bin/env node\n', 'utf8');

  await fs.writeFile(
    mcpConfigPath,
    JSON.stringify({
      mcpServers: {
        anytype: {
          command: fakeCliPath,
          disabled: false,
          env: {
            ANYTYPE_API_BASE_URL: 'http://192.0.2.10:31009',
            OPENAPI_MCP_HEADERS: '{"Authorization":"Bearer mock-token","Anytype-Version":"2025-11-08"}'
          }
        }
      }
    }),
    'utf8'
  );

  await fs.writeFile(
    claudeUserPath,
    JSON.stringify({
      userID: 'existing-user',
      mcpServers: {
        other: { type: 'http', url: 'https://example.com/mcp' }
      }
    }),
    'utf8'
  );

  try {
    await withIsolatedEnv(
      {
        MCP_CONFIG_PATH: mcpConfigPath,
        CLAUDE_USER_CONFIG_FILE: claudeUserPath,
        ANYTYPE_MCP_CLI_PATH: fakeCliPath,
        ANYTYPE_API_BASE_URL: undefined,
        OPENAPI_MCP_HEADERS: undefined,
        ANYTYPE_API_KEY: undefined
      },
      async () => {
        const first = await mcpService.ensureAnytypeMcpServer();
        assert.equal(first.cliExists, true);
        assert.equal(first.mcpConfigUpdated, false);
        assert.equal(first.claudeConfigUpdated, true);

        const parsed = JSON.parse(await fs.readFile(claudeUserPath, 'utf8'));
        assert.equal(parsed.userID, 'existing-user');
        assert.deepEqual(parsed.mcpServers.other, { type: 'http', url: 'https://example.com/mcp' });
        assert.deepEqual(parsed.mcpServers.anytype, {
          type: 'stdio',
          command: 'node',
          args: [fakeCliPath],
          env: {
            ANYTYPE_API_BASE_URL: 'http://192.0.2.10:31009',
            OPENAPI_MCP_HEADERS: '{"Authorization":"Bearer mock-token","Anytype-Version":"2025-11-08"}'
          }
        });

        // Idempotência na segunda execução
        const second = await mcpService.ensureAnytypeMcpServer();
        assert.equal(second.claudeConfigUpdated, false);
      }
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('mcpService.ensureAnytypeMcpServer: cria entrada em mcp_config.json quando ausente e pula quando CLI não existe', async () => {
  const tmpDir = path.join(os.tmpdir(), `mcp-anytype-missing-${randomUUID()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const mcpConfigPath = path.join(tmpDir, 'mcp_config.json');
  const claudeUserPath = path.join(tmpDir, '.claude.json');
  const missingCliPath = path.join(tmpDir, 'nao-existe.mjs');

  try {
    await withIsolatedEnv(
      {
        MCP_CONFIG_PATH: mcpConfigPath,
        CLAUDE_USER_CONFIG_FILE: claudeUserPath,
        ANYTYPE_MCP_CLI_PATH: missingCliPath,
        ANYTYPE_API_BASE_URL: 'http://192.0.2.10:31009'
      },
      async () => {
        const missingRes = await mcpService.ensureAnytypeMcpServer();
        assert.equal(missingRes.cliExists, false);
        assert.equal(missingRes.claudeConfigUpdated, false);
        assert.equal(fsSync.existsSync(claudeUserPath), false);

        const existingCliPath = path.join(tmpDir, 'cli.mjs');
        await fs.writeFile(existingCliPath, '#!/usr/bin/env node\n', 'utf8');
        process.env.ANYTYPE_MCP_CLI_PATH = existingCliPath;

        const createdRes = await mcpService.ensureAnytypeMcpServer();
        assert.equal(createdRes.cliExists, true);
        assert.equal(createdRes.mcpConfigUpdated, true);
        assert.equal(createdRes.claudeConfigUpdated, true);

        const claudeJson = JSON.parse(await fs.readFile(claudeUserPath, 'utf8'));
        assert.equal(claudeJson.mcpServers.anytype.command, 'node');
        assert.deepEqual(claudeJson.mcpServers.anytype.args, [existingCliPath]);
        assert.equal(claudeJson.mcpServers.anytype.env.ANYTYPE_API_BASE_URL, 'http://192.0.2.10:31009');
      }
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('mcpService.ensureAnytypeMcpServer: nunca sobrescreve ~/.claude.json com JSON inválido e preenche headers faltantes', async () => {
  const tmpDir = path.join(os.tmpdir(), `mcp-anytype-invalid-${randomUUID()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const mcpConfigPath = path.join(tmpDir, 'mcp_config.json');
  const claudeUserPath = path.join(tmpDir, '.claude.json');
  const fakeCliPath = path.join(tmpDir, 'cli.mjs');
  await fs.writeFile(fakeCliPath, '#!/usr/bin/env node\n', 'utf8');
  await fs.writeFile(claudeUserPath, '{ json invalido', 'utf8');

  try {
    await withIsolatedEnv(
      {
        MCP_CONFIG_PATH: mcpConfigPath,
        CLAUDE_USER_CONFIG_FILE: claudeUserPath,
        ANYTYPE_MCP_CLI_PATH: fakeCliPath
      },
      async () => {
        const res = await mcpService.ensureAnytypeMcpServer();
        assert.equal(res.cliExists, true);
        assert.equal(res.claudeConfigUpdated, false);
        assert.equal(await fs.readFile(claudeUserPath, 'utf8'), '{ json invalido');
      }
    );

    const { nextConfig, changed } = upsertAnytypeInClaudeConfig(
      {
        mcpServers: {
          anytype: {
            type: 'stdio',
            command: 'node',
            args: [fakeCliPath],
            env: { ANYTYPE_API_BASE_URL: 'http://192.0.2.10:31009' }
          }
        }
      },
      fakeCliPath,
      {
        ANYTYPE_API_BASE_URL: 'http://192.0.2.10:31009',
        OPENAPI_MCP_HEADERS: '{"Authorization":"Bearer abc"}'
      }
    );
    assert.equal(changed, true);
    const anytype = nextConfig.mcpServers.anytype;
    assert.deepEqual(anytype.env, {
      ANYTYPE_API_BASE_URL: 'http://192.0.2.10:31009',
      OPENAPI_MCP_HEADERS: '{"Authorization":"Bearer abc"}'
    });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('claudeAuthService + mcpService: symlink /root/.claude.json -> /DATA/.claude.json não corrompe arquivo existente e persiste anytype MCP', async () => {
  const tmpDir = path.join(os.tmpdir(), `mcp-symlink-test-${randomUUID()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const claudeConfigDir = path.join(tmpDir, '.claude');
  const userJsonPath = path.join(tmpDir, 'root', '.claude.json');
  const dataJsonPath = path.join(tmpDir, 'DATA', '.claude.json');
  const mcpConfigPath = path.join(tmpDir, 'mcp_config.json');
  const fakeCliPath = path.join(tmpDir, 'cli.mjs');

  await fs.mkdir(path.dirname(dataJsonPath), { recursive: true });
  await fs.writeFile(fakeCliPath, '#!/usr/bin/env node\n', 'utf8');
  await fs.writeFile(dataJsonPath, JSON.stringify({ userID: 'persisted-user' }, null, 2), 'utf8');

  try {
    await withIsolatedEnv(
      {
        CLAUDE_CONFIG_DIR: claudeConfigDir,
        CLAUDE_CREDENTIALS_FILE: path.join(claudeConfigDir, '.credentials.json'),
        CREDENTIALS_VAULT_FILE: path.join(claudeConfigDir, '.credentials.json.vault'),
        DATA_VAULT_FILE: path.join(tmpDir, 'DATA', '.credentials.json.vault'),
        PAPERCLIP_CREDENTIALS_FILE: path.join(tmpDir, 'paperclip.json'),
        CLAUDE_USER_CONFIG_FILE: userJsonPath,
        PERSISTENT_CLAUDE_USER_CONFIG_FILE: dataJsonPath,
        MCP_CONFIG_PATH: mcpConfigPath,
        ANYTYPE_MCP_CLI_PATH: fakeCliPath
      },
      async () => {
        // Garante symlink quando /root/.claude.json ainda não existe e /DATA/.claude.json já existe
        await claudeAuthService.ensurePersistentStorage();
        const lstat = await fs.lstat(userJsonPath);
        assert.equal(lstat.isSymbolicLink(), true);

        // Valida que ensureClaudeJsonSymlink não anexou "{}" corrompendo o JSON existente
        const dataBeforeMcp = JSON.parse(await fs.readFile(dataJsonPath, 'utf8'));
        assert.equal(dataBeforeMcp.userID, 'persisted-user');

        // Agora provisiona o MCP Anytype e valida escrita através do symlink mantendo o symlink intacto
        const res = await mcpService.ensureAnytypeMcpServer();
        assert.equal(res.claudeConfigUpdated, true);
        assert.equal((await fs.lstat(userJsonPath)).isSymbolicLink(), true);

        const dataAfterMcp = JSON.parse(await fs.readFile(dataJsonPath, 'utf8'));
        assert.equal(dataAfterMcp.userID, 'persisted-user');
        assert.equal(dataAfterMcp.mcpServers.anytype.command, 'node');
        assert.deepEqual(dataAfterMcp.mcpServers.anytype.args, [fakeCliPath]);

        // Caso de arquivo regular local substituindo o symlink: mescla sem perder /DATA/.claude.json
        await fs.rm(userJsonPath, { force: true });
        await fs.writeFile(
          userJsonPath,
          JSON.stringify({ mcpServers: { extra: { type: 'http', url: 'https://local.test/mcp' } } }),
          'utf8'
        );
        await ensureClaudeJsonSymlink(userJsonPath, dataJsonPath);
        assert.equal((await fs.lstat(userJsonPath)).isSymbolicLink(), true);
        const merged = JSON.parse(await fs.readFile(dataJsonPath, 'utf8'));
        assert.equal(merged.mcpServers.anytype.command, 'node');
        assert.deepEqual(merged.mcpServers.extra, { type: 'http', url: 'https://local.test/mcp' });
      }
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('claude mcp get anytype: servidor auto-provisionado reporta status Connected quando /workspace/anytype-mcp/bin/cli.mjs existe', async () => {
  const realCliPath = '/workspace/anytype-mcp/bin/cli.mjs';
  if (!fsSync.existsSync(realCliPath)) return;

  const tmpHome = path.join(os.tmpdir(), `claude-mcp-verify-${randomUUID()}`);
  await fs.mkdir(tmpHome, { recursive: true });
  const mcpConfigPath = path.join(tmpHome, 'mcp_config.json');
  const claudeUserPath = path.join(tmpHome, '.claude.json');

  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const address = mockServer.address();
  const mockBaseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await withIsolatedEnv(
      {
        HOME: tmpHome,
        MCP_CONFIG_PATH: mcpConfigPath,
        CLAUDE_USER_CONFIG_FILE: undefined,
        CLAUDE_USER_CONFIG_PATH: undefined,
        ANYTYPE_MCP_CLI_PATH: realCliPath,
        ANYTYPE_API_BASE_URL: mockBaseUrl
      },
      async () => {
        const res = await mcpService.ensureAnytypeMcpServer();
        assert.equal(res.cliExists, true);
        assert.equal(res.claudeConfigUpdated, true);
        assert.equal(fsSync.existsSync(claudeUserPath), true);

        const { stdout: output } = await execFileAsync('claude', ['mcp', 'get', 'anytype'], {
          env: { ...process.env, HOME: tmpHome },
          encoding: 'utf8',
          timeout: 15000
        });
        assert.match(output, /anytype:/);
        assert.match(output, /Connected/);
        assert.match(output, /\/workspace\/anytype-mcp\/bin\/cli\.mjs/);
      }
    );
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
    await fs.rm(tmpHome, { recursive: true, force: true }).catch(() => {});
  }
});

test('mcpService.ensureClaudeCoreMcpServers: sincroniza anytype e ai-memory em ~/.claude.json e $CLAUDE_CONFIG_DIR/.claude.json', async () => {
  const tmpDir = path.join(os.tmpdir(), `mcp-core-claude-dir-${randomUUID()}`);
  const claudeConfigDir = path.join(tmpDir, 'claude-config-dir');
  await fs.mkdir(claudeConfigDir, { recursive: true });

  const mcpConfigPath = path.join(tmpDir, 'mcp_config.json');
  const claudeUserPath = path.join(tmpDir, '.claude.json');
  const claudeDirJsonPath = path.join(claudeConfigDir, '.claude.json');
  const fakeCliPath = path.join(tmpDir, 'cli.mjs');
  const tokenFile = path.join(tmpDir, 'ai-memory-token');

  await fs.writeFile(fakeCliPath, '#!/usr/bin/env node\n', 'utf8');
  await fs.writeFile(tokenFile, 'file-secret-token\n', 'utf8');
  await fs.writeFile(
    mcpConfigPath,
    JSON.stringify({
      mcpServers: {
        'ai-memory': {
          url: 'http://192.0.2.20:49374/mcp?flavor=gemini',
          headers: {
            Authorization: 'Bearer mcp-config-token'
          }
        },
        anytype: {
          command: fakeCliPath,
          env: {
            ANYTYPE_API_BASE_URL: 'http://192.0.2.20:31009',
            OPENAPI_MCP_HEADERS: '{"Authorization":"Bearer anytype-tok","Anytype-Version":"2025-11-08"}'
          }
        }
      }
    }),
    'utf8'
  );
  await fs.writeFile(claudeDirJsonPath, JSON.stringify({ userID: 'dir-user', mcpServers: {} }), 'utf8');

  try {
    await withIsolatedEnv(
      {
        MCP_CONFIG_PATH: mcpConfigPath,
        CLAUDE_USER_CONFIG_FILE: claudeUserPath,
        CLAUDE_CONFIG_DIR: claudeConfigDir,
        ANYTYPE_MCP_CLI_PATH: fakeCliPath,
        AI_MEMORY_CLAUDE_URL: undefined,
        AI_MEMORY_URL: undefined,
        AI_MEMORY_TOKEN: undefined,
        AI_MEMORY_TOKEN_FILE: tokenFile
      },
      async () => {
        const res = await mcpService.ensureClaudeCoreMcpServers();
        assert.equal(res.anytype.cliExists, true);
        assert.equal(res.anytype.claudeConfigUpdated, true);
        assert.equal(res.aiMemory.configured, true);
        assert.equal(res.aiMemory.claudeConfigUpdated, true);

        for (const targetFile of [claudeUserPath, claudeDirJsonPath]) {
          const parsed = JSON.parse(await fs.readFile(targetFile, 'utf8'));
          assert.equal(parsed.mcpServers.anytype.command, 'node');
          assert.deepEqual(parsed.mcpServers.anytype.args, [fakeCliPath]);
          assert.deepEqual(parsed.mcpServers['ai-memory'], {
            type: 'http',
            url: 'http://192.0.2.20:49374/mcp?flavor=claude',
            headers: {
              Authorization: 'Bearer mcp-config-token'
            }
          });
        }

        const dirParsed = JSON.parse(await fs.readFile(claudeDirJsonPath, 'utf8'));
        assert.equal(dirParsed.userID, 'dir-user');

        // Idempotência
        const second = await mcpService.ensureClaudeCoreMcpServers();
        assert.equal(second.anytype.claudeConfigUpdated, false);
        assert.equal(second.aiMemory.claudeConfigUpdated, false);
      }
    );

    // Fallback de token via AI_MEMORY_TOKEN_FILE quando mcp_config.json não tem ai-memory
    assert.equal(
      normalizeAiMemoryUrlForClaude('http://192.0.2.20:49374/mcp?flavor=gemini'),
      'http://192.0.2.20:49374/mcp?flavor=claude'
    );
    assert.equal(
      normalizeAiMemoryUrlForClaude('http://192.0.2.20:49374/mcp'),
      'http://192.0.2.20:49374/mcp?flavor=claude'
    );
    const upserted = upsertAiMemoryInClaudeConfig(
      { mcpServers: { 'ai-memory': { type: 'http', url: 'http://192.0.2.20:49374/mcp?flavor=claude' } } },
      'http://192.0.2.20:49374/mcp?flavor=claude',
      { Authorization: 'Bearer injected-token' }
    );
    assert.equal(upserted.changed, true);
    assert.equal(upserted.nextConfig.mcpServers['ai-memory'].headers.Authorization, 'Bearer injected-token');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('claude mcp get (com CLAUDE_CONFIG_DIR): anytype e ai-memory reportam Connected', async () => {
  const realCliPath = '/workspace/anytype-mcp/bin/cli.mjs';
  if (!fsSync.existsSync(realCliPath)) return;

  const tmpHome = path.join(os.tmpdir(), `claude-mcp-dir-verify-${randomUUID()}`);
  const claudeConfigDir = path.join(tmpHome, '.claude');
  await fs.mkdir(claudeConfigDir, { recursive: true });
  const mcpConfigPath = path.join(tmpHome, 'mcp_config.json');

  const mockServer = http.createServer((req, res) => {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        let reqId = 1;
        try { reqId = JSON.parse(body).id ?? 1; } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: reqId,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'ai-memory-mock', version: '1.0.0' }
          }
        }));
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const address = mockServer.address();
  const mockBaseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await withIsolatedEnv(
      {
        HOME: tmpHome,
        CLAUDE_CONFIG_DIR: claudeConfigDir,
        MCP_CONFIG_PATH: mcpConfigPath,
        CLAUDE_USER_CONFIG_FILE: undefined,
        CLAUDE_USER_CONFIG_PATH: undefined,
        ANYTYPE_MCP_CLI_PATH: realCliPath,
        ANYTYPE_API_BASE_URL: mockBaseUrl,
        AI_MEMORY_URL: `${mockBaseUrl}/mcp`,
        AI_MEMORY_TOKEN: 'test-token-218'
      },
      async () => {
        const res = await mcpService.ensureClaudeCoreMcpServers();
        assert.equal(res.anytype.cliExists, true);
        assert.equal(res.aiMemory.configured, true);
        assert.equal(fsSync.existsSync(path.join(claudeConfigDir, '.claude.json')), true);

        const cliEnv = { ...process.env, HOME: tmpHome, CLAUDE_CONFIG_DIR: claudeConfigDir };

        const { stdout: anytypeOut } = await execFileAsync('claude', ['mcp', 'get', 'anytype'], {
          env: cliEnv,
          encoding: 'utf8',
          timeout: 15000
        });
        assert.match(anytypeOut, /anytype:/);
        assert.match(anytypeOut, /Connected/);

        const { stdout: memoryOut } = await execFileAsync('claude', ['mcp', 'get', 'ai-memory'], {
          env: cliEnv,
          encoding: 'utf8',
          timeout: 15000
        });
        assert.match(memoryOut, /ai-memory:/);
        assert.match(memoryOut, /Connected/);
        assert.match(memoryOut, /flavor=claude/);
      }
    );
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
    await fs.rm(tmpHome, { recursive: true, force: true }).catch(() => {});
  }
});
