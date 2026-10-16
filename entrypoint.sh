#!/bin/bash
set -e

# Garantir safe.directory para evitar erros com volumes montados pelo ZimaOS
git config --global --add safe.directory "*" || true

# Configurar diretório de trabalho padrão caso não exista
mkdir -p "$WORKSPACE_DIR"

# Vincular diretórios de configuração persistente e binários do Vercel e GitHub CLI
mkdir -p /root/.config/com.vercel.cli /root/.local/share /app/bin
ln -sf /root/.config/com.vercel.cli /root/.local/share/com.vercel.cli 2>/dev/null || true
ln -sf /app/bin/vercel /usr/local/bin/vercel 2>/dev/null || true
ln -sf /app/bin/vc /usr/local/bin/vc 2>/dev/null || true

# Garantir que o binário gh esteja acessível tanto em /usr/local/bin quanto em /app/bin
if [ -x /usr/bin/gh ]; then
  ln -sf /usr/bin/gh /app/bin/gh 2>/dev/null || true
  ln -sf /usr/bin/gh /usr/local/bin/gh 2>/dev/null || true
elif [ -x /app/bin/gh ]; then
  ln -sf /app/bin/gh /usr/local/bin/gh 2>/dev/null || true
fi

ln -sf /app/bin/agy /usr/local/bin/agy 2>/dev/null || true
ln -sf /app/bin/ai-memory /usr/local/bin/ai-memory 2>/dev/null || true

echo "=========================================="
echo "🦑 Iniciando KrakenBridge Web (ZimaOS)"
echo "📂 Workspace: $WORKSPACE_DIR"
echo "🌐 Porta Web: $PORT"
echo "=========================================="

exec "$@"
