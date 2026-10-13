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

// GET /api/mcp/auth-url ou /api/mcp/:server/auth-url - Gera dados para login/token
mcpRouter.get(['/auth-url', '/:server/auth-url'], async (req, res) => {
  try {
    const serverName = req.params.server || req.query.server || req.query.name;
    if (!serverName) {
      return res.status(400).json({ error: 'Parâmetro server é obrigatório' });
    }
    const data = await mcpService.getAuthUrl(serverName);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mcp/exchange ou /api/mcp/:server/exchange - Troca de PIN/Código/Token
mcpRouter.post(['/exchange', '/:server/exchange'], async (req, res) => {
  try {
    const serverName = req.params.server || req.body.server || req.body.name;
    const rawInput = req.body.code || req.body.token || req.body.rawInput || req.body.url;
    if (!serverName) {
      return res.status(400).json({ error: 'Parâmetro server é obrigatório' });
    }
    if (!rawInput) {
      return res.status(400).json({ error: 'Código ou token de autenticação é obrigatório' });
    }
    const result = await mcpService.exchangeCode(serverName, rawInput);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
