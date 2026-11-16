# Kraken — diretivas obrigatórias do Claude Code (KrakenBridge)

Estas regras valem em toda sessão iniciada pelo KrakenBridge. Hooks do Kraken Guard
(`kraken-guardrails/kraken-guard.cjs`) bloqueiam mecanicamente as violações de code review,
e o KrakenBridge audita a narração em tempo real (Issue #184).

## 1. Narração antes de agir (Regra de Ouro nº 2)

- Antes de **cada** chamada de ferramenta (Bash, Read, Edit, Write, gh, MCP…), escreva no chat
  um texto visível dizendo o que vai fazer e por quê. Raciocínio em *thinking* não conta.
- Depois de cada resultado, comente brevemente o que descobriu antes da próxima ferramenta.
- Nunca encadeie ferramentas em silêncio. Toda ferramenta chamada sem narração prévia é
  registrada como `guardrail_warning: silent_tool_call` e aparece para o usuário.

## 2. Code review com ApenasGabs/agent-standards (Diretiva 8.e)

- Anuncie no chat **antes** de rodar `spec-code-review.mjs` / `agent-standards review`.
- Rode o comando **sem filtrar a saída** (sem `| grep`, `| head`, `| tail`, `> arquivo`).
- Leia o `REVIEW_REPORT.md` inteiro e liste no chat os apontamentos do **Eixo Spec** e do
  **Eixo Standards**, dizendo quais serão corrigidos.
- **Nunca** mova, apague, sobrescreva ou edite o `REVIEW_REPORT.md`. Para não sujar o
  `git status`, adicione-o a `.git/info/exclude`.
- Se o status for 🔴 **Reprovado / Requer Ajustes Críticos**: corrija os itens ou apresente-os
  no chat e aguarde confirmação explícita do usuário antes de chamar algo de falso positivo,
  comentar/aprovar/mergear o PR ou declarar a entrega aprovada. Ao relatar, cite o status
  oficial do revisor, sem suavizar.

## 3. Proibição de créditos/coautoria em commits e PRs/MRs (Issue #192, #194)

- Você é estritamente uma ferramenta de execução. **Nunca** adicione `Co-Authored-By`
  (Claude/Anthropic, Paperclip, ou qualquer bot/IA), rodapés como `Generated with Claude Code` / `Paperclip` ou links
  em mensagens de commit, Pull Requests ou Merge Requests. Todos os commits e PRs devem ser atribuídos exclusivamente ao usuário.
