import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  ArrowUpCircle, 
  RotateCcw, 
  Pin, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  GitBranch, 
  Calendar,
  Lock,
  RefreshCw
} from 'lucide-react';
import { api } from '../../services/api';

interface SystemUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemUpdateModal: React.FC<SystemUpdateModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState<{
    currentVersion: string;
    latestVersion: string;
    hasUpdate: boolean;
    policy: 'auto' | 'pinned';
    pinnedVersion: string | null;
    releases: Array<{
      tag: string;
      name: string;
      changelog: string;
      publishedAt: string;
      isCurrent: boolean;
      isLatest: boolean;
    }>;
  } | null>(null);

  const [selectedTag, setSelectedTag] = useState<string>('');
  const [policy, setPolicy] = useState<'auto' | 'pinned'>('auto');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [liveProgress, setLiveProgress] = useState<{ message?: string; percent?: number; stage?: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    loadStatus();
  }, [isOpen]);

  // Monitora progresso dinâmico durante atualização
  useEffect(() => {
    if (!updating) {
      setLiveProgress(null);
      return;
    }

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const evo = await api.getEvolutionStatus();
        if (evo && isMounted) {
          if (evo.progress || evo.stepMessage) {
            setLiveProgress({
              message: evo.progress?.message || evo.stepMessage,
              percent: evo.progress?.percent,
              stage: evo.progress?.stage || evo.status
            });
          }
        }
      } catch {}
    }, 1200);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [updating]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const res = await api.getSystemVersion();
      if (res.success) {
        setStatus(res);
        setPolicy(res.policy);
        if (res.releases.length > 0) {
          const defaultTag = res.hasUpdate ? `v${res.latestVersion}` : `v${res.currentVersion}`;
          setSelectedTag(defaultTag);
        }
      }
    } catch (err: any) {
      console.warn('[SystemUpdateModal] Erro ao carregar status:', err);
      setMessage({ type: 'error', text: 'Não foi possível carregar a lista de versões remotas.' });
    } finally {
      setLoading(false);
    }
  };

  const handlePolicyChange = async (newPolicy: 'auto' | 'pinned') => {
    try {
      const res = await api.setSystemVersionPolicy(newPolicy, newPolicy === 'pinned' ? selectedTag : null);
      if (res.success) {
        setPolicy(newPolicy);
        setMessage({ 
          type: 'success', 
          text: newPolicy === 'pinned' 
            ? `Sistema fixado na versão ${selectedTag}. Updates automáticos pausados.` 
            : 'Modo de atualização automática ativado.' 
        });
        loadStatus();
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Falha ao atualizar política.' });
    }
  };

  const handleApplyUpdate = async () => {
    if (!selectedTag) return;
    try {
      setUpdating(true);
      setMessage(null);
      const res = await api.updateSystemVersion(selectedTag);
      if (res.success) {
        setMessage({ 
          type: 'success', 
          text: `${res.message} A página será reconectada automaticamente após o Pod Drain.` 
        });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Erro ao aplicar versão.' });
      setUpdating(false);
    }
  };

  if (!isOpen) return null;

  const currentVerStr = status?.currentVersion || '...';
  const selectedRelease = status?.releases.find(r => r.tag === selectedTag);
  const isCurrentSelected = selectedTag === `v${currentVerStr}`;
  const isRollback = status ? (selectedTag < `v${status.currentVersion}`) : false;

  return (
    <div className="modal modal-open z-50" data-testid="system-update-modal">
      <div className="modal-backdrop bg-black/60 backdrop-blur-xs" onClick={onClose} />

      <div className="modal-box max-w-xl bg-base-100 border border-base-300 shadow-2xl p-5 sm:p-6 rounded-2xl relative">
        {/* Botão Fechar */}
        <button 
          data-testid="system-update-modal-close"
          onClick={onClose}
          disabled={updating}
          className="btn btn-sm btn-ghost btn-circle absolute right-4 top-4 text-base-content/60 hover:text-base-content"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Cabeçalho */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-base-content leading-tight flex items-center gap-2">
              <span>Gestão de Versões & Atualizações</span>
              <span className="badge badge-sm badge-neutral font-mono">v{currentVerStr}</span>
            </h3>
            <p className="text-xs text-base-content/60 mt-0.5">
              Atualização com Pod Drain, seleção de tag específica, rollback e fixação de versão
            </p>
          </div>
        </div>

        {/* Feedback de Mensagem */}
        {message && (
          <div className={`alert text-xs py-2 px-3 mb-4 rounded-xl flex items-center gap-2 ${
            message.type === 'success' ? 'alert-success text-success-content' :
            message.type === 'error' ? 'alert-error text-error-content' : 'alert-info text-info-content'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Banner de Progresso Dinâmico durante Atualização */}
        {updating && (
          <div data-testid="update-progress-banner" className="mb-4 p-3.5 rounded-xl bg-primary/10 border border-primary/30 text-base-content space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-primary flex items-center gap-1.5">
                <span className="loading loading-spinner loading-xs text-primary" />
                {liveProgress?.message || 'Iniciando atualização de versão...'}
              </span>
              {liveProgress?.percent !== undefined && (
                <span className="badge badge-primary badge-sm font-mono text-[11px]">
                  {liveProgress.percent}%
                </span>
              )}
            </div>
            {liveProgress?.percent !== undefined && (
              <progress
                className="progress progress-primary w-full h-1.5"
                value={liveProgress.percent}
                max="100"
              />
            )}
          </div>
        )}

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-base-content/60">
            <span className="loading loading-spinner loading-md text-primary"></span>
            <span>Verificando novas releases no GitHub...</span>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Card: Notificação de Update Disponível */}
            {status?.hasUpdate && (
              <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ArrowUpCircle className="w-5 h-5 text-primary shrink-0" />
                  <div>
                    <div className="font-semibold text-base-content text-sm flex items-center gap-1.5">
                      <span>Nova Versão Disponível: v{status.latestVersion}</span>
                      <span className="badge badge-xs badge-primary font-mono">Recomendada</span>
                    </div>
                    <p className="text-[11px] text-base-content/70 mt-0.5">
                      Atualize agora com 1 clique para receber novas correções e funcionalidades.
                    </p>
                  </div>
                </div>

                <button
                  data-testid="quick-update-btn"
                  onClick={() => {
                    setSelectedTag(`v${status.latestVersion}`);
                    handleApplyUpdate();
                  }}
                  disabled={updating}
                  className="btn btn-sm btn-primary gap-1 font-medium shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${updating ? 'animate-spin' : ''}`} />
                  Atualizar Agora
                </button>
              </div>
            )}

            {/* Seletor de Versão Específica */}
            <div className="p-3.5 rounded-xl bg-base-200/60 border border-base-300 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <label className="font-semibold text-base-content text-xs block">
                    Selecione uma Versão para Aplicar:
                  </label>
                  <p className="text-[11px] text-base-content/60">
                    Você pode escolher qualquer release oficial para upgrade ou rollback.
                  </p>
                </div>

                <select 
                  data-testid="version-select-dropdown"
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                  disabled={updating}
                  className="select select-sm select-bordered font-mono text-xs w-full sm:w-auto"
                >
                  {(status?.releases || []).map((r) => (
                    <option key={r.tag} value={r.tag}>
                      {r.tag} {r.isCurrent ? '(Instalada)' : (r.isLatest ? '(Mais recente)' : '')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Detalhes da Versão Selecionada */}
              {selectedRelease && (
                <div className="pt-2 border-t border-base-300/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-base-content flex items-center gap-1.5">
                      <GitBranch className="w-3.5 h-3.5 text-primary" />
                      <span>{selectedRelease.name}</span>
                      {isCurrentSelected && <span className="badge badge-xs badge-success font-mono">Ativa</span>}
                      {isRollback && <span className="badge badge-xs badge-warning font-mono">Rollback</span>}
                    </span>
                    <span className="text-[10px] text-base-content/50 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(selectedRelease.publishedAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Resumo do Changelog */}
                  <div className="p-2.5 rounded-lg bg-base-100 border border-base-300 text-[11px] font-mono text-base-content/80 max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {selectedRelease.changelog}
                  </div>
                </div>
              )}
            </div>

            {/* Card: Política de Atualização (Auto vs Pinned) */}
            <div className="p-3.5 rounded-xl bg-base-200/60 border border-base-300 space-y-3">
              <label className="font-semibold text-base-content text-xs block">
                Política de Atualização do Sistema:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Opção Auto-Update */}
                <div 
                  data-testid="policy-auto-card"
                  onClick={() => handlePolicyChange('auto')}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-start gap-2 ${
                    policy === 'auto'
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-base-100 border-base-300 text-base-content/70 hover:border-base-content/30'
                  }`}
                >
                  <ArrowUpCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="text-[11px] min-w-0">
                    <div className="font-semibold leading-tight">Atualização Automática</div>
                    <div className="text-[10px] opacity-75 mt-0.5">Notifica e recomenda sempre a versão estável mais recente.</div>
                  </div>
                </div>

                {/* Opção Pinned */}
                <div 
                  data-testid="policy-pinned-card"
                  onClick={() => handlePolicyChange('pinned')}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-start gap-2 ${
                    policy === 'pinned'
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-base-100 border-base-300 text-base-content/70 hover:border-base-content/30'
                  }`}
                >
                  <Pin className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="text-[11px] min-w-0">
                    <div className="font-semibold leading-tight">Fixar Versão (Pin)</div>
                    <div className="text-[10px] opacity-75 mt-0.5">Trava o sistema nesta versão específica sem updates involuntários.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Processo Seguro de Pod Drain */}
            <div className="p-3 rounded-xl bg-base-200/40 border border-base-300/70 text-[11px] text-base-content/70 flex items-start gap-2">
              <Lock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-base-content">Garantia de Estabilidade & Pod Drain:</span>
                <p className="text-[10px] text-base-content/60 mt-0.5">
                  Ao aplicar uma versão, o supervisor aguarda qualquer agente ativo concluir suas tarefas antes de realizar o build e o graceful reload. Nenhuma tarefa em andamento é interrompida.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Rodapé / Ações */}
        <div className="modal-action mt-4 pt-3 border-t border-base-300/60 flex items-center justify-between">
          <button 
            data-testid="system-update-modal-cancel"
            onClick={onClose} 
            disabled={updating}
            className="btn btn-sm btn-ghost"
          >
            Fechar
          </button>

          <button
            data-testid="apply-version-btn"
            onClick={handleApplyUpdate}
            disabled={updating || isCurrentSelected}
            className="btn btn-sm btn-primary gap-1.5 font-medium max-w-xs"
          >
            {updating ? (
              <>
                <span className="loading loading-spinner loading-xs"></span>
                <span className="truncate">{liveProgress?.message || 'Compilando & Aplicando...'}</span>
              </>
            ) : isRollback ? (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Executar Rollback para {selectedTag}</span>
              </>
            ) : (
              <>
                <ArrowUpCircle className="w-3.5 h-3.5" />
                <span>Aplicar {selectedTag}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
