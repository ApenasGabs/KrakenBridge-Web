# Diretrizes e Responsabilidades do Agente

1. **Responsabilidade Intransferível por Testes e Estabilidade**:
   - É responsabilidade total e intransferível do agente garantir que todos os testes (unitários, integração, E2E e CI gates) estejam passando e verdes antes de considerar qualquer tarefa concluída ou abrir/mergear Pull Requests.
   - NUNCA realize bypass ou force-merge (`--admin`, `--no-verify`) quando houver testes ou verificações de CI falhando.
   - Se um teste falhar (seja de regressão, snapshot visual ou lógica), o agente DEVE investigar a causa raiz imediatamente, corrigir o que quebrou e reexecutar a suite de testes até obter aprovação de 100%.

2. **Verificação de Regressão e Build**:
   - Sempre valide o build completo (`npm run build:server` e `npm run build:frontend`) e execute os testes locais pertinentes (`npm test`, `npm run test:e2e` quando viável) antes de concluir alterações.
   - Ao alterar UI, verifique impactos em snapshots visuais existentes e atualize os snapshots conscientemente caso o design tenha mudado de forma intencional e esperada.

3. **Auditoria Obrigatória de Code Review (ApenasGabs/agent-standards)**:
   - Todo PR/MR deve obrigatoriamente passar pela auditoria do agente de revisão baseado em `ApenasGabs/agent-standards` (`node /workspace/.agents/scripts/spec-code-review.mjs --target <dir> --task <id>` ou `npx @apenasgabs/agent-standards review --base origin/main`).
   - O agente DEVE anunciar explicitamente no chat o início da revisão, relatar os itens apontados nos dois eixos (Aderência à Tarefa/Spec e Conformidade com Padrões/Standards) e explicar detalhadamente quais itens estão sendo corrigidos no código antes de submeter para aprovação.
   - Nenhuma entrega pode ser considerada pronta sem a execução dessa auditoria e resolução de seus apontamentos.
