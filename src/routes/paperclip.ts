import { Router, type Request, type Response } from 'express';
import { paperclipService } from '../services/paperclipService.js';

export const paperclipRouter = Router();

/**
 * GET /api/paperclip/status
 * Retorna o snapshot atual do estado do Paperclip (agentes, issues, PRs, stalls, progresso, timeline)
 */
paperclipRouter.get('/status', (_req: Request, res: Response) => {
  const snapshot = paperclipService.getSnapshot();
  res.json(snapshot);
});

/**
 * GET /api/paperclip/summary
 * Retorna o resumo formatado em Markdown para o comando de chat ou visualização rápida
 */
paperclipRouter.get('/summary', (_req: Request, res: Response) => {
  const summary = paperclipService.getPaperclipSummary();
  res.json({ summary });
});

/**
 * GET /api/paperclip/stream
 * Conexão SSE em tempo real para transmissão instantânea de eventos e snapshots
 */
paperclipRouter.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // Keep-alive heartbeat a cada 15s
  const keepAlive = setInterval(() => {
    try {
      if (!res.writableEnded && !res.destroyed) {
        res.write(': ping\n\n');
      }
    } catch {}
  }, 15000);

  paperclipService.registerSSEClient(res);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

/**
 * POST /api/paperclip/poll
 * Dispara uma checagem imediata fora do intervalo regular de 35s
 */
paperclipRouter.post('/poll', async (_req: Request, res: Response) => {
  try {
    const snapshot = await paperclipService.poll();
    res.json({ success: true, snapshot });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

/**
 * POST /api/paperclip/simulate
 * Simula eventos para validação de testes E2E e critérios de aceite (error, blocked, stall)
 */
paperclipRouter.post('/simulate', async (req: Request, res: Response) => {
  const { type } = req.body;
  if (!['error', 'blocked', 'stall', 'ci_failed'].includes(type)) {
    return res.status(400).json({ error: 'Tipo inválido. Esperado: error, blocked, stall ou ci_failed' });
  }

  try {
    const event = await paperclipService.simulateEvent(type, req.body);
    res.json({ success: true, event });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

/**
 * POST /api/paperclip/webhook
 * Ponto de entrada para webhooks vindos diretamente do Paperclip
 */
paperclipRouter.post('/webhook', (req: Request, res: Response) => {
  const body = req.body;
  if (body?.event || body?.type) {
    paperclipService.addTimelineEvent({
      type: body.type || 'issue.status_changed',
      timestamp: new Date().toISOString(),
      title: body.title || 'Evento Recebido via Webhook',
      description: body.description || JSON.stringify(body),
      severity: body.severity || 'info',
      metadata: body
    });
  }
  res.json({ received: true });
});

/**
 * POST /api/paperclip/action
 * Ações rápidas seguras (fase 2): wakeup de agente
 */
paperclipRouter.post('/action', async (req: Request, res: Response) => {
  const { action, agentId, issueId } = req.body;

  if (action === 'wakeup' && agentId) {
    try {
      const paperclipUrl = process.env.PAPERCLIP_URL || 'http://192.168.31.5:3101';
      const token = process.env.PAPERCLIP_API_TOKEN || 'pcp_5df95fac0e950db0d8e9770214678a478ccb79d6d6ce9f3a';
      const response = await fetch(`${paperclipUrl}/api/agents/${agentId}/wakeup`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: 'kraken_operator_action', issueId })
      });

      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: text });
      }

      const json = await response.json().catch(() => ({}));
      return res.json({ success: true, result: json });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || String(err) });
    }
  }

  return res.status(400).json({ error: 'Ação não suportada' });
});
