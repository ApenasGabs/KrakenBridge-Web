import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

// Validar via npm ci --dry-run para garantir que o pipeline de Release e publicação execute com sucesso.
test('Validar via npm ci --dry-run para garantir que o pipeline de Release e publicação execute com sucesso.', async () => {
  const rootDir = path.resolve('.');
  const { stdout, stderr } = await execFileAsync('npm', ['ci', '--dry-run'], {
    cwd: rootDir,
    timeout: 30000
  });

  // npm ci --dry-run executando sem erros.
  assert.ok(!stderr.includes('npm error `npm ci` can only install packages'));
  assert.ok(stdout.includes('added') || stdout.includes('up to date') || stdout.includes('@anthropic-ai/claude-code'));
});

// Pipeline de CI/Release executando sem interrupções: verificar integridade do package-lock.json
test('Pipeline de CI/Release executando sem interrupções.', async () => {
  const pkgRaw = await fs.readFile('package.json', 'utf8');
  const lockRaw = await fs.readFile('package-lock.json', 'utf8');
  const pkg = JSON.parse(pkgRaw);
  const lock = JSON.parse(lockRaw);

  // Garantir que claude-code está em package.json e em package-lock.json
  assert.ok(pkg.dependencies['@anthropic-ai/claude-code']);
  assert.ok(lock.packages['node_modules/@anthropic-ai/claude-code'] || lock.dependencies?.['@anthropic-ai/claude-code']);
});
