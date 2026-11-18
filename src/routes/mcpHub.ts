import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { mcpHubService, type JsonRpcRequest } from '../services/mcpHubService.js';

export const mcpHubRouter = Router();

// Mapa de sessões ativas para suporte a clientes SSE (Server-Sent Events)
const activeSseSessions = new Map<string, Response>();

// Validador de autenticação para o endpoint /mcp
const mcpAuthMiddleware = (req: Request, res: Response, next: () => void) => {
  // Se for apenas verificação de status JSON via GET sem SSE, libera para healthcheck/observabilidade
  const acceptHeader = req.headers.accept || '';
  if (req.method === 'GET' && !acceptHeader.includes('text/event-stream')) {
    return next();
  }

  const configuredPin = (process.env.KRAKEN_PIN || '').trim();
  // Se não houver KRAKEN_PIN configurado, o acesso ao homelab é liberado
  if (!configuredPin) return next();

  const secret = process.env.APP_SECRET || configuredPin;
  const expectedPinToken = crypto.createHmac('sha256', secret).update(`kraken_auth_${configuredPin}`).digest('hex');
  const allowedTokens = new Set([
    expectedPinToken,
    configuredPin,
    process.env.AI_MEMORY_TOKEN || 'a1543485d89fc26de8b596ecda51ba012966340f0f7bc1d385f7ec1456ff139d'
  ]);

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || (req.query.token as string | undefined) || (req.query.pin as string | undefined);

  if (token && allowedTokens.has(token)) {
    return next();
  }

  // Falha de autenticação
  return res.status(401).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Acesso não autorizado ao Kraken MCP Hub. Forneça o token ou PIN correto.'
    }
  });
};

mcpHubRouter.use(mcpAuthMiddleware);

// GET /mcp - Suporte a SSE para clientes MCP que utilizam EventSource ou checagem de status
mcpHubRouter.get('/', (req: Request, res: Response) => {
  const acceptHeader = req.headers.accept || '';

  if (acceptHeader.includes('text/event-stream')) {
    const sessionId = crypto.randomUUID();

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    activeSseSessions.set(sessionId, res);

    // Envia o endpoint relativo para POST de mensagens
    const endpointUrl = `/mcp/messages?sessionId=${sessionId}`;
    res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

    // Keepalive a cada 15 segundos
    const keepaliveTimer = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keepalive\n\n');
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(keepaliveTimer);
      activeSseSessions.delete(sessionId);
    });

    return;
  }

  // Se não for SSE, responde com o status operacional do Hub
  const status = mcpHubService.getStatus();
  res.json({
    status: 'online',
    service: 'Kraken MCP Hub Gateway',
    version: '1.0.0',
    endpoints: {
      http: '/mcp',
      sse: '/mcp',
      messages: '/mcp/messages'
    },
    downstream: {
      aiMemory: status.aiMemoryUrl,
      anytype: status.anytypeBaseUrl,
      anytypeReady: status.anytypeReady
    },
    cachedToolCount: status.cachedToolCount
  });
});

// POST /mcp - Endpoint primário Streamable HTTP POST JSON-RPC (MCP 2024-11-05)
mcpHubRouter.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body as JsonRpcRequest;
    if (!body || typeof body !== 'object' || body.jsonrpc !== '2.0' || !body.method) {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: body?.id ?? null,
        error: {
          code: -32600,
          message: 'Invalid Request: Objeto JSON-RPC 2.0 inválido'
        }
      });
    }

    const response = await mcpHubService.handleJsonRpc(body);

    if (response === null) {
      // Notificação (ex: notifications/initialized) não tem corpo de resposta
      return res.status(204).end();
    }

    return res.json(response);
  } catch (err) {
    return res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id ?? null,
      error: {
        code: -32603,
        message: `Internal error: ${(err as Error).message}`
      }
    });
  }
});

// POST /mcp/messages - Envio de mensagens para sessões SSE abertas
mcpHubRouter.post('/messages', async (req: Request, res: Response) => {
  try {
    const sessionId = req.query.sessionId as string | undefined;
    const body = req.body as JsonRpcRequest;

    if (!body || typeof body !== 'object' || body.jsonrpc !== '2.0' || !body.method) {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: body?.id ?? null,
        error: {
          code: -32600,
          message: 'Invalid Request: Objeto JSON-RPC 2.0 inválido'
        }
      });
    }

    const response = await mcpHubService.handleJsonRpc(body);

    if (sessionId && activeSseSessions.has(sessionId)) {
      const sseRes = activeSseSessions.get(sessionId)!;
      if (!sseRes.writableEnded && response !== null) {
        sseRes.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
      }
      return res.status(202).send('Accepted');
    }

    // Fallback: se não houver stream SSE ativo, responde no próprio POST
    if (response === null) {
      return res.status(204).end();
    }
    return res.json(response);
  } catch (err) {
    return res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id ?? null,
      error: {
        code: -32603,
        message: `Internal error: ${(err as Error).message}`
      }
    });
  }
});
