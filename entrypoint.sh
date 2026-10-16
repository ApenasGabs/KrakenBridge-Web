#!/bin/bash
set -e

# Garantir safe.directory para evitar erros com volumes montados pelo ZimaOS
git config --global --add safe.directory "*" || true

# Configurar diretório de trabalho padrão caso não exista
mkdir -p "$WORKSPACE_DIR"

# Vincular diretórios de configuração persistente e binários do Vercel e GitHub CLI
mkdir -p /root/.config/com.vercel.cli /root/.local/share
ln -sf /root/.config/com.vercel.cli /root/.local/share/com.vercel.cli 2>/dev/null || true
ln -sf /app/bin/vercel /usr/local/bin/vercel 2>/dev/null || true
ln -sf /app/bin/vc /usr/local/bin/vc 2>/dev/null || true
ln -sf /app/bin/gh /usr/local/bin/gh 2>/dev/null || true
ln -sf /app/bin/agy /usr/local/bin/agy 2>/dev/null || true
ln -sf /app/bin/ai-memory /usr/local/bin/ai-memory 2>/dev/null || true

echo "=========================================="
echo "🦑 Iniciando KrakenBridge Web (ZimaOS)"
echo "📂 Workspace: $WORKSPACE_DIR"
echo "🌐 Porta Web: $PORT"
echo "=========================================="

exec "$@"
