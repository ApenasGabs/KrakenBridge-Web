# Sincronização GitHub → Paperclip

Usa só as APIs, sem modelos de IA. Sem `--apply`, tudo é simulação.

```bash
npm run build:server
npm run paperclip:sync -- plan
npm run paperclip:sync -- sync --apply
npm run paperclip:sync -- dispatch --apply
npm run paperclip:sync -- close 123 --pr 130 --apply
```

| Variável | Uso |
|---|---|
| `PAPERCLIP_URL`, `PAPERCLIP_COMPANY_ID`, `PAPERCLIP_API_TOKEN` | Acesso ao Paperclip (obrigatórias, sem valor padrão) |
| `PAPERCLIP_SYNC_REPO` | Repositório, como `dono/repo` |
| `PAPERCLIP_SYNC_PROJECT_ID` | Projeto de destino |
| `PAPERCLIP_SYNC_AGENT_ID` | Agente do `dispatch` |
| `PAPERCLIP_SYNC_LABEL` | Label que autoriza a importação (padrão `paperclip`) |

## Conferências

- **sync:** só issues abertas, com o label e de autor vinculado ao repositório. Cria em `backlog`, sem responsável e sem duplicar tarefas com o título `[dono/repo#N]`.
- **dispatch:** uma tarefa por vez, com a fila livre, o agente disponível e a issue ainda elegível.
- **close:** PR mergeado na branch padrão, vinculado à issue, checks verdes e uma única tarefa. Nunca faz merge.
- Falha de leitura interrompe antes de gravar. Saída 1 é erro; 2 é conferência recusada.
- Se uma execução for interrompida à força, a trava precisa ser removida manualmente.
