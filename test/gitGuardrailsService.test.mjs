import assert from 'node:assert';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

// Carregar o serviço compilado ou testar via child_process/lógica
const scriptPath = join(process.cwd(), 'src/templates/git-guardrail.cjs');
const prePushHookPath = join(process.cwd(), 'src/templates/pre-push-hook.sh');

test('guardrails: deve validar a existência dos arquivos de template', () => {
  assert.strictEqual(existsSync(scriptPath), true, 'git-guardrail.cjs deve existir');
  assert.strictEqual(existsSync(prePushHookPath), true, 'pre-push-hook.sh deve existir');
});

test('guardrails: pre-push hook deve conter bloqueio determinístico para main e master', () => {
  const content = readFileSync(prePushHookPath, 'utf8');
  assert.match(content, /refs\/heads\/main\|refs\/heads\/master/);
  assert.match(content, /KRAKEN GIT GUARDRAIL BLOQUEOU O PUSH/);
});

test('guardrails: deve bloquear tentativas explícitas de push direto na main via script interceptador', () => {
  const dangerousCommands = [
    'git push origin main',
    'git push origin master',
    'git push --force origin main',
    'git push -f origin main',
    'git push origin HEAD:main',
    'git push origin HEAD:master',
    'cd /app && git push origin main',
  ];

  for (const cmd of dangerousCommands) {
    const inputPayload = JSON.stringify({
      tool_name: 'run_command',
      tool_input: { CommandLine: cmd },
    });

    const result = spawnSync('node', [scriptPath], {
      input: inputPayload,
      encoding: 'utf8',
    });

    assert.strictEqual(
      result.status,
      2,
      `Comando perigoso "${cmd}" deveria ter sido bloqueado com código de saída 2`
    );
    assert.match(
      result.stderr,
      /KRAKEN GIT GUARDRAIL BLOQUEOU ESTA AÇÃO/,
      `Comando perigoso "${cmd}" deve imprimir mensagem didática no stderr`
    );
  }
});

test('guardrails: deve permitir comandos git legítimos em branches de feature', () => {
  const allowedCommands = [
    'git status',
    'git diff',
    'git log -5',
    'git commit -m "feat: adicionar recurso"',
    'git push -u origin feat/#140-git-guardrails',
    'git push origin fix/#141-bugfix',
    'gh pr create --assignee @me --title "feat: teste"',
  ];

  for (const cmd of allowedCommands) {
    const inputPayload = JSON.stringify({
      tool_name: 'run_command',
      tool_input: { CommandLine: cmd },
    });

    const result = spawnSync('node', [scriptPath], {
      input: inputPayload,
      encoding: 'utf8',
    });

    assert.strictEqual(
      result.status,
      0,
      `Comando legítimo "${cmd}" deveria ter sido permitido (código 0), mas saiu com ${result.status}: ${result.stderr}`
    );
  }
});
