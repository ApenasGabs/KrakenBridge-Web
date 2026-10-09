import { Router } from 'express';
import { mcpService } from '../services/mcpService.js';

export const mcpRouter = Router();

// GET /api/mcp - Retorna lista de servidores MCP configurados
mcpRouter.get('/', async (req, res) => {
  try {
    const servers = await mcpService.list();
    res.json({ servers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mcp/toggle - Habilita ou desabilita um servidor MCP
mcpRouter.post('/toggle', async (req, res) => {
  try {
    const { name, enable } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Parâmetro name é obrigatório' });
    }
    const result = await mcpService.toggle(name, !!enable);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
