#!/bin/sh
# Kraken Git Guardrail - Native Pre-Push Hook
# Bloqueia qualquer push cuja referência remota aponte para main ou master.

z40="0000000000000000000000000000000000000000"

while read -r local_ref local_sha remote_ref remote_sha; do
  if [ "$local_sha" != "$z40" ]; then
    case "$remote_ref" in
      refs/heads/main|refs/heads/master)
        echo "" >&2
        echo "🚨 [KRAKEN GIT GUARDRAIL BLOQUEOU O PUSH] 🚨" >&2
        echo "--------------------------------------------------------------------------------" >&2
        echo "Tentativa de push direto para branch protegida: $remote_ref" >&2
        echo "Pushes diretos para 'main' ou 'master' são proibidos por governança." >&2
        echo "Crie uma branch de feature e abra um Pull Request para aprovação manual." >&2
        echo "--------------------------------------------------------------------------------" >&2
        echo "" >&2
        exit 1
        ;;
    esac
  fi
done

exit 0
