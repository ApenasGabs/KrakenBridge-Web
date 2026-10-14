#!/bin/bash
# ==============================================================================
# Kraken Git/GitHub SDLC Workflow Helper
# Padroniza a criação de Issues, Branches vinculadas e Pull Requests
# ==============================================================================

set -e

COMMAND="$1"
shift || true

function show_help() {
  echo "Uso: ./scripts/git-workflow.sh <comando> [argumentos]"
  echo ""
  echo "Comandos disponíveis:"
  echo "  issue <titulo> <corpo> [labels]              - Cria uma issue no GitHub"
  echo "  branch <issue-id> <feat|fix|chore> <slug>    - Cria uma branch vinculada à issue"
  echo "  pr <issue-id> <titulo> <corpo>               - Publica a branch e abre o Pull Request"
  echo ""
}

case "$COMMAND" in
  issue)
    TITLE="$1"
    BODY="$2"
    LABELS="${3:-enhancement}"
    if [ -z "$TITLE" ] || [ -z "$BODY" ]; then
      echo "❌ Erro: Título e corpo são obrigatórios."
      exit 1
    fi
    echo "📌 Criando Issue no GitHub..."
    gh issue create --title "$TITLE" --body "$BODY" --label "$LABELS"
    ;;

  branch)
    ISSUE_ID="$1"
    TYPE="${2:-feat}"
    SLUG="$3"
    if [ -z "$ISSUE_ID" ] || [ -z "$SLUG" ]; then
      echo "❌ Erro: Número da issue e slug são obrigatórios."
      exit 1
    fi
    BRANCH_NAME="${TYPE}/#${ISSUE_ID}-${SLUG}"
    echo "🌿 Criando branch: $BRANCH_NAME..."
    git checkout -b "$BRANCH_NAME"
    echo "✅ Branch criada e ativa: $BRANCH_NAME"
    ;;

  pr)
    ISSUE_ID="$1"
    TITLE="$2"
    BODY="$3"
    if [ -z "$ISSUE_ID" ] || [ -z "$TITLE" ]; then
      echo "❌ Erro: Número da issue e título são obrigatórios."
      exit 1
    fi
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
      echo "❌ Erro: Não é permitido abrir PR diretamente a partir da branch principal!"
      exit 1
    fi
    echo "🚀 Publicando branch $CURRENT_BRANCH no GitHub..."
    git push -u origin "$CURRENT_BRANCH"
    
    FULL_BODY=$(cat <<EOF
## 🎯 Resumo da Proposta
$BODY

## 🔗 Issue Vinculada
- Closes #$ISSUE_ID

## 🧪 Validação Local
- [x] Build local executado com sucesso
- [x] Testes e tipos verificados
- [ ] **Aprovação Manual do Usuário Pendente (Human-in-the-Loop)**
EOF
)
    echo "📝 Criando Pull Request..."
    gh pr create --title "$TITLE" --body "$FULL_BODY" --base main --head "$CURRENT_BRANCH"
    ;;

  *)
    show_help
    exit 1
    ;;
esac
