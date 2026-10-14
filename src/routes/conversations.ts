import { Router, type Request, type Response } from 'express';
import { historyService } from '../services/historyService.js';
import { randomUUID } from 'crypto';
import { activeSessions } from '../services/sessionState.js';

export const conversationsRouter = Router();

// Listar todas as conversas
conversationsRouter.get('/', async (_req: Request, res: Response) => {
  const list = await historyService.list();
  const enriched = list.map(item => ({
    ...item,
    isRunning: activeSessions.has(item.id)
  }));
  res.json({ conversations: enriched });
});

// Criar nova conversa
conversationsRouter.post('/', async (req: Request, res: Response) => {
  const { title, agent, model, effort, mode, subproject, tags } = req.body || {};
  const id = randomUUID();
  const session = await historyService.save({
    id,
    title: title || 'Nova Conversa',
    agent: agent || 'antigravity',
    model: model || '',
    effort: effort || 'high',
    mode: mode || 'default',
    subproject: subproject || '',
    tags: Array.isArray(tags) ? tags : [],
    messages: []
  });
  res.json({ session });
});

// Obter detalhes e mensagens de uma conversa específica
conversationsRouter.get('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const session = await historyService.get(id);
  if (!session) {
    return res.status(404).json({ error: 'Conversa não encontrada' });
  }
  session.isRunning = activeSessions.has(id);
  res.json({ session });
});

// Renomear ou atualizar conversa (título, subprojeto e/ou tags)
conversationsRouter.patch('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { title, subproject, tags } = req.body || {};
  if (!title && subproject === undefined && tags === undefined) {
    return res.status(400).json({ error: 'Nenhum campo fornecido para atualização (title, subproject ou tags)' });
  }
  const updated = await historyService.update(id, { title, subproject, tags });
  if (!updated) return res.status(404).json({ error: 'Conversa não encontrada' });
  res.json({ session: updated });
});

// Excluir conversa
conversationsRouter.delete('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (activeSessions.has(id)) {
    const session = activeSessions.get(id);
    try {
      session?.child.kill('SIGTERM');
    } catch {}
    activeSessions.delete(id);
  }
  const success = await historyService.delete(id);
  if (!success) return res.status(404).json({ error: 'Conversa não encontrada ou já excluída' });
  res.json({ success: true, id });
});
