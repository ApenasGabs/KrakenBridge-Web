import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getGoogleClientId, getGoogleClientSecret } from '../../../../src/config/authConfig';
import { api } from '../api';

describe('Auth - Google Antigravity OAuth Client ID & Fallback (Issue #63 & #79)', () => {
  const originalEnvClientId = process.env.GOOGLE_CLIENT_ID;
  const originalEnvClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  beforeEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  afterEach(() => {
    if (originalEnvClientId !== undefined) {
      process.env.GOOGLE_CLIENT_ID = originalEnvClientId;
    } else {
      delete process.env.GOOGLE_CLIENT_ID;
    }
    if (originalEnvClientSecret !== undefined) {
      process.env.GOOGLE_CLIENT_SECRET = originalEnvClientSecret;
    } else {
      delete process.env.GOOGLE_CLIENT_SECRET;
    }
    vi.restoreAllMocks();
  });

  it('deve usar o Client ID oficial do Google Antigravity como fallback quando a variável de ambiente não estiver definida', () => {
    const clientId = getGoogleClientId();
    expect(clientId).toBe('1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com');
  });

  it('deve respeitar GOOGLE_CLIENT_ID customizado quando configurado no ambiente', () => {
    process.env.GOOGLE_CLIENT_ID = 'custom-client-id.apps.googleusercontent.com';
    const clientId = getGoogleClientId();
    expect(clientId).toBe('custom-client-id.apps.googleusercontent.com');
  });

  it('deve retornar o secret oficial do Google Antigravity como fallback padrão quando GOOGLE_CLIENT_SECRET não estiver definido', () => {
    const secret = getGoogleClientSecret();
    expect(secret.length).toBeGreaterThan(20);
    expect(secret.slice(0, 6)).toBe('GOCSPX');
  });

  it('deve respeitar GOOGLE_CLIENT_SECRET quando definido no ambiente', () => {
    process.env.GOOGLE_CLIENT_SECRET = 'secret-12345';
    const secret = getGoogleClientSecret();
    expect(secret).toBe('secret-12345');
  });

  it('deve lançar erro no frontend (api.startAntigravityAuth) quando o backend responder com status 400 ou erro', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ status: 'error', error: 'GOOGLE_CLIENT_ID não configurado no servidor.' })
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(api.startAntigravityAuth(true)).rejects.toThrow('GOOGLE_CLIENT_ID não configurado no servidor.');
  });

  it('deve retornar dados de sucesso com authUrl quando o backend responder 200 OK', async () => {
    const expectedUrl = 'https://accounts.google.com/o/oauth2/auth?client_id=1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'waiting_for_code', authUrl: expectedUrl })
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await api.startAntigravityAuth(true);
    expect(res.authUrl).toBe(expectedUrl);
  });

  it('deve retornar resposta detalhada de erro ao submeter código inválido via api.submitAntigravityCode', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({
        success: false,
        status: 'error',
        error: 'Google OAuth Error: Malformed auth code.',
        message: 'Google OAuth Error: Malformed auth code.'
      })
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await api.submitAntigravityCode('codigo_invalido');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Google OAuth Error: Malformed auth code.');
    expect(res.message).toBe('Google OAuth Error: Malformed auth code.');
  });

  it('deve retornar sucesso e email ao submeter código válido via api.submitAntigravityCode', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        status: 'success',
        email: 'dev@gmail.com',
        message: 'Conta dev@gmail.com autenticada e ativada com sucesso!'
      })
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await api.submitAntigravityCode('4/0AY0e-valid_code');
    expect(res.success).toBe(true);
    expect(res.email).toBe('dev@gmail.com');
  });
});
