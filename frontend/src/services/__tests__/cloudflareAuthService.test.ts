// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

describe('CloudflareAuthService & Wrangler Integration (Issues #143 & #146)', () => {
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

  it('deve retornar authenticated=false e authMethod=none quando não houver credenciais', async () => {
    const { cloudflareAuthService } = await import('../../../../src/services/cloudflareAuthService');
    const status = await cloudflareAuthService.getStatus();
    expect(status.authenticated).toBe(false);
    expect(status.authMethod).toBe('none');
    expect(status.hasToken).toBe(false);
    expect(status.isOAuth).toBe(false);
  });

  it('deve validar API Token com sucesso e indicar authMethod=token', async () => {
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
    expect(status.authMethod).toBe('token');
    expect(status.isOAuth).toBe(false);
    expect(status.hasToken).toBe(true);
    expect(status.accountName).toBe('Kraken Org');
  });

  it('deve detectar e autenticar credenciais OAuth nativas do Wrangler em default.toml', async () => {
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/user/tokens/verify')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            result: { id: 'oauth-token-id', status: 'active' }
          })
        };
      }
      if (url.includes('/accounts')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            result: [{ id: 'cf-acc-oauth', name: 'OAuth Cloudflare Account' }]
          })
        };
      }
      if (url.includes('/user')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            result: { id: 'usr-oauth', email: 'oauth@kraken.test', username: 'oauthuser' }
          })
        };
      }
      return { ok: false, status: 404 };
    });

    vi.stubGlobal('fetch', mockFetch);

    const { cloudflareAuthService } = await import('../../../../src/services/cloudflareAuthService');
    await cloudflareAuthService.saveOAuthData({
      oauth_token: 'valid-oauth-access-token-123',
      refresh_token: 'valid-refresh-token-456',
      expiration_time: new Date(Date.now() + 3600 * 1000).toISOString()
    });

    const status = await cloudflareAuthService.getStatus();
    expect(status.authenticated).toBe(true);
    expect(status.authMethod).toBe('oauth');
    expect(status.isOAuth).toBe(true);
    expect(status.email).toBe('oauth@kraken.test');
    expect(status.accountName).toBe('OAuth Cloudflare Account');
    expect(status.accountId).toBe('cf-acc-oauth');
  });

  it('deve renovar token OAuth se expirado e atualizar default.toml', async () => {
    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/oauth2/token')) {
        return {
          ok: true,
          json: async () => ({
            access_token: 'new-refreshed-oauth-token',
            refresh_token: 'new-refresh-token-789',
            expires_in: 7200
          })
        };
      }
      if (url.includes('/user/tokens/verify')) {
        const authHeader = (init?.headers as Record<string, string>)?.['Authorization'] || '';
        if (authHeader.includes('new-refreshed-oauth-token')) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              result: { id: 'token-refreshed', status: 'active' }
            })
          };
        }
        return { ok: false, status: 401 };
      }
      if (url.includes('/accounts')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            result: [{ id: 'acc-refreshed', name: 'Refreshed Account' }]
          })
        };
      }
      if (url.includes('/user')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            result: { id: 'usr-refreshed', email: 'refreshed@kraken.test' }
          })
        };
      }
      return { ok: false, status: 404 };
    });

    vi.stubGlobal('fetch', mockFetch);

    const { cloudflareAuthService } = await import('../../../../src/services/cloudflareAuthService');
    await cloudflareAuthService.saveOAuthData({
      oauth_token: 'expired-token',
      refresh_token: 'my-refresh-token',
      expiration_time: new Date(Date.now() - 1000).toISOString()
    });

    const status = await cloudflareAuthService.getStatus();
    expect(status.authenticated).toBe(true);
    expect(status.authMethod).toBe('oauth');
    expect(status.email).toBe('refreshed@kraken.test');

    const updated = await cloudflareAuthService.getStoredOAuthData();
    expect(updated?.oauth_token).toBe('new-refreshed-oauth-token');
  });

  it('deve gerenciar preferência de keyring no Wrangler', async () => {
    const { cloudflareAuthService } = await import('../../../../src/services/cloudflareAuthService');

    expect(await cloudflareAuthService.isKeyringEnabled()).toBe(false);
    await cloudflareAuthService.setKeyringPreference(true);
    expect(await cloudflareAuthService.isKeyringEnabled()).toBe(true);
    await cloudflareAuthService.setKeyringPreference(false);
    expect(await cloudflareAuthService.isKeyringEnabled()).toBe(false);
  });

  it('deve alternar para modo OAuth através de switchToOAuth removendo tokens manuais', async () => {
    process.env.CLOUDFLARE_API_TOKEN = 'manual-token';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'manual-acc';

    const { cloudflareAuthService } = await import('../../../../src/services/cloudflareAuthService');
    const result = await cloudflareAuthService.switchToOAuth();

    expect(result.success).toBe(true);
    expect(process.env.CLOUDFLARE_API_TOKEN).toBeUndefined();
    expect(process.env.CLOUDFLARE_ACCOUNT_ID).toBeUndefined();
  });

  it('deve realizar logout completo removendo tokens, default.toml e variáveis', async () => {
    process.env.CLOUDFLARE_API_TOKEN = 'token-to-delete';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acc-to-delete';

    const { cloudflareAuthService } = await import('../../../../src/services/cloudflareAuthService');
    await cloudflareAuthService.saveOAuthData({
      oauth_token: 'oauth-to-delete',
      refresh_token: 'ref-to-delete'
    });

    const res = await cloudflareAuthService.logout();

    expect(res.success).toBe(true);
    expect(process.env.CLOUDFLARE_API_TOKEN).toBeUndefined();
    expect(process.env.CLOUDFLARE_ACCOUNT_ID).toBeUndefined();
    expect(await cloudflareAuthService.getStoredOAuthData()).toBeNull();
  });
});
