import React from 'react';
import { Loader2, ShieldAlert, Cpu } from 'lucide-react';
import type { EvolutionStatus } from '../../types';

interface PodDrainBannerProps {
  status: EvolutionStatus | null;
  className?: string;
}

export const PodDrainBanner: React.FC<PodDrainBannerProps> = ({ status, className = '' }) => {
  if (!status || (!status.isDraining && status.status !== 'draining')) {
    return null;
  }

  const activeCount = status.activeTasksCount ?? 0;
  const taskDesc = status.taskDescription || 'Atualização de código do sistema';

  return (
    <div
      data-testid="pod-drain-banner"
      role="alert"
      className={`relative overflow-hidden rounded-xl border border-warning/40 bg-warning/10 p-3 sm:p-4 text-warning-content shadow-md backdrop-blur-sm transition-all ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-warning/20 text-warning shrink-0 mt-0.5">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm text-amber-300 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-warning" />
              Pod Drain em Andamento
            </span>
            <span className="badge badge-warning badge-sm font-mono font-medium text-[11px] gap-1">
              <Cpu className="w-3 h-3" />
              {activeCount} {activeCount === 1 ? 'tarefa ativa' : 'tarefas ativas'}
            </span>
          </div>

          <p className="text-xs text-base-content/80 mt-1 leading-relaxed">
            O Kraken está concluindo <strong>{activeCount} {activeCount === 1 ? 'tarefa em execução' : 'tarefas em execução'}</strong> antes de reiniciar para aplicar a nova versão com segurança.
          </p>

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
