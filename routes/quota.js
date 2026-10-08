import { Router } from 'express';
import { quotaService } from '../services/quotaService.js';

export const quotaRouter = Router();

// GET /api/quota - Retorna métricas de consumo por hora, dia e semana
quotaRouter.get('/', async (req, res) => {
  try {
    const stats = await quotaService.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/quota/record - Registra um consumo de tokens manualmente (se necessário)
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
