import { Router, type Request, type Response } from 'express';
import { pushNotificationService } from '../services/pushNotificationService.js';

export const notificationsRouter = Router();

// Retorna a chave pública VAPID para registro no browser / Service Worker
notificationsRouter.get('/vapid-public-key', (_req: Request, res: Response) => {
  const publicKey = pushNotificationService.getVapidPublicKey();
  if (!publicKey) {
    return res.status(500).json({ error: 'Chaves VAPID não configuradas no servidor.' });
  }
  return res.json({ publicKey });
});

// Registra nova inscrição de Web Push
notificationsRouter.post('/subscribe', (req: Request, res: Response) => {
  const { subscription } = req.body || {};
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Assinatura inválida. endpoint e keys são obrigatórios.' });
  }

  const userAgent = req.headers['user-agent'] as string | undefined;
  const ok = pushNotificationService.subscribe(subscription, userAgent);
  if (!ok) {
    return res.status(400).json({ error: 'Falha ao registrar assinatura push.' });
  }

  return res.json({
    success: true,
    message: 'Dispositivo registrado para notificações push com sucesso.',
    activeSubscriptions: pushNotificationService.getSubscriptionsCount()
  });
});

// Remove inscrição de Web Push
notificationsRouter.post('/unsubscribe', (req: Request, res: Response) => {
  const { endpoint } = req.body || {};
  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({ error: 'Endpoint é obrigatório.' });
  }

  const removed = pushNotificationService.unsubscribe(endpoint);
  return res.json({
    success: true,
    removed,
    activeSubscriptions: pushNotificationService.getSubscriptionsCount()
  });
});

// Envia notificação de teste para todos os dispositivos inscritos
notificationsRouter.post('/test', async (req: Request, res: Response) => {
  const { title = '🔔 Teste de Notificação Kraken', body = 'O sistema de notificações móveis PWA & Web Push está operacional!' } = req.body || {};
  
  const result = await pushNotificationService.sendPushNotification({
    title,
    body,
    tag: 'kraken-test-notification',
    data: { url: '/', test: true }
  });

  return res.json({
    success: true,
    sent: result.sent,
    failed: result.failed,
    activeSubscriptions: pushNotificationService.getSubscriptionsCount()
  });
});

// Retorna status das notificações
notificationsRouter.get('/status', (_req: Request, res: Response) => {
  return res.json({
    configured: !!pushNotificationService.getVapidPublicKey(),
    activeSubscriptions: pushNotificationService.getSubscriptionsCount()
  });
});
