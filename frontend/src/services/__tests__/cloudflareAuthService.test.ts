// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

describe('CloudflareAuthService & Wrangler Integration (Issue #143)', () => {
  let tmpConfigDir: string;
  let originalConfigDir: string | undefined;
  let originalToken: string | undefined;
  let originalAccountId: string | undefined;

  beforeEach(async () => {
    tmpConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kraken-cf-test-'));
    originalConfigDir = process.env.CLOUDFLARE_CONFIG_DIR;
    originalToken = process.env.CLOUDFLARE_API_TOKEN;
    originalAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    process.env.CLOUDFLARE_CONFIG_DIR = tmpConfigDir;
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
  });

  afterEach(async () => {
    if (originalConfigDir !== undefined) {
      process.env.CLOUDFLARE_CONFIG_DIR = originalConfigDir;
    } else {
      delete process.env.CLOUDFLARE_CONFIG_DIR;
    }

    if (originalToken !== undefined) {
      process.env.CLOUDFLARE_API_TOKEN = originalToken;
    } else {
      delete process.env.CLOUDFLARE_API_TOKEN;
    }

    if (originalAccountId !== undefined) {
      process.env.CLOUDFLARE_ACCOUNT_ID = originalAccountId;
    } else {
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
    }

    vi.restoreAllMocks();
    try {
      await fs.rm(tmpConfigDir, { recursive: true, force: true });
    } catch {}
  });

  it('deve retornar authenticated=false quando não houver token configurado', async () => {
    const { cloudflareAuthService } = await import('../../../../src/services/cloudflareAuthService');
    const status = await cloudflareAuthService.getStatus();
    expect(status.authenticated).toBe(false);
    expect(status.hasToken).toBe(false);
  });

  it('deve validar token com sucesso contra a API da Cloudflare e retornar dados da conta', async () => {
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/user/tokens/verify')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            result: { id: 'token-123', status: 'active' }
          })
        };
      }
      if (url.includes('/accounts')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            result: [{ id: 'acc-999', name: 'Kraken Org' }]
          })
        };
      }
      if (url.includes('/user')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            result: { id: 'usr-111', email: 'dev@kraken.test', username: 'krakendev' }
          })
        };
      }
      return { ok: false, status: 404 };
    });

    vi.stubGlobal('fetch', mockFetch);

    const { cloudflareAuthService } = await import('../../../../src/services/cloudflareAuthService');
    const saved = await cloudflareAuthService.saveToken('test-cf-token-abc', 'acc-999');

    expect(saved.success).toBe(true);
    expect(saved.accountId).toBe('acc-999');
    expect(saved.accountName).toBe('Kraken Org');
    expect(saved.email).toBe('dev@kraken.test');
    expect(process.env.CLOUDFLARE_API_TOKEN).toBe('test-cf-token-abc');

    const status = await cloudflareAuthService.getStatus();
    expect(status.authenticated).toBe(true);
    expect(status.hasToken).toBe(true);
    expect(status.accountName).toBe('Kraken Org');
  });

  it('deve rejeitar e lançar erro se o token for inválido na API da Cloudflare', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ success: false, errors: [{ code: 1000, message: 'Invalid token' }] })
    }));

    vi.stubGlobal('fetch', mockFetch);

    const { cloudflareAuthService } = await import('../../../../src/services/cloudflareAuthService');
    await expect(cloudflareAuthService.saveToken('invalid-token')).rejects.toThrow('Token da Cloudflare inválido ou não autorizado.');
  });

  it('deve realizar logout e remover variáveis de ambiente e arquivos de configuração', async () => {
    process.env.CLOUDFLARE_API_TOKEN = 'token-to-delete';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acc-to-delete';

    const { cloudflareAuthService } = await import('../../../../src/services/cloudflareAuthService');
    const res = await cloudflareAuthService.logout();

    expect(res.success).toBe(true);
    expect(process.env.CLOUDFLARE_API_TOKEN).toBeUndefined();
    expect(process.env.CLOUDFLARE_ACCOUNT_ID).toBeUndefined();
  });
});
