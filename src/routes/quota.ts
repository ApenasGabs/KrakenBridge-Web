import { Router, type Request, type Response } from 'express';
import { quotaService } from '../services/quotaService.js';
import { paperclipService } from '../services/paperclipService.js';
import { PaperclipUsageService } from '../services/paperclipUsageService.js';
import type { UsageSource } from '../types/quota.js';

export const quotaRouter = Router();

const paperclipUsageService = new PaperclipUsageService((path) => paperclipService.fetchCompanyResource(path));

const parseUsageSource = (value: unknown): UsageSource =>
  value === 'kraken' || value === 'paperclip' ? value : 'all';

const loadStats = async (source: UsageSource) => {
  const external = source === 'kraken' ? undefined : await paperclipUsageService.getSnapshot();
  return quotaService.getStats({ source, external });
};

// GET /api/quota - Retorna métricas de cota dos modelos (Gemini e Claude/GPT) e tokens
quotaRouter.get('/', async (req: Request, res: Response) => {
  try {
    const stats = await loadStats(parseUsageSource(req.query.source));
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/quota/refresh - Força consulta oficial ao vivo no Google via CLI
quotaRouter.post('/refresh', async (req: Request, res: Response) => {
  try {
    await quotaService.fetchLiveQuotaFromGoogle(true);
    const stats = await loadStats(parseUsageSource(req.query.source));
    res.json({ ok: true, stats });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/quota/sync - Permite calibrar manualmente se desejado
quotaRouter.post('/sync', async (req: Request, res: Response) => {
  try {
    const { gemini, claudeGpt } = req.body || {};
    const updated = await quotaService.syncQuota({ gemini, claudeGpt });
    res.json({ ok: true, stats: updated });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/quota/accounts - Retorna visão multi-contas de cotas de todo o pool
quotaRouter.get('/accounts', async (req: Request, res: Response) => {
  try {
    const force = req.query.force === 'true';
    const overview = await quotaService.getMultiAccountQuotaOverview(force);
    res.json(overview);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/quota/accounts/refresh - Força atualização do cache de todas as contas (AGY + Claude Code)
quotaRouter.post('/accounts/refresh', async (_req: Request, res: Response) => {
  try {
    const overview = await quotaService.getMultiAccountQuotaOverview(true);
    res.json({ ok: true, overview });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/quota/route-by-model - Roteia automaticamente para a conta com melhor cota do modelo
quotaRouter.post('/route-by-model', async (req: Request, res: Response) => {
  try {
    const { model, minQuotaThreshold } = req.body || {};
    if (!model || typeof model !== 'string') {
      res.status(400).json({ error: 'Campo model é obrigatório.' });
      return;
    }
    const result = await quotaService.routeByModel(
      model,
      typeof minQuotaThreshold === 'number' ? minQuotaThreshold : 5
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/quota/record - Registra um consumo de tokens manualmente
quotaRouter.post('/record', async (req: Request, res: Response) => {
  try {
    const { model, agent, input_tokens, cached_input_tokens, output_tokens, thinking_tokens, total_tokens } = req.body || {};
    const record = await quotaService.recordUsage({
      model,
      agent,
      input_tokens,
      cached_input_tokens,
      output_tokens,
      thinking_tokens,
      total_tokens
    });
    res.json({ ok: true, record });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
