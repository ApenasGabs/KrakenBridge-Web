import React from 'react';
import type { QueuedMessage } from '../../types';
import { ListOrdered, X, Pencil, Trash2 } from 'lucide-react';

interface MessageQueueBannerProps {
  queue: QueuedMessage[];
  onRemove: (id: string) => void;
  onEdit: (msg: QueuedMessage) => void;
  onClear: () => void;
}

export const MessageQueueBanner: React.FC<MessageQueueBannerProps> = ({
  queue,
  onRemove,
  onEdit,
  onClear
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
              </div>
              <p className="text-[10px] text-base-content/50 leading-none mt-0.5">
                Executará automaticamente em sequência assim que a resposta atual terminar
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClear}
            className="btn btn-ghost btn-xs text-base-content/50 hover:text-error flex items-center gap-1 text-[11px] h-7"
            title="Limpar todas as mensagens da fila"
          >
            <Trash2 className="w-3 h-3" />
            <span className="hidden sm:inline">Limpar fila</span>
          </button>
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
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="btn btn-ghost btn-xs btn-square h-6 w-6 text-base-content/60 hover:text-sky-400"
                  title="Editar mensagem (remove da fila e coloca no campo de texto)"
                >
                  <Pencil className="w-3 h-3" />
                </button>
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
