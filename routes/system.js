import { Router } from 'express';
import { evolutionService } from '../services/evolutionService.js';

export const systemRouter = Router();

// Obter status da auto-evolução
systemRouter.get('/evolution/status', async (req, res) => {
  try {
    const state = await evolutionService.getState();
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Disparar auto-reload pós-modificação de código
systemRouter.post('/self-reload', async (req, res) => {
  try {
    const { conversationId, taskDescription, rebuildFrontend } = req.body || {};
    const result = await evolutionService.triggerReload({
      conversationId,
      taskDescription,
      rebuildFrontend
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
