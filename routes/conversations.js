import { Router } from 'express';
import { historyService } from '../services/historyService.js';
import { randomUUID } from 'crypto';

export const conversationsRouter = Router();

// Listar todas as conversas
conversationsRouter.get('/', async (req, res) => {
  const list = await historyService.list();
  res.json({ conversations: list });
});

// Criar nova conversa
conversationsRouter.post('/', async (req, res) => {
  const { title, agent, model, effort, mode, subproject } = req.body;
  const id = randomUUID();
  const session = await historyService.save({
    id,
    title: title || 'Nova Conversa',
    agent: agent || 'antigravity',
    model: model || '',
    effort: effort || 'high',
    mode: mode || 'default',
    subproject: subproject || '',
    messages: []
  });
  res.json({ session });
});

// Obter detalhes e mensagens de uma conversa específica
conversationsRouter.get('/:id', async (req, res) => {
  const session = await historyService.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Conversa não encontrada' });
  }
  res.json({ session });
});

// Renomear conversa
conversationsRouter.patch('/:id', async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Título é obrigatório' });
  const updated = await historyService.rename(req.params.id, title);
  if (!updated) return res.status(404).json({ error: 'Conversa não encontrada' });
  res.json({ session: updated });
});

// Excluir conversa
conversationsRouter.delete('/:id', async (req, res) => {
  const success = await historyService.delete(req.params.id);
  if (!success) return res.status(404).json({ error: 'Conversa não encontrada ou já excluída' });
  res.json({ success: true, id: req.params.id });
});
