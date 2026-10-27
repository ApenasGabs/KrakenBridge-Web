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

let deferredPrompt: any = null;
let installPromptListeners: ((canInstall: boolean) => void)[] = [];

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installPromptListeners.forEach(fn => fn(true));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installPromptListeners.forEach(fn => fn(false));
    console.log('[PWA] Kraken App instalado com sucesso na tela inicial!');
  });
}

export function onInstallPromptChange(callback: (canInstall: boolean) => void): () => void {
  installPromptListeners.push(callback);
  callback(deferredPrompt !== null);
  return () => {
    installPromptListeners = installPromptListeners.filter(fn => fn !== callback);
  };
}

export async function promptPwaInstall(): Promise<'accepted' | 'dismissed' | null> {
  if (!deferredPrompt) {
    return null;
  }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  installPromptListeners.forEach(fn => fn(false));
  return outcome;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const isSubpath = window.location.pathname.startsWith('/chat');
    const swUrl = isSubpath ? '/chat/sw.js' : '/sw.js';
    const scope = isSubpath ? '/chat/' : '/';
    const reg = await navigator.serviceWorker.register(swUrl, { scope });
    console.log('[PWA] Service Worker registrado com escopo:', reg.scope);
    return reg;
  } catch (err) {
    console.warn('[PWA] Falha ao registrar Service Worker:', err);
    return null;
  }
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
  } catch (err: any) {
    console.error('[PWA] Erro ao subscrever push:', err);
    return { success: false, error: err?.message || 'Erro ao registrar notificações push.' };
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
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao cancelar notificações push.' };
  }
}
