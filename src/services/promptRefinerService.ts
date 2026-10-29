import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { loadDotEnvFiles } from '../utils/envLoader.js';

export type RefineProvider = 'groq' | 'aistudio' | 'agy';

export interface ProviderAttempt {
  provider: RefineProvider;
  status: 'skipped' | 'failed' | 'ok';
  reason?: string;
  latencyMs?: number;
}

export interface RefinePromptInput {
  draft: string;
  chatMode?: 'agent' | 'chat';
  project?: string;
  recentMessages?: string[];
  sessionKey?: string;
  signal?: AbortSignal;
}

export interface RefinePromptResult {
  refined: string;
  provider: RefineProvider;
  model: string;
  latencyMs: number;
  skills: string[];
  maskedSecretsCount: number;
  attempts: ProviderAttempt[];
}

export class RefineValidationError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'RefineValidationError';
  }
}

export class RefineCancelledError extends Error {
  statusCode = 499;
  constructor(message = 'Refinamento cancelado pelo usuário.') {
    super(message);
    this.name = 'RefineCancelledError';
  }
}

export class RefineProvidersExhaustedError extends Error {
  statusCode = 502;
  attempts: ProviderAttempt[];
  constructor(message: string, attempts: ProviderAttempt[]) {
    super(message);
    this.name = 'RefineProvidersExhaustedError';
    this.attempts = attempts;
  }
}

export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';
export const DEFAULT_AISTUDIO_MODEL = 'gemini-2.5-flash';
export const DEFAULT_AGY_MODEL = 'gemini-3.8-flash-low';

const MIN_DRAFT_CHARS = 5;
const MAX_DRAFT_CHARS = 8000;
const MAX_RECENT_MESSAGES = 4;
const MAX_RECENT_MSG_CHARS = 400;

const GROQ_TIMEOUT_MS = 8000;
const AISTUDIO_TIMEOUT_MS = 10000;
const AGY_TIMEOUT_MS = 42000;

const SCOUT_HOME = '/tmp/kraken-scout-home';

/**
 * Remove eventual bloco [DIRETIVA_DO_SISTEMA ... FIM_DA_DIRETIVA_DO_SISTEMA] de mensagens históricas.
 */
export function stripSystemDirective(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const endMarker = '[FIM_DA_DIRETIVA_DO_SISTEMA]';
  const idx = raw.lastIndexOf(endMarker);
  if (idx !== -1) {
    return raw.slice(idx + endMarker.length).trim();
  }
  return raw.trim();
}

/**
 * Mascara segredos aparentes (API keys, PATs, Bearer tokens, JWTs e senhas inline)
 * ANTES de enviar o rascunho a provedores externos.
 */
export function maskSecrets(input: string): { masked: string; count: number } {
  if (!input) return { masked: '', count: 0 };

  let count = 0;
  let text = input;

  const standalonePatterns: RegExp[] = [
    /\bgsk_[A-Za-z0-9]{20,}\b/g,
    /\bsk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9_-]{20,}\b/g,
    /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    /\bAIza[0-9A-Za-z_-]{30,}\b/g,
    /\bxox[baprs]-[A-Za-z0-9-]{15,}\b/g,
    /\bpcp_[A-Za-z0-9]{24,}\b/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g
  ];

  for (const pattern of standalonePatterns) {
    text = text.replace(pattern, () => {
      count++;
      return '[SECRET_REDACTED]';
    });
  }

  // Authorization: Bearer <token>
  text = text.replace(/(\bBearer\s+)([A-Za-z0-9._~+/-]{16,})/gi, (_m, prefix: string, tok: string) => {
    if (tok.includes('SECRET_REDACTED')) return `${prefix}${tok}`;
    count++;
    return `${prefix}[SECRET_REDACTED]`;
  });

  // pares chave=valor ou chave: valor com segredo aparente
  text = text.replace(
    /\b((?:[A-Za-z0-9_]*?(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key|password|senha))\s*[:=]\s*['"]?)([^\s'"]{12,})(['"]?)/gi,
    (full, prefix: string, val: string, suffix: string) => {
      if (val.includes('SECRET_REDACTED') || /^\$\{.*\}$/.test(val)) return full;
      count++;
      return `${prefix}[SECRET_REDACTED]${suffix}`;
    }
  );

  return { masked: text, count };
}

interface SkillRule {
  skill: string;
  keywords: RegExp;
}

const SKILL_RULES: SkillRule[] = [
  { skill: 'ux-testing', keywords: /\b(ux|ui|responsiv\w*|mobile|viewport|375|768|1440|layout|visual|browserless)\b/i },
  { skill: 'e2e-testing-patterns', keywords: /\b(e2e|playwright|cypress|end-to-end|flaky)\b/i },
  { skill: 'webapp-testing', keywords: /\b(screenshot|testar tela|frontend test|dom)\b/i },
  { skill: 'framer-motion-react', keywords: /\b(framer|motion|animatepresence|animac\w*|animaç\w*)\b/i },
  { skill: 'react-native-best-practices', keywords: /\b(react[- ]native|expo|hermes|flashlist)\b/i },
  { skill: 'debug-issue', keywords: /\b(bug|erro|falha\w*|quebrad\w*|travando|corrigir|fix|debug\w*|exception|crash)\b/i },
  { skill: 'refactor-safely', keywords: /\b(refator\w*|refactor\w*|limpar codigo|reestruturar|desacoplar)\b/i },
  { skill: 'code-review', keywords: /\b(code[- ]?review|revisar pr|revisao|pull request|merge request)\b/i },
  { skill: 'git-commit', keywords: /\b(conventional commit|git commit|commitar|comitar)\b/i },
  { skill: 'github-issues', keywords: /\b(issue\w*|criar issue|abrir issue|label\w*|milestone)\b/i },
  { skill: 'gitlab', keywords: /\b(gitlab|glab)\b/i },
  { skill: 'paperclip', keywords: /\b(paper\s*clip|sentinel|forge|pai do kraken)\b/i },
  { skill: 'dotenvx', keywords: /\b(dotenvx|dotenv_private_key|criptografar \.env)\b/i },
  { skill: 'agile-product-owner', keywords: /\b(product owner|\bpo\b|épico|epico|invest)\b/i },
  { skill: 'user-stories', keywords: /\b(user stor\w*|historia\w* de usuario|criterio\w* de aceit\w*)\b/i },
  { skill: 'scrum-master', keywords: /\b(scrum|sprint|velocity|burndown|retrospectiva)\b/i },
  { skill: 'prioritization', keywords: /\b(prioriz\w*|rice|wsjf|moscow)\b/i },
  { skill: 'roadmap-planning', keywords: /\b(roadmap|planejamento de release)\b/i },
  { skill: 'hono-api-scaffolder', keywords: /\b(hono|cloudflare worker\w*)\b/i },
  { skill: 'aws-serverless', keywords: /\b(lambda|eventbridge|step functions|serverless)\b/i },
  { skill: 'whatsapp-automation', keywords: /\b(whatsapp|wpp|evolution api)\b/i },
  { skill: 'prompt-engineering-patterns', keywords: /\b(prompt\w*|few-shot|chain-of-thought)\b/i }
];

let skillsCache: { expiresAt: number; skills: Set<string> } | null = null;

function sanitizeSubprojectName(project?: string): string {
  if (!project || typeof project !== 'string') return '';
  const clean = project.trim().replace(/^\/+|\/+$/g, '');
  if (!clean || clean.includes('..') || path.isAbsolute(clean)) return '';
  return clean;
}

export function listInstalledSkills(project?: string, forceRefresh = false): Set<string> {
  const now = Date.now();
  if (!forceRefresh && !project && skillsCache && skillsCache.expiresAt > now) {
    return skillsCache.skills;
  }

  const workspaceDir = process.env.WORKSPACE_DIR || '/workspace';
  const geminiConfigDir = process.env.GEMINI_CONFIG_DIR || '/root/.gemini/config';
  const safeProject = sanitizeSubprojectName(project);

  const dirs = [
    path.join(geminiConfigDir, 'skills'),
    '/root/.gemini/skills',
    path.join(workspaceDir, '.agents', 'skills'),
    ...(safeProject ? [path.join(workspaceDir, safeProject, '.agents', 'skills')] : [])
  ];

  const found = new Set<string>();
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'SKILL.md'))) {
          found.add(entry.name);
        }
      }
    } catch {
      // Ignora diretórios sem permissão
    }
  }

  if (!project) {
    skillsCache = { expiresAt: now + 30_000, skills: found };
  }
  return found;
}

/**
 * Identifica até 4 skills relevantes para o rascunho sem gastar chamadas extras de LLM.
 */
export function detectRelevantSkills(
  draft: string,
  project?: string,
  installedOverride?: Set<string>
): string[] {
  if (!draft || typeof draft !== 'string') return [];

  const installed = installedOverride ?? listInstalledSkills(project);
  const hasInstalledCatalog = installed.size > 0;
  const matched: string[] = [];

  for (const rule of SKILL_RULES) {
    if (rule.keywords.test(draft)) {
      if (!hasInstalledCatalog || installed.has(rule.skill)) {
        if (!matched.includes(rule.skill)) {
          matched.push(rule.skill);
        }
      }
    }
    if (matched.length >= 4) break;
  }

  // Match direto pelo nome de alguma skill instalada mencionada literalmente no texto
  if (matched.length < 4 && hasInstalledCatalog) {
    const lower = draft.toLowerCase();
    for (const skillName of installed) {
      if (skillName.length >= 4 && lower.includes(skillName.toLowerCase()) && !matched.includes(skillName)) {
        matched.push(skillName);
        if (matched.length >= 4) break;
      }
    }
  }

  return matched;
}

export function buildRefinePrompts(params: {
  maskedDraft: string;
  chatMode: 'agent' | 'chat';
  project?: string;
  maskedRecentMessages: string[];
  skills: string[];
}): { systemPrompt: string; userPrompt: string } {
  const { maskedDraft, chatMode, project, maskedRecentMessages, skills } = params;
  const safeProject = sanitizeSubprojectName(project);

  const modeInstruction =
    chatMode === 'chat'
      ? `Modo ativo: CHAT (apenas consulta/conversa e ferramentas MCP, sem editar arquivos). Estruture de forma enxuta com "🎯 Objetivo:" e, se útil, "📁 Contexto:" e "🔍 Pontos principais:". Não invente critérios de implementação de código se o rascunho for apenas uma dúvida.`
      : `Modo ativo: AGENTE DE ENGENHARIA (autonomia para inspecionar/editar código e rodar testes). Estruture com seções curtas e objetivas:
🎯 Objetivo: (1 frase clara do resultado esperado)
📁 Contexto: (inclua apenas se houver projeto ativo ou contexto explícito no rascunho)
🧩 Requisitos: (lista de itens fiel ao que foi pedido)
✅ Critérios de aceite: (itens curtos e verificáveis derivados apenas do pedido)`;

  const skillsInstruction =
    skills.length > 0
      ? `Inclua ao final exatamente esta linha: "🛠️ Skills sugeridas: ${skills.join(', ')}"`
      : `Não adicione seção de skills se nenhuma skill foi informada.`;

  const systemPrompt = [
    'Você é o pré-refinador oficial de prompts do Kraken (assistente de engenharia de software).',
    'Sua tarefa é transformar o rascunho informal do usuário (que pode conter erros de digitação ou transcrição de voz) em um prompt claro, direto e bem estruturado para o Kraken executar.',
    '',
    'REGRAS INEGOCIÁVEIS:',
    '1. Mantenha o idioma original do rascunho (português pt-BR por padrão) e 100% da intenção do usuário.',
    '2. PROIBIDO INVENTAR: NÃO adicione requisitos técnicos, arquiteturas, bibliotecas, locks de banco, endpoints, testes ou cenários Dado/Quando/Então que o usuário NÃO pediu nem implicou diretamente.',
    '3. Preserve literalmente nomes de arquivos, caminhos, comandos /slash, variáveis e eventuais marcadores [SECRET_REDACTED].',
    '4. Seja conciso: não seja prolixo nem transforme pedidos simples em especificações gigantes.',
    '5. Responda SOMENTE com o texto final do prompt refinado — sem cumprimentos, sem explicações antes/depois e sem cercar a resposta inteira com blocos ```markdown```.',
    '',
    modeInstruction,
    skillsInstruction
  ].join('\n');

  const contextParts: string[] = [];
  if (safeProject) {
    contextParts.push(`Projeto/Subdiretório selecionado na UI: /workspace/${safeProject}`);
  }
  if (maskedRecentMessages.length > 0) {
    contextParts.push(
      `Últimas mensagens da conversa (apenas referência de contexto, NÃO repita o histórico):\n${maskedRecentMessages
        .map((m, i) => `[${i + 1}] ${m}`)
        .join('\n')}`
    );
  }
  if (skills.length > 0) {
    contextParts.push(`Skills instaladas detectadas para este pedido: ${skills.join(', ')}`);
  }

  const userPrompt = [
    ...(contextParts.length > 0 ? ['--- CONTEXTO DA SESSÃO ---', ...contextParts, ''] : []),
    '--- RASCUNHO DO USUÁRIO PARA REFINAR ---',
    maskedDraft
  ].join('\n');

  return { systemPrompt, userPrompt };
}

/**
 * Limpa cercas markdown externas acidentais ou preâmbulos conversacionais e garante a linha de skills.
 */
export function cleanRefinedOutput(raw: string, skills: string[]): string {
  let text = (raw || '').trim();
  if (!text) return '';

  // Remove cercas externas caso o modelo envolva tudo em ```markdown ... ```
  const outerFence = text.match(/^```(?:markdown|md|text|txt)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
  if (outerFence) {
    text = outerFence[1].trim();
  }

  // Remove preâmbulos comuns ("Aqui está o prompt refinado:")
  text = text.replace(/^(?:aqui est[aá] o prompt(?: refinado| otimizado)?|prompt refinado)\s*:\s*\r?\n+/i, '').trim();

  if (skills.length > 0 && !/skills?\s+sugeridas\s*:/i.test(text)) {
    text = `${text}\n\n🛠️ Skills sugeridas: ${skills.join(', ')}`;
  }

  return text;
}

function createLinkedAbortController(
  parentSignals: Array<AbortSignal | undefined>,
  timeoutMs: number
): { controller: AbortController; cleanup: () => void; didTimeout: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;

  const onParentAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(new Error('parent_aborted'));
    }
  };

  for (const sig of parentSignals) {
    if (!sig) continue;
    if (sig.aborted) {
      controller.abort(new Error('parent_aborted'));
      break;
    }
    sig.addEventListener('abort', onParentAbort, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    if (!controller.signal.aborted) {
      controller.abort(new Error('timeout'));
    }
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(timer);
    for (const sig of parentSignals) {
      sig?.removeEventListener('abort', onParentAbort);
    }
  };

  return {
    controller,
    cleanup,
    didTimeout: () => timedOut
  };
}

export interface PromptRefinerDeps {
  fetchFn?: typeof fetch;
  runAgyFn?: (prompt: string, model: string, signal: AbortSignal) => Promise<string>;
  installedSkills?: Set<string>;
}

export class PromptRefinerService {
  private inFlightBySession = new Map<string, AbortController>();
  private deps: PromptRefinerDeps;

  constructor(deps: PromptRefinerDeps = {}) {
    this.deps = deps;
  }

  getProvidersAvailability(): {
    groq: boolean;
    aistudio: boolean;
    agy: boolean;
    groqModel: string;
    aistudioModel: string;
    agyModel: string;
  } {
    loadDotEnvFiles();
    const groqKey = (process.env.GROQ_API_KEY || '').trim();
    const aistudioKey = (process.env.AISTUDIO_API_KEY || process.env.GEMINI_API_KEY || '').trim();
    return {
      groq: !!groqKey,
      aistudio: !!aistudioKey,
      agy: true,
      groqModel: (process.env.GROQ_MODEL || '').trim() || DEFAULT_GROQ_MODEL,
      aistudioModel: (process.env.AISTUDIO_MODEL || '').trim() || DEFAULT_AISTUDIO_MODEL,
      agyModel: (process.env.AGY_REFINE_MODEL || '').trim() || DEFAULT_AGY_MODEL
    };
  }

  /**
   * Executa o refinamento sob demanda com cadeia determinística:
   * Groq (1x) -> Google AI Studio (1x) -> agy CLI one-shot (1x).
   * Zero loop de retries; no máximo 1 execução ativa por sessionKey.
   */
  async refinePrompt(input: RefinePromptInput): Promise<RefinePromptResult> {
    if (!input || typeof input.draft !== 'string') {
      throw new RefineValidationError('O texto do rascunho (draft) é obrigatório.');
    }

    const trimmedDraft = input.draft.trim();
    if (trimmedDraft.length < MIN_DRAFT_CHARS) {
      throw new RefineValidationError(`Digite pelo menos ${MIN_DRAFT_CHARS} caracteres antes de refinar.`);
    }
    if (trimmedDraft.length > MAX_DRAFT_CHARS) {
      throw new RefineValidationError(`O rascunho excede o limite máximo de ${MAX_DRAFT_CHARS} caracteres.`);
    }

    const sessionKey = (input.sessionKey || 'default').trim() || 'default';

    // Cancela imediatamente qualquer refinamento anterior ainda em voo na mesma sessão
    const previousController = this.inFlightBySession.get(sessionKey);
    if (previousController && !previousController.signal.aborted) {
      previousController.abort(new Error('superseded_by_new_request'));
    }

    const sessionController = new AbortController();
    this.inFlightBySession.set(sessionKey, sessionController);

    const isCancelled = (): boolean =>
      Boolean(input.signal?.aborted || sessionController.signal.aborted);

    try {
      if (isCancelled()) {
        throw new RefineCancelledError();
      }

      loadDotEnvFiles();

      const chatMode: 'agent' | 'chat' = input.chatMode === 'chat' ? 'chat' : 'agent';
      const { masked: maskedDraft, count: draftSecretsCount } = maskSecrets(trimmedDraft);

      let extraSecretsCount = 0;
      const maskedRecentMessages = Array.isArray(input.recentMessages)
        ? input.recentMessages
            .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
            .slice(-MAX_RECENT_MESSAGES)
            .map((m) => {
              const stripped = stripSystemDirective(m).slice(0, MAX_RECENT_MSG_CHARS);
              const res = maskSecrets(stripped);
              extraSecretsCount += res.count;
              return res.masked;
            })
            .filter(Boolean)
        : [];

      const totalMaskedSecrets = draftSecretsCount + extraSecretsCount;
      const skills = detectRelevantSkills(maskedDraft, input.project, this.deps.installedSkills);
      const { systemPrompt, userPrompt } = buildRefinePrompts({
        maskedDraft,
        chatMode,
        project: input.project,
        maskedRecentMessages,
        skills
      });

      const attempts: ProviderAttempt[] = [];
      const availability = this.getProvidersAvailability();

      // 1) TENTATIVA ÚNICA: GROQ
      const groqKey = (process.env.GROQ_API_KEY || '').trim();
      if (!groqKey) {
        attempts.push({ provider: 'groq', status: 'skipped', reason: 'GROQ_API_KEY ausente' });
      } else {
        const t0 = Date.now();
        try {
          const raw = await this.callGroqOnce({
            apiKey: groqKey,
            model: availability.groqModel,
            systemPrompt,
            userPrompt,
            parentSignals: [input.signal, sessionController.signal]
          });
          const refined = cleanRefinedOutput(raw, skills);
          if (!refined) throw new Error('Resposta vazia da Groq');
          const latencyMs = Date.now() - t0;
          attempts.push({ provider: 'groq', status: 'ok', latencyMs });
          return {
            refined,
            provider: 'groq',
            model: availability.groqModel,
            latencyMs,
            skills,
            maskedSecretsCount: totalMaskedSecrets,
            attempts
          };
        } catch (err) {
          if (isCancelled()) throw new RefineCancelledError();
          attempts.push({
            provider: 'groq',
            status: 'failed',
            reason: (err as Error).message || 'erro desconhecido',
            latencyMs: Date.now() - t0
          });
        }
      }

      if (isCancelled()) throw new RefineCancelledError();

      // 2) TENTATIVA ÚNICA: GOOGLE AI STUDIO (GEMINI FLASH)
      const aistudioKey = (process.env.AISTUDIO_API_KEY || process.env.GEMINI_API_KEY || '').trim();
      if (!aistudioKey) {
        attempts.push({ provider: 'aistudio', status: 'skipped', reason: 'AISTUDIO_API_KEY/GEMINI_API_KEY ausente' });
      } else {
        const t0 = Date.now();
        try {
          const raw = await this.callAiStudioOnce({
            apiKey: aistudioKey,
            model: availability.aistudioModel,
            systemPrompt,
            userPrompt,
            parentSignals: [input.signal, sessionController.signal]
          });
          const refined = cleanRefinedOutput(raw, skills);
          if (!refined) throw new Error('Resposta vazia do AI Studio');
          const latencyMs = Date.now() - t0;
          attempts.push({ provider: 'aistudio', status: 'ok', latencyMs });
          return {
            refined,
            provider: 'aistudio',
            model: availability.aistudioModel,
            latencyMs,
            skills,
            maskedSecretsCount: totalMaskedSecrets,
            attempts
          };
        } catch (err) {
          if (isCancelled()) throw new RefineCancelledError();
          attempts.push({
            provider: 'aistudio',
            status: 'failed',
            reason: (err as Error).message || 'erro desconhecido',
            latencyMs: Date.now() - t0
          });
        }
      }

      if (isCancelled()) throw new RefineCancelledError();

      // 3) TENTATIVA ÚNICA: AGY CLI ONE-SHOT (FALLBACK LOCAL)
      const t0 = Date.now();
      try {
        const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
        const raw = await this.callAgyOnce({
          prompt: combinedPrompt,
          model: availability.agyModel,
          parentSignals: [input.signal, sessionController.signal]
        });
        const refined = cleanRefinedOutput(raw, skills);
        if (!refined) throw new Error('Resposta vazia do agy CLI');
        const latencyMs = Date.now() - t0;
        attempts.push({ provider: 'agy', status: 'ok', latencyMs });
        return {
          refined,
          provider: 'agy',
          model: availability.agyModel,
          latencyMs,
          skills,
          maskedSecretsCount: totalMaskedSecrets,
          attempts
        };
      } catch (err) {
        if (isCancelled()) throw new RefineCancelledError();
        attempts.push({
          provider: 'agy',
          status: 'failed',
          reason: (err as Error).message || 'erro desconhecido',
          latencyMs: Date.now() - t0
        });
      }

      const summary = attempts
        .map((a) => `${a.provider}: ${a.status}${a.reason ? ` (${a.reason})` : ''}`)
        .join(' | ');
      throw new RefineProvidersExhaustedError(
        `Não foi possível refinar o prompt no momento (${summary}).`,
        attempts
      );
    } finally {
      if (this.inFlightBySession.get(sessionKey) === sessionController) {
        this.inFlightBySession.delete(sessionKey);
      }
    }
  }

  private async callGroqOnce(params: {
    apiKey: string;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    parentSignals: Array<AbortSignal | undefined>;
  }): Promise<string> {
    const fetchImpl = this.deps.fetchFn ?? fetch;
    const { controller, cleanup, didTimeout } = createLinkedAbortController(
      params.parentSignals,
      GROQ_TIMEOUT_MS
    );

    try {
      const body: Record<string, unknown> = {
        model: params.model,
        temperature: 0.2,
        max_tokens: 900,
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userPrompt }
        ]
      };
      if (params.model.includes('gpt-oss')) {
        body.reasoning_effort = 'low';
      }

      const res = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data?.choices?.[0]?.message?.content?.trim() || '';
    } catch (err) {
      if (didTimeout()) {
        throw new Error(`timeout (${GROQ_TIMEOUT_MS}ms)`);
      }
      throw err;
    } finally {
      cleanup();
    }
  }

  private async callAiStudioOnce(params: {
    apiKey: string;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    parentSignals: Array<AbortSignal | undefined>;
  }): Promise<string> {
    const fetchImpl = this.deps.fetchFn ?? fetch;
    const { controller, cleanup, didTimeout } = createLinkedAbortController(
      params.parentSignals,
      AISTUDIO_TIMEOUT_MS
    );

    try {
      const safeModel = encodeURIComponent(params.model);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent`;

      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': params.apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: params.systemPrompt }]
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: params.userPrompt }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 900
          }
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const parts = data?.candidates?.[0]?.content?.parts || [];
      return parts.map((p) => p.text || '').join('').trim();
    } catch (err) {
      if (didTimeout()) {
        throw new Error(`timeout (${AISTUDIO_TIMEOUT_MS}ms)`);
      }
      throw err;
    } finally {
      cleanup();
    }
  }

  private async callAgyOnce(params: {
    prompt: string;
    model: string;
    parentSignals: Array<AbortSignal | undefined>;
  }): Promise<string> {
    const { controller, cleanup, didTimeout } = createLinkedAbortController(
      params.parentSignals,
      AGY_TIMEOUT_MS
    );

    try {
      if (this.deps.runAgyFn) {
        return await this.deps.runAgyFn(params.prompt, params.model, controller.signal);
      }

      return await this.spawnAgySandbox(params.prompt, params.model, controller.signal);
    } catch (err) {
      if (didTimeout()) {
        throw new Error(`timeout (${AGY_TIMEOUT_MS}ms)`);
      }
      throw err;
    } finally {
      cleanup();
    }
  }

  private spawnAgySandbox(prompt: string, model: string, signal: AbortSignal): Promise<string> {
    // Prepara HOME isolado sem MCPs para evitar overhead de boot e recursão de hooks
    const cliDir = path.join(SCOUT_HOME, '.gemini', 'antigravity-cli');
    try {
      fs.mkdirSync(cliDir, { recursive: true });
      const tokenSrc = '/root/.gemini/antigravity-cli/antigravity-oauth-token';
      const tokenDst = path.join(cliDir, 'antigravity-oauth-token');
      if (!fs.existsSync(tokenDst) && fs.existsSync(tokenSrc)) {
        fs.symlinkSync(tokenSrc, tokenDst);
      }
    } catch {
      // Fallback para /tmp se SCOUT_HOME não puder ser preparado
    }

    const cwd = fs.existsSync(SCOUT_HOME) ? SCOUT_HOME : '/tmp';
    const home = fs.existsSync(cliDir) ? SCOUT_HOME : process.env.HOME || '/root';

    return new Promise<string>((resolve, reject) => {
      if (signal.aborted) {
        return reject(new Error('aborted'));
      }

      const args = [
        '--model',
        model,
        '--effort',
        'low',
        '--disable-slash-commands',
        '--print-timeout',
        '40s',
        '-p',
        prompt
      ];

      const isPosix = process.platform !== 'win32';
      const child = spawn('agy', args, {
        cwd,
        detached: isPosix,
        env: {
          ...process.env,
          HOME: home,
          SKILL_SCOUT_INTERNAL: '1'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      const killChildGroup = (sig: NodeJS.Signals) => {
        try {
          if (isPosix && child.pid) {
            process.kill(-child.pid, sig);
            return;
          }
        } catch {}
        try {
          child.kill(sig);
        } catch {}
      };

      const onAbort = () => {
        killChildGroup('SIGTERM');
        setTimeout(() => {
          if (!child.killed && child.exitCode === null) {
            killChildGroup('SIGKILL');
          }
        }, 300);
      };

      signal.addEventListener('abort', onAbort, { once: true });

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      });

      child.on('close', (code) => {
        signal.removeEventListener('abort', onAbort);
        if (signal.aborted) {
          return reject(new Error('aborted'));
        }
        if (code !== 0 && !stdout.trim()) {
          return reject(new Error(`agy exit ${code}: ${stderr.trim().slice(0, 160)}`));
        }
        resolve(stdout.trim());
      });
    });
  }
}

export const promptRefinerService = new PromptRefinerService();
