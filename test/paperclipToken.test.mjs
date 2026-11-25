import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kraken-token-'));
process.env.DATA_DIR = dir;
delete process.env.PAPERCLIP_API_TOKEN;
const { getPaperclipApiToken } = await import('../dist-server/utils/paperclipToken.js');
after(() => fs.rm(dir, { recursive: true, force: true }));

test('token ausente gera aviso claro no log, uma vez', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  assert.equal(getPaperclipApiToken(), '');
  assert.equal(getPaperclipApiToken(), '');
  assert.equal(warn.mock.callCount(), 1);
});

test('token lido do arquivo privado em DATA_DIR a cada chamada, sem reiniciar o servidor', async () => {
  await fs.writeFile(path.join(dir, 'paperclip_token'), 'primeiro\n');
  assert.equal(getPaperclipApiToken(), 'primeiro');
  await fs.writeFile(path.join(dir, 'paperclip_token'), 'segundo\n');
  assert.equal(getPaperclipApiToken(), 'segundo');
});

test('PAPERCLIP_API_TOKEN tem precedência', () => {
  process.env.PAPERCLIP_API_TOKEN = 'do-ambiente';
  assert.equal(getPaperclipApiToken(), 'do-ambiente');
  delete process.env.PAPERCLIP_API_TOKEN;
});

test('nenhum token do Paperclip fixo no código', async () => {
  const files = await fs.readdir('src', { recursive: true });
  for (const file of files.filter((f) => f.endsWith('.ts') || f.endsWith('.cjs'))) {
    assert.doesNotMatch(await fs.readFile(path.join('src', file), 'utf8'), /pcp_[0-9a-f]{20,}/, file);
  }
});
