import React from 'react';
import { Loader2, ShieldAlert, Cpu, RefreshCw, AlertTriangle } from 'lucide-react';
import type { EvolutionStatus } from '../../types';

interface PodDrainBannerProps {
  status: EvolutionStatus | null;
  className?: string;
}

export const PodDrainBanner: React.FC<PodDrainBannerProps> = ({ status, className = '' }) => {
  if (!status || (!status.isDraining && status.status !== 'draining' && status.status !== 'reloading')) {
    return null;
  }

  const activeCount = status.activeTasksCount ?? 0;
  const taskDesc = status.taskDescription || 'Atualização de código do sistema';
  const progress = status.progress;
  const isReloading = status.status === 'reloading';
  const hasError = progress?.stage === 'error';
  const dynamicMessage = progress?.message || status.stepMessage;

  return (
    <div
      data-testid="pod-drain-banner"
      role="alert"
      className={`relative overflow-hidden rounded-xl border p-3 sm:p-4 shadow-md backdrop-blur-sm transition-all ${
        hasError
          ? 'border-error/40 bg-error/10 text-error-content'
          : isReloading
          ? 'border-primary/40 bg-primary/10 text-primary-content'
          : 'border-warning/40 bg-warning/10 text-warning-content'
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`p-2 rounded-lg shrink-0 mt-0.5 ${
            hasError
              ? 'bg-error/20 text-error'
              : isReloading
              ? 'bg-primary/20 text-primary'
              : 'bg-warning/20 text-warning'
          }`}
        >
          {hasError ? (
            <AlertTriangle className="w-5 h-5 text-error" />
          ) : isReloading ? (
            <RefreshCw className="w-5 h-5 animate-spin text-primary" />
          ) : (
            <Loader2 className="w-5 h-5 animate-spin" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`font-semibold text-sm flex items-center gap-1.5 ${
                hasError ? 'text-red-400' : isReloading ? 'text-primary' : 'text-amber-300'
              }`}
            >
              {isReloading ? (
                <>
                  <RefreshCw className="w-4 h-4 text-primary animate-spin" />
                  Reiniciando Pod do Kraken
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4 text-warning" />
                  Pod Drain em Andamento
                </>
              )}
            </span>

            {!isReloading && (
              <span className="badge badge-warning badge-sm font-mono font-medium text-[11px] gap-1">
                <Cpu className="w-3 h-3" />
                {activeCount} {activeCount === 1 ? 'tarefa ativa' : 'tarefas ativas'}
              </span>
            )}

            {progress?.percent !== undefined && progress.percent > 0 && (
              <span className="badge badge-primary badge-sm font-mono text-[11px]">
                {progress.percent}%
              </span>
            )}
          </div>

          <p className="text-xs text-base-content/80 mt-1 leading-relaxed">
            {dynamicMessage ? (
              <span className="font-medium text-base-content flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
                {dynamicMessage}
              </span>
            ) : isReloading ? (
              <>O servidor está reiniciando para aplicar a nova versão com segurança.</>
            ) : activeCount > 0 ? (
              <>
                O Kraken está concluindo <strong>{activeCount} {activeCount === 1 ? 'tarefa em execução' : 'tarefas em execução'}</strong> antes de reiniciar para aplicar a nova versão com segurança.
              </>
            ) : (
              <>Todas as tarefas foram concluídas! <strong>Aplicando a nova versão e reiniciando o serviço...</strong></>
            )}
          </p>

          {progress?.percent !== undefined && progress.percent > 0 && (
            <div className="mt-2 space-y-1">
              <progress
                className="progress progress-primary w-full h-1.5"
                value={progress.percent}
                max="100"
              />
            </div>
          )}

          {taskDesc && (
            <div className="mt-1.5 text-xs text-base-content/70 italic truncate">
              🎯 Atualização: &ldquo;{taskDesc}&rdquo;
            </div>
          )}

          <div className="mt-2 text-[11px] text-amber-400/90 font-medium flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            Envio de novas mensagens pausado preventivamente para evitar concorrência.
          </div>
        </div>
      </div>
    </div>
  );
};
