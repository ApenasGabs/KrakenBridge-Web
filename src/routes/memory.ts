import { Router, type Request, type Response } from 'express';
import { aiMemoryService } from '../services/aiMemoryService.js';

export const memoryRouter = Router();

// Retorna o status do servidor ai-memory
memoryRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await aiMemoryService.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Retorna o snapshot/briefing atual da memória
memoryRouter.get('/briefing', async (req: Request, res: Response) => {
  try {
    const workspace = (req.query.workspace as string) || 'default';
    const project = (req.query.project as string) || 'scratch';
    const briefing = await aiMemoryService.getBriefing(workspace, project);
    res.json(briefing);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Busca textual e semântica na memória
memoryRouter.get('/search', async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || '';
    const limit = parseInt(req.query.limit as string || '20', 10);
    const results = await aiMemoryService.search(query, limit);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Lista páginas wiki mais recentes
memoryRouter.get('/recent', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string || '20', 10);
    const pages = await aiMemoryService.listRecentPages(limit);
    res.json(pages);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Obtém o conteúdo de uma página específica
memoryRouter.get('/page', async (req: Request, res: Response) => {
  try {
    const pagePath = req.query.path as string;
    if (!pagePath) {
      return res.status(400).json({ error: 'Parâmetro "path" é obrigatório.' });
    }
    const page = await aiMemoryService.readPage(pagePath);
    if (!page) {
      return res.status(404).json({ error: 'Página não encontrada.' });
    }
    res.json(page);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Grava ou atualiza uma página wiki
memoryRouter.post('/page', async (req: Request, res: Response) => {
  try {
    const { path: pagePath, body, tags, pinned, workspace, project } = req.body;
    if (!pagePath || !body) {
      return res.status(400).json({ error: 'Campos "path" e "body" são obrigatórios.' });
    }

    const result = await aiMemoryService.writePage({
      path: pagePath,
      body,
      tags,
      pinned,
      workspace,
      project
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Lista handoffs abertos
memoryRouter.get('/handoffs', async (_req: Request, res: Response) => {
  try {
    const handoffs = await aiMemoryService.listHandoffs();
    res.json(handoffs);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Cria um novo handoff
memoryRouter.post('/handoff', async (req: Request, res: Response) => {
  try {
    const { title, summary, targetAgent } = req.body;
    if (!title || !summary) {
      return res.status(400).json({ error: 'Campos "title" e "summary" são obrigatórios.' });
    }

    const result = await aiMemoryService.createHandoff({
      title,
      summary,
      targetAgent
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
