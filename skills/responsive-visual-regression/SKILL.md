---
name: responsive-visual-regression
description: Validação automatizada de layouts responsivos e regressão visual com Playwright nas viewports padrão (Mobile 360px, Tablet 768px, Desktop 1280px) para o ecossistema KrakenBridge e projetos web.
---

# Skill: Testes de Regressão Visual e Validação Responsiva Mobile

Esta skill padroniza os procedimentos, scripts e critérios de aceitação para testes de regressão visual e validação responsiva em projetos web do ecossistema Kraken (KrakenBridge-Web, ocarina-tabs, meuestoque, tfla).

---

## 📱 1. Viewports Padrão de Validação

Todo componente ou tela deve ser validado nas 3 resoluções canônicas:

| Dispositivo / Viewport | Largura × Altura | Foco da Validação |
| :--- | :--- | :--- |
| **Mobile Compacto** | `360px × 800px` | Prevenção de overflow horizontal, menus colapsáveis, formulários e modais responsivos. |
| **Tablet Vertical** | `768px × 1024px` | Ajuste de grids (1 col -> 2 cols), drawers laterais, tabelas e barras de ferramentas. |
| **Desktop Padrão** | `1280px × 800px` | Split-panes, opções avançadas, densidade de informações e alinhamento tipográfico. |

---

## 🛠️ 2. Como Executar os Testes

### A. Executar a Suíte de Validação Responsiva (Playwright)
```bash
# Na raiz do repositório
npm run test:responsive

# Ou diretamente no pacote frontend
npm --prefix frontend run test:responsive
```

### B. Gerar Relatório e Capturas de Tela Comparativas (Script Standalone)
```bash
# Executa o script gerador de screenshots e galeria HTML
node scripts/responsive-check.mjs
```
O relatório interativo com as capturas comparativas das 3 viewports será salvo em:
`reports/responsive-screenshots/index.html`

### C. Executar Toda a Suíte E2E + Snapshots Visuais
```bash
npm --prefix frontend run test:e2e
```

---

## 📋 3. Checklist de Validação Pré-PR (SDLC Gate)

Antes de abrir ou mergear qualquer Pull Request que altere componentes de UI, CSS ou layout:

- [ ] **Sem Overflow Horizontal:** O `document.documentElement.scrollWidth` nunca deve exceder a largura da janela (`window.innerWidth + 2px`).
- [ ] **Modais & Drawers:** Todos os modais (`AuthModal`, `McpModal`, `PinModal`, `ArtifactDrawer`) devem caber com padding e scroll interno em telas de 360px.
- [ ] **Chat & Input:** O campo de digitação e os botões de ação (Microfone, Enviar, Seletor de Modelo) não devem quebrar ou sobrepor texto.
- [ ] **Tipografia & Badges:** Badges com nomes longos ou caminhos de arquivos devem usar `truncate` sem empurrar botões para fora do container.
- [ ] **Contraste & Temas:** A legibilidade deve ser preservada em temas claros e escuros (`data-theme="dark"` / `data-theme="light"`).

---

## 🔄 4. Procedimento de Atualização de Snapshots Visuais

Quando houver uma alteração visual **intencional e aprovada**:
1. Execute os testes no ambiente Docker/Linux idêntico ao do CI para evitar diferenças de fonte:
   ```bash
   docker run --rm -v $(pwd)/frontend:/app -w /app mcr.microsoft.com/playwright:v1.58.0-noble npx playwright test -u
   ```
2. Inspecione os novos snapshots com `git diff` antes de commitar.
3. Nunca comite snapshots com quebras ou elementos cortados.
