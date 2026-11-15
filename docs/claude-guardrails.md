# Guardrails do Claude Code (Issue #184)

O KrakenBridge garante que o Claude Code siga a Regra de Ouro nº 2 (narração antes de agir)
e a Diretiva 8.e (code review com `ApenasGabs/agent-standards`) com mecanismos que não
dependem só do prompt.

## Camadas

| Camada | Onde | O que garante |
|---|---|---|
| Streaming em tempo real | `AGENT_DRIVERS.claude` (`--output-format stream-json --verbose`) + `src/services/claudeStreamAdapter.ts` | Narração e ferramentas aparecem na UI conforme acontecem. Antes, em modo texto, só o resultado final chegava ao chat. |
| Auditoria de narração | `claudeStreamAdapter` → `guardrail_warning` (`silent_tool_call`) | Toda ferramenta chamada sem texto visível desde a anterior vira uma linha `⚠️ Kraken Guard` no chat e no histórico. |
| Hooks bloqueantes | `$CLAUDE_CONFIG_DIR/kraken-guardrails/kraken-guard.cjs` registrado em `settings.json` | `PreToolUse` nega o revisor com saída filtrada, qualquer adulteração do `REVIEW_REPORT.md` e `gh pr comment/review/merge` com reprovação pendente. `PostToolUse` injeta o relatório completo. `Stop` impede encerrar sem expor os eixos Spec/Standards e o status 🔴. `UserPromptSubmit` reinjeta as regras. |
| Diretivas globais | `$CLAUDE_CONFIG_DIR/CLAUDE.md` (bloco `KRAKEN-GUARDRAILS`) | As regras em linguagem direta, carregadas em toda sessão. |

Os hooks continuam valendo com `--dangerously-skip-permissions`. Isso foi validado ao vivo
com o CLI 2.1.325.

## Provisionamento

`claudeGuardrailsService.ensureProvisioned()` roda no boot e antes de cada execução do Claude.
Ele é idempotente: substitui só as entradas antigas do `kraken-guard.cjs` no `settings.json`
e preserva hooks e configurações de terceiros. Se o `settings.json` tiver JSON inválido,
ele **não** é sobrescrito (aparece um erro no log). Os templates ficam em
`src/templates/claude-guardrails/`.

## Por que a narração não é bloqueada por hook

Neste runtime o transcript do Claude Code não grava blocos `text`, apenas `thinking` e
`tool_use`. Um `PreToolUse` que verificasse a narração pelo transcript bloquearia todas as
ferramentas. Por isso a narração é tornada visível (stream-json), auditada em tempo real
pelo backend, que é quem vê a ordem real dos eventos, e reforçada a cada turno.

## Diagnóstico

- Estado do revisor por sessão: `$CLAUDE_CONFIG_DIR/kraken-guardrails/state/<session_id>.json`
- Logs do servidor: prefixos `[ClaudeGuardrails]` e `[KrakenBridge][guardrail]`
- Testes: `test/claudeGuardrails.test.mjs`, `test/claudeStreamAdapter.test.mjs`
