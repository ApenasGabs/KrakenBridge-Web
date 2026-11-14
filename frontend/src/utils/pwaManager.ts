import { Workbox } from 'workbox-window';
import { api } from '../services/api';

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installPromptListeners: ((canInstall: boolean) => void)[] = [];
let activeWorkbox: Workbox | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    installPromptListeners.forEach((fn) => fn(true));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installPromptListeners.forEach((fn) => fn(false));
    console.log('[PWA] Kraken App instalado com sucesso na tela inicial!');
  });
}

export function onInstallPromptChange(callback: (canInstall: boolean) => void): () => void {
  installPromptListeners.push(callback);
  callback(deferredPrompt !== null);
  return () => {
    installPromptListeners = installPromptListeners.filter((fn) => fn !== callback);
  };
}

export async function promptPwaInstall(): Promise<'accepted' | 'dismissed' | null> {
  if (!deferredPrompt) {
    return null;
  }
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  installPromptListeners.forEach((fn) => fn(false));
  return outcome;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  // Em modo Vite dev puro (sem build SW), evita falso erro de MIME text/html
  if (import.meta.env.DEV) {
    return null;
  }

  try {
    const baseEl = typeof document !== 'undefined' ? document.querySelector('base') : null;
    const baseHref = baseEl?.getAttribute('href') || '/';
    const isSubpath = baseHref.startsWith('/chat') || window.location.pathname.startsWith('/chat');
    const swUrl = isSubpath ? '/chat/sw.js' : '/sw.js';
    // Com o header Service-Worker-Allowed: /, registramos escopo /chat/ ou /
    const scope = isSubpath ? '/chat/' : '/';

    const wb = new Workbox(swUrl, { scope });
    activeWorkbox = wb;

    wb.addEventListener('waiting', () => {
      wb.messageSkipWaiting();
    });

    // Quando um novo service worker assume o controle após atualização, recarrega a janela automaticamente
    wb.addEventListener('controlling', (event) => {
      if (event.isUpdate) {
        console.log('[PWA] Nova versão do Service Worker ativada. Recarregando aplicação...');
        window.location.reload();
      }
    });

    const reg = await wb.register();
    if (reg) {
      console.log('[PWA] Workbox Service Worker registrado com escopo:', reg.scope);

      // Checa atualizações quando o app ganha foco / visibilidade (ao voltar da tela inicial ou desbloquear celular)
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            reg.update().catch((err) => {
              console.warn('[PWA] Falha ao verificar update do SW no visibilitychange:', err);
            });
          }
        });
      }

      // Checa atualizações a cada 10 minutos em segundo plano
      setInterval(() => {
        reg.update().catch(() => {});
      }, 10 * 60 * 1000);
    }
    return reg ?? null;
  } catch (err) {
    console.warn('[PWA] Falha ao registrar Service Worker via Workbox:', err);
    return null;
  }
}

/**
 * Expurga todos os caches salvos no CacheStorage e força a recarga limpa da aplicação.
 * Útil para quando o PWA renderizar estilos antigos ou travar em assets em cache.
 */
export async function forcePurgePwaCacheAndReload(): Promise<void> {
  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      console.log('[PWA] Todos os caches do CacheStorage foram expurgados com sucesso.');
    }
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.update().catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[PWA] Erro ao expurgar caches:', err);
  } finally {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }
}

export function getWorkboxInstance(): Workbox | null {
  return activeWorkbox;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'default';
  }
  return Notification.permission;
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function subscribeToPush(): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) {
    return { success: false, error: 'Web Push não é suportado neste navegador.' };
  }

  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      return { success: false, error: 'Permissão de notificações negada pelo usuário.' };
    }

    const reg = await navigator.serviceWorker.ready;
    const { publicKey } = await api.getVapidPublicKey();
    if (!publicKey) {
      return { success: false, error: 'Chave pública VAPID indisponível no servidor.' };
    }

    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as unknown as BufferSource
    });

    const serialized = subscription.toJSON();
    await api.subscribePush(serialized);

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao registrar notificações push.';
    console.error('[PWA] Erro ao subscrever push:', err);
    return { success: false, error: message };
  }
}

export async function unsubscribeFromPush(): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) return { success: false };

  try {
    const sub = await getCurrentPushSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await api.unsubscribePush(endpoint);
    }
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao cancelar notificações push.';
    return { success: false, error: message };
  }
}
