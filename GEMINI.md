# Diretrizes e Responsabilidades do Agente

1. **Responsabilidade Intransferível por Testes e Estabilidade**:
   - É responsabilidade total e intransferível do agente garantir que todos os testes (unitários, integração, E2E e CI gates) estejam passando e verdes antes de considerar qualquer tarefa concluída ou abrir/mergear Pull Requests.
   - NUNCA realize bypass ou force-merge (`--admin`, `--no-verify`) quando houver testes ou verificações de CI falhando.
   - Se um teste falhar (seja de regressão, snapshot visual ou lógica), o agente DEVE investigar a causa raiz imediatamente, corrigir o que quebrou e reexecutar a suite de testes até obter aprovação de 100%.

2. **Verificação de Regressão e Build**:
   - Sempre valide o build completo (`npm run build:server` e `npm run build:frontend`) e execute os testes locais pertinentes (`npm test`, `npm run test:e2e` quando viável) antes de concluir alterações.
   - Ao alterar UI, verifique impactos em snapshots visuais existentes e atualize os snapshots conscientemente caso o design tenha mudado de forma intencional e esperada.
