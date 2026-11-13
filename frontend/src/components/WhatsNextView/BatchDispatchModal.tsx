import React from 'react';
import {
  X,
  Sparkles,
  CheckCircle2,
  Edit3,
  GitMerge,
  RefreshCw,
  Bot,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import type { BatchItemDecision, BatchDispatchResult } from '../../types';

export interface BatchDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: BatchItemDecision[];
  isDispatching: boolean;
  onConfirmDispatch: () => void;
  result: BatchDispatchResult | null;
  onViewConversation?: (conversationId: string) => void;
}

export const BatchDispatchModal: React.FC<BatchDispatchModalProps> = ({
  isOpen,
  onClose,
  items,
  isDispatching,
  onConfirmDispatch,
  result,
  onViewConversation
}) => {
  if (!isOpen) return null;

  // Agrupamento por ação
  const approvedItems = items.filter(i => i.action === 'approve');
  const adjustItems = items.filter(i => i.action === 'request_changes');
  const mergeItems = items.filter(i => i.action === 'merge');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-base-100 border border-base-300 shadow-2xl rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-base-200 bg-base-200/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-base-content leading-tight">
                {result ? 'Resultado do Despacho em Lote' : 'Revisão e Despacho em Lote'}
              </h2>
              <p className="text-xs text-base-content/60">
                {result 
                  ? `${result.successful} de ${result.total} ações processadas com sucesso`
                  : `Revise a distribuição de ${items.length} item(ns) antes da execução`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isDispatching}
            className="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-base-content"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Se já concluiu e temos resultado */}
          {result ? (
            <div className="space-y-4">
              <div className={`p-4 rounded-xl border flex items-center gap-3 ${
                result.failed === 0 
                  ? 'bg-success/10 border-success/30 text-success' 
                  : 'bg-warning/10 border-warning/30 text-warning'
              }`}>
                {result.failed === 0 ? (
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 shrink-0" />
                )}
                <div className="text-xs">
                  <p className="font-bold text-sm">
                    {result.failed === 0 
                      ? 'Todas as ações foram processadas com sucesso!' 
                      : `Concluído com ${result.failed} falha(s).`}
                  </p>
                  <p className="text-base-content/70">
                    O agente triador realizou as aprovações e despachou as anotações para as filas correspondentes.
                  </p>
                </div>
              </div>

              {/* Lista de Resultados Detalhados */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-base-content/60 uppercase tracking-wider">
                  Detalhamento por Item:
                </span>
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {result.results.map((res) => (
                    <div 
                      key={res.itemKey}
                      className="p-2.5 rounded-lg bg-base-200/60 border border-base-300 text-xs flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${res.success ? 'bg-success' : 'bg-error'}`} />
                        <span className="font-mono text-base-content/70 shrink-0">{res.itemKey}</span>
                        <span className="text-base-content/60 truncate">{res.message || res.action}</span>
                      </div>
                      {res.conversationId && onViewConversation && (
                        <button
                          onClick={() => {
                            onViewConversation(res.conversationId!);
                            onClose();
                          }}
                          className="btn btn-ghost btn-xs text-primary gap-1 shrink-0"
                          title="Abrir sessão gerada/vinculada"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Ver Sessão</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Modo Prévia antes do Despacho */
            <div className="space-y-4">
              {/* Aviso do Agente Triador */}
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2.5 text-xs text-base-content/80">
                <Bot className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>
                  O <strong>Agente Triador</strong> vai executar as aprovações no GitHub/GitLab e encaminhar os itens com anotações diretamente para as sessões de resolução (Forge/Sentinel).
                </span>
              </div>

              {/* Seção 1: Itens Aprovados */}
              {approvedItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-success">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Aprovação Direta ({approvedItems.length})</span>
                  </div>
                  <div className="space-y-1 pl-2 border-l-2 border-success/40">
                    {approvedItems.map((item) => (
                      <div key={item.itemKey} className="text-xs flex items-center justify-between gap-2 py-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-mono text-base-content/60">{item.repo}#{item.number}:</span>
                          <span className="text-base-content font-medium truncate">{item.title}</span>
                        </div>
                        <span className="badge badge-xs badge-success shrink-0">Aprovar</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Seção 2: Itens com Ajuste e Anotações */}
              {adjustItems.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-warning">
                    <Edit3 className="w-4 h-4" />
                    <span>Ajustes com Anotações ({adjustItems.length})</span>
                  </div>
                  <div className="space-y-2 pl-2 border-l-2 border-warning/40">
                    {adjustItems.map((item) => (
                      <div key={item.itemKey} className="p-2.5 rounded-lg bg-base-200/50 border border-base-300 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono text-base-content/70 font-semibold">{item.repo}#{item.number}</span>
                          <span className="badge badge-xs badge-warning">Ajuste</span>
                        </div>
                        <p className="text-xs font-medium text-base-content truncate">{item.title}</p>
                        
                        <div className="p-2 rounded bg-base-100 border border-base-300 text-xs text-base-content/90 font-mono">
                          <span className="text-[10px] uppercase tracking-wider text-base-content/40 block mb-0.5 font-sans">
                            Anotação para o Agente:
                          </span>
                          {item.notes?.trim() ? (
                            <span>{item.notes}</span>
                          ) : (
                            <span className="italic text-warning text-[11px]">(Nenhuma anotação fornecida — agente fará revisão padrão)</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Seção 3: Merges Diretos */}
              {mergeItems.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-info">
                    <GitMerge className="w-4 h-4" />
                    <span>Mesclar / Squash ({mergeItems.length})</span>
                  </div>
                  <div className="space-y-1 pl-2 border-l-2 border-info/40">
                    {mergeItems.map((item) => (
                      <div key={item.itemKey} className="text-xs flex items-center justify-between gap-2 py-1">
                        <span className="font-mono text-base-content/60">{item.repo}#{item.number}:</span>
                        <span className="text-base-content font-medium truncate">{item.title}</span>
                        <span className="badge badge-xs badge-info shrink-0">Merge</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé do Modal com Ações */}
        <div className="p-4 sm:p-5 border-t border-base-200 bg-base-200/30 flex items-center justify-end gap-2">
          {result ? (
            <button
              onClick={onClose}
              className="btn btn-sm btn-primary"
            >
              Concluir
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={isDispatching}
                className="btn btn-sm btn-ghost text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirmDispatch}
                disabled={isDispatching || items.length === 0}
                className="btn btn-sm btn-primary gap-1.5 text-xs shadow-md font-semibold"
              >
                {isDispatching ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 text-primary-content" />
                )}
                <span>Confirmar e Despachar Lote ({items.length})</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BatchDispatchModal;
