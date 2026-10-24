import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mockApi';

test.describe('E2E: Status, Chat, Cotas e Temas', () => {
  test('Navegação entre Abas Principais (Status, Chat, IDE)', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    // Inicialmente na aba Status
    const statusTab = page.getByTestId('tab-status');
    const chatTab = page.getByTestId('tab-chat');
    const ideTab = page.getByTestId('tab-ide');

    await expect(page.getByText('Status Operacional', { exact: true })).toBeVisible();

    // Alterna para a aba Chat
    await chatTab.click();
    await expect(page.getByTestId('chat-textarea')).toBeVisible();

    // Alterna para a aba IDE
    await ideTab.click();
    await expect(page.getByText('VS Code (code-server)')).toBeVisible();

    // Retorna para a aba Status
    await statusTab.click();
    await expect(page.getByText('Status Operacional', { exact: true })).toBeVisible();
  });

  test('Chat: Exibição de conversa existente com Thinking e Tool Executions', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    // Fecha o balão de cotas para não cobrir a área de mensagens
    const quotaCloseBtn = page.getByTestId('quota-bubble-close');
    if (await quotaCloseBtn.isVisible()) {
      await quotaCloseBtn.click();
    }

    // Clica na conversa existente no histórico da barra lateral
    await page.getByRole('complementary').getByText('Sessão de Demonstração E2E').click();

    // Automaticamente navega para a aba de chat
    await expect(page.getByTestId('chat-textarea')).toBeVisible();

    // Verifica mensagem do usuário
    await expect(page.getByText('Kraken, valide o sistema com testes E2E e regressão visual.', { exact: true })).toBeVisible();

    // Verifica balão do assistente
    await expect(page.getByText(/Testes configurados e prontos!/)).toBeVisible();

    // Verifica acordeão de raciocínio (Thinking)
    const thinkingTitle = page.getByText('Raciocínio Interno (Thinking)');
    await expect(thinkingTitle).toBeVisible();
    await thinkingTitle.click({ force: true });
    await expect(page.getByText(/1. Inspecionar modais/)).toBeVisible();

    // Verifica acordeão de ferramentas (Tools)
    const toolsTitle = page.getByText(/Execuções de Ferramentas/);
    await expect(toolsTitle).toBeVisible();
    await toolsTitle.click({ force: true });

    // Clica em 'Ver saída' para expandir os logs do comando terminal
    const viewOutputBtn = page.getByText('Ver saída');
    await expect(viewOutputBtn).toBeVisible();
    await viewOutputBtn.click();
    await expect(page.getByText('✓ 14 passed (3.4s)')).toBeVisible();

    // Verifica card inline de Diff e Operação de Arquivo (FileOperationCard)
    await expect(page.getByText('Editado', { exact: true })).toBeVisible();
    await expect(page.getByText('App.tsx')).toBeVisible();
    await expect(page.getByText('+2', { exact: true })).toBeVisible();
    await expect(page.getByText('-1', { exact: true })).toBeVisible();
    await expect(page.getByText('Adiciona componente FileOperationCard')).toBeVisible();
    await expect(page.getByText(/const updated = 2;/)).toBeVisible();
    await expect(page.getByText(/const old = 1;/)).toBeVisible();

    // Verifica renderizador visual interativo de diagramas Mermaid
    const mermaidCard = page.getByTestId('mermaid-card');
    await expect(mermaidCard).toBeVisible();
    await expect(page.getByTestId('mermaid-badge-type')).toContainText('Fluxograma');
    await expect(page.getByTestId('mermaid-diagram-container')).toBeVisible();

    // Alterna para a aba de Código Mermaid
    const codeTab = page.getByTestId('mermaid-tab-code');
    await codeTab.scrollIntoViewIfNeeded();
    await codeTab.click({ force: true });
    await expect(page.getByTestId('mermaid-code-view')).toBeVisible();
    await expect(page.getByText(/Client\[Cliente Web\]/)).toBeVisible();

    // Retorna para a aba de Diagrama visual
    const diagramTab = page.getByTestId('mermaid-tab-diagram');
    await diagramTab.scrollIntoViewIfNeeded();
    await diagramTab.click({ force: true });
    await expect(page.getByTestId('mermaid-diagram-container')).toBeVisible();

    // Verifica botão de cópia presente
    await expect(page.getByTestId('mermaid-copy-code')).toBeVisible();
  });

  test('Chat: Envio de nova mensagem e recepção de resposta simulada via stream', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    // Fecha o balão de cotas flutuante para desimpedir a área inferior do chat
    const quotaCloseBtn = page.getByTestId('quota-bubble-close');
    if (await quotaCloseBtn.isVisible()) {
      await quotaCloseBtn.click();
    }

    // Abre a aba de chat
    await page.getByTestId('tab-chat').click();

    const textarea = page.getByTestId('chat-textarea');
    const sendBtn = page.getByTestId('chat-send-btn');

    // Digita e envia o prompt
    await textarea.fill('Olá Kraken, teste de envio ao vivo');
    await sendBtn.click();

    // Mensagem enviada pelo usuário aparece na tela (match exato)
    await expect(page.getByText('Olá Kraken, teste de envio ao vivo', { exact: true })).toBeVisible();

    // Resposta do assistente com streaming mockado deve aparecer
    await expect(page.getByText(/Recebi sua mensagem/)).toBeVisible();
  });

  test('QuotaBubble: Exibição de cotas oficiais, fechamento e reabertura pelo Header', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    // Balão de cotas visível por padrão
    const quotaBubble = page.getByTestId('quota-bubble');
    await expect(quotaBubble).toBeVisible();
    await expect(page.getByText('Antigravity Quotas')).toBeVisible();
    await expect(page.getByText('Gemini Models')).toBeVisible();
    await expect(quotaBubble.getByText('92%')).toBeVisible();
    await expect(page.getByText('Claude and GPT models')).toBeVisible();
    await expect(quotaBubble.getByText('78%')).toBeVisible();

    // Fecha o balão de cotas
    const closeBtn = page.getByTestId('quota-bubble-close');
    await closeBtn.click();
    await expect(quotaBubble).not.toBeVisible();

    // Reabre clicando no indicador de cotas/tokens no Header
    const headerQuotaBtn = page.getByTestId('header-quota-btn');
    await headerQuotaBtn.click();
    await expect(quotaBubble).toBeVisible();
  });

  test('ThemeSelector: Alternância de temas (light, dark, synthwave)', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    // Abre o menu/drawer de temas
    const themeBtn = page.getByTestId('theme-button').first();
    await expect(themeBtn).toBeVisible();
    await themeBtn.click();

    // Seleciona tema dark
    await page.getByTestId('theme-option-dark').first().evaluate((el: HTMLInputElement) => {
      el.click();
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Seleciona tema light
    await page.getByTestId('theme-option-light').first().evaluate((el: HTMLInputElement) => {
      el.click();
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // Seleciona tema synthwave
    await page.getByTestId('theme-option-synthwave').first().evaluate((el: HTMLInputElement) => {
      el.click();
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'synthwave');
  });
});
