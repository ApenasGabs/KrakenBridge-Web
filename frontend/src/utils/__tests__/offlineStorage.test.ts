import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveConversationsListOffline,
  getConversationsListOffline,
  saveConversationSessionOffline,
  getConversationSessionOffline,
  deleteConversationOffline,
  clearOfflineStorage,
  MAX_OFFLINE_SESSIONS
} from '../offlineStorage';
import type { ConversationSession } from '../../types';

describe('offlineStorage - Persistência Local IndexedDB (Issue #129)', () => {
  beforeEach(async () => {
    await clearOfflineStorage();
  });

  it('deve salvar e recuperar a lista de conversas ordenada por updatedAt decrescente', async () => {
    const mockList: ConversationSession[] = [
      {
        id: 'conv-old',
        title: 'Conversa Antiga',
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-01T10:00:00.000Z',
        isRunning: true,
        messageCount: 2
      },
      {
        id: 'conv-new',
        title: 'Conversa Recente',
        createdAt: '2026-11-04T01:00:00.000Z',
        updatedAt: '2026-11-04T02:00:00.000Z',
        isRunning: false,
        messageCount: 5
      }
    ];

    await saveConversationsListOffline(mockList);
    const loaded = await getConversationsListOffline();

    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe('conv-new');
    expect(loaded[1].id).toBe('conv-old');
    // No cache offline, nenhuma conversa deve ficar presa como isRunning: true
    expect(loaded[1].isRunning).toBe(false);
  });

  it('deve salvar e recuperar uma sessão completa de conversa com mensagens normalizadas', async () => {
    const session: ConversationSession = {
      id: 'conv-123',
      title: 'Implementação PWA no Kraken',
      createdAt: '2026-11-04T00:00:00.000Z',
      updatedAt: '2026-11-04T02:00:00.000Z',
      model: 'gemini-2.5-pro',
      chatMode: 'agent',
      isRunning: true,
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'Como funciona o modo offline?',
          timestamp: '2026-11-04T01:00:00.000Z'
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Utilizamos Workbox + IndexedDB para leitura instantânea.',
          timestamp: '2026-11-04T01:01:00.000Z',
          isStreaming: true
        }
      ]
    };

    await saveConversationSessionOffline(session);

    const restored = await getConversationSessionOffline('conv-123');
    expect(restored).not.toBeNull();
    expect(restored?.title).toBe('Implementação PWA no Kraken');
    expect(restored?.isRunning).toBe(false);
    expect(restored?.messages).toHaveLength(2);
    expect(restored?.messages?.[1].isStreaming).toBe(false);

    // Também deve atualizar o store de metadados
    const metaList = await getConversationsListOffline();
    expect(metaList.some((c) => c.id === 'conv-123')).toBe(true);
  });

  it('deve remover conversa do cache offline ao chamar deleteConversationOffline', async () => {
    await saveConversationSessionOffline({
      id: 'conv-del',
      title: 'Para deletar',
      createdAt: '2026-11-04T00:00:00.000Z',
      updatedAt: '2026-11-04T00:00:00.000Z',
      messages: [{ id: 'm1', role: 'user', content: 'Oi', timestamp: '2026-11-04T00:00:00.000Z' }]
    });

    expect(await getConversationSessionOffline('conv-del')).not.toBeNull();
    await deleteConversationOffline('conv-del');
    expect(await getConversationSessionOffline('conv-del')).toBeNull();
  });

  it('deve aplicar poda LRU mantendo no máximo MAX_OFFLINE_SESSIONS sessões completas', async () => {
    const totalToInsert = MAX_OFFLINE_SESSIONS + 4;
    for (let i = 0; i < totalToInsert; i++) {
      await saveConversationSessionOffline({
        id: `conv-lru-${i}`,
        title: `Sessão ${i}`,
        createdAt: new Date(Date.now() + i * 1000).toISOString(),
        updatedAt: new Date(Date.now() + i * 1000).toISOString(),
        messages: []
      });
    }

    // As últimas sessões inseridas devem existir
    const newest = await getConversationSessionOffline(`conv-lru-${totalToInsert - 1}`);
    expect(newest).not.toBeNull();
  });
});
