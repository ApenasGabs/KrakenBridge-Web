import React from 'react';
import { 
  Sparkles, 
  CheckCheck, 
  X, 
  CheckCircle2, 
  Edit3, 
  GitMerge, 
  AlertTriangle,
  RefreshCw
} from 'lucide-react';

export interface BatchActionBarProps {
  totalSelected: number;
  counts: {
    approve: number;
    requestChanges: number;
    merge: number;
    close: number;
  };
  hasUnfilledNotes?: boolean;
  isDispatching?: boolean;
  onMarkAllAsOk: () => void;
  onClearSelection: () => void;
  onTriggerDispatch: () => void;
}

export const BatchActionBar: React.FC<BatchActionBarProps> = ({
  totalSelected,
  counts,
  hasUnfilledNotes = false,
  isDispatching = false,
  onMarkAllAsOk,
  onClearSelection,
  onTriggerDispatch
}) => {
  if (totalSelected === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-2xl animate-in fade-in slide-in-from-bottom-5 duration-200">
      <div className="bg-base-100/95 backdrop-blur-md border border-primary/30 shadow-2xl rounded-2xl p-2.5 sm:px-4 sm:py-3 flex flex-wrap items-center justify-between gap-2.5 text-base-content">
        {/* Esquerda: Contadores de Seleção */}
        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm">
            <span className="badge badge-primary badge-sm font-mono text-xs px-2 py-2.5 shadow-xs">
              {totalSelected}
            </span>
            <span className="hidden sm:inline">selecionado{totalSelected > 1 ? 's' : ''}:</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            {counts.approve > 0 && (
              <span className="badge badge-sm badge-success gap-1 text-[11px] font-medium py-2">
                <CheckCircle2 className="w-3 h-3" />
                {counts.approve} OK
              </span>
            )}
            {counts.requestChanges > 0 && (
              <span className="badge badge-sm badge-warning gap-1 text-[11px] font-medium py-2">
                <Edit3 className="w-3 h-3" />
                {counts.requestChanges} Ajustar
              </span>
            )}
            {counts.merge > 0 && (
              <span className="badge badge-sm badge-info gap-1 text-[11px] font-medium py-2">
                <GitMerge className="w-3 h-3" />
                {counts.merge} Merge
              </span>
            )}
          </div>

          {hasUnfilledNotes && (
            <div 
              className="tooltip tooltip-top text-[11px] text-warning flex items-center gap-1 cursor-pointer"
              data-tip="Há itens marcados para Ajustar sem anotações preenchidas"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="hidden md:inline text-[10px]">Anotação vazia</span>
            </div>
          )}
        </div>

        {/* Direita: Ações Rápidas & Despacho */}
        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
          {/* Botão Marcar Todos como OK */}
          <button
            onClick={onMarkAllAsOk}
            disabled={isDispatching}
            className="btn btn-ghost btn-xs text-[11px] text-success hover:bg-success/10 gap-1 h-7 min-h-0"
            title="Definir ação de todos os itens selecionados como OK / Aprovar"
          >
            <CheckCheck className="w-3 h-3" />
            <span className="hidden sm:inline">Todos como OK</span>
          </button>

          {/* Botão Limpar Seleção */}
          <button
            onClick={onClearSelection}
            disabled={isDispatching}
            className="btn btn-ghost btn-xs text-[11px] text-base-content/60 hover:text-base-content gap-1 h-7 min-h-0"
            title="Desmarcar todos os itens"
          >
            <X className="w-3 h-3" />
            <span className="hidden sm:inline">Limpar</span>
          </button>

          {/* Botão Principal de Despacho */}
          <button
            onClick={onTriggerDispatch}
            disabled={isDispatching || totalSelected === 0}
            className="btn btn-xs sm:btn-sm btn-primary gap-1.5 text-xs shadow-md font-semibold"
          >
            {isDispatching ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-primary-content" />
            )}
            <span>Despachar Lote ({totalSelected})</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatchActionBar;
