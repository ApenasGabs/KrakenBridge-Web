import { describe, it, expect } from 'vitest';
import { 
  normalizeSearchText, 
  extractSnippet, 
  calculateRelevance, 
  filterAndRankConversations 
} from '../searchUtils';
import type { ConversationSession } from '../../types';

describe('searchUtils', () => {
  describe('normalizeSearchText', () => {
    it('deve remover acentuação gráfica e padronizar minúsculas', () => {
      expect(normalizeSearchText('Ações e Funções')).toBe('acoes e funcoes');
      expect(normalizeSearchText('QUEROVAGAS')).toBe('querovagas');
      expect(normalizeSearchText('  Olá Mundo!  ')).toBe('ola mundo!');
      expect(normalizeSearchText(null)).toBe('');
    });
  });

  describe('extractSnippet', () => {
    it('deve extrair um snippet contextual com reticências ao redor da correspondência', () => {
      const text = 'Nesta conversa nós discutimos a implementação do scraper querovagas com puppeteer e cheerio para extração de vagas.';
      const snippet = extractSnippet(text, 'querovagas', 50);
      expect(snippet.toLowerCase()).toContain('querovagas');
      expect(snippet.startsWith('...')).toBe(true);
      expect(snippet.endsWith('...')).toBe(true);
    });

    it('deve retornar o texto original se couber no limite máximo', () => {
      const text = 'Falamos de querovagas aqui';
      const snippet = extractSnippet(text, 'querovagas', 100);
      expect(snippet).toBe('Falamos de querovagas aqui');
    });
  });

  describe('calculateRelevance - Regra de Ouro (Termo falado pelo usuário)', () => {
    it('deve pontuar mais alto uma conversa onde o usuário falou o termo do que uma conversa que só tem a tag', () => {
      // Conversa A: usuário conversou sobre querovagas, sem tag e sem título querovagas
      const sessionA: ConversationSession = {
        id: 'session-a',
        title: 'Discussão sobre arquitetura do crawler',
        createdAt: '2026-10-10T12:00:00Z',
        updatedAt: '2026-10-10T12:00:00Z',
        messageCount: 5,
        subproject: 'scraper',
        tags: ['scraping', 'node'],
        userQueries: [
          'queria que você analisasse o layout do querovagas para extrair salários'
        ],
        searchableText: 'análise de layout do querovagas'
      };

      // Conversa B: tem tag querovagas, mas o usuário nunca falou sobre querovagas nas mensagens
      const sessionB: ConversationSession = {
        id: 'session-b',
        title: 'Nova Conversa Genérica',
        createdAt: '2026-10-14T12:00:00Z',
        updatedAt: '2026-10-14T12:00:00Z',
        messageCount: 2,
        tags: ['querovagas'],
        userQueries: ['olá como vai você'],
        searchableText: 'Nova Conversa Genérica querovagas'
      };

      const scoreA = calculateRelevance(sessionA, 'querovagas');
      const scoreB = calculateRelevance(sessionB, 'querovagas');

      // Conversa A onde o usuário falou diretamente "querovagas" deve pontuar mais que a conversa B que só tem tag!
      expect(scoreA.score).toBeGreaterThan(scoreB.score);
      expect(scoreA.matchedSnippet).toBeDefined();
      expect(scoreA.matchedSnippet?.toLowerCase()).toContain('querovagas');
      expect(scoreA.matchSource).toBe('user');
    });

    it('deve funcionar com busca insensível a acentuação', () => {
      const session: ConversationSession = {
        id: 'session-accents',
        title: 'Configurações de Produção',
        createdAt: '2026-10-14T12:00:00Z',
        updatedAt: '2026-10-14T12:00:00Z',
        messageCount: 3,
        userQueries: ['preciso atualizar as ações automáticas no servidor'],
        searchableText: 'acoes automaticas'
      };

      // Busca sem acento ("acoes") deve encontrar "ações"
      const result = calculateRelevance(session, 'acoes');
      expect(result.score).toBeGreaterThan(100);
      expect(result.matchSource).toBe('user');
    });
  });

  describe('filterAndRankConversations', () => {
    it('deve ordenar conversas estritamente pela maior pontuação de relevância', () => {
      const convUserSpoke: ConversationSession = {
        id: 'conv-user',
        title: 'Ajustes no coletor',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
        messageCount: 4,
        tags: ['infra'],
        userQueries: ['falei do querovagas semana passada e precisamos retomar']
      };

      const convOnlyTag: ConversationSession = {
        id: 'conv-tag',
        title: 'Outro projeto',
        createdAt: '2026-10-12T10:00:00Z',
        updatedAt: '2026-10-12T10:00:00Z',
        messageCount: 2,
        tags: ['querovagas']
      };

      const convUnrelated: ConversationSession = {
        id: 'conv-unrelated',
        title: 'Backup do Postgres',
        createdAt: '2026-10-13T10:00:00Z',
        updatedAt: '2026-10-13T10:00:00Z',
        messageCount: 2,
        tags: ['database'],
        userQueries: ['fazer dump da base']
      };

      const ranked = filterAndRankConversations(
        [convOnlyTag, convUnrelated, convUserSpoke], 
        'querovagas'
      );

      // Deve filtrar a não-relacionada
      expect(ranked.length).toBe(2);
      // O primeiro resultado DEVE ser a conversa onde o usuário falou "querovagas", mesmo sendo mais antiga e sem a tag!
      expect(ranked[0].id).toBe('conv-user');
      expect(ranked[1].id).toBe('conv-tag');
    });
  });
});
