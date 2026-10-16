// Service Worker para Kraken PWA & Web Push
const CACHE_NAME = 'kraken-pwa-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Escuta eventos push disparados pelo servidor (Web Push API)
self.addEventListener('push', (event) => {
  let payload = {
    title: '🤖 KrakenBridge Alerta',
    body: 'Atualização nos agentes autônomos em execução.',
    icon: '/kraken-icon.svg',
    badge: '/kraken-icon.svg',
    tag: 'kraken-agent-notification',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  const notificationOptions = {
    body: payload.body,
    icon: payload.icon || '/kraken-icon.svg',
    badge: payload.badge || '/kraken-icon.svg',
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
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Procura uma janela aberta do Kraken
      for (const client of windowClients) {
        if ('focus' in client) {
          if (client.url.includes(self.location.origin)) {
            // Se já está na mesma conversa ou tela inicial, foca a janela
            return client.focus();
          }
        }
      }
      // Se nenhuma aba estiver aberta, abre uma nova janela
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
