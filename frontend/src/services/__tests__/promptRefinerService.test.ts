// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  PromptRefinerService,
  RefineValidationError,
  RefineCancelledError,
  RefineProvidersExhaustedError,
  maskSecrets,
  detectRelevantSkills,
  cleanRefinedOutput,
  DEFAULT_GROQ_MODEL
} from '../../../../src/services/promptRefinerService';
import { parseDotEnv, loadDotEnvFiles } from '../../../../src/utils/envLoader';

describe('PromptRefinerService & EnvLoader (Issue #103)', () => {
  const savedEnv = { ...process.env };
  let tempEnvPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_MODEL;
    delete process.env.AISTUDIO_API_KEY;
    delete process.env.GEMINI_API_KEY;
    tempEnvPath = path.join(os.tmpdir(), `kraken-env-test-${Date.now()}-${Math.random()}.env`);
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    try {
      if (fs.existsSync(tempEnvPath)) fs.unlinkSync(tempEnvPath);
    } catch {
      // ignora erro de limpeza de arquivo temporário
    }
  });

  it('parseDotEnv e loadDotEnvFiles devem carregar chaves ausentes sem sobrescrever envs já definidas', () => {
    fs.writeFileSync(
      tempEnvPath,
      '# comentário\nGROQ_API_KEY="mock_groq_from_file_12345"\nexport GROQ_MODEL=\'openai/gpt-oss-20b\'\nOPENAI_API_KEY=from_file\n',
      'utf8'
    );
    process.env.OPENAI_API_KEY = 'already_set_in_container';
    process.env.GROQ_API_KEY = '';

    const parsed = parseDotEnv(fs.readFileSync(tempEnvPath, 'utf8'));
    expect(parsed.GROQ_API_KEY).toBe('mock_groq_from_file_12345');
    expect(parsed.GROQ_MODEL).toBe('openai/gpt-oss-20b');

    loadDotEnvFiles([tempEnvPath]);
    expect(process.env.GROQ_API_KEY).toBe('mock_groq_from_file_12345');
    expect(process.env.OPENAI_API_KEY).toBe('already_set_in_container');
  });

  it('maskSecrets deve mascarar tokens da Groq, GitHub, AI Studio, OpenAI e Bearer antes do envio externo', () => {
    // Monta tokens de teste dinamicamente para evitar falsos positivos de secret scanners no GitHub
    const dummyGroq = ['gsk_', '1234567890abcdefghij123456'].join('');
    const dummyGithub = ['ghp_', 'abcdefghijklmnopqrstuvwxyz123456'].join('');
    const raw =
      `Configure minha chave ${dummyGroq} e token ${dummyGithub} com Authorization: Bearer superSecretJwtToken123456789 e api_key=mySecretKeyValue12345`;
    const { masked, count } = maskSecrets(raw);

    expect(count).toBeGreaterThanOrEqual(4);
    expect(masked).not.toContain('1234567890abcdefghij123456');
    expect(masked).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
    expect(masked).not.toContain('superSecretJwtToken123456789');
    expect(masked).not.toContain('mySecretKeyValue12345');
    expect(masked).toContain('[SECRET_REDACTED]');
  });

  it('detectRelevantSkills deve sugerir apenas skills instaladas correspondentes ao rascunho', () => {
    const installed = new Set(['ux-testing', 'debug-issue', 'github-issues', 'framer-motion-react']);
    const skills = detectRelevantSkills(
      'Preciso corrigir um bug de layout responsivo mobile 375px e abrir uma issue',
      undefined,
      installed
    );

    expect(skills).toContain('ux-testing');
    expect(skills).toContain('debug-issue');
    expect(skills).toContain('github-issues');
    expect(skills).not.toContain('framer-motion-react');
  });

  it('deve rejeitar rascunhos vazios ou curtos demais (< 5 chars)', async () => {
    const service = new PromptRefinerService({
      fetchFn: vi.fn(),
      runAgyFn: vi.fn(),
      installedSkills: new Set()
    });

    await expect(service.refinePrompt({ draft: '   ' })).rejects.toBeInstanceOf(RefineValidationError);
    await expect(service.refinePrompt({ draft: 'oi' })).rejects.toBeInstanceOf(RefineValidationError);
  });

  it('deve usar Groq (openai/gpt-oss-20b) em 1 única tentativa e mascarar segredos no payload enviado', async () => {
    process.env.GROQ_API_KEY = 'mock_groq_valid_key_12345';
    process.env.GEMINI_API_KEY = 'mock_gemini_valid_key_12345';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: '🎯 Objetivo: Evitar duplicidade ao clicar duas vezes em salvar no estoque.'
            }
          }
        ]
      })
    });
    const agyMock = vi.fn();

    const service = new PromptRefinerService({
      fetchFn: fetchMock as unknown as typeof fetch,
      runAgyFn: agyMock,
      installedSkills: new Set(['debug-issue', 'ux-testing'])
    });

    const dummySecret = ['ghp_', 'secretTokenShouldNeverLeaveHost1234'].join('');
    const res = await service.refinePrompt({
      draft: `corrige o bug do botão salvar com token ${dummySecret} no mobile`,
      chatMode: 'agent',
      project: 'meu-estoque'
    });

    expect(res.provider).toBe('groq');
    expect(res.model).toBe(DEFAULT_GROQ_MODEL);
    expect(res.maskedSecretsCount).toBe(1);
    expect(res.skills).toEqual(['ux-testing', 'debug-issue']);
    expect(res.refined).toContain('🛠️ Skills sugeridas: ux-testing, debug-issue');

    // Chamou apenas Groq (1 chamada HTTP, 0 chamadas agy)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(agyMock).not.toHaveBeenCalled();

    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://api.groq.com/openai/v1/chat/completions');
    const sentBody = JSON.parse(calledInit.body);
    expect(sentBody.model).toBe('openai/gpt-oss-20b');
    expect(sentBody.reasoning_effort).toBe('low');
    expect(calledInit.body).not.toContain('secretTokenShouldNeverLeaveHost1234');
    expect(calledInit.body).toContain('[SECRET_REDACTED]');
  });

  it('deve cair para AI Studio (1x) quando Groq retornar 429, passando chave no header x-goog-api-key', async () => {
    process.env.GROQ_API_KEY = 'mock_groq_quota_exceeded_12345';
    process.env.GEMINI_API_KEY = 'mock_gemini_fallback_12345';

    const fetchMock = vi
      .fn()
      // 1ª chamada: Groq falha com 429
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: 'rate_limit_exceeded' })
      })
      // 2ª chamada: AI Studio responde 200
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '```markdown\n🎯 Objetivo: Ajustar filtro de busca.\n```' }]
              }
            }
          ]
        })
      });

    const agyMock = vi.fn();
    const service = new PromptRefinerService({
      fetchFn: fetchMock as unknown as typeof fetch,
      runAgyFn: agyMock,
      installedSkills: new Set()
    });

    const res = await service.refinePrompt({
      draft: 'quero ajustar o filtro de busca da listagem principal'
    });

    expect(res.provider).toBe('aistudio');
    expect(res.refined).toBe('🎯 Objetivo: Ajustar filtro de busca.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(agyMock).not.toHaveBeenCalled();

    const [aiStudioUrl, aiStudioInit] = fetchMock.mock.calls[1];
    expect(aiStudioUrl).toContain('generativelanguage.googleapis.com');
    expect(aiStudioUrl).not.toContain('mock_gemini_fallback_12345');
    expect(aiStudioInit.headers['x-goog-api-key']).toBe('mock_gemini_fallback_12345');
  });

  it('deve pular chaves ausentes e cair para agy CLI one-shot sem loop de retries', async () => {
    // Passa um arquivo .env vazio via WORKSPACE_DIR temporário para garantir zero chaves no ambiente do teste
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kraken-no-keys-'));
    const prevCwd = process.cwd();
    process.chdir(emptyDir);
    process.env.WORKSPACE_DIR = emptyDir;

    try {
      const fetchMock = vi.fn();
      const agyMock = vi.fn().mockResolvedValue('🎯 Objetivo: Criar endpoint de saúde.');

      const service = new PromptRefinerService({
        fetchFn: fetchMock as unknown as typeof fetch,
        runAgyFn: agyMock,
        installedSkills: new Set()
      });

      const res = await service.refinePrompt({
        draft: 'cria um endpoint simples de healthcheck na api'
      });

      expect(res.provider).toBe('agy');
      expect(res.refined).toBe('🎯 Objetivo: Criar endpoint de saúde.');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(agyMock).toHaveBeenCalledTimes(1);
      expect(res.attempts.map((a) => `${a.provider}:${a.status}`)).toEqual([
        'groq:skipped',
        'aistudio:skipped',
        'agy:ok'
      ]);
    } finally {
      process.chdir(prevCwd);
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('deve encerrar após no máximo 1 tentativa por provider quando todos falharem (sem loop infinito)', async () => {
    process.env.GROQ_API_KEY = 'mock_groq_fail_key_12345';
    process.env.AISTUDIO_API_KEY = 'mock_aistudio_fail_key_12345';

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const agyMock = vi.fn().mockRejectedValue(new Error('agy unavailable'));

    const service = new PromptRefinerService({
      fetchFn: fetchMock as unknown as typeof fetch,
      runAgyFn: agyMock,
      installedSkills: new Set()
    });

    await expect(
      service.refinePrompt({ draft: 'refatorar componente de tabela de pedidos' })
    ).rejects.toBeInstanceOf(RefineProvidersExhaustedError);

    // Exatamente 1 tentativa Groq + 1 tentativa AI Studio + 1 tentativa agy = 3 no total
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(agyMock).toHaveBeenCalledTimes(1);
  });

  it('não deve acionar fallback se o usuário cancelar via AbortSignal, e novo clique na mesma sessão deve abortar o anterior', async () => {
    process.env.GROQ_API_KEY = 'mock_groq_slow_key_12345';
    process.env.GEMINI_API_KEY = 'mock_gemini_should_not_be_called_key_12345';

    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      });
    });
    const agyMock = vi.fn();

    const service = new PromptRefinerService({
      fetchFn: fetchMock as unknown as typeof fetch,
      runAgyFn: agyMock,
      installedSkills: new Set()
    });

    // Caso 1: Cancelamento explícito pelo usuário não cai para AI Studio nem agy
    const userAbort = new AbortController();
    const p1 = service.refinePrompt({
      draft: 'primeiro rascunho que será cancelado pelo usuário',
      sessionKey: 'sess-cancel',
      signal: userAbort.signal
    });
    userAbort.abort();
    await expect(p1).rejects.toBeInstanceOf(RefineCancelledError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(agyMock).not.toHaveBeenCalled();

    // Caso 2: Segundo clique na mesma sessionKey aborta a requisição anterior em voo
    fetchMock.mockReset();
    let callIdx = 0;
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      callIdx++;
      if (callIdx === 1) {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('superseded')));
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '🎯 Objetivo: Resultado do segundo clique.' } }]
        })
      });
    });

    const firstInFlight = service.refinePrompt({
      draft: 'primeiro clique lento na mesma sessao',
      sessionKey: 'sess-same'
    });
    const secondClick = service.refinePrompt({
      draft: 'segundo clique substituindo o anterior',
      sessionKey: 'sess-same'
    });

    await expect(firstInFlight).rejects.toBeInstanceOf(RefineCancelledError);
    const secondResult = await secondClick;
    expect(secondResult.refined).toBe('🎯 Objetivo: Resultado do segundo clique.');
  });

  it('cleanRefinedOutput deve remover preâmbulos e cercas markdown externas preservando o conteúdo', () => {
    const raw = '```markdown\nAqui está o prompt refinado:\n\n🎯 Objetivo: Testar parser.\n```';
    expect(cleanRefinedOutput(raw, ['ux-testing'])).toBe(
      '🎯 Objetivo: Testar parser.\n\n🛠️ Skills sugeridas: ux-testing'
    );
  });
});
