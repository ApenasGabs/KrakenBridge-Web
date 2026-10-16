import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mockApi';

const VIEWPORTS = [
  { name: 'Mobile (360px)', width: 360, height: 800, isMobile: true },
  { name: 'Tablet (768px)', width: 768, height: 1024, isMobile: false },
  { name: 'Desktop (1280px)', width: 1280, height: 800, isMobile: false }
];

test.describe('Validação Responsiva & Regressão de Layout (Issue #49)', () => {
  for (const vp of VIEWPORTS) {
    test(`Viewport: ${vp.name} (${vp.width}x${vp.height}) - fluxo responsivo completo`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setupMockApi(page);
      await page.goto('/');

      // 1. Fecha balão de cotas se aberto
      const quotaCloseBtn = page.getByTestId('quota-bubble-close');
      if (await quotaCloseBtn.isVisible()) {
        await quotaCloseBtn.click();
      }

      // 2. Layout geral: sem overflow horizontal
      const isOverflowingInitial = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 2;
      });
      expect(isOverflowingInitial).toBe(false);

      // 3. Header e Navegação: tabs principais acessíveis
      await expect(page.getByTestId('tab-status')).toBeVisible();
      await expect(page.getByTestId('tab-chat')).toBeVisible();
      await expect(page.getByTestId('tab-whatsnext')).toBeVisible();

      // 4. Modal responsivo: AuthModal abre, cabe na tela e fecha
      const authBtn = vp.isMobile
        ? page.getByTestId('header-auth-btn-mobile')
        : page.getByTestId('header-auth-btn');

      await expect(authBtn).toBeVisible();
      await authBtn.click();

      const modal = page.getByTestId('auth-modal');
      await expect(modal).toBeVisible();
      const modalBox = await modal.boundingBox();
      expect(modalBox).not.toBeNull();
      if (modalBox) {
        expect(modalBox.width).toBeLessThanOrEqual(vp.width + 2);
      }

      const closeBtn = page.getByTestId('auth-modal-close');
      await closeBtn.click();
      await expect(modal).not.toBeVisible();

      // 5. ChatView e Input: formulário ajusta ao viewport sem quebrar
      await page.getByTestId('tab-chat').click();
      const promptInput = page.getByTestId('chat-textarea');
      await expect(promptInput).toBeVisible();

      const promptBox = await promptInput.boundingBox();
      expect(promptBox).not.toBeNull();
      if (promptBox) {
        expect(promptBox.width).toBeLessThanOrEqual(vp.width);
      }

      // 6. ArtifactDrawer: não bloqueia inicialmente a visualização
      const isDrawerInDOM = await page.evaluate(() => {
        return document.querySelector('[data-testid="artifact-drawer"]') !== null;
      });
      expect(isDrawerInDOM).toBe(false);

      // 7. Sem overflow horizontal na visão de Chat
      const isOverflowingChat = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 2;
      });
      expect(isOverflowingChat).toBe(false);
    });
  }
});
