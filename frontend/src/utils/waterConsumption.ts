import { useState, useEffect, useCallback } from 'react';

/**
 * Utilitário para estimativa de pegada hídrica (consumo equivalente de água) por tokens de IA.
 * 
 * Base de cálculo fundamentada nos estudos da Universidade da Califórnia, Riverside (UC Riverside - Shaolei Ren et al., 2023):
 * Em média, o consumo elétrico e resfriamento evaporativo em data centers de modelos de linguagem de larga escala (LLMs)
 * equivale a aproximadamente 500 mL (0.5 litros) de água potável/doce a cada 1.000 tokens processados (ou ~0.0005 L / token).
 */

export const LITERS_PER_TOKEN = 0.0005; // 0.5 mL por token = 0.5L / 1.000 tokens
export const WATER_METRICS_STORAGE_KEY = 'kraken_show_water_metrics';
export const WATER_METRICS_EVENT_NAME = 'kraken-water-metrics-changed';

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

/**
 * Formata quantidade padrão de tokens com sufixos k e M.
 */
export function formatTokens(value?: number): string {
  if (!value || value <= 0) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
}

/**
 * Formata tokens ou litros de água conforme a preferência de pegada hídrica ativa.
 */
export function formatTokensOrWater(tokens?: number, showWaterMetrics = false): string {
  if (showWaterMetrics) {
    return formatWaterLiters(tokens, true);
  }
  return formatTokens(tokens);
}

/**
 * Recupera o estado de ativação da pegada hídrica salvo no localStorage.
 */
export function getWaterMetricsPreference(): boolean {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(WATER_METRICS_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Grava e sincroniza globalmente o estado da pegada hídrica com disparo de evento customizado.
 */
export function setWaterMetricsPreference(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    if (window.localStorage) {
      try {
        window.localStorage.setItem(WATER_METRICS_STORAGE_KEY, String(enabled));
      } catch {
        // Ignora erros em ambientes restritos
      }
    }
    window.dispatchEvent(new CustomEvent(WATER_METRICS_EVENT_NAME, { detail: { enabled } }));
  }
}

/**
 * Hook reativo compartilhado para ler e alternar o modo de litros de água em qualquer componente da aplicação.
 */
export function useWaterMetrics(): [boolean, (next?: boolean | ((prev: boolean) => boolean)) => void] {
  const [showWaterMetrics, setShowWaterMetrics] = useState<boolean>(() => getWaterMetricsPreference());

  useEffect(() => {
    const handleUpdate = () => {
      setShowWaterMetrics(getWaterMetricsPreference());
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleUpdate);
      window.addEventListener(WATER_METRICS_EVENT_NAME, handleUpdate);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleUpdate);
        window.removeEventListener(WATER_METRICS_EVENT_NAME, handleUpdate);
      }
    };
  }, []);

  const toggle = useCallback((next?: boolean | ((prev: boolean) => boolean)) => {
    setShowWaterMetrics((prev) => {
      const nextVal = typeof next === 'function' 
        ? next(prev) 
        : typeof next === 'boolean' 
          ? next 
          : !prev;
      setWaterMetricsPreference(nextVal);
      return nextVal;
    });
  }, []);

  return [showWaterMetrics, toggle];
}

