# AGENTS.md — Protocolo de Desenvolvimento e Governança para Agentes

> Este arquivo é lido automaticamente pelo **Antigravity**, **Claude Code**, **Cursor** e outros agentes de IA.
> Ele define os padrões arquiteturais e o protocolo mandatório de engenharia no repositório `KrakenBridge-Web`.

---

## 1. Stack Tecnológica
- **Backend**: Node.js 18+ (ES Modules) + Express + TypeScript
- **Frontend**: React 19 + TypeScript 5 + Vite + Tailwind CSS v4 + daisyUI v5
- **Testes**: Vitest (Frontend) e Node Test Runner (`test/*.test.mjs`) (Backend)

---

## 2. Protocolo Mandatório por Fase (SDLC)

1. **Issue Formal**: Criar issue via CLI (`gh issue create --assignee @me`) e branch dedicada `feat/#<id>-<slug>`.
2. **Implementação Atômica**: TypeScript estrito sem `any`, funções em arrow function, DaisyUI prioritário.
3. **Pipeline & Validação Local**:
   ```bash
   npm run build:server
   npm run --prefix frontend test -- --run
   npm run --prefix frontend build
   ```
4. **Pull Request**: Abrir via `gh pr create --assignee @me` com template de engenharia.
5. **Auditoria Obrigatória de Code Review (ApenasGabs/agent-standards)**:
   - **Chamada Obrigatória**: Executar `node /workspace/.agents/scripts/spec-code-review.mjs --target <dir> --task <id>` (ou `npx @apenasgabs/agent-standards review --base origin/main`).
   - **Transparência no Chat**: Avisar no chat que a auditoria está sendo feita, listar os apontamentos de Spec e Standards e detalhar o que será corrigido.
   - **Resolução de Apontamentos**: Resolver todos os apontamentos procedentes antes de solicitar aprovação.
6. **Acompanhamento Obrigatório da Pipeline de CI/CD (GitHub Actions / CI Gate)**:
   - **Monitoramento Ativo**: O agente DEVE acompanhar ativamente a execução da pipeline de CI/CD (`gh pr checks <id>` ou equivalente) após abrir ou atualizar qualquer PR.
   - **Diagnóstico e Resolução Automática**: Se algum check falhar (testes E2E, Playwright, lint, build), o agente DEVE baixar e inspecionar os logs de falha (`gh run view <id> --log-failed`), corrigir o código imediatamente, subir novo commit e reacompanhar até todos os checks ficarem verdes (`SUCCESS`).
   - **Proibição de Hand-off com CI Falhado**: NUNCA submeter o PR para aprovação manual com a pipeline pendente ou em falha.
7. **Portão de Aprovação Manual (Human-in-the-Loop)**: Aguardar aprovação manual do usuário no GitHub antes de mergear na `main` ou disparar Pod Drain.
