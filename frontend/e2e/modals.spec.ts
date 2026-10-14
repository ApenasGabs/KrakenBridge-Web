import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mockApi';

test.describe('E2E: Modais do KrakenBridge-Web', () => {
  test.beforeEach(async ({ page }) => {
    // Escuta logs e erros do console para garantir ausência de violação de React Hooks (#310)
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        expect(msg.text()).not.toContain('Rendered fewer hooks than expected');
        expect(msg.text()).not.toContain('Rendered more hooks than expected');
        expect(msg.text()).not.toContain('Minified React error #310');
      }
    });
  });

  test('AuthModal: abertura, ciclo de abas (Contas, Google, GitHub, API Key, IDE) e fechamento sem erro de hooks', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    // Abre o AuthModal pelo botão de autenticação do Header
    const authBtn = page.getByTestId('header-auth-btn');
    await expect(authBtn).toBeVisible();
    await authBtn.click();

    // Modal visível
    const modal = page.getByTestId('auth-modal');
    await expect(modal).toBeVisible();
    await expect(page.getByText('Gerenciador de Contas & Autenticação')).toBeVisible();

    // Aba Contas Salvas (ativa por padrão)
    const tabAccounts = page.getByTestId('auth-tab-accounts');
    await expect(tabAccounts).toBeVisible();
    await expect(page.getByText('Dev Kraken (Principal)')).toBeVisible();

    // Aba Google OAuth
    const tabGoogle = page.getByTestId('auth-tab-google');
    await tabGoogle.click();
    await expect(page.getByText('Iniciar Login via Google OAuth')).toBeVisible();

    // Aba GitHub
    const tabGithub = page.getByTestId('auth-tab-github');
    await tabGithub.click();
    await expect(page.getByText('Opção 1: Conectar via Código (Recomendado)')).toBeVisible();

    // Aba API Key
    const tabApiKey = page.getByTestId('auth-tab-apikey');
    await tabApiKey.click();
    await expect(page.getByPlaceholder('AIzaSy...')).toBeVisible();

    // Aba Dicas IDE
    const tabIde = page.getByTestId('auth-tab-ide');
    await tabIde.click();
    await expect(page.getByText('Erro de "Local Extension Host" no VS Code')).toBeVisible();

    // Volta para Contas Salvas
    await tabAccounts.click();
    await expect(page.getByText('Dev Kraken (Principal)')).toBeVisible();

    // Fecha o modal
    const closeBtn = page.getByTestId('auth-modal-close');
    await closeBtn.click();
    await expect(modal).not.toBeVisible();

    // Reabre para certificar que o ciclo de reabertura não quebra hooks
    await authBtn.click();
    await expect(modal).toBeVisible();
    await closeBtn.click();
    await expect(modal).not.toBeVisible();
  });

  test('McpModal: listagem de servidores MCP e fechamento', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    // Abre o McpModal pelo botão do Header
    const mcpBtn = page.getByTestId('header-mcp-btn');
    await expect(mcpBtn).toBeVisible();
    await mcpBtn.click();

    // Modal visível
    const modal = page.getByTestId('mcp-modal');
    await expect(modal).toBeVisible();
    await expect(page.getByText('Servidores MCP (Model Context Protocol)')).toBeVisible();

    // Verifica servidores da lista mockada
    await expect(page.getByText('anytype')).toBeVisible();
    await expect(page.getByText('sqlite')).toBeVisible();

    // Fecha o modal
    const closeBtn = page.getByTestId('mcp-modal-close');
    await closeBtn.click();
    await expect(modal).not.toBeVisible();
  });

  test('PinModal: bloqueio de segurança quando PIN é requerido e desbloqueio bem-sucedido', async ({ page }) => {
    await setupMockApi(page, { pinRequired: true });
    // Limpa qualquer token pré-existente no localStorage
    await page.addInitScript(() => {
      localStorage.removeItem('kraken_pin_token');
    });
    await page.goto('/');

    // O modal de PIN deve estar visível bloqueando a aplicação
    const pinModal = page.getByTestId('pin-modal');
    await expect(pinModal).toBeVisible();
    await expect(page.getByText('KrakenBridge Seguro')).toBeVisible();

    // Digita PIN incorreto
    const pinInput = page.getByTestId('pin-input');
    const submitBtn = page.getByTestId('pin-submit-btn');

    await pinInput.fill('9999');
    await submitBtn.click();

    // Deve exibir mensagem de erro
    await expect(page.getByText('PIN incorreto. Tente novamente.')).toBeVisible();

    // Digita PIN correto
    await pinInput.fill('1234');
    await submitBtn.click();

    // Modal de PIN deve desaparecer
    await expect(pinModal).not.toBeVisible();
  });

  test('OptionsBar: alternância de exibição e alteração de parâmetros do agente', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    // Inicialmente a barra de opções está fechada
    const optionsBar = page.getByTestId('options-bar');
    await expect(optionsBar).not.toBeVisible();

    // Clica no botão de opções do Header para abrir
    const optionsBtn = page.getByTestId('header-options-btn');
    await optionsBtn.click();
    await expect(optionsBar).toBeVisible();

    // Altera o modelo
    const modelSelect = page.getByTestId('options-model-select');
    await modelSelect.selectOption('gemini-3.1-pro-high');
    await expect(modelSelect).toHaveValue('gemini-3.1-pro-high');

    // Altera o esforço de raciocínio
    const effortSelect = page.getByTestId('options-effort-select');
    await effortSelect.selectOption('high');
    await expect(effortSelect).toHaveValue('high');

    // Altera o modo de execução
    const modeSelect = page.getByTestId('options-mode-select');
    await modeSelect.selectOption('plan');
    await expect(modeSelect).toHaveValue('plan');

    // Altera o modo de interação
    const interactionSelect = page.getByTestId('options-interaction-select');
    await interactionSelect.selectOption('chat');
    await expect(interactionSelect).toHaveValue('chat');

    // Alterna checkboxes
    const skipPermissions = page.getByTestId('options-skip-permissions');
    await skipPermissions.click();

    const sandbox = page.getByTestId('options-sandbox');
    await sandbox.click();
    await expect(sandbox).toBeChecked();

    // Fecha a barra de opções
    await optionsBtn.click();
    await expect(optionsBar).not.toBeVisible();
  });
});
