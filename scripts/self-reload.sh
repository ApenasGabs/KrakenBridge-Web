#!/bin/bash
# ==============================================================================
# KrakenBridge Self-Reload Supervisor
# Desacoplado do processo do Node.js: espera a requisição terminar,
# faz o build (se solicitado) e recarrega o servidor Node de forma atômica.
# ==============================================================================

MODE="${1:-quick}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$DIR" || exit 1

# Aguarda 1.5s para a resposta HTTP ser completamente enviada ao cliente
sleep 1.5

echo "[SelfReload] Iniciando rotina de auto-reload no diretório: $DIR (Modo: $MODE)" >> data/evolution.log 2>&1

if [ "$MODE" = "build" ]; then
    echo "[SelfReload] Executando compilação do frontend..." >> data/evolution.log 2>&1
    if [ -d "frontend" ]; then
        cd frontend && npm run build >> ../data/evolution.log 2>&1
        cd ..
    fi
fi

echo "[SelfReload] Recarregando processo do servidor Node..." >> data/evolution.log 2>&1

# Mata o processo do node server.js antigo (PID 1 do container sh -c vai reiniciar ou nós reiniciamos o processo)
NODE_PID=$(pgrep -f "node server.js" | grep -v "$$" | head -n 1)

if [ -n "$NODE_PID" ]; then
    echo "[SelfReload] Encerrando Node PID: $NODE_PID para reinício automático..." >> data/evolution.log 2>&1
    kill -15 "$NODE_PID" 2>/dev/null || kill -9 "$NODE_PID" 2>/dev/null
fi

# Fallback: Se o container não reiniciar o node server.js pelo PID 1, sobe em background
sleep 2
if ! pgrep -f "node server.js" > /dev/null; then
    echo "[SelfReload] Subindo node server.js manualmente..." >> data/evolution.log 2>&1
    nohup node server.js >> data/evolution.log 2>&1 &
fi

echo "[SelfReload] Auto-reload finalizado com sucesso." >> data/evolution.log 2>&1
