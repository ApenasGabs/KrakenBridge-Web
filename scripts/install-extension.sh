#!/bin/bash
set -e

# ==============================================================================
# Instalação da Extensão Oficial do Google Antigravity no code-server
# ==============================================================================

TARGET_CONTAINER="${1:-code-server}"
VSIX_PATH="$2"

echo "========================================================="
echo "📦 Instalando Extensão Google Antigravity em: $TARGET_CONTAINER"
echo "========================================================="

if [ -n "$VSIX_PATH" ] && [ -f "$VSIX_PATH" ]; then
  echo "Enviando arquivo VSIX para o contêiner..."
  docker cp "$VSIX_PATH" "$TARGET_CONTAINER:/tmp/antigravity.vsix"
  echo "Instalando via code-server CLI..."
  docker exec "$TARGET_CONTAINER" /usr/lib/code-server/bin/code-server --install-extension /tmp/antigravity.vsix
  docker exec "$TARGET_CONTAINER" rm -f /tmp/antigravity.vsix
  echo "✅ Extensão instalada com sucesso a partir do arquivo VSIX!"
else
  echo "💡 Dica: Se você possui o arquivo .vsix ou a pasta extraída da extensão,"
  echo "execute:"
  echo "  ./scripts/install-extension.sh code-server /caminho/para/extensao.vsix"
  echo ""
  echo "Ou se já tiver a pasta descompactada no host, copie diretamente para:"
  echo "  cp -r /origem/google.google-antigravity-1.6.0 /DATA/AppData/code-server-config/data/extensions/"
  echo "  cp config/extensions.json /DATA/AppData/code-server-config/data/extensions/extensions.json"
fi

echo "Reiniciando o contêiner do code-server..."
docker restart "$TARGET_CONTAINER"
echo "✅ Pronto! Abra o VS Code Web e recarregue a aba."
