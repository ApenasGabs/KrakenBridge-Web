import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import {
  getSpinnerVerbsConfig,
  getActiveVerbsList,
  type SpinnerVerbsConfig
} from '../../utils/spinnerVerbsData';

interface SpinnerVerbsProps {
  startTime?: string | number;
}

export const SpinnerVerbs: React.FC<SpinnerVerbsProps> = ({ startTime }) => {
  const [config, setConfig] = useState<SpinnerVerbsConfig>(() => getSpinnerVerbsConfig());
  const verbs = useMemo(() => getActiveVerbsList(config), [config]);

  // Escolhe um primeiro verbo aleatório
  const [currentIndex, setCurrentIndex] = useState(() => {
    return Math.floor(Math.random() * (verbs.length || 1));
  });
  const [fade, setFade] = useState(true);

  // Cronômetro decorrido
  const initialTime = useRef<number>(
    typeof startTime === 'number'
      ? startTime
      : typeof startTime === 'string'
      ? new Date(startTime).getTime() || Date.now()
      : Date.now()
  );
  const [elapsedMs, setElapsedMs] = useState(0);

  // Listener para atualização dinâmica de configurações
  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<SpinnerVerbsConfig>;
      if (customEvent.detail) {
        setConfig(customEvent.detail);
      } else {
        setConfig(getSpinnerVerbsConfig());
      }
    };

    window.addEventListener('kraken:spinner-verbs-updated', handleUpdate);
    return () => window.removeEventListener('kraken:spinner-verbs-updated', handleUpdate);
  }, []);

  // Timer contínuo de alta precisão para os segundos decorridos (100ms)
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - initialTime.current));
    }, 100);

    return () => clearInterval(timer);
  }, []);

  // Alternância suave de verbos com fade-out e fade-in
  useEffect(() => {
    if (!config.enabled || verbs.length === 0) return;

    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % verbs.length);
        setFade(true);
      }, 250);
    }, config.intervalMs || 2600);

    return () => clearInterval(interval);
  }, [config.enabled, config.intervalMs, verbs]);

  const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
  const currentVerb = verbs[currentIndex % verbs.length] || 'Pondering';

  // Se o usuário desativou os Spinner Verbs nas preferências, renderiza mensagem clássica minimalista
  if (!config.enabled) {
    return (
      <div 
        className="flex items-center gap-2 text-xs text-base-content/60 py-1 font-mono select-none"
        data-testid="spinner-verbs-disabled"
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
        <span>Iniciando motor e conectando ferramentas...</span>
        <span className="text-[11px] opacity-60">({elapsedSeconds}s)</span>
      </div>
    );
  }

  return (
    <div 
      className="flex items-center gap-2 text-xs font-mono py-1 select-none text-base-content/80"
      data-testid="spinner-verbs-container"
    >
      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
      <span
        className={`transition-all duration-300 transform font-medium text-base-content/90 ${
          fade ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
        }`}
        data-testid="spinner-verb-text"
      >
        {currentVerb}...
      </span>
      <span 
        className="text-[11px] font-mono text-base-content/50"
        data-testid="spinner-verb-timer"
      >
        ({elapsedSeconds}s)
      </span>
    </div>
  );
};
