import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadLocalCache,
  saveLocalCache,
  isCacheStale,
  LOCAL_STORAGE_CACHE_KEY,
  REFRESH_INTERVAL_MS,
  type WhatsNextCache
} from '../whatsNextCache';

describe('whatsNextCache utility', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('deve retornar null se o cache do localStorage estiver vazio', () => {
    const result = loadLocalCache();
    expect(result).toBeNull();
  });

  it('deve salvar e carregar dados válidos do cache local com sucesso', () => {
    const mockCache: WhatsNextCache = {
      overview: {
        authenticatedUser: 'ApenasGabs',
        repositories: [],
        issuesCount: 5,
        prsCount: 2,
        lastUpdated: Date.now()
      },
      issues: [
        {
          number: 10,
          title: 'Implementar Cache',
          body: 'Descricao',
          url: 'https://github.com/test/issues/10',
          labels: [],
          author: { login: 'ApenasGabs' },
          createdAt: new Date().toISOString(),
          repository: { name: 'KrakenBridge', nameWithOwner: 'ApenasGabs/KrakenBridge' }
        }
      ],
      prs: [],
      timestamp: Date.now()
    };

    saveLocalCache(mockCache);

    const loaded = loadLocalCache();
    expect(loaded).not.toBeNull();
    expect(loaded?.overview?.authenticatedUser).toBe('ApenasGabs');
    expect(loaded?.issues).toHaveLength(1);
    expect(loaded?.issues[0].title).toBe('Implementar Cache');
    expect(loaded?.timestamp).toBe(mockCache.timestamp);
  });

  it('deve lidar de forma resiliente com JSON corrompido no localStorage retornando null sem lançar exceção', () => {
    localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, 'INVALID_JSON{{{');

    const result = loadLocalCache();
    expect(result).toBeNull();
  });

  it('deve retornar null se os dados no localStorage não possuírem timestamp numérico', () => {
    localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify({ issues: [], prs: [] }));

    const result = loadLocalCache();
    expect(result).toBeNull();
  });

  describe('isCacheStale', () => {
    it('deve retornar true se o timestamp for nulo ou indefinido', () => {
      expect(isCacheStale(null)).toBe(true);
      expect(isCacheStale(undefined)).toBe(true);
      expect(isCacheStale(0)).toBe(true);
    });

    it('deve retornar false se o cache tiver menos de 5 minutos', () => {
      const recentTimestamp = Date.now() - (2 * 60 * 1000); // 2 minutos atrás
      expect(isCacheStale(recentTimestamp)).toBe(false);
    });

    it('deve retornar true se o cache tiver 5 minutos ou mais', () => {
      const staleTimestamp = Date.now() - (5 * 60 * 1000); // 5 minutos atrás
      expect(isCacheStale(staleTimestamp)).toBe(true);

      const oldTimestamp = Date.now() - (10 * 60 * 1000); // 10 minutos atrás
      expect(isCacheStale(oldTimestamp)).toBe(true);
    });

    it('deve respeitar um TTL customizado quando informado', () => {
      const timestamp = Date.now() - 3000; // 3 segundos atrás
      expect(isCacheStale(timestamp, 2000)).toBe(true); // TTL de 2s -> stale
      expect(isCacheStale(timestamp, 5000)).toBe(false); // TTL de 5s -> fresh
    });

    it('deve possuir REFRESH_INTERVAL_MS configurado para 5 minutos', () => {
      expect(REFRESH_INTERVAL_MS).toBe(5 * 60 * 1000);
    });
  });
});

