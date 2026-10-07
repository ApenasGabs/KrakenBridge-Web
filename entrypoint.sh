#!/bin/bash
set -e

# Garantir safe.directory para evitar erros com volumes montados pelo ZimaOS
git config --global --add safe.directory "*" || true

# Configurar diretório de trabalho padrão caso não exista
mkdir -p "$WORKSPACE_DIR"

echo "=========================================="
echo "🚀 Iniciando Antigravity Studio (ZimaOS)"
echo "📂 Workspace: $WORKSPACE_DIR"
echo "🌐 Porta Web: $PORT"
echo "=========================================="

exec "$@"
