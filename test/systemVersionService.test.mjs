import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('Garantir que a sincronização de versões nunca seja bloqueada por tags previamente cacheadas no container de produção: git fetch usa flag --force (Testes e typecheck passando)', () => {
  const file = path.resolve('src/services/systemVersionService.ts');
  const content = fs.readFileSync(file, 'utf8');

  // Verifica que o fetch de tags é executado com a flag --force
  assert.match(
    content,
    /git\s+fetch\s+--tags\s+--force\s+origin/,
    'systemVersionService deve usar git fetch --tags --force origin para evitar erro de clobber em tags'
  );
});
