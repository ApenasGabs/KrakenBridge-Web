// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { isPathAllowed, getAllowedDirectories } from '../../../../src/services/filesService';

describe('Files Service - Path Traversal & Security Validation (Issue #50)', () => {
  let tempDir: string;
  let allowedTestFile: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `kraken-files-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    allowedTestFile = path.join(tempDir, 'sample_report.md');
    fs.writeFileSync(allowedTestFile, '# Relatório de Análise\nConteúdo seguro.', 'utf8');
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('deve listar diretórios permitidos incluindo tmpdir, workspace e dev cwd', () => {
    const allowed = getAllowedDirectories();
    expect(allowed.length).toBeGreaterThan(0);
    expect(allowed).toContain(path.resolve(os.tmpdir()).toLowerCase());
    expect(allowed).toContain(path.resolve(process.cwd()).toLowerCase());
  });

  it('deve permitir acesso a arquivos dentro de diretórios autorizados', () => {
    expect(isPathAllowed(allowedTestFile)).toBe(true);
    expect(isPathAllowed(path.join(process.cwd(), 'package.json'))).toBe(true);
  });

  it('deve bloquear tentativas de path traversal para fora dos diretórios permitidos', () => {
    // Tentativa de escapar via ..
    const escapeAttempt = path.join(os.tmpdir(), '..', '..', 'etc', 'shadow');
    expect(isPathAllowed(escapeAttempt)).toBe(false);

    // Tentativa direta em arquivos de sistema Linux
    expect(isPathAllowed('/etc/shadow')).toBe(false);
    expect(isPathAllowed('/etc/passwd')).toBe(false);

    // Tentativa em diretórios de sistema Windows
    expect(isPathAllowed('C:\\Windows\\System32\\config\\SAM')).toBe(false);
    expect(isPathAllowed('C:\\Windows\\System32\\drivers\\etc\\hosts')).toBe(false);
  });

  it('deve bloquear bypass por prefixo de nome de diretório similar', () => {
    const maliciousPrefix = path.resolve(process.cwd()) + '-malicious/hack.txt';
    expect(isPathAllowed(maliciousPrefix)).toBe(false);
  });

  it('deve retornar false para caminhos vazios, nulos ou inválidos', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isPathAllowed(null as any)).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isPathAllowed(undefined as any)).toBe(false);
    expect(isPathAllowed('')).toBe(false);
  });
});
