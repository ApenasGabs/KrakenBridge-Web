import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

// Isola o diretório de testes para não interferir nem apagar as credenciais reais de produção
const tmpTestDir = path.join(os.tmpdir(), 'claude-auth-test-' + randomUUID());
await fs.mkdir(tmpTestDir, { recursive: true });

process.env.CLAUDE_CONFIG_DIR = tmpTestDir;
process.env.CLAUDE_CREDENTIALS_FILE = path.join(tmpTestDir, '.credentials.json');
process.env.CREDENTIALS_VAULT_FILE = path.join(tmpTestDir, '.credentials.json.vault');
process.env.DATA_VAULT_FILE = path.join(tmpTestDir, 'data.vault');
process.env.PAPERCLIP_CREDENTIALS_FILE = path.join(tmpTestDir, 'paperclip.json');

import { claudeAuthService, isValidClaudeCredentials } from '../dist-server/services/claudeAuthService.js';
import express from 'express';
import { authRouter } from '../dist-server/routes/auth.js';

// Testes unitários/integração cobrindo os fluxos de início, submissão de código e status (Issue #166)
test('Testes unitários/integração cobrindo os fluxos de início, submissão de código e status', async () => {
  // 1. Fluxo de verificação de status
  const statusInitial = await claudeAuthService.getStatus();
  assert.ok(typeof statusInitial.authenticated === 'boolean');
  assert.ok(typeof statusInitial.configDirectory === 'string');

  // 2. Fluxo de início (startAuth)
  const startResult = await claudeAuthService.startAuth(true);
  assert.ok(startResult.status === 'waiting_for_code' || startResult.status === 'already_authenticated');
  if (startResult.status === 'waiting_for_code') {
    assert.ok(startResult.authUrl);
  }

  // 3. Fluxo de submissão de código (submitCode)
  const invalidResult = await claudeAuthService.submitCode('');
  assert.equal(invalidResult.success, false);
  assert.equal(invalidResult.status, 'error');

  const keyResult = await claudeAuthService.submitCode('sk-ant-api03-mock-flow-test-key');
  assert.equal(keyResult.success, true);
  assert.equal(keyResult.status, 'success');

  // 4. Limpeza e logout
  await claudeAuthService.logout();
});

test('claudeAuthService: getStatus deve retornar estrutura válida de status', async () => {
  const status = await claudeAuthService.getStatus();
  assert.ok(typeof status.authenticated === 'boolean');
  assert.ok(typeof status.hasKey === 'boolean');
  assert.ok(typeof status.hasToken === 'boolean');
  assert.ok(typeof status.configDirectory === 'string');
});

test('claudeAuthService: submitCode deve rejeitar código vazio com erro amigável', async () => {
  const result = await claudeAuthService.submitCode('');
  assert.equal(result.success, false);
  assert.equal(result.status, 'error');
  assert.match(result.error, /não informado/i);
});

test('claudeAuthService: submitCode deve suportar e salvar Anthropic API Key diretamente', async () => {
  const testKey = 'sk-ant-api03-test-mock-key-12345';
  const result = await claudeAuthService.submitCode(testKey);
  assert.equal(result.success, true);
  assert.equal(result.status, 'success');
  assert.match(result.message, /Anthropic API Key/i);

  const status = await claudeAuthService.getStatus();
  assert.equal(status.authenticated, true);
  assert.equal(status.hasKey, true);

  // Limpa após o teste
  await claudeAuthService.logout();
});

test('claudeAuthService: startAuth deve iniciar processo e capturar a URL oficial de OAuth', async () => {
  const result = await claudeAuthService.startAuth(true);
  assert.ok(result.status === 'waiting_for_code' || result.status === 'already_authenticated');
  if (result.status === 'waiting_for_code') {
    assert.ok(result.authUrl);
    assert.match(result.authUrl, /^https:\/\/(?:claude\.com|platform\.claude\.com|claude\.ai)\//);
  }

  // Desconecta/limpa sessão
  await claudeAuthService.logout();
});

test('authRouter: endpoints /api/auth/status e /api/auth/claude/* devem responder corretamente', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);

  // Inicia servidor temporário em porta livre
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/auth`;

  try {
    // 1. GET /api/auth/status
    const statusRes = await fetch(`${baseUrl}/status`);
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.ok('claude' in statusData);
    assert.ok(typeof statusData.claude.authenticated === 'boolean');

    // 2. GET /api/auth/claude/status
    const claudeStatusRes = await fetch(`${baseUrl}/claude/status`);
    assert.equal(claudeStatusRes.status, 200);
    const claudeStatusData = await claudeStatusRes.json();
    assert.ok(typeof claudeStatusData.authenticated === 'boolean');

    // 3. POST /api/auth/claude/submit-code sem código deve retornar 400
    const submitEmptyRes = await fetch(`${baseUrl}/claude/submit-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(submitEmptyRes.status, 400);
    const emptyJson = await submitEmptyRes.json();
    assert.equal(emptyJson.success, false);
  } finally {
    server.close();
  }
});

test('claudeAuthService: isValidClaudeCredentials deve validar e rejeitar tokens vazios ou corrompidos', () => {
  // Rejeita valores vazios ou inválidos
  assert.equal(isValidClaudeCredentials(''), false);
  assert.equal(isValidClaudeCredentials('invalid json'), false);
  assert.equal(isValidClaudeCredentials('{"claudeAiOauth":{"accessToken":"","refreshToken":""}}'), false);
  assert.equal(isValidClaudeCredentials('{"claudeAiOauth":{"accessToken":"   "}}'), false);

  // Aceita tokens válidos
  assert.equal(isValidClaudeCredentials('{"claudeAiOauth":{"accessToken":"sk-ant-oat01-validtoken1234567890"}}'), true);
  assert.equal(isValidClaudeCredentials('{"claudeAiOauth":{"refreshToken":"validrefreshtoken1234567890"}}'), true);
  assert.equal(isValidClaudeCredentials('{"accessToken":"sk-ant-oat01-directtoken1234567890"}'), true);
});

test('claudeAuthService: ensurePersistentStorage deve auto-curar .credentials.json a partir do cofre persistente', async () => {
  const credsFile = path.join(tmpTestDir, '.credentials.json');
  const vaultFile = path.join(tmpTestDir, '.credentials.json.vault');

  const validVaultPayload = JSON.stringify({
    claudeAiOauth: {
      accessToken: 'sk-ant-oat01-mock-vault-heal-token-12345',
      refreshToken: 'mock-refresh-token-12345',
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000
    }
  });

  // Grava cofre válido
  await fs.mkdir(tmpTestDir, { recursive: true });
  await fs.writeFile(vaultFile, validVaultPayload, { mode: 0o600 });

  // Simula o arquivo .credentials.json tendo sido corrompido/limpo pelo CLI
  const corruptedPayload = JSON.stringify({
    claudeAiOauth: {
      accessToken: '',
      refreshToken: '',
      expiresAt: 0
    }
  });
  await fs.writeFile(credsFile, corruptedPayload, { mode: 0o600 });

  // Executa auto-cura
  await claudeAuthService.ensurePersistentStorage();

  // Verifica se o arquivo foi restaurado com sucesso a partir do cofre
  const restoredRaw = await fs.readFile(credsFile, 'utf8');
  assert.ok(restoredRaw.includes('sk-ant-oat01-mock-vault-heal-token-12345'));
  assert.equal(isValidClaudeCredentials(restoredRaw), true);

  // Limpeza
  await claudeAuthService.logout();
});

test('claudeAuthService: parsing de URL de autenticacao deve suportar escape ANSI OSC 8 sem corromper a URL', () => {
  const sampleWithAnsi = 'Welcome to Claude Code v2.1.325\n\n Browser didn\'t open? Use the url below to sign in (c to copy)\n\n\u001b]8;id=a2aoov;https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=user%3Ainference&code_challenge=test_challenge&code_challenge_method=S256&state=test_state\u0007https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=user%3Ainference&code_challenge=test_challenge&code_challenge_method=S256&state=test_state\u001b]8;;\u0007\n\n Paste code here if prompted >';

  const match = sampleWithAnsi.match(/https:\/\/(?:claude\.com\/cai\/oauth\/authorize|auth\.anthropic\.com)[^\s>\x1b\x07\x00-\x1f'"]+/);
  assert.ok(match, 'Regex deve capturar a URL');
  assert.equal(match[0].includes('\u0007'), false, 'URL nao pode conter caractere de controle BEL');
  assert.equal(match[0].includes('\u001b'), false, 'URL nao pode conter escape ANSI');
  assert.equal(match[0].endsWith('test_state'), true, 'URL deve terminar limpa com o parametro state');
});

test('claudeAuthService: startAuth deve gerar URL com claude auth login sem travar em Ink/TTY', async () => {
  const result = await claudeAuthService.startAuth(true, 'login');
  assert.ok(result, 'Deve retornar resultado de autenticacao');
  assert.equal(result.status, 'waiting_for_code');
  assert.ok(result.authUrl, 'Deve conter authUrl');
  assert.ok(result.authUrl.startsWith('https://claude.com/cai/oauth/authorize'));

  // Garante que o processo filho e encerrado deterministamente
  await claudeAuthService.logout();
});

test('Limpeza do ambiente isolado de testes', async () => {
  await fs.rm(tmpTestDir, { recursive: true, force: true }).catch(() => {});
});
