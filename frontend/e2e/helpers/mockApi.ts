import type { Page } from '@playwright/test';

export interface MockOptions {
  pinRequired?: boolean;
  pinValid?: boolean;
  authenticated?: boolean;
  conversations?: any[];
  activeConversation?: any;
  mcpServers?: any[];
}

export const defaultMockData = {
  authStatus: {
    authenticated: true,
    email: 'dev@kraken.local',
    picture: null,
    isKeyValid: true,
    github: {
      authenticated: true,
      username: 'ApenasGabs',
      hasToken: true,
    },
  },
  accounts: [
    { email: 'dev@kraken.local', name: 'Dev Kraken (Principal)', picture: '', active: true },
    { email: 'secondary@kraken.local', name: 'Secundária', picture: '', active: false },
  ],
  config: {
    workspaceDir: '/workspace',
    codeServerPort: 8089,
  },
  projects: [
    { name: 'KrakenBridge-Web', path: '/app', isGit: true, currentBranch: 'feat/#9-e2e-visual-tests' },
    { name: 'homelab-stack', path: '/workspace/homelab', isGit: false },
  ],
  models: {
    antigravity: [
      { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)' },
      { id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (High)' },
      { id: 'claude-sonnet-5-5-high', name: 'Claude Sonnet 5.5 (High)' },
    ],
    models: ['gemini-3.8-flash-high', 'gemini-3.1-pro-high', 'claude-sonnet-5-5-high'],
  },
  mcpServers: [
    {
      name: 'anytype',
      status: 'enabled',
      command: 'node /opt/mcps/anytype/dist/index.js',
      description: 'Anytype Homelab Knowledge Base MCP',
    },
    {
      name: 'sqlite',
      status: 'disabled',
      command: 'python -m mcp_sqlite',
      description: 'Local SQLite Database Explorer',
    },
  ],
  quotaStats: {
    source: 'official_google',
    gemini: {
      title: 'Gemini Models',
      fiveHour: { remaining: 92, message: 'Reseta em 3h 12m' },
      weekly: { remaining: 85, message: 'Reseta em 5 dias' },
    },
    claudeGpt: {
      title: 'Claude and GPT models',
      fiveHour: { remaining: 78, message: 'Reseta em 2h 40m' },
      weekly: { remaining: 60, message: 'Reseta em 4 dias' },
    },
  },
  conversations: [
    {
      id: 'conv-e2e-demo',
      title: 'Sessão de Demonstração E2E',
      timestamp: Date.now() - 3600000,
      agent: 'antigravity',
      model: 'gemini-3.8-flash-high',
      status: 'idle',
      tags: ['e2e', 'playwright', 'visual-test'],
      messages: [
        {
          id: 'msg-user-1',
          role: 'user',
          text: 'Kraken, valide o sistema com testes E2E e regressão visual.',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'msg-bot-1',
          role: 'assistant',
          text: 'Testes configurados e prontos! A suíte cobre todos os modais, fluxos do chat e snapshots visuais sem erros de React Hooks.',
          timestamp: new Date().toISOString(),
          agent: 'antigravity',
          model: 'gemini-3.8-flash-high',
          thinking: '1. Inspecionar modais (AuthModal, McpModal, PinModal, OptionsBar).\n2. Validar ciclo de vida e renderização.\n3. Comparar snapshots visuais.',
          toolCalls: [
            {
              step_index: 1,
              name: 'run_command',
              command: 'npx playwright test',
              state: 'DONE',
              output: '✓ 14 passed (3.4s)',
            },
            {
              step_index: 2,
              name: 'replace_file_content',
              parameters: {
                TargetFile: '/workspace/src/App.tsx',
                Instruction: 'Adiciona componente FileOperationCard',
                StartLine: 45,
                EndLine: 48
              },
              state: 'DONE',
              output: `The following changes were made to /workspace/src/App.tsx:
[diff_block_start]
@@ -45,4 +45,5 @@
  import React from 'react';
- const old = 1;
+ const updated = 2;
+ const added = 3;
[diff_block_end]`,
            },
          ],
        },
        {
          id: 'msg-bot-mermaid',
          role: 'assistant',
          text: 'Aqui está a arquitetura do sistema:\n\n```mermaid\ngraph TD\n  Client[Cliente Web] -->|HTTP / WebSocket| Server[Servidor Kraken]\n  Server --> Docker[Docker Daemon / ZimaOS]\n```',
          timestamp: new Date().toISOString(),
          agent: 'antigravity',
          model: 'gemini-3.8-flash-high',
        },
      ],
    },
  ],
};

export async function setupMockApi(page: Page, options: MockOptions = {}) {
  const pinRequired = options.pinRequired ?? false;
  const pinValid = options.pinValid ?? true;
  const mcpList = [...(options.mcpServers ?? defaultMockData.mcpServers)];
  const convList = [...(options.conversations ?? defaultMockData.conversations)];

  // Rota de PIN
  await page.route('**/api/auth/pin/status', async (route) => {
    const authHeader = route.request().headers()['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const authenticated = !pinRequired || (token === 'mock-pin-token-xyz');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        required: pinRequired,
        authenticated,
      }),
    });
  });

  await page.route('**/api/auth/pin/verify', async (route) => {
    if (route.request().method() === 'POST') {
      const data = route.request().postDataJSON();
      if (data?.pin === '1234') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, token: 'mock-pin-token-xyz' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'PIN incorreto. Tente novamente.' }),
        });
      }
    } else {
      await route.continue();
    }
  });

  // Rota de Configurações e Modelos
  await page.route('**/api/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(defaultMockData.config),
    });
  });

  await page.route('**/api/config/projects', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ projects: defaultMockData.projects }),
    });
  });

  await page.route('**/api/config/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(defaultMockData.models),
    });
  });

  // Rota de Autenticação e Contas
  await page.route('**/api/auth/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(defaultMockData.authStatus),
    });
  });

  await page.route('**/api/auth/accounts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ activeEmail: 'dev@kraken.local', accounts: defaultMockData.accounts }),
    });
  });

  await page.route('**/api/auth/accounts/switch', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, message: 'Conta alternada com sucesso!' }),
    });
  });

  await page.route('**/api/auth/antigravity/start', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authUrl: 'https://accounts.google.com/o/oauth2/auth?mock=true',
        message: 'Abra a URL para autorizar o KrakenBridge.',
      }),
    });
  });

  await page.route('**/api/auth/github/device/start', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        userCode: 'ABCD-1234',
        verificationUri: 'https://github.com/login/device',
        interval: 5,
      }),
    });
  });

  await page.route('**/api/auth/github/device/poll', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'pending' }),
    });
  });

  await page.route('**/api/auth/keys', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  // Rota de Servidores MCP
  await page.route('**/api/mcp', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ servers: mcpList }),
      });
    } else {
      await route.continue();
    }
  });

  await page.route('**/api/mcp/toggle', async (route) => {
    const postData = route.request().postDataJSON();
    const server = mcpList.find((s) => s.name === postData.name);
    if (server) {
      server.status = postData.enable ? 'enabled' : 'disabled';
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  // Rota de Cotas
  await page.route('**/api/quota', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(defaultMockData.quotaStats),
    });
  });

  // Rota de Conversas
  await page.route('**/api/conversations', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversations: convList }),
      });
    } else if (route.request().method() === 'POST') {
      const newConv = {
        id: `conv-${Date.now()}`,
        title: 'Nova Conversa',
        timestamp: Date.now(),
        agent: 'antigravity',
        model: 'gemini-3.8-flash-high',
        status: 'idle',
        tags: [],
        messages: [],
      };
      convList.unshift(newConv);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(newConv),
      });
    } else {
      await route.continue();
    }
  });

  await page.route(/.*\/api\/conversations\/[^/]+$/, async (route) => {
    const url = route.request().url();
    const id = url.split('/').pop();
    const conv = convList.find((c) => c.id === id) || convList[0];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ session: conv }),
    });
  });

  // Rota de Chat com SSE Streaming
  await page.route('**/api/chat', async (route) => {
    const postData = route.request().postDataJSON();
    const streamContent = [
      'data: {"event":"session_start","conversation_id":"conv-e2e-demo","reqId":"req-e2e-1"}\n\n',
      'data: {"event":"step_update","step_update":{"step_type":"thinking","text_delta":"Planejando a resposta técnica passo a passo..."}}\n\n',
      `data: {"event":"step_update","step_update":{"step_type":"agent_response","text_delta":"Recebi sua mensagem: \\"${postData?.prompt || 'Olá'}\\". Executando perfeitamente!"}}\n\n`,
      'data: {"event":"step_update","step_update":{"step_type":"tool","step_index":1,"tool_name":"run_command","tool_info":{"parameters":{"CommandLine":"echo OK"}},"status":"DONE","output":"OK"}}\n\n',
      'data: {"event":"done","code":0,"conversation_id":"conv-e2e-demo"}\n\n',
    ].join('');

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
      body: streamContent,
    });
  });
}
