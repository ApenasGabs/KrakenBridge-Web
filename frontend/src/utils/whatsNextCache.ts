import type { ProjectOverview, GithubIssueItem, GithubPullRequestItem } from '../types';

export interface WhatsNextCache {
  overview: ProjectOverview | null;
  issues: GithubIssueItem[];
  prs: GithubPullRequestItem[];
  timestamp: number;
}

export const LOCAL_STORAGE_CACHE_KEY = 'kraken_whatsnext_cache_v1';
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos (300.000 ms)

/**
 * Carrega os dados persistidos do What's Next no localStorage com validação segura
 */
export function loadLocalCache(): WhatsNextCache | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LOCAL_STORAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.timestamp === 'number') {
      return parsed;
    }
  } catch (err) {
    console.warn('[WhatsNextCache] Falha ao ler cache local:', err);
  }
  return null;
}

/**
 * Salva os dados consolidados do What's Next no localStorage
 */
export function saveLocalCache(cache: WhatsNextCache): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('[WhatsNextCache] Falha ao persistir cache local:', err);
  }
}

/**
 * Verifica se o timestamp fornecido já ultrapassou o tempo limite (TTL) de 5 minutos
 */
export function isCacheStale(timestamp: number | null | undefined, ttlMs = REFRESH_INTERVAL_MS): boolean {
  if (!timestamp || typeof timestamp !== 'number') return true;
  return Date.now() - timestamp >= ttlMs;
}
