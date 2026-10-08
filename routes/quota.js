import { Router } from 'express';
import { quotaService } from '../services/quotaService.js';

export const quotaRouter = Router();

// GET /api/quota - Retorna métricas de cota dos modelos (Gemini e Claude/GPT) e tokens
quotaRouter.get('/', async (req, res) => {
  try {
    const stats = await quotaService.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/quota/sync - Permite calibrar / sincronizar os percentuais com a conta oficial
quotaRouter.post('/sync', async (req, res) => {
  try {
    const { gemini, claudeGpt } = req.body;
    const updated = await quotaService.syncQuota({ gemini, claudeGpt });
    res.json({ ok: true, stats: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/quota/record - Registra um consumo de tokens manualmente
quotaRouter.post('/record', async (req, res) => {
  try {
    const { model, agent, input_tokens, output_tokens, thinking_tokens, total_tokens } = req.body;
    const record = await quotaService.recordUsage({
      model,
      agent,
      input_tokens,
      output_tokens,
      thinking_tokens,
      total_tokens
    });
    res.json({ ok: true, record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
