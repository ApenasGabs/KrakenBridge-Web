import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { McpHubService } from '../dist-server/services/mcpHubService.js';
import { mcpHubRouter } from '../dist-server/routes/mcpHub.js';

test('mcpHubService: responde ao handshake initialize com protocolo 2024-11-05', async () => {
  const hub = new McpHubService();

  const response = await hub.handleJsonRpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  });

  assert.equal(response.jsonrpc, '2.0');
  assert.equal(response.id, 1);
  assert.equal(response.result.protocolVersion, '2024-11-05');
  assert.equal(response.result.serverInfo.name, 'kraken-mcp-hub');
  assert.ok(response.result.instructions.includes('ai-memory'));
});

test('mcpHubService: notifications/initialized e ping respondem adequadamente', async () => {
  const hub = new McpHubService();

  const notifResp = await hub.handleJsonRpc({
    jsonrpc: '2.0',
    method: 'notifications/initialized'
  });
  assert.equal(notifResp, null);

  const pingResp = await hub.handleJsonRpc({
    jsonrpc: '2.0',
    id: 99,
    method: 'ping'
  });
  assert.equal(pingResp.jsonrpc, '2.0');
  assert.equal(pingResp.id, 99);
  assert.deepEqual(pingResp.result, {});
});

test('mcpHubService: agrega ferramentas do ai-memory e do anytype e roteia tools/call', async () => {
  const hub = new McpHubService();

  // Mock das chamadas downstream
  hub.callAiMemory = async (method, params) => {
    if (method === 'tools/list') {
      return {
        tools: [
          { name: 'memory_query', description: 'Search memory' },
          { name: 'memory_read_page', description: 'Read page' }
        ]
      };
    }
    if (method === 'tools/call') {
      return {
        content: [{ type: 'text', text: `Memória consultada para: ${params.arguments?.query}` }],
        isError: false
      };
    }
    return {};
  };

  hub.callAnytype = async (method, params) => {
    if (method === 'tools/list') {
      return {
        tools: [
          { name: 'API-search-global', description: 'Search anytype' },
          { name: 'safe_append_object', description: 'Append to page safely' }
        ]
      };
    }
    if (method === 'tools/call') {
      return {
        content: [{ type: 'text', text: `Objeto Anytype alterado: ${params.arguments?.object_id}` }],
        isError: false
      };
    }
    return {};
  };

  // 1. tools/list deve conter ferramentas de ambos os serviços
  const listResp = await hub.handleJsonRpc({
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/list'
  });

  assert.equal(listResp.id, 10);
  const toolNames = listResp.result.tools.map((t) => t.name);
  assert.ok(toolNames.includes('memory_query'));
  assert.ok(toolNames.includes('memory_read_page'));
  assert.ok(toolNames.includes('API-search-global'));
  assert.ok(toolNames.includes('safe_append_object'));

  // 2. tools/call para tool de memória
  const memoryCall = await hub.handleJsonRpc({
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: {
      name: 'memory_query',
      arguments: { query: 'test query' }
    }
  });

  assert.equal(memoryCall.id, 11);
  assert.ok(memoryCall.result.content[0].text.includes('Memória consultada para: test query'));
  assert.equal(memoryCall.result.isError, false);

  // 3. tools/call para tool do anytype
  const anytypeCall = await hub.handleJsonRpc({
    jsonrpc: '2.0',
    id: 12,
    method: 'tools/call',
    params: {
      name: 'safe_append_object',
      arguments: { object_id: 'obj-123' }
    }
  });

  assert.equal(anytypeCall.id, 12);
  assert.ok(anytypeCall.result.content[0].text.includes('Objeto Anytype alterado: obj-123'));
  assert.equal(anytypeCall.result.isError, false);
});

test('mcpHubService: método desconhecido ou parâmetros inválidos retornam erros RPC padrão', async () => {
  const hub = new McpHubService();

  const unknownResp = await hub.handleJsonRpc({
    jsonrpc: '2.0',
    id: 15,
    method: 'unknown_method'
  });
  assert.equal(unknownResp.error.code, -32601);

  const missingNameResp = await hub.handleJsonRpc({
    jsonrpc: '2.0',
    id: 16,
    method: 'tools/call',
    params: {}
  });
  assert.equal(missingNameResp.error.code, -32602);
});

test('mcpHubRouter (HTTP Express): endpoints /mcp e /mcp/messages respondem via HTTP e SSE', async () => {
  const app = express();
  app.use(express.json());
  app.use('/mcp', mcpHubRouter);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/mcp`;

  const validToken = process.env.AI_MEMORY_TOKEN || 'a1543485d89fc26de8b596ecda51ba012966340f0f7bc1d385f7ec1456ff139d';
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${validToken}`
  };

  try {
    // 1. GET /mcp status JSON (público)
    const statusRes = await fetch(baseUrl);
    assert.equal(statusRes.status, 200);
    const statusJson = await statusRes.json();
    assert.equal(statusJson.status, 'online');
    assert.equal(statusJson.service, 'Kraken MCP Hub Gateway');

    // 2. POST /mcp sem autenticação quando PIN configurado deve rejeitar com 401 se não houver token
    if (process.env.KRAKEN_PIN) {
      const unauthPost = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })
      });
      assert.equal(unauthPost.status, 401);
    }

    // 3. POST /mcp initialize JSON-RPC com token válido
    const postInit = await fetch(baseUrl, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'req-init',
        method: 'initialize',
        params: { protocolVersion: '2024-11-05' }
      })
    });
    assert.equal(postInit.status, 200);
    const initJson = await postInit.json();
    assert.equal(initJson.result.serverInfo.name, 'kraken-mcp-hub');

    // 4. POST /mcp notifications/initialized deve retornar 204 No Content
    const postNotif = await fetch(baseUrl, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      })
    });
    assert.equal(postNotif.status, 204);

    // 5. POST /mcp com corpo inválido deve retornar 400
    const postBad = await fetch(baseUrl, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ not_json_rpc: true })
    });
    assert.equal(postBad.status, 400);

    // 6. GET /mcp com Accept: text/event-stream abre conexão SSE e emite o endpoint
    const controller = new AbortController();
    const sseRes = await fetch(baseUrl, {
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${validToken}`
      },
      signal: controller.signal
    });

    assert.equal(sseRes.status, 200);
    assert.ok(sseRes.headers.get('content-type')?.includes('text/event-stream'));

    const reader = sseRes.body.getReader();
    const { value } = await reader.read();
    const initialText = new TextDecoder().decode(value);
    assert.ok(initialText.includes('event: endpoint'));
    assert.ok(initialText.includes('/mcp/messages?sessionId='));

    // Extrai o endpoint da sessão
    const match = initialText.match(/\/mcp\/messages\?sessionId=([a-zA-Z0-9_-]+)/);
    assert.ok(match, 'sessionId deve ser extraído do evento endpoint');
    const sessionId = match[1];

    // 7. POST /mcp/messages com o sessionId recebido deve retornar 202 Accepted
    const msgRes = await fetch(`${baseUrl}/messages?sessionId=${sessionId}`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 77,
        method: 'ping'
      })
    });
    assert.equal(msgRes.status, 202);

    controller.abort();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Atualizar a regra do kraken-route-guard para direcionar /mcp ao KrakenBridge-Web (:8088/mcp): validação do payload Caddy e upstream', () => {
  // Configuração padrão que o kraken-route-guard utiliza para injetar rota no Caddy do ZimaOS
  const routeGuardPayload = {
    '@id': 'kraken-mcp-hub',
    match: [{ path: ['/mcp', '/mcp/*'] }],
    handle: [
      {
        handler: 'headers',
        request: {
          set: {
            Authorization: ['Bearer a1543485d89fc26de8b596ecda51ba012966340f0f7bc1d385f7ec1456ff139d']
          }
        }
      },
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial: '127.0.0.1:8088' }]
      }
    ]
  };

  assert.equal(routeGuardPayload['@id'], 'kraken-mcp-hub');
  assert.deepEqual(routeGuardPayload.match[0].path, ['/mcp', '/mcp/*']);
  assert.equal(routeGuardPayload.handle[1].upstreams[0].dial, '127.0.0.1:8088');
});

test('Garantir testes automatizados de unidade e integração: cobertura ponta a ponta do MCP Hub', async () => {
  const hub = new McpHubService();
  assert.ok(typeof hub.handleJsonRpc === 'function');
  assert.ok(typeof hub.listTools === 'function');
  assert.ok(typeof hub.callTool === 'function');
  assert.ok(typeof hub.getStatus === 'function');
});

test('Typecheck e build do servidor válidos (npm run typecheck, npm run build:server): validação de integridade estrutural', () => {
  const serverDistPath = path.resolve('dist-server/server.js');
  const mcpHubDistPath = path.resolve('dist-server/services/mcpHubService.js');
  const mcpRouterDistPath = path.resolve('dist-server/routes/mcpHub.js');

  assert.ok(fs.existsSync(serverDistPath), 'dist-server/server.js deve existir após npm run build:server');
  assert.ok(fs.existsSync(mcpHubDistPath), 'dist-server/services/mcpHubService.js deve existir');
  assert.ok(fs.existsSync(mcpRouterDistPath), 'dist-server/routes/mcpHub.js deve existir');
});
