import { describe, it, expect, afterEach, vi } from 'vitest';
import { api } from '../api';

describe('Auth - Claude Code CLI OAuth & Credentials (Issue #166)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Testes unitários/integração cobrindo os fluxos de início, submissão de código e status', async () => {
    // Início (startAuth)
    const mockAuthUrl = 'https://claude.com/cai/oauth/authorize?code=true';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'waiting_for_code', authUrl: mockAuthUrl })
    });
    vi.stubGlobal('fetch', mockFetch);
    const startRes = await api.startClaudeAuth(true);
    expect(startRes.status).toBe('waiting_for_code');

    // Submissão de código (submitCode)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, email: 'claude@test.com' })
    });
    const submitRes = await api.submitClaudeCode('code_123');
    expect(submitRes.success).toBe(true);

    // Status (getClaudeStatus)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ authenticated: true, authMethod: 'oauth' })
    });
    const statusRes = await api.getClaudeStatus();
    expect(statusRes.authenticated).toBe(true);
  });

  it('deve retornar authUrl ao iniciar o fluxo OAuth via api.startClaudeAuth', async () => {
    const mockAuthUrl = 'https://claude.com/cai/oauth/authorize?code=true&client_id=test-id';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'waiting_for_code',
        authUrl: mockAuthUrl,
        message: 'URL gerada'
      })
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await api.startClaudeAuth(true);
    expect(res.status).toBe('waiting_for_code');
    expect(res.authUrl).toBe(mockAuthUrl);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/claude/start'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ force: true })
      })
    );
  });

  it('deve lançar erro quando api.startClaudeAuth falhar', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ status: 'error', error: 'Falha ao iniciar CLI' })
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(api.startClaudeAuth(true)).rejects.toThrow('Falha ao iniciar CLI');
  });

  it('deve submeter código com sucesso via api.submitClaudeCode', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        status: 'success',
        email: 'user@example.com',
        message: 'Claude Code conectado com sucesso!'
      })
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await api.submitClaudeCode('mock_oauth_code_123');
    expect(res.success).toBe(true);
    expect(res.email).toBe('user@example.com');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/claude/submit-code'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ code: 'mock_oauth_code_123' })
      })
    );
  });

  it('deve consultar status via api.getClaudeStatus', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        authenticated: true,
        authMethod: 'oauth',
        hasToken: true,
        hasKey: false,
        email: 'claude-user@domain.com'
      })
    });
    vi.stubGlobal('fetch', mockFetch);

    const status = await api.getClaudeStatus();
    expect(status.authenticated).toBe(true);
    expect(status.authMethod).toBe('oauth');
    expect(status.email).toBe('claude-user@domain.com');
  });

  it('deve desconectar com sucesso via api.logoutClaude', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: 'Claude Code desconectado com sucesso.'
      })
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await api.logoutClaude();
    expect(res.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/claude/logout'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
