import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mockApi';

test.describe('Visual Regression: Snapshots Visuais do KrakenBridge-Web', () => {
  test('Snapshot: Tela Inicial (Status Operacional) em Desktop', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    // Fecha o balão de cotas para snapshot limpo e estável da tela
    const quotaCloseBtn = page.getByTestId('quota-bubble-close');
    if (await quotaCloseBtn.isVisible()) {
      await quotaCloseBtn.click();
    }

    await expect(page.getByText('Status Operacional', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('status-view-desktop.png');
  });

  test('Snapshot: AuthModal aberto (Desktop)', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    await page.getByTestId('header-auth-btn').click();
    const modal = page.getByTestId('auth-modal');
    await expect(modal).toBeVisible();

    await expect(modal).toHaveScreenshot('auth-modal-desktop.png');
  });

  test('Snapshot: McpModal aberto (Desktop)', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    await page.getByTestId('header-mcp-btn').click();
    const modal = page.getByTestId('mcp-modal');
    await expect(modal).toBeVisible();

    await expect(modal).toHaveScreenshot('mcp-modal-desktop.png');
  });

  test('Snapshot: OptionsBar aberto (Desktop)', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    await page.getByTestId('header-options-btn').click();
    const optionsBar = page.getByTestId('options-bar');
    await expect(optionsBar).toBeVisible();

    await expect(optionsBar).toHaveScreenshot('options-bar-desktop.png');
  });

  test('Snapshot: PinModal de Segurança', async ({ page }) => {
    await setupMockApi(page, { pinRequired: true });
    await page.addInitScript(() => {
      localStorage.removeItem('kraken_pin_token');
    });
    await page.goto('/');

    const pinModal = page.getByTestId('pin-modal');
    await expect(pinModal).toBeVisible();

    await expect(pinModal).toHaveScreenshot('pin-modal-desktop.png');
  });

  test('Snapshot: Resolução Mobile (390x844)', async ({ page }) => {
    await setupMockApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const quotaCloseBtn = page.getByTestId('quota-bubble-close');
    if (await quotaCloseBtn.isVisible()) {
      await quotaCloseBtn.click();
    }

    await expect(page.getByText('Status Operacional', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('status-view-mobile.png');
  });

  test('Snapshot: Tema Dark (Desktop)', async ({ page }) => {
    await setupMockApi(page);
    await page.addInitScript(() => {
      localStorage.setItem('theme', 'dark');
    });
    await page.goto('/');

    const quotaCloseBtn = page.getByTestId('quota-bubble-close');
    if (await quotaCloseBtn.isVisible()) {
      await quotaCloseBtn.click();
    }

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page).toHaveScreenshot('theme-dark-desktop.png');
  });
});
