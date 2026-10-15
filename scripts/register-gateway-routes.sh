#!/bin/bash
if ! curl -s http://127.0.0.1/v1/gateway/routes 2>/dev/null | grep -q '"path":"/chat"'; then
    PORT=$(cat /var/run/casaos/management.url 2>/dev/null | cut -d: -f3)
    if [ -n "$PORT" ]; then
        curl -s -X POST -H 'Content-Type: application/json' -d '{\"path\":\"/chat\",\"target\":\"http://127.0.0.1:8088\"}' "http://127.0.0.1:${PORT}/v1/gateway/routes" >/dev/null 2>&1
    fi
fi
