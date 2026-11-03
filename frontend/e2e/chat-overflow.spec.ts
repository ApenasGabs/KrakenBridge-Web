import { test, expect, type Page } from '@playwright/test';
import { setupMockApi, defaultMockData } from './helpers/mockApi';

/**
 * Regressão de layout do chat (Issue #125).
 *
 * O teste antigo (responsive.spec.ts) só olhava `document.documentElement.scrollWidth`,
 * que nunca transborda porque a raiz da app é `overflow-hidden` — o overflow real
 * acontecia em containers internos e com chat vazio. Aqui renderizamos conteúdo
 * hostil (código longo, tabela larga, URL gigante) e varremos TODOS os elementos.
 */

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

const LONG_URL = 'https://example.com/' + 'segmento-muito-longo-sem-espaco/'.repeat(12);
const LONG_CODE = 'const resultado = ' + 'chamadaMuitoLongaDeFuncao(argumentoComNomeEnorme), '.repeat(10) + ';';
const WIDE_TABLE =
  '| ' + Array.from({ length: 10 }, (_, i) => `Coluna_${i}_com_titulo_longo`).join(' | ') + ' |\n' +
  '|' + ' --- |'.repeat(10) + '\n' +
  '| ' + Array.from({ length: 10 }, (_, i) => `valor_${i}_extenso_sem_quebra`).join(' | ') + ' |';

const longConversation = {
  ...defaultMockData.conversations[0],
  id: 'conv-overflow',
  title: 'Conversa com conteúdo largo',
  tags: ['overflow', 'layout', 'mobile', 'issue-125', 'tag-extra-longa-para-testar'],
  messages: [
    {
      id: 'u1',
      role: 'user',
      text: `Olha essa URL: ${LONG_URL}`,
      timestamp: new Date().toISOString(),
    },
    {
      id: 'a1',
      role: 'assistant',
      agent: 'antigravity',
      model: 'gemini-3.8-flash-high',
      timestamp: new Date().toISOString(),
      text: `Segue o código:\n\n\`\`\`ts\n${LONG_CODE}\n\`\`\`\n\n${WIDE_TABLE}\n\nLink: ${LONG_URL}\n\n` +
        Array.from({ length: 30 }, (_, i) => `Parágrafo ${i} para forçar scroll vertical.`).join('\n\n'),
    },
  ],
};

/** Elementos cuja largura de conteúdo excede a própria caixa e que de fato rolam/vazam na horizontal. */
async function findHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const offenders: string[] = [];
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${(el.getAttribute('class') || '').split(/\s+/).slice(0, 4).join('.')}`;

    // Página em si nunca pode rolar
    if (document.documentElement.scrollWidth > vw + 1) offenders.push('document');

    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || style.display === 'none' || style.visibility === 'hidden') continue;
      // Elementos fixos fora da tela (sidebar fechada, toasts) são intencionais
      if (style.position === 'fixed' && (rect.right <= 0 || rect.left >= vw)) continue;
      if (el.closest('[aria-hidden="true"], .-translate-x-full')) continue;

      // Scroll horizontal exposto ao usuário fora de blocos de código/tabelas
      const scrollsX = (style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1;
      const allowedScroller = el.matches('pre, table, .scrollbar-none, [data-allow-x-scroll]') || !!el.closest('pre, table');
      if (scrollsX && !allowedScroller) offenders.push(`scroll-x: ${describe(el)} (${el.scrollWidth}>${el.clientWidth})`);

      // Nada visível pode ultrapassar a borda direita da viewport
      if (style.position !== 'fixed' && rect.right > vw + 1 && !el.closest('pre, table, .scrollbar-none')) {
        offenders.push(`bleed: ${describe(el)} (right=${Math.round(rect.right)} > ${vw})`);
      }
    }
    return offenders.slice(0, 15);
  });
}

test.describe('Chat sem scroll lateral e header sempre visível (Issue #125)', () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name} ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setupMockApi(page, { conversations: [longConversation] });
      await page.goto('/c/conv-overflow');

      const quotaCloseBtn = page.getByTestId('quota-bubble-close');
      if (await quotaCloseBtn.isVisible()) await quotaCloseBtn.click();

      await expect(page.getByTestId('chat-textarea')).toBeVisible();
      await expect(page.getByText('Parágrafo 29 para forçar scroll vertical.')).toBeAttached();

      expect(await findHorizontalOverflow(page)).toEqual([]);

      // Header visível sem rolar a página, mesmo depois de rolar o chat até o fim
      const header = page.locator('header').first();
      await page.getByText('Parágrafo 29 para forçar scroll vertical.').scrollIntoViewIfNeeded();
      const box = await header.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await expect(page.getByTestId('tab-chat')).toBeInViewport();
      await expect(page.getByTestId('chat-textarea')).toBeInViewport();
    });
  }
});
