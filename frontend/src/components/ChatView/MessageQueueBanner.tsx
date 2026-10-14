import React from 'react';
import type { QueuedMessage } from '../../types';
import { ListOrdered, X, Pencil, Trash2, Zap, Play } from 'lucide-react';

interface MessageQueueBannerProps {
  queue: QueuedMessage[];
  onRemove: (id: string) => void;
  onEdit: (msg: QueuedMessage) => void;
  onClear: () => void;
  onForceSend?: (msg: QueuedMessage) => void;
  onRunNext?: () => void;
  isGenerating?: boolean;
}

export const MessageQueueBanner: React.FC<MessageQueueBannerProps> = ({
  queue,
  onRemove,
  onEdit,
  onClear,
  onForceSend,
  onRunNext,
  isGenerating = false
}) => {
  if (queue.length === 0) return null;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="bg-base-200/90 border border-sky-500/30 rounded-xl p-2.5 shadow-md backdrop-blur-sm">
        {/* Cabeçalho da Fila */}
        <div className="flex items-center justify-between pb-2 border-b border-base-300/60 mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-sky-500/10 text-sky-400">
              <ListOrdered className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-base-content">
                  Fila de Mensagens
                </span>
                <span className="badge badge-sm badge-info text-[10px] font-mono px-1.5 py-0.5 h-4">
                  {queue.length} {queue.length === 1 ? 'pendente' : 'pendentes'}
                </span>
                {isGenerating ? (
                  <span className="flex items-center gap-1 text-[10px] text-sky-400/90 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping inline-block" />
                    auto-espera
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-400 font-medium">
                    ● pronta
                  </span>
                )}
              </div>
              <p className="text-[10px] text-base-content/60 leading-none mt-0.5">
                {isGenerating
                  ? 'Aguardando término da resposta atual ou clique em ⚡ para forçar o envio imediato'
                  : 'Fila pronta para execução sequencial'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Botão de Executar Fila se o agente não estiver gerando */}
            {!isGenerating && onRunNext && (
              <button
                type="button"
                onClick={onRunNext}
                className="btn btn-primary btn-xs text-[11px] h-7 gap-1 shadow-sm font-medium"
                title="Executar próxima mensagem da fila agora"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Executar fila</span>
              </button>
            )}

            {/* Botão de Forçar 1º da fila caso esteja gerando */}
            {isGenerating && onForceSend && queue.length > 0 && (
              <button
                type="button"
                onClick={() => onForceSend(queue[0])}
                className="btn btn-warning btn-xs text-[11px] h-7 gap-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold border-amber-600 shadow-sm"
                title="Forçar envio da 1ª mensagem agora (interrompe geração atual)"
              >
                <Zap className="w-3 h-3 fill-current" />
                <span className="hidden sm:inline">Forçar 1º agora</span>
                <span className="sm:hidden">Forçar</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClear}
              className="btn btn-ghost btn-xs text-base-content/50 hover:text-error flex items-center gap-1 text-[11px] h-7"
              title="Limpar todas as mensagens da fila"
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden sm:inline">Limpar</span>
            </button>
          </div>
        </div>

        {/* Lista de Mensagens Enfileiradas */}
        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
          {queue.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-base-100 border border-base-300/80 hover:border-sky-500/30 text-xs transition-all group"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="font-mono text-[10px] text-sky-400 font-bold px-1.5 py-0.5 rounded bg-sky-500/10 shrink-0">
                  #{idx + 1}
                </span>
                <span className="truncate text-base-content/90 font-normal">
                  {item.text}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                {/* Forçar Envio do Item Específico */}
                {onForceSend && (
                  <button
                    type="button"
                    onClick={() => onForceSend(item)}
                    className="btn btn-ghost btn-xs btn-square h-6 w-6 text-amber-400 hover:bg-amber-500/20"
                    title="Forçar envio desta mensagem agora (interrompe geração atual)"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" />
                  </button>
                )}

                {/* Editar Item */}
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="btn btn-ghost btn-xs btn-square h-6 w-6 text-base-content/60 hover:text-sky-400"
                  title="Editar mensagem (remove da fila e coloca no campo de texto)"
                >
                  <Pencil className="w-3 h-3" />
                </button>

                {/* Remover Item */}
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="btn btn-ghost btn-xs btn-square h-6 w-6 text-base-content/60 hover:text-error"
                  title="Remover da fila"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
