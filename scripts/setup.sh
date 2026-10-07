#!/bin/bash
set -e

echo "========================================================="
echo "🦑 Setup do KrakenBridge Web para ZimaOS / Docker"
echo "========================================================="

# 1. Carregar variáveis de ambiente ou usar padrões
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

WORKSPACE_DIR="${WORKSPACE_PATH:-/DATA/Projetos}"
CONFIG_DIR="${CODE_SERVER_CONFIG:-/DATA/AppData/code-server-config}"
CLI_CONFIG_DIR="${KRAKEN_CONFIG_PATH:-/DATA/AppData/krakenbridge/config}"

echo "📁 Criando diretórios persistentes..."
mkdir -p "$WORKSPACE_DIR"
mkdir -p "$CONFIG_DIR/data/extensions"
mkdir -p "$CLI_CONFIG_DIR"
mkdir -p "$WORKSPACE_DIR/.vscode"

# 2. Configurar Git Safe Directory no host
echo "🔒 Configurando safe.directory no Git do host..."
git config --global --add safe.directory "*" || true

# 3. Copiar settings otimizadas do VS Code para detecção profunda de repositórios
if [ ! -f "$WORKSPACE_DIR/.vscode/settings.json" ]; then
  echo "⚙️ Copiando configurações de detecção Git (.vscode/settings.json)..."
  cp config/vscode-settings.json "$WORKSPACE_DIR/.vscode/settings.json"
fi

# 4. Copiar configurações de permissão autônoma
if [ ! -f "$CLI_CONFIG_DIR/settings.json" ]; then
  echo "⚙️ Copiando configurações autônomas de IA..."
  cp config/antigravity-settings.json "$CLI_CONFIG_DIR/settings.json"
fi

echo "✅ Configuração inicial concluída com sucesso!"
echo "➡️ Agora você pode iniciar com: docker compose up -d"
