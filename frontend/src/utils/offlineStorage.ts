import type { ConversationSession } from '../types';

const DB_NAME = 'kraken_pwa_offline_db';
const DB_VERSION = 1;
const STORE_CONVERSATIONS = 'conversations_meta';
const STORE_SESSIONS = 'conversation_sessions';

export const MAX_OFFLINE_CONVERSATIONS = 50;
export const MAX_OFFLINE_SESSIONS = 30;

interface CachedSessionRecord {
  id: string;
  updatedAt: string;
  cachedAt: string;
  session: ConversationSession;
}

// Fallback em memória para ambientes sem IndexedDB (SSR, WebViews restritas)
const memoryMetaFallback = new Map<string, ConversationSession>();
const memorySessionFallback = new Map<string, CachedSessionRecord>();

function isIndexedDbSupported(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
          const metaStore = db.createObjectStore(STORE_CONVERSATIONS, { keyPath: 'id' });
          metaStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          const sessionStore = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
          sessionStore.createIndex('cachedAt', 'cachedAt', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Falha ao abrir IndexedDB'));
    } catch (err) {
      reject(err);
    }
  });
}

function sortByUpdatedDesc(items: ConversationSession[]): ConversationSession[] {
  return [...items].sort((a, b) => {
    const tA = Date.parse(a.updatedAt || a.createdAt || '') || 0;
    const tB = Date.parse(b.updatedAt || b.createdAt || '') || 0;
    return tB - tA;
  });
}

/**
 * Persiste a lista recente de conversas (metadados) no IndexedDB para navegação offline.
 */
export async function saveConversationsListOffline(
  conversations: ConversationSession[]
): Promise<void> {
  const trimmed = sortByUpdatedDesc(conversations).slice(0, MAX_OFFLINE_CONVERSATIONS);

  if (!isIndexedDbSupported()) {
    memoryMetaFallback.clear();
    for (const conv of trimmed) {
      const { messages: _messages, ...meta } = conv;
      void _messages;
      memoryMetaFallback.set(conv.id, meta);
    }
    return;
  }

  let db: IDBDatabase | null = null;
  try {
    db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(STORE_CONVERSATIONS, 'readwrite');
      const store = tx.objectStore(STORE_CONVERSATIONS);
      store.clear();
      for (const conv of trimmed) {
        const { messages: _messages, ...meta } = conv;
        void _messages;
        store.put({
          ...meta,
          isRunning: false
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Erro ao gravar conversas no IndexedDB'));
    });
  } catch (err) {
    console.warn('[PWA Offline] Falha ao persistir lista de conversas:', err);
  } finally {
    db?.close();
  }
}

/**
 * Recupera a lista de conversas salva localmente para modo leitura offline.
 */
export async function getConversationsListOffline(): Promise<ConversationSession[]> {
  if (!isIndexedDbSupported()) {
    return sortByUpdatedDesc(Array.from(memoryMetaFallback.values()));
  }

  let db: IDBDatabase | null = null;
  try {
    db = await openOfflineDb();
    const records = await new Promise<ConversationSession[]>((resolve, reject) => {
      const tx = db!.transaction(STORE_CONVERSATIONS, 'readonly');
      const store = tx.objectStore(STORE_CONVERSATIONS);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as ConversationSession[]) || []);
      req.onerror = () => reject(req.error ?? new Error('Erro ao ler conversas do IndexedDB'));
    });
    return sortByUpdatedDesc(records);
  } catch (err) {
    console.warn('[PWA Offline] Falha ao ler lista de conversas:', err);
    return [];
  } finally {
    db?.close();
  }
}

/**
 * Persiste uma sessão completa (com mensagens) no IndexedDB, aplicando poda LRU
 * para manter apenas as conversas mais recentes em armazenamento local.
 */
export async function saveConversationSessionOffline(
  session: ConversationSession
): Promise<void> {
  if (!session?.id) return;

  const normalizedSession: ConversationSession = {
    ...session,
    isRunning: false,
    messages: (session.messages || []).map((m) => ({
      ...m,
      isStreaming: false
    }))
  };

  const record: CachedSessionRecord = {
    id: session.id,
    updatedAt: session.updatedAt || new Date().toISOString(),
    cachedAt: new Date().toISOString(),
    session: normalizedSession
  };

  if (!isIndexedDbSupported()) {
    memorySessionFallback.set(record.id, record);
    if (memorySessionFallback.size > MAX_OFFLINE_SESSIONS) {
      const entries = Array.from(memorySessionFallback.values()).sort(
        (a, b) => Date.parse(b.cachedAt) - Date.parse(a.cachedAt)
      );
      for (const stale of entries.slice(MAX_OFFLINE_SESSIONS)) {
        memorySessionFallback.delete(stale.id);
      }
    }
    return;
  }

  let db: IDBDatabase | null = null;
  try {
    db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction([STORE_SESSIONS, STORE_CONVERSATIONS], 'readwrite');
      const sessionStore = tx.objectStore(STORE_SESSIONS);
      const metaStore = tx.objectStore(STORE_CONVERSATIONS);

      sessionStore.put(record);

      // Mantém também o metadado sincronizado na listagem offline
      const { messages: _messages, ...meta } = normalizedSession;
      void _messages;
      metaStore.put({
        ...meta,
        messageCount: normalizedSession.messages?.length ?? normalizedSession.messageCount ?? 0
      });

      const allReq = sessionStore.getAll();
      allReq.onsuccess = () => {
        const all = (allReq.result as CachedSessionRecord[]) || [];
        if (all.length > MAX_OFFLINE_SESSIONS) {
          const sorted = [...all].sort(
            (a, b) => (Date.parse(b.cachedAt) || 0) - (Date.parse(a.cachedAt) || 0)
          );
          for (const stale of sorted.slice(MAX_OFFLINE_SESSIONS)) {
            sessionStore.delete(stale.id);
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Erro ao gravar sessão no IndexedDB'));
    });
  } catch (err) {
    console.warn('[PWA Offline] Falha ao salvar sessão de conversa:', err);
  } finally {
    db?.close();
  }
}

/**
 * Lê o histórico completo de uma conversa previamente armazenada no IndexedDB.
 */
export async function getConversationSessionOffline(
  id: string
): Promise<ConversationSession | null> {
  if (!id) return null;

  if (!isIndexedDbSupported()) {
    return memorySessionFallback.get(id)?.session ?? null;
  }

  let db: IDBDatabase | null = null;
  try {
    db = await openOfflineDb();
    const record = await new Promise<CachedSessionRecord | undefined>((resolve, reject) => {
      const tx = db!.transaction(STORE_SESSIONS, 'readonly');
      const store = tx.objectStore(STORE_SESSIONS);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result as CachedSessionRecord | undefined);
      req.onerror = () => reject(req.error ?? new Error('Erro ao ler sessão do IndexedDB'));
    });
    return record?.session ?? null;
  } catch (err) {
    console.warn('[PWA Offline] Falha ao ler sessão de conversa:', err);
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Remove uma conversa excluída também do cache offline.
 */
export async function deleteConversationOffline(id: string): Promise<void> {
  if (!id) return;

  if (!isIndexedDbSupported()) {
    memoryMetaFallback.delete(id);
    memorySessionFallback.delete(id);
    return;
  }

  let db: IDBDatabase | null = null;
  try {
    db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction([STORE_CONVERSATIONS, STORE_SESSIONS], 'readwrite');
      tx.objectStore(STORE_CONVERSATIONS).delete(id);
      tx.objectStore(STORE_SESSIONS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Erro ao excluir conversa offline'));
    });
  } catch (err) {
    console.warn('[PWA Offline] Falha ao remover conversa do cache local:', err);
  } finally {
    db?.close();
  }
}

/**
 * Limpa integralmente os stores de persistência offline (útil para testes e diagnóstico).
 */
export async function clearOfflineStorage(): Promise<void> {
  memoryMetaFallback.clear();
  memorySessionFallback.clear();

  if (!isIndexedDbSupported()) return;

  let db: IDBDatabase | null = null;
  try {
    db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction([STORE_CONVERSATIONS, STORE_SESSIONS], 'readwrite');
      tx.objectStore(STORE_CONVERSATIONS).clear();
      tx.objectStore(STORE_SESSIONS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Erro ao limpar IndexedDB'));
    });
  } catch {
    // Ignora falhas de limpeza
  } finally {
    db?.close();
  }
}
