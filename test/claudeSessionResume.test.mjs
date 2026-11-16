import test from 'node:test';
import assert from 'node:assert/strict';
import { createClaudeStreamTranslator } from '../dist-server/services/claudeStreamAdapter.js';
import { AGENT_DRIVERS, resolveNativeSessionId } from '../dist-server/routes/chat.js';

// Issue #188: o driver claude precisa retomar a sessão nativa entre turnos.

test('adapter emite claude_session uma única vez com session_id e cwd, sem tocar em conversation_id', () => {
  const t = createClaudeStreamTranslator();
  const init = t({ type: 'system', subtype: 'init', session_id: 'sess-1', cwd: '/workspace/app' });
  assert.deepEqual(init, [{ event: 'claude_session', session_id: 'sess-1', cwd: '/workspace/app' }]);
  assert.equal(init[0].conversation_id, undefined, 'não deve sobrescrever agyConvId');

  const again = t({ type: 'assistant', session_id: 'sess-1', message: { content: [{ type: 'text', text: 'oi' }] } });
  assert.ok(!again.some((e) => e.event === 'claude_session'), 'mesmo session_id não é reemitido');

  const result = t({ type: 'result', session_id: 'sess-1', result: 'oi' });
  assert.deepEqual(result.map((e) => e.event), ['result']);
});

test('adapter reemite claude_session quando o session_id muda', () => {
  const t = createClaudeStreamTranslator();
  t({ type: 'system', subtype: 'init', session_id: 'a' });
  const out = t({ type: 'result', session_id: 'b', result: '' });
  assert.equal(out[0].event, 'claude_session');
  assert.equal(out[0].session_id, 'b');
});

test('AGENT_DRIVERS.claude: buildArgs envia --resume quando há claudeSessionId', () => {
  const args = AGENT_DRIVERS.claude.buildArgs({ prompt: 'continua', claudeSessionId: 'sess-42' });
  const idx = args.indexOf('--resume');
  assert.ok(idx > -1, 'deve conter --resume');
  assert.equal(args[idx + 1], 'sess-42');
});

test('AGENT_DRIVERS.claude: buildArgs não envia --resume sem claudeSessionId nem usa agyConvId', () => {
  const args = AGENT_DRIVERS.claude.buildArgs({ prompt: 'primeiro', agyConvId: 'agy-1', claudeSessionId: null });
  assert.ok(!args.includes('--resume'));
  assert.ok(!args.includes('agy-1'));
});

test('resolveNativeSessionId usa a sessão nativa do agente ativo', () => {
  const session = { agyConvId: 'agy-1', claudeSessionId: 'cl-1', claudeSessionCwd: '/w/app' };
  assert.equal(resolveNativeSessionId('antigravity', session, '/w/app'), 'agy-1');
  assert.equal(resolveNativeSessionId('claude', session, '/w/app'), 'cl-1');
  assert.equal(resolveNativeSessionId('aider', session, '/w/app'), null);
  assert.equal(resolveNativeSessionId('claude', null, '/w/app'), null);
});

test('diretiva: primeiro turno do claude injeta; turnos seguintes não reinjetam', () => {
  // shouldInjectDirective = !resolveNativeSessionId(...)
  assert.equal(!resolveNativeSessionId('claude', {}, '/w/app'), true, 'sem sessão: injeta');
  assert.equal(!resolveNativeSessionId('claude', { claudeSessionId: 'cl-1', claudeSessionCwd: '/w/app' }, '/w/app'), false, 'com sessão: não reinjeta');
  // agyConvId de um turno anterior com AGY não deve suprimir a diretiva no Claude
  assert.equal(!resolveNativeSessionId('claude', { agyConvId: 'agy-1' }, '/w/app'), true);
});

test('resolveNativeSessionId ignora sessão do claude criada em outro cwd (workspace efêmero)', () => {
  const session = { claudeSessionId: 'cl-1', claudeSessionCwd: '/w/app' };
  assert.equal(resolveNativeSessionId('claude', session, '/tmp/ephemeral/conv'), null);
  assert.equal(resolveNativeSessionId('claude', { claudeSessionId: 'cl-1' }, '/qualquer'), 'cl-1', 'sem cwd registrado: retoma');
});
