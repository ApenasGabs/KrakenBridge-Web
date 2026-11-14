import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_DRIVERS } from '../dist-server/routes/chat.js';

test('AGENT_DRIVERS.claude: buildEnv deve injetar IS_SANDBOX=1 para contornar bloqueio de root no Docker', () => {
  const env = AGENT_DRIVERS.claude.buildEnv({
    ANTHROPIC_API_KEY: 'test-key',
    PATH: '/usr/bin'
  });

  assert.equal(env.IS_SANDBOX, '1', 'IS_SANDBOX deve ser "1" para contornar restrição de root/sudo da CLI do Claude');
  assert.equal(env.ANTHROPIC_API_KEY, 'test-key');
  assert.equal(env.CLAUDE_CONFIG_DIR, '/root/.claude');
  assert.equal(env.HOME, '/root');
});

test('AGENT_DRIVERS.claude: buildArgs deve incluir prompt, --dangerously-skip-permissions e modelo', () => {
  const args = AGENT_DRIVERS.claude.buildArgs({
    prompt: 'Olá Claude',
    model: 'claude-3-opus-20240229',
    skipPermissions: true
  });

  assert.ok(args.includes('-p'), 'Deve conter flag -p');
  assert.ok(args.includes('Olá Claude'), 'Deve conter o prompt');
  assert.ok(args.includes('--dangerously-skip-permissions'), 'Deve conter flag de permissões');
  assert.ok(args.includes('--model'), 'Deve conter flag --model');
  assert.ok(args.includes('claude-3-opus-20240229'), 'Deve conter o modelo especificado');
});
