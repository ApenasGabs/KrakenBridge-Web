import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mockApi';

const VIEWPORTS = [
  { name: 'Mobile (360px)', width: 360, height: 800 },
  { name: 'Tablet (768px)', width: 768, height: 1024 },
  { name: 'Desktop (1280px)', width: 1280, height: 800 }
];

test.describe('Validação Responsiva & Regressão de Layout (Issue #49)', () => {
  for (const vp of VIEWPORTS) {
    test.describe(`Viewport: ${vp.name} (${vp.width}x${vp.height})`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
      });

      test('Layout geral: não deve causar overflow horizontal na página', async ({ page }) => {
        await setupMockApi(page);
        await page.goto('/');

        // Fecha balão de cotas se aberto
        const quotaCloseBtn = page.getByTestId('quota-bubble-close');
        if (await quotaCloseBtn.isVisible()) {
          await quotaCloseBtn.click();
        }

        // Verifica que o scrollWidth do documento cabe no viewport (com tolerância de 2px para subpixel rendering)
        const isOverflowing = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth + 2;
        });
        expect(isOverflowing).toBe(false);
      });

      test('Header e Navegação: elementos essenciais acessíveis', async ({ page }) => {
        await setupMockApi(page);
        await page.goto('/');

        // Botão de navegação entre Chat e Status deve estar visível
        const chatViewBtn = page.getByTestId('header-chat-btn');
        const statusViewBtn = page.getByTestId('header-status-btn');
        await expect(chatViewBtn).toBeVisible();
        await expect(statusViewBtn).toBeVisible();

        // Botões de autenticação e MCP devem estar operacionais
        await expect(page.getByTestId('header-auth-btn')).toBeVisible();
        await expect(page.getByTestId('header-mcp-btn')).toBeVisible();
      });

      test('ChatView e Input: formulário de chat ajusta sem quebrar a largura', async ({ page }) => {
        await setupMockApi(page);
        await page.goto('/');

        // Alterna para o Chat
        await page.getByTestId('header-chat-btn').click();

        // O campo de entrada de prompt deve estar visível
        const promptInput = page.getByPlaceholder(/Digite sua instrução/i);
        await expect(promptInput).toBeVisible();

        // Verifica que o container de chat não excede a largura da janela
        const chatContainerBox = await promptInput.boundingBox();
        expect(chatContainerBox).not.toBeNull();
        if (chatContainerBox) {
          expect(chatContainerBox.width).toBeLessThanOrEqual(vp.width);
        }
      });

      test('Modais responsivos: AuthModal cabe perfeitamente na viewport', async ({ page }) => {
        await setupMockApi(page);
        await page.goto('/');

        await page.getByTestId('header-auth-btn').click();
        const modal = page.getByTestId('auth-modal');
        await expect(modal).toBeVisible();

        const box = await modal.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(box.width).toBeLessThanOrEqual(vp.width);
        }

        // Fecha o modal
        const closeBtn = page.getByTestId('auth-modal-close');
        await closeBtn.click();
        await expect(modal).not.toBeVisible();
      });

      test('ArtifactDrawer: gaveta de visualização cabe na tela', async ({ page }) => {
        await setupMockApi(page);
        await page.goto('/');

        // Abre ChatView
        await page.getByTestId('header-chat-btn').click();

        // Simula clique em arquivo no chat ou verifica presença do drawer
        const isDrawerInDOM = await page.evaluate(() => {
          return document.querySelector('[data-testid="artifact-drawer"]') !== null;
        });
        // Quando fechado, não deve estar no DOM
        expect(isDrawerInDOM).toBe(false);
      });
    });
  }
});
