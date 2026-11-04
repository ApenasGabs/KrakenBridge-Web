/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  matchPrecache,
  precacheAndRoute
} from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import {
  CacheFirst,
  NetworkFirst,
  StaleWhileRevalidate
} from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope;

// Ativação imediata e controle de clientes abertos
self.skipWaiting();
clientsClaim();

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Limpa caches obsoletos de versões anteriores e registra precache do manifesto gerado pelo Vite
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

function isBypassedPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api/') ||
    pathname === '/api' ||
    pathname.startsWith('/chat/api/') ||
    pathname === '/chat/api' ||
    pathname.endsWith('/healthz') ||
    pathname.endsWith('/readyz')
  );
}

// 1. Navegação SPA (index.html com <base href> dinâmico): NetworkFirst com fallback offline
const navigationStrategy = new NetworkFirst({
  cacheName: 'kraken-navigation-v1',
  networkTimeoutSeconds: 4,
  plugins: [
    new CacheableResponsePlugin({ statuses: [200] }),
    new ExpirationPlugin({
      maxEntries: 30,
      maxAgeSeconds: 7 * 24 * 60 * 60
    })
  ]
});

registerRoute(
  ({ request, url }) =>
    request.mode === 'navigate' && !isBypassedPath(url.pathname),
  async (options) => {
    try {
      const response = await navigationStrategy.handle(options);
      if (response) return response;
    } catch {
      // Continua para o fallback offline abaixo
    }

    const navCache = await caches.open('kraken-navigation-v1');
    const isSubpath = options.url.pathname.startsWith('/chat');
    if (isSubpath) {
      const cachedSubpath =
        (await navCache.match('/chat', { ignoreSearch: true })) ||
        (await navCache.match('/chat/', { ignoreSearch: true }));
      if (cachedSubpath) return cachedSubpath;
    }

    const cachedRoot = await navCache.match('/', { ignoreSearch: true });
    if (cachedRoot) return cachedRoot;

    const precachedIndex =
      (await matchPrecache('index.html')) ||
      (await matchPrecache('./index.html')) ||
      (await matchPrecache('/index.html'));
    if (precachedIndex) return precachedIndex;

    return Response.error();
  }
);

// 2. Bundles versionados do Vite (/assets/* e /chat/assets/*): CacheFirst
registerRoute(
  ({ request, url }) =>
    request.method === 'GET' &&
    !isBypassedPath(url.pathname) &&
    /\/assets\/[^?#]+$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'kraken-vite-assets-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 120,
        maxAgeSeconds: 30 * 24 * 60 * 60
      })
    ]
  })
);

// 3. Editor Monaco (/monaco/vs/*), Google Fonts e assets estáticos públicos: StaleWhileRevalidate
registerRoute(
  ({ request, url }) => {
    if (request.method !== 'GET' || isBypassedPath(url.pathname)) {
      return false;
    }

    const isMonaco = /\/monaco\/vs\//.test(url.pathname);
    const isGoogleFonts =
      url.origin === 'https://fonts.googleapis.com' ||
      url.origin === 'https://fonts.gstatic.com';
    const isPublicStatic =
      url.origin === self.location.origin &&
      /\.(?:png|svg|ico|webp|woff2?|ttf|webmanifest)$/i.test(url.pathname);

    return isMonaco || isGoogleFonts || isPublicStatic;
  },
  new StaleWhileRevalidate({
    cacheName: 'kraken-static-monaco-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 250,
        maxAgeSeconds: 30 * 24 * 60 * 60
      })
    ]
  })
);

// ============================================================================
// Web Push Notifications (Preservado integralmente + suporte a ícones PNG)
// ============================================================================
interface KrakenPushPayload {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: { url?: string; [key: string]: unknown };
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: Required<Pick<KrakenPushPayload, 'title' | 'body' | 'icon' | 'badge' | 'tag'>> & {
    data: { url: string; [key: string]: unknown };
  } = {
    title: '🤖 KrakenBridge Alerta',
    body: 'Atualização nos agentes autônomos em execução.',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: 'kraken-agent-notification',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      const parsed = event.data.json() as KrakenPushPayload;
      payload = {
        ...payload,
        ...parsed,
        data: { url: '/', ...(parsed.data || {}) }
      };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  const notificationOptions: NotificationOptions & {
    vibrate?: number[];
    renotify?: boolean;
  } = {
    body: payload.body,
    icon: payload.icon || '/icon-192x192.png',
    badge: payload.badge || '/icon-192x192.png',
    tag: payload.tag || 'kraken-agent-notification',
    data: payload.data || { url: '/' },
    vibrate: [150, 50, 150],
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, notificationOptions)
  );
});

// Ao clicar na notificação no smartphone ou desktop, foca ou abre o Kraken
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const defaultUrl = self.location.pathname.startsWith('/chat') ? '/chat/' : '/';
  const targetUrl =
    (event.notification.data as { url?: string } | undefined)?.url || defaultUrl;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client && client.url.includes(self.location.origin)) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
