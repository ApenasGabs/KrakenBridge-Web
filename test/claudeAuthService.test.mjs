import test from 'node:test';
import assert from 'node:assert/strict';
import { claudeAuthService } from '../dist-server/services/claudeAuthService.js';
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
