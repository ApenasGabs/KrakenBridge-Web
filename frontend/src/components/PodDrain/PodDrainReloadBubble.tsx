import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, CheckCircle2, Sparkles, Server } from 'lucide-react';
import { api } from '../../services/api';
import type { EvolutionStatus } from '../../types';

interface PodDrainReloadBubbleProps {
  status: EvolutionStatus | null;
  onReconnected?: () => void;
  initialCountdown?: number;
}

export const PodDrainReloadBubble: React.FC<PodDrainReloadBubbleProps> = ({
  status,
  onReconnected,
  initialCountdown = 18
}) => {
  const isReloading = status?.status === 'reloading';
  const [secondsLeft, setSecondsLeft] = useState(initialCountdown);
  const [isReconnected, setIsReconnected] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const hasTriggeredReconnect = useRef(false);

  // Monitora a transição para reloading
  useEffect(() => {
    if (isReloading) {
      setIsVisible(true);
      setSecondsLeft(initialCountdown);
      setIsReconnected(false);
      hasTriggeredReconnect.current = false;
    }
  }, [isReloading, initialCountdown]);

  // Contagem regressiva de segundos
  useEffect(() => {
    if (!isVisible || isReconnected) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 1 ? prev - 1 : 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [isVisible, isReconnected]);

  // Polling em /api/health para detectar o retorno do servidor
  useEffect(() => {
    if (!isVisible || isReconnected) return;

    let isMounted = true;
    const healthCheckInterval = setInterval(async () => {
      try {
        const res = await api.checkHealth();
        if (res && res.status === 'healthy' && isMounted) {
          if (!hasTriggeredReconnect.current) {
            hasTriggeredReconnect.current = true;
            setIsReconnected(true);
            if (onReconnected) {
              onReconnected();
            }

            // Oculta o balão após 3.5s mostrando a mensagem de sucesso
            setTimeout(() => {
              if (isMounted) {
                setIsVisible(false);
              }
            }, 3500);
          }
        }
      } catch {
        // Servidor ainda reiniciando, continua aguardando normalmente
      }
    }, 1500);

    return () => {
      isMounted = false;
      clearInterval(healthCheckInterval);
    };
  }, [isVisible, isReconnected, onReconnected]);

  if (!isVisible) return null;

  const totalTime = initialCountdown;
  const elapsed = totalTime - secondsLeft;
  const progressPercent = Math.min(100, Math.round((elapsed / totalTime) * 100));
  const taskDesc = status?.taskDescription || 'Atualização e reconstrução do sistema';

  return (
    <div
      data-testid="pod-drain-reload-bubble"
      className="fixed bottom-6 right-6 z-50 max-w-sm w-full animate-in fade-in slide-in-from-bottom-5 duration-300 pointer-events-auto"
    >
      <div
        className={`rounded-2xl border p-4 shadow-2xl backdrop-blur-xl transition-all duration-300 ${
          isReconnected
            ? 'bg-success/15 border-success/40 text-success-content'
            : 'bg-base-100/90 border-primary/40 text-base-content'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`p-2.5 rounded-xl shrink-0 transition-colors ${
              isReconnected ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'
            }`}
          >
            {isReconnected ? (
              <CheckCircle2 className="w-5 h-5 animate-bounce" />
            ) : (
              <RefreshCw className="w-5 h-5 animate-spin" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold text-sm flex items-center gap-1.5">
                {isReconnected ? (
                  <>
                    <Sparkles className="w-4 h-4 text-success" />
                    Kraken Restabelecido!
                  </>
                ) : (
                  <>
                    <Server className="w-4 h-4 text-primary" />
                    Reiniciando Kraken (Auto-Reload)
                  </>
                )}
              </h4>
              {!isReconnected && (
                <span className="badge badge-primary badge-sm font-mono text-[11px]">
                  ~{secondsLeft}s
                </span>
              )}
            </div>

            <p className="text-xs text-base-content/70 mt-1 leading-relaxed">
              {isReconnected ? (
                'O servidor concluiu o ciclo de reinício e a nova versão já está operacional.'
              ) : status?.progress?.message || status?.stepMessage ? (
                <span className="font-medium text-base-content flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
                  {status.progress?.message || status.stepMessage}
                </span>
              ) : (
                <>
                  Aplicando modificações: <span className="italic font-medium text-base-content/90">&ldquo;{taskDesc}&rdquo;</span>.
                </>
              )}
            </p>

            {/* Barra de progresso da estimativa de reinício */}
            {!isReconnected && (
              <div className="mt-2.5 space-y-1">
                <div className="flex justify-between text-[10px] text-base-content/50 font-mono">
                  <span>Reiniciando processo</span>
                  <span>{progressPercent}%</span>
                </div>
                <progress
                  className="progress progress-primary w-full h-1.5"
                  value={progressPercent}
                  max="100"
                />
              </div>
            )}

            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-base-content/60">
              <span
                className={`w-2 h-2 rounded-full ${
                  isReconnected ? 'bg-success animate-ping' : 'bg-primary animate-pulse'
                }`}
              />
              <span>
                {isReconnected
                  ? 'Sessão restabelecida com sucesso'
                  : 'Aguardando inicialização do servidor...'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
