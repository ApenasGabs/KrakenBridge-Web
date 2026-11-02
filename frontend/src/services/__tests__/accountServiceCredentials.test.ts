// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

describe('AccountService - Git Credentials Isolation & Inheritance (Issue #122)', () => {
  let tmpDataDir: string;
  let originalDataDir: string | undefined;

  beforeEach(async () => {
    tmpDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kraken-acc-test-'));
    originalDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = tmpDataDir;
  });

  afterEach(async () => {
    if (originalDataDir !== undefined) {
      process.env.DATA_DIR = originalDataDir;
    } else {
      delete process.env.DATA_DIR;
    }
    try {
      await fs.rm(tmpDataDir, { recursive: true, force: true });
    } catch {}
  });

  it('deve retornar HOME padr?o quando nenhum email for fornecido', async () => {
    const { accountService } = await import('../../../../src/services/accountService');
    const home = await accountService.prepareAccountHome(null);
    expect(home).toBe(process.env.HOME || '/root');
  });

  it('deve propagar links de .config, .gitconfig e .ssh no accountHome (Issue #122)', async () => {
    const { accountService } = await import('../../../../src/services/accountService');

    // Simula conta armazenada no tmpDataDir
    const testEmail = 'dev@apenasgabs.dev';
    const accountsDir = path.join(tmpDataDir, 'accounts');
    await fs.mkdir(accountsDir, { recursive: true });
    const accountFilePath = path.join(accountsDir, 'dev_apenasgabs.dev.json');
    await fs.writeFile(
      accountFilePath,
      JSON.stringify({ email: testEmail, raw: 'oauth-token-test-123' })
    );

    const accountHome = await accountService.prepareAccountHome(testEmail);
    expect(accountHome).toContain('dev_apenasgabs.dev');

    const cliDir = path.join(accountHome, '.gemini', 'antigravity-cli');
    const tokenExists = await fs.access(path.join(cliDir, 'antigravity-oauth-token')).then(() => true).catch(() => false);
    expect(tokenExists).toBe(true);

    // Valida que o m?todo vincula .config, .gitconfig e .ssh caso existam em /root
    for (const item of ['.config', '.gitconfig', '.ssh']) {
      const targetPath = path.join(accountHome, item);
      const rootExists = await fs.access(path.join('/root', item)).then(() => true).catch(() => false);
      if (rootExists) {
        const linkExists = await fs.lstat(targetPath).then(() => true).catch(() => false);
        expect(linkExists).toBe(true);
      }
    }
  });
});
