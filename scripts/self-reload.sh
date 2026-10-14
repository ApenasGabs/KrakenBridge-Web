#!/bin/bash
# ==============================================================================
# KrakenBridge Self-Reload Supervisor (TypeScript Edition)
# Desacoplado do processo do Node.js: espera a requisição terminar,
# compila TypeScript de forma segura (fail-safe) e recarrega o servidor Node.
# ==============================================================================

MODE="${1:-quick}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$DIR" || exit 1

# Aguarda 1.5s para a resposta HTTP ser completamente enviada ao cliente
sleep 1.5

echo "[SelfReload] Iniciando rotina de auto-reload no diretório: $DIR (Modo: $MODE)" >> data/evolution.log 2>&1

# 1. Compilação do Backend TypeScript (Fail-safe: se falhar, aborta sem derrubar o servidor)
echo "[SelfReload] Verificando e compilando Backend TypeScript..." >> data/evolution.log 2>&1
if [ -f "./node_modules/.bin/tsc" ]; then
    ./node_modules/.bin/tsc >> data/evolution.log 2>&1
    if [ $? -ne 0 ]; then
        echo "[SelfReload] ❌ ERRO CRÍTICO: Falha na compilação do TypeScript! Abortando reinício para manter serviço ativo." >> data/evolution.log 2>&1
        exit 1
    fi
    echo "[SelfReload] ✅ Backend TypeScript compilado com sucesso em dist-server/." >> data/evolution.log 2>&1
fi

# 2. Compilação do Frontend se solicitado
if [ "$MODE" = "build" ]; then
    echo "[SelfReload] Executando compilação do frontend..." >> data/evolution.log 2>&1
    if [ -d "frontend" ]; then
        cd frontend && npm run build >> ../data/evolution.log 2>&1
        cd ..
    fi
fi

echo "[SelfReload] Recarregando processo do servidor Node..." >> data/evolution.log 2>&1

# 3. Mata o processo do servidor antigo (seja node dist-server/server.js ou o legado node server.js)
NODE_PID=$(pgrep -f "server.js" | grep -v "$$" | grep -v "self-reload" | head -n 1)

if [ -n "$NODE_PID" ]; then
    echo "[SelfReload] Encerrando Node PID: $NODE_PID para reinício atômico..." >> data/evolution.log 2>&1
    kill -15 "$NODE_PID" 2>/dev/null || kill -9 "$NODE_PID" 2>/dev/null
fi

# 4. Fallback: Se o container não reiniciar automaticamente pelo supervisor do PID 1, sobe em background
sleep 2
if ! pgrep -f "dist-server/server.js" > /dev/null && ! pgrep -f "node server.js" > /dev/null; then
    echo "[SelfReload] Subindo node dist-server/server.js manualmente..." >> data/evolution.log 2>&1
    nohup node dist-server/server.js >> data/evolution.log 2>&1 &
fi

echo "[SelfReload] Auto-reload finalizado com sucesso na versão TypeScript." >> data/evolution.log 2>&1
