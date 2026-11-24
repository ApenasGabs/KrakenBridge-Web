export type PricingProvider = 'google' | 'anthropic' | 'openai';

export interface ModelTokenPricing {
  provider: PricingProvider;
  /** USD por 1M de tokens de input (não-cacheados) */
  inputPerMillion: number;
  /** USD por 1M de tokens de input cacheados / cache read */
  cachedInputPerMillion: number;
  /** USD por 1M de tokens de output e thinking/reasoning */
  outputPerMillion: number;
}

export interface ResolvedModelPricing {
  canonicalModel: string;
  pricing: ModelTokenPricing;
}

export interface TokenCostCalculationInput {
  model?: string | null;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
}

export interface TokenCostCalculationResult {
  costUsd: number | null;
  isPriced: boolean;
  canonicalModel: string | null;
  pricing: ModelTokenPricing | null;
}

/**
 * Catálogo oficial de preços por 1M tokens (USD).
 * Thinking/reasoning tokens são tarifados na taxa de output conforme política dos provedores.
 */
export const MODEL_PRICING_CATALOG: Record<string, ModelTokenPricing> = {
  // Google Gemini (Google AI Studio / Gemini API)
  'gemini-4-argon': {
    provider: 'google',
    inputPerMillion: 2.0,
    cachedInputPerMillion: 0.1,
    outputPerMillion: 10.0
  },
  'gemini-4-neon': {
    provider: 'google',
    inputPerMillion: 3.0,
    cachedInputPerMillion: 0.15,
    outputPerMillion: 15.0
  },
  'gemini-4-hydrogen': {
    provider: 'google',
    inputPerMillion: 1.5,
    cachedInputPerMillion: 0.075,
    outputPerMillion: 7.5
  },
  'gemini-3.8-flash': {
    provider: 'google',
    inputPerMillion: 0.75,
    cachedInputPerMillion: 0.075,
    outputPerMillion: 3.75
  },
  'gemini-2.5-pro': {
    provider: 'google',
    inputPerMillion: 1.25,
    cachedInputPerMillion: 0.125,
    outputPerMillion: 10.0
  },
  'gemini-2.5-flash': {
    provider: 'google',
    inputPerMillion: 0.3,
    cachedInputPerMillion: 0.03,
    outputPerMillion: 2.5
  },

  // Anthropic Claude (Direct API)
  'claude-fable-5-2': {
    provider: 'anthropic',
    inputPerMillion: 8.0,
    cachedInputPerMillion: 0.8,
    outputPerMillion: 40.0
  },
  'claude-opus-5-5': {
    provider: 'anthropic',
    inputPerMillion: 4.0,
    cachedInputPerMillion: 0.2,
    outputPerMillion: 20.0
  },
  'claude-opus-4-8': {
    provider: 'anthropic',
    inputPerMillion: 5.0,
    cachedInputPerMillion: 0.5,
    outputPerMillion: 25.0
  },
  'claude-sonnet-5-5': {
    provider: 'anthropic',
    inputPerMillion: 2.0,
    cachedInputPerMillion: 0.1,
    outputPerMillion: 10.0
  },
  'claude-sonnet-5': {
    provider: 'anthropic',
    inputPerMillion: 2.0,
    cachedInputPerMillion: 0.2,
    outputPerMillion: 10.0
  },
  'claude-sonnet-4-6': {
    provider: 'anthropic',
    inputPerMillion: 3.0,
    cachedInputPerMillion: 0.3,
    outputPerMillion: 15.0
  },
  'claude-haiku-5-5': {
    provider: 'anthropic',
    inputPerMillion: 0.1,
    cachedInputPerMillion: 0.01,
    outputPerMillion: 0.5
  },
  'claude-haiku-4-5': {
    provider: 'anthropic',
    inputPerMillion: 1.0,
    cachedInputPerMillion: 0.1,
    outputPerMillion: 5.0
  },

  // OpenAI (Direct API)
  'gpt-6-astra': {
    provider: 'openai',
    inputPerMillion: 10.0,
    cachedInputPerMillion: 1.0,
    outputPerMillion: 50.0
  },
  'gpt-6-sol': {
    provider: 'openai',
    inputPerMillion: 2.0,
    cachedInputPerMillion: 0.2,
    outputPerMillion: 10.0
  },
  'gpt-6.1-sol': {
    provider: 'openai',
    inputPerMillion: 2.0,
    cachedInputPerMillion: 0.1,
    outputPerMillion: 10.0
  },
  'gpt-6-luna': {
    provider: 'openai',
    inputPerMillion: 0.1,
    cachedInputPerMillion: 0.01,
    outputPerMillion: 0.5
  },
  'gpt-5.6-sol': {
    provider: 'openai',
    inputPerMillion: 4.0,
    cachedInputPerMillion: 0.4,
    outputPerMillion: 20.0
  },
  'gpt-5': {
    provider: 'openai',
    inputPerMillion: 1.25,
    cachedInputPerMillion: 0.125,
    outputPerMillion: 10.0
  },
  'gpt-5-mini': {
    provider: 'openai',
    inputPerMillion: 0.25,
    cachedInputPerMillion: 0.025,
    outputPerMillion: 2.0
  },
  'gpt-5-nano': {
    provider: 'openai',
    inputPerMillion: 0.05,
    cachedInputPerMillion: 0.005,
    outputPerMillion: 0.4
  },
  'o3': {
    provider: 'openai',
    inputPerMillion: 2.0,
    cachedInputPerMillion: 0.5,
    outputPerMillion: 8.0
  },
  'o4-mini': {
    provider: 'openai',
    inputPerMillion: 1.1,
    cachedInputPerMillion: 0.275,
    outputPerMillion: 4.4
  }
};

const MODEL_ALIASES: Record<string, string> = {
  'opus': 'claude-opus-5-5',
  'claude-opus-5.5': 'claude-opus-5-5',
  'claude-opus-4.8': 'claude-opus-4-8',
  'claude-fable-5.2': 'claude-fable-5-2',
  'claude-sonnet-5.5': 'claude-sonnet-5-5',
  'claude-sonnet-4.6': 'claude-sonnet-4-6',
  'claude-haiku-5.5': 'claude-haiku-5-5',
  'claude-haiku-4.5': 'claude-haiku-4-5'
};

const UNPRICED_SENTINELS = new Set(['', 'auto', 'unknown', 'desconhecido', 'default', 'none', 'null']);
const EFFORT_SUFFIX_REGEX = /-(?:high|medium|low|xhigh|max|minimal)$/i;
const PROVIDER_PREFIX_REGEX = /^(?:google\/|anthropic\/|openai\/|vertex_ai\/|us\.anthropic\.|eu\.anthropic\.)/i;

/**
 * Arredonda valores USD para 6 casas decimais evitando ruído de ponto flutuante.
 */
export const roundUsd = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1_000_000) / 1_000_000;
};

/**
 * Normaliza identificadores de modelo removendo prefixos de provedor e sufixos de esforço
 * (-high, -medium, -low, -xhigh, -max, -minimal), resolvendo aliases conhecidos.
 * Retorna null para 'auto', vazio ou modelos não catalogados.
 */
export const normalizeModelName = (rawModel?: string | null): string | null => {
  if (!rawModel || typeof rawModel !== 'string') return null;
  let cleaned = rawModel.trim().toLowerCase();
  if (UNPRICED_SENTINELS.has(cleaned)) return null;

  cleaned = cleaned.replace(PROVIDER_PREFIX_REGEX, '').trim();
  if (UNPRICED_SENTINELS.has(cleaned)) return null;

  if (Object.hasOwn(MODEL_PRICING_CATALOG, cleaned)) {
    return cleaned;
  }
  if (Object.hasOwn(MODEL_ALIASES, cleaned)) {
    return MODEL_ALIASES[cleaned];
  }

  const withoutEffort = cleaned.replace(EFFORT_SUFFIX_REGEX, '');
  if (withoutEffort !== cleaned) {
    if (Object.hasOwn(MODEL_PRICING_CATALOG, withoutEffort)) {
      return withoutEffort;
    }
    if (Object.hasOwn(MODEL_ALIASES, withoutEffort)) {
      return MODEL_ALIASES[withoutEffort];
    }
  }

  return null;
};

/**
 * Obtém a entrada de tarifação oficial para o modelo informado ou null se não tarifado.
 */
export const getModelPricing = (rawModel?: string | null): ResolvedModelPricing | null => {
  const canonicalModel = normalizeModelName(rawModel);
  if (!canonicalModel) return null;
  const pricing = MODEL_PRICING_CATALOG[canonicalModel];
  if (!pricing) return null;
  return { canonicalModel, pricing };
};

const sanitizeTokenCount = (value: unknown): number => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num;
};

/**
 * Calcula o custo estimado em USD para um volume de tokens e modelo.
 * Retorna costUsd: null e isPriced: false quando o modelo for desconhecido ou 'auto'.
 */
export const calculateTokenCostUsd = (input: TokenCostCalculationInput): TokenCostCalculationResult => {
  const resolved = getModelPricing(input.model);
  if (!resolved) {
    return {
      costUsd: null,
      isPriced: false,
      canonicalModel: null,
      pricing: null
    };
  }

  const inputTokens = sanitizeTokenCount(input.inputTokens);
  const cachedInputTokens = sanitizeTokenCount(input.cachedInputTokens);
  const outputTokens = sanitizeTokenCount(input.outputTokens);
  const thinkingTokens = sanitizeTokenCount(input.thinkingTokens);

  const { pricing, canonicalModel } = resolved;
  const totalUsd =
    (inputTokens * pricing.inputPerMillion +
      cachedInputTokens * pricing.cachedInputPerMillion +
      (outputTokens + thinkingTokens) * pricing.outputPerMillion) /
    1_000_000;

  return {
    costUsd: roundUsd(totalUsd),
    isPriced: true,
    canonicalModel,
    pricing
  };
}
