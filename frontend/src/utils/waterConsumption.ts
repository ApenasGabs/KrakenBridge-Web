/**
 * Utilitário para estimativa de pegada hídrica (consumo equivalente de água) por tokens de IA.
 * 
 * Base de cálculo fundamentada nos estudos da Universidade da Califórnia, Riverside (UC Riverside - Shaolei Ren et al., 2023):
 * Em média, o consumo elétrico e resfriamento evaporativo em data centers de modelos de linguagem de larga escala (LLMs)
 * equivale a aproximadamente 500 mL (0.5 litros) de água potável/doce a cada 1.000 tokens processados (ou ~0.0005 L / token).
 */

export const LITERS_PER_TOKEN = 0.0005; // 0.5 mL por token = 0.5L / 1.000 tokens

/**
 * Converte uma quantidade de tokens para litros de água estimados.
 */
export function tokensToWaterLiters(tokens?: number): number {
  if (!tokens || typeof tokens !== 'number' || isNaN(tokens) || tokens <= 0) {
    return 0;
  }
  return tokens * LITERS_PER_TOKEN;
}

/**
 * Formata a quantidade de litros com unidade e casas decimais adequadas.
 * Ex: 0.5 L, 12.5 L, 1,250.0 L
 */
export function formatWaterLiters(litersOrTokens: number | undefined, isTokensInput = false): string {
  const liters = isTokensInput ? tokensToWaterLiters(litersOrTokens) : (litersOrTokens || 0);

  if (!liters || isNaN(liters) || liters <= 0) {
    return '0 L';
  }

  if (liters < 0.01) {
    return `${liters.toFixed(3)} L`;
  }

  if (liters < 10) {
    return `${liters.toFixed(2)} L`;
  }

  if (liters < 1000) {
    return `${liters.toFixed(1)} L`;
  }

  return `${liters.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`;
}
