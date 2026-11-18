import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  encodeClaudeProjectPath,
  getClaudeSessionFilePath,
  resolveNativeSessionId,
  AGENT_DRIVERS
} from '../dist-server/routes/chat.js';
import {
  buildHistoryFallbackPrompt,
  historyService
} from '../dist-server/services/historyService.js';

// Issue #189: fallback de histórico no prompt para troca de agente e mudança de cwd em workspace efêmero

test('encodeClaudeProjectPath codifica diretórios substituindo caracteres não permitidos por hífen', () => {
  assert.equal(encodeClaudeProjectPath('/workspace/KrakenBridge-Web'), '-workspace-KrakenBridge-Web');
  assert.equal(encodeClaudeProjectPath('/workspace'), '-workspace');
  assert.equal(
    encodeClaudeProjectPath('/tmp/kraken-workspaces/4e40f347-f2c7-49dc-a822-506201f82010'),
    '-tmp-kraken-workspaces-4e40f347-f2c7-49dc-a822-506201f82010'
  );
  assert.equal(encodeClaudeProjectPath('/tmp/tmp.GVNf2u9Yjx'), '-tmp-tmp-GVNf2u9Yjx');
  assert.equal(encodeClaudeProjectPath('/path/with spaces/and@symbols!'), '-path-with-spaces-and-symbols-');
});

test('getClaudeSessionFilePath constrói o caminho do .jsonl sob projects/<encoded-cwd>', () => {
  const customConfig = '/tmp/test-claude-config';
  const filePath = getClaudeSessionFilePath('sess-abc', '/workspace/app', customConfig);
  assert.equal(filePath, path.join(customConfig, 'projects', '-workspace-app', 'sess-abc.jsonl'));
});

test('resolveNativeSessionId com checkDisk: true valida a existência física do arquivo .jsonl no disco', () => {
  const tmpConfigDir = path.join(os.tmpdir(), `claude-test-${randomUUID()}`);
  const workDir = path.join(os.tmpdir(), `workdir-${randomUUID()}`);
  const sessionId = `session-${randomUUID()}`;

  try {
    const sessionDir = path.join(tmpConfigDir, 'projects', encodeClaudeProjectPath(workDir));
    fs.mkdirSync(sessionDir, { recursive: true });

    const session = {
      agent: 'claude',
      claudeSessionId: sessionId,
      claudeSessionCwd: workDir
    };

    // Arquivo .jsonl ainda não existe no disco
    assert.equal(
      resolveNativeSessionId('claude', session, workDir, { checkDisk: true, claudeConfigDir: tmpConfigDir }),
      null,
      'deve retornar null se o arquivo .jsonl não existir no disco'
    );

    // Sem checkDisk (compatibilidade retroativa), retorna o ID
    assert.equal(
      resolveNativeSessionId('claude', session, workDir),
      sessionId,
      'sem checkDisk, valida apenas os metadados em memória'
    );

    // Cria o arquivo de sessão
    const sessionFile = path.join(sessionDir, `${sessionId}.jsonl`);
    fs.writeFileSync(sessionFile, '{"type":"init"}\n');

    // Com o arquivo presente, checkDisk: true deve retornar o sessionId
    assert.equal(
      resolveNativeSessionId('claude', session, workDir, { checkDisk: true, claudeConfigDir: tmpConfigDir }),
      sessionId,
      'deve retornar o sessionId se o arquivo existir'
    );
  } finally {
    fs.rmSync(tmpConfigDir, { recursive: true, force: true });
  }
});

test('resolveNativeSessionId retorna null quando há troca de agente entre turnos', () => {
  const session = {
    agent: 'antigravity',
    agyConvId: 'agy-prev',
    claudeSessionId: 'claude-prev',
    claudeSessionCwd: '/workspace/app'
  };

  // Turno atual é claude, mas o turno anterior foi antigravity: troca de agente detectada
  assert.equal(
    resolveNativeSessionId('claude', session, '/workspace/app'),
    null,
    'troca de agente (antigravity -> claude) deve descartar sessão nativa'
  );

  // Turno anterior era claude, agora é antigravity
  const sessionClaude = {
    agent: 'claude',
    agyConvId: 'agy-prev',
    claudeSessionId: 'claude-prev',
    claudeSessionCwd: '/workspace/app'
  };
  assert.equal(
    resolveNativeSessionId('antigravity', sessionClaude, '/workspace/app'),
    null,
    'troca de agente (claude -> antigravity) deve descartar sessão nativa'
  );

  // Mesmo agente mantém a sessão
  assert.equal(
    resolveNativeSessionId('claude', sessionClaude, '/workspace/app'),
    'claude-prev'
  );
  assert.equal(
    resolveNativeSessionId('antigravity', session, '/workspace/app'),
    'agy-prev'
  );
});

test('buildHistoryFallbackPrompt gera bloco [HISTÓRICO_DA_CONVERSA_ANTERIOR] formatado', () => {
  const messages = [
    { role: 'user', text: 'Como criar um componente React?', timestamp: 1 },
    { role: 'assistant', agent: 'antigravity', text: 'Você pode usar uma função que retorna JSX.', timestamp: 2 },
    { role: 'user', text: 'E com TypeScript?', timestamp: 3 },
    { role: 'assistant', agent: 'antigravity', text: 'Basta tipar as props usando interface Props.', timestamp: 4 }
  ];

  const result = buildHistoryFallbackPrompt(messages);
  assert.ok(result.includes('[HISTÓRICO_DA_CONVERSA_ANTERIOR]'));
  assert.ok(result.includes('[FIM_DO_HISTÓRICO_DA_CONVERSA_ANTERIOR]'));
  assert.ok(result.includes('- [Usuário]:\nComo criar um componente React?'));
  assert.ok(result.includes('- [Assistente (antigravity)]:\nVocê pode usar uma função que retorna JSX.'));
  assert.ok(result.includes('- [Usuário]:\nE com TypeScript?'));
  assert.ok(result.includes('- [Assistente (antigravity)]:\nBasta tipar as props usando interface Props.'));
});

test('buildHistoryFallbackPrompt lida com mensagens vazias, ausência de mensagens ou mensagens sem conteúdo', () => {
  assert.equal(buildHistoryFallbackPrompt([]), '');
  assert.equal(buildHistoryFallbackPrompt(null), '');
  assert.equal(buildHistoryFallbackPrompt(undefined), '');
  assert.equal(
    buildHistoryFallbackPrompt([
      { role: 'assistant', text: '', content: '', timestamp: 1 },
      { role: 'system', text: 'instrução interna', timestamp: 2 }
    ]),
    ''
  );
});

test('buildHistoryFallbackPrompt trunca mensagens individuais que excedem maxCharsPerMessage', () => {
  const longText = 'A'.repeat(3000);
  const messages = [
    { role: 'user', text: 'Texto longo', timestamp: 1 },
    { role: 'assistant', text: longText, timestamp: 2 }
  ];

  const result = buildHistoryFallbackPrompt(messages, { maxCharsPerMessage: 500 });
  assert.ok(result.includes('... [conteúdo truncado para manter contexto]'));
  assert.ok(!result.includes('A'.repeat(501)));
});

test('buildHistoryFallbackPrompt respeita maxMessages e maxTotalChars descartando turnos mais antigos', () => {
  const messages = [];
  for (let i = 1; i <= 20; i++) {
    messages.push({ role: 'user', text: `Pergunta ${i}`, timestamp: i * 2 });
    messages.push({ role: 'assistant', agent: 'claude', text: `Resposta ${i}`, timestamp: i * 2 + 1 });
  }

  // Com limite de 6 mensagens, só deve conter perguntas e respostas 18, 19 e 20
  const result = buildHistoryFallbackPrompt(messages, { maxMessages: 6 });
  assert.ok(!result.includes('Pergunta 14'));
  assert.ok(result.includes('Pergunta 18'));
  assert.ok(result.includes('Resposta 20'));

  // Com maxTotalChars baixo, descarta as primeiras mensagens até caber
  const tightResult = buildHistoryFallbackPrompt(messages, { maxMessages: 6, maxTotalChars: 200 });
  assert.ok(tightResult.length <= 550); // Cabeçalho + rodapé (~280 chars) + mensagens que couberem (<= 200 chars)
  assert.ok(tightResult.includes('Resposta 20'));
});

test('Cenários integrados de fallback de histórico e montagem de prompt:', () => {
  const systemDirective = '[DIRETIVA_DO_SISTEMA]\nSeu nome é Kraken.\n[FIM_DA_DIRETIVA_DO_SISTEMA]\n\n';
  const userPrompt = 'Qual a próxima tarefa?';

  // Cenário 1: Troca de agente (antigravity -> claude)
  const sessionPrevAgy = {
    agent: 'antigravity',
    agyConvId: 'agy-1',
    messages: [
      { role: 'user', text: 'Iniciei a tarefa 1', timestamp: 1 },
      { role: 'assistant', agent: 'antigravity', text: 'Tarefa 1 iniciada com sucesso.', timestamp: 2 }
    ]
  };

  const isSwitchAgyToClaude = Boolean(sessionPrevAgy.agent && sessionPrevAgy.agent !== 'claude');
  const nativeIdAgyToClaude = resolveNativeSessionId('claude', sessionPrevAgy, '/workspace/app', { checkDisk: true });
  assert.equal(isSwitchAgyToClaude, true);
  assert.equal(nativeIdAgyToClaude, null);

  const fallbackBlock1 = buildHistoryFallbackPrompt(sessionPrevAgy.messages);
  assert.ok(fallbackBlock1.includes('Tarefa 1 iniciada'));

  const effectivePrompt1 = `${systemDirective}${fallbackBlock1}\n\n${userPrompt}`;
  assert.ok(effectivePrompt1.startsWith('[DIRETIVA_DO_SISTEMA]'));
  assert.ok(effectivePrompt1.includes('[HISTÓRICO_DA_CONVERSA_ANTERIOR]'));
  assert.ok(effectivePrompt1.endsWith(userPrompt));

  // Cenário 2: Mudança de CWD por Workspace Efêmero (claudeSessionCwd diferente do effectiveWorkDir)
  const sessionClaudeEphemeral = {
    agent: 'claude',
    claudeSessionId: 'claude-sess-ephemeral',
    claudeSessionCwd: '/tmp/kraken-workspaces/conv-123',
    messages: [
      { role: 'user', text: 'Edite o arquivo X', timestamp: 1 },
      { role: 'assistant', agent: 'claude', text: 'Arquivo X editado.', timestamp: 2 }
    ]
  };

  const nativeIdCwdMismatch = resolveNativeSessionId('claude', sessionClaudeEphemeral, '/workspace/KrakenBridge-Web');
  assert.equal(nativeIdCwdMismatch, null, 'CWD mismatch deve forçar nova sessão');

  const fallbackBlock2 = buildHistoryFallbackPrompt(sessionClaudeEphemeral.messages);
  assert.ok(fallbackBlock2.includes('Arquivo X editado.'));

  // Cenário 3: Mesma sessão e CWD com arquivo presente (retomada nativa limpa)
  const sessionClaudeResume = {
    agent: 'claude',
    claudeSessionId: 'sess-active',
    claudeSessionCwd: '/workspace/app',
    messages: [{ role: 'user', text: 'Oi', timestamp: 1 }]
  };
  const nativeIdResume = resolveNativeSessionId('claude', sessionClaudeResume, '/workspace/app');
  assert.equal(nativeIdResume, 'sess-active');
  const shouldInjectDirectiveResume = !nativeIdResume;
  assert.equal(shouldInjectDirectiveResume, false);

  // Cenário 4: Primeiro turno de conversa nova (sem mensagens anteriores)
  const newSession = { agent: 'claude', messages: [] };
  const fallbackEmpty = buildHistoryFallbackPrompt(newSession.messages);
  assert.equal(fallbackEmpty, '');
  const promptNew = `${systemDirective}${fallbackEmpty ? `${fallbackEmpty}\n\n` : ''}${userPrompt}`;
  assert.equal(promptNew, `${systemDirective}${userPrompt}`);
});
