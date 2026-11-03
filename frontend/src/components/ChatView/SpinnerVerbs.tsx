import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import {
  getSpinnerVerbsConfig,
  getActiveVerbsList,
  TOOL_CATEGORY_VERBS,
  getCategoryForTool,
  getTargetForTool,
  type SpinnerVerbsConfig
} from '../../utils/spinnerVerbsData';
import type { ToolCall } from '../../types';

export interface SpinnerVerbsProps {
  startTime?: string | number;
  toolCalls?: ToolCall[];
  activeTool?: ToolCall;
  thinking?: string;
}

// 10 Frames clássicos do Braille Spinner oficial do ecossistema terminal / Claude Code
export const CLAUDE_BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const SpinnerVerbs: React.FC<SpinnerVerbsProps> = ({
  startTime,
  toolCalls,
  activeTool,
  thinking
}) => {
  const [config, setConfig] = useState<SpinnerVerbsConfig>(() => getSpinnerVerbsConfig());
  const verbs = useMemo(() => getActiveVerbsList(config), [config]);

  // Frame do spinner Braille (atualizado a cada 80ms, exatamente como no Claude Code)
  const [brailleIndex, setBrailleIndex] = useState(0);

  // Ferramenta ativa no momento
  const currentTool = useMemo(() => {
    if (activeTool) return activeTool;
    if (!toolCalls || toolCalls.length === 0) return undefined;
    const running = [...toolCalls].reverse().find(t => t.state === 'ACTIVE' || t.state === 'RUNNING');
    return running || toolCalls[toolCalls.length - 1];
  }, [activeTool, toolCalls]);

  // Categoria e alvo contextual
  const currentCategory = useMemo(() => {
    if (currentTool) return getCategoryForTool(currentTool);
    if (thinking && thinking.trim()) return 'thinking';
    return 'default';
  }, [currentTool, thinking]);

  const currentTarget = useMemo(() => {
    return getTargetForTool(currentTool);
  }, [currentTool]);

  // Pool de verbos correspondente à categoria ativa
  const activePool = useMemo(() => {
    if (currentCategory in TOOL_CATEGORY_VERBS) {
      const categoryList = TOOL_CATEGORY_VERBS[currentCategory];
      if (categoryList && categoryList.length > 0) return categoryList;
    }
    return verbs;
  }, [currentCategory, verbs]);

  // Índice do verbo atual
  const [currentIndex, setCurrentIndex] = useState(() => {
    return Math.floor(Math.random() * (activePool.length || 1));
  });
  const [fade, setFade] = useState(true);

  // Chave única para detectar mudança de ferramenta/ação
  const actionSignature = useMemo(() => {
    if (currentTool) {
      return `${currentTool.name}:${currentTarget || ''}:${currentTool.state || ''}`;
    }
    if (thinking && thinking.trim()) {
      return `thinking:${thinking.trim().slice(0, 30)}`;
    }
    return 'idle';
  }, [currentTool, currentTarget, thinking]);

  const prevSignatureRef = useRef(actionSignature);

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

  // Animação fluida dos frames Braille a 80ms
  useEffect(() => {
    const brailleTimer = setInterval(() => {
      setBrailleIndex((prev) => (prev + 1) % CLAUDE_BRAILLE_FRAMES.length);
    }, 80);

    return () => clearInterval(brailleTimer);
  }, []);

  // Transição IMEDIATA quando o agente troca de ferramenta / ação
  useEffect(() => {
    if (prevSignatureRef.current !== actionSignature) {
      prevSignatureRef.current = actionSignature;
      setFade(false);
      const timeout = setTimeout(() => {
        const pool = activePool.length > 0 ? activePool : verbs;
        const nextIdx = Math.floor(Math.random() * pool.length);
        setCurrentIndex(nextIdx);
        setFade(true);
      }, 140);
      return () => clearTimeout(timeout);
    }
  }, [actionSignature, activePool, verbs]);

  // Alternância periódica suave se o agente permanecer na mesma ferramenta por longo período
  useEffect(() => {
    if (!config.enabled || activePool.length === 0) return;

    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        const pool = activePool.length > 0 ? activePool : verbs;
        setCurrentIndex((prev) => (prev + 1) % pool.length);
        setFade(true);
      }, 200);
    }, config.intervalMs || 2600);

    return () => clearInterval(interval);
  }, [config.enabled, config.intervalMs, activePool, verbs]);

  const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
  const pool = activePool.length > 0 ? activePool : verbs;
  const currentVerb = pool[currentIndex % pool.length] || 'Pondering';

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
      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-base-300/40 border border-base-300/60 font-mono text-xs select-none text-base-content/90 shadow-sm backdrop-blur-xs"
      data-testid="spinner-verbs-container"
    >
      {/* Glifo Braille clássico do Claude Code */}
      <span 
        className="font-mono text-amber-500 dark:text-amber-400 font-bold select-none inline-block w-3.5 text-center shrink-0 text-sm leading-none"
        data-testid="spinner-braille-icon"
        aria-hidden="true"
      >
        {CLAUDE_BRAILLE_FRAMES[brailleIndex]}
      </span>

      {/* Texto do verbo e alvo contextual com efeito de transição slide & fade */}
      <span
        className={`inline-flex items-baseline gap-1.5 transition-all duration-200 transform font-mono ${
          fade ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-1 scale-[0.98]'
        }`}
        data-testid="spinner-verb-text"
      >
        <span className="font-semibold text-amber-600 dark:text-amber-400">
          {currentVerb}
        </span>
        {currentTarget && (
          <span 
            className="text-base-content/75 text-[11px] font-mono truncate max-w-[180px] sm:max-w-xs"
            title={currentTarget}
          >
            {currentTarget}
          </span>
        )}
        <span className="text-base-content/40">...</span>
      </span>

      {/* Cronômetro decorrido */}
      <span 
        className="text-[11px] font-mono text-base-content/45 shrink-0"
        data-testid="spinner-verb-timer"
      >
        ({elapsedSeconds}s)
      </span>
    </div>
  );
};
