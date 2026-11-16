import test from 'node:test';
import assert from 'node:assert/strict';
import { createClaudeStreamTranslator, isClaudeStreamLine, mapClaudeToolInput } from '../dist-server/services/claudeStreamAdapter.js';

// Issue #184: narração e ferramentas do Claude precisam chegar à UI em tempo real.

test('isClaudeStreamLine reconhece só linhas do stream-json do Claude', () => {
  assert.equal(isClaudeStreamLine({ type: 'assistant', message: { content: [] } }), true);
  assert.equal(isClaudeStreamLine({ type: 'result', result: 'ok' }), true);
  assert.equal(isClaudeStreamLine({ event: 'step_update' }), false);
  assert.equal(isClaudeStreamLine(null), false);
});

test('traduz narração, tool_use e tool_result para o schema do AGY', () => {
  const t = createClaudeStreamTranslator();
  const narr = t({ type: 'assistant', message: { content: [{ type: 'text', text: 'Vou listar os arquivos.' }] } });
  assert.deepEqual(narr, [{ event: 'step_update', step_update: { step_type: 'agent_response', text_delta: 'Vou listar os arquivos.' } }]);

  const use = t({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'ls', description: 'Lista' } }] } });
  assert.equal(use.length, 1, 'tool_use narrado não deve gerar aviso');
  assert.equal(use[0].step_update.step_type, 'tool');
  assert.equal(use[0].step_update.state, 'RUNNING');
  assert.equal(use[0].step_update.step_index, 0);
  assert.equal(use[0].step_update.tool_info.parameters.CommandLine, 'ls');

  const res = t({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: [{ type: 'text', text: 'a.txt' }] }] } });
  assert.equal(res[0].step_update.state, 'DONE');
  assert.equal(res[0].step_update.step_index, 0);
  assert.equal(res[0].step_update.tool_info.output, 'a.txt');

  const err = t({ type: 'assistant', message: { content: [{ type: 'text', text: 'Agora leio.' }, { type: 'tool_use', id: 'tu_2', name: 'Read', input: { file_path: '/x' } }] } });
  assert.equal(err[0].step_update.text_delta, '\n\nAgora leio.', 'blocos de narração consecutivos são separados');
  const errRes = t({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_2', content: 'boom', is_error: true }] } });
  assert.equal(errRes[0].step_update.state, 'ERROR');
  assert.equal(errRes[0].step_update.step_index, 1);
});

test('tool_use sem narração desde a ferramenta anterior gera guardrail_warning silent_tool_call', () => {
  const t = createClaudeStreamTranslator();
  const first = t({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'pensando' }, { type: 'tool_use', id: 'a', name: 'Bash', input: {} }] } });
  assert.ok(first.some((e) => e.event === 'guardrail_warning' && e.kind === 'silent_tool_call' && e.tool_name === 'Bash'), 'thinking não conta como narração');

  t({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a', content: 'ok' }] } });
  const second = t({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'b', name: 'Write', input: { file_path: '/f' } }] } });
  assert.equal(second[0].event, 'guardrail_warning');
  assert.equal(second[1].step_update.tool_info.parameters.TargetFile, '/f');
});

test('evento result vira result com response e usage', () => {
  const t = createClaudeStreamTranslator();
  const out = t({ type: 'result', subtype: 'success', result: 'Pronto', usage: { input_tokens: 1 } });
  assert.deepEqual(out, [{ event: 'result', result: { response: 'Pronto', usage: { input_tokens: 1 } }, is_error: false }]);
  // Issue #188: init vira claude_session (para --resume), nunca conversation_id/agyConvId
  assert.deepEqual(t({ type: 'system', subtype: 'init', session_id: 's' }), [{ event: 'claude_session', session_id: 's' }], 'init do Claude não deve virar agyConvId');
});

test('mapClaudeToolInput mapeia ferramentas MCP', () => {
  const p = mapClaudeToolInput('mcp__ai-memory__memory_query', { query: 'x' });
  assert.equal(p.ServerName, 'ai-memory');
  assert.equal(p.ToolName, 'memory_query');
});
