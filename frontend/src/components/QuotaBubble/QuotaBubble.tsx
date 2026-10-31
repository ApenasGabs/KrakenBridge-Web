import React, { useState, useEffect, useCallback } from 'react';
import type { QuotaStats, QuotaGroup } from '../../types';
import { api } from '../../services/api';
import { 
  Info, 
  X, 
  Minimize2, 
  Maximize2, 
  RotateCw, 
  SlidersHorizontal, 
  Check, 
  ChevronDown, 
  ChevronUp,
  Droplets
} from 'lucide-react';
import { formatWaterLiters, useWaterMetrics } from '../../utils/waterConsumption';

interface QuotaBubbleProps {
  isVisible: boolean;
  onClose: () => void;
  lastTurnTokens?: number;
}

// Anel circular SVG estilizado exatamente como o indicador oficial do Antigravity
const QuotaGauge: React.FC<{ percent: number; size?: number; strokeWidth?: number }> = ({
  percent,
  size = 28,
  strokeWidth = 3.5
}) => {
  const safePercent = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (safePercent / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90 shrink-0">
      {/* Trilha de fundo escura */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="#262b32"
        strokeWidth={strokeWidth}
        fill="transparent"
      />
      {/* Arco de progresso verde Antigravity */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="#22c55e"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        fill="transparent"
        className="transition-all duration-500 ease-out"
      />
    </svg>
  );
};

export const QuotaBubble: React.FC<QuotaBubbleProps> = ({
  isVisible,
  onClose,
  lastTurnTokens
}) => {
  const [stats, setStats] = useState<QuotaStats | null>(null);
  const [showWaterMetrics] = useWaterMetrics();
  // Em viewports < 1024px (mobile/tablet) inicia recolhido para não obstruir a área principal
  const [isExpanded, setIsExpanded] = useState<boolean>(
    () => typeof window === 'undefined' || window.innerWidth >= 1024
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [showTokensDetail, setShowTokensDetail] = useState<boolean>(false);

  // Estados locais para calibração rápida
  const [geminiWeekly, setGeminiWeekly] = useState<number>(57);
  const [gemini5h, setGemini5h] = useState<number>(85);
  const [claudeWeekly, setClaudeWeekly] = useState<number>(100);
  const [claude5h, setClaude5h] = useState<number>(100);
  const [savingSync, setSavingSync] = useState<boolean>(false);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getQuotaStats();
      setStats(data);
      if (data?.gemini) {
        setGeminiWeekly(data.gemini.weekly.remaining);
        setGemini5h(data.gemini.fiveHour.remaining);
      }
      if (data?.claudeGpt) {
        setClaudeWeekly(data.claudeGpt.weekly.remaining);
        setClaude5h(data.claudeGpt.fiveHour.remaining);
      }
    } catch (err) {
      console.warn('Erro ao carregar estatísticas de cota:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLiveRefresh = async () => {
    try {
      setLoading(true);
      const res = await api.refreshQuota();
      if (res?.stats) {
        setStats(res.stats);
        if (res.stats.gemini) {
          setGeminiWeekly(res.stats.gemini.weekly.remaining);
          setGemini5h(res.stats.gemini.fiveHour.remaining);
        }
        if (res.stats.claudeGpt) {
          setClaudeWeekly(res.stats.claudeGpt.weekly.remaining);
          setClaude5h(res.stats.claudeGpt.fiveHour.remaining);
        }
      }
    } catch (err) {
      console.warn('Falha ao atualizar cota ao vivo:', err);
      await fetchStats();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isVisible) {
      fetchStats();
      const interval = setInterval(fetchStats, 30000);
      return () => clearInterval(interval);
    }
  }, [isVisible, fetchStats, lastTurnTokens]);

  const handleSaveSync = async () => {
    try {
      setSavingSync(true);
      const res = await api.syncQuota({
        gemini: {
          weeklyRemaining: geminiWeekly,
          fiveHourRemaining: gemini5h
        },
        claudeGpt: {
          weeklyRemaining: claudeWeekly,
          fiveHourRemaining: claude5h
        }
      });
      if (res?.stats) {
        setStats(res.stats);
      }
      setShowConfig(false);
    } catch (err) {
      console.error('Falha ao sincronizar cota:', err);
    } finally {
      setSavingSync(false);
    }
  };

  if (!isVisible) return null;

  // Valores reais obtidos ou fallback idêntico aos dados reais da conta do usuário
  const geminiData = stats?.gemini || {
    title: 'Gemini Models',
    weekly: {
      remaining: 57,
      message: 'You have used some of your weekly limit, it will fully refresh in 1 day, 23 hours.'
    },
    fiveHour: {
      remaining: 85,
      message: 'You have used some of your 5-hour limit, it will fully refresh in 4 hours, 32 minutes.'
    }
  };

  const claudeGptData = stats?.claudeGpt || {
    title: 'Claude and GPT models',
    weekly: {
      remaining: 100,
      message: null
    },
    fiveHour: {
      remaining: 100,
      message: null
    }
  };

  // Grupos dinâmicos retornados pela API oficial (/usage) com fallback idêntico aos dados reais da conta
  const displayGroups: QuotaGroup[] = (stats?.groups && stats.groups.length > 0)
    ? stats.groups
    : [
        {
          name: geminiData.title || 'Gemini Models',
          description: 'Limites de cota para Gemini 3.8 Flash, 3.7 Flash, 3.1 Pro e variantes',
          buckets: [
            {
              name: 'Weekly Limit Remaining',
              remaining: geminiData.weekly.remaining,
              message: geminiData.weekly.message
            },
            {
              name: 'Five Hour Limit Remaining',
              remaining: geminiData.fiveHour.remaining,
              message: geminiData.fiveHour.message
            }
          ]
        },
        {
          name: claudeGptData.title || 'Claude and GPT models',
          description: 'Limites de cota para modelos Claude Sonnet/Opus e GPT-OSS',
          buckets: [
            {
              name: 'Weekly Limit Remaining',
              remaining: claudeGptData.weekly.remaining,
              message: claudeGptData.weekly.message
            },
            {
              name: 'Five Hour Limit Remaining',
              remaining: claudeGptData.fiveHour.remaining,
              message: claudeGptData.fiveHour.message
            }
          ]
        }
      ];

  // Modo Balão Minimizado (Pílula Flutuante)
  if (!isExpanded) {
    const firstGroup = displayGroups[0];
    const fiveHourBucket = firstGroup?.buckets.find(b => b.name.toLowerCase().includes('five') || b.name.toLowerCase().includes('5h')) || firstGroup?.buckets[0];
    const weeklyBucket = firstGroup?.buckets.find(b => b.name.toLowerCase().includes('week') || b.name.toLowerCase().includes('7d')) || firstGroup?.buckets[1];

    return (
      <div 
        data-testid="quota-bubble-minimized"
        onClick={() => setIsExpanded(true)}
        className="fixed bottom-4 sm:bottom-6 right-3 sm:right-6 z-20 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full bg-[#131518]/95 backdrop-blur-md border border-neutral-800 shadow-2xl cursor-pointer hover:border-neutral-700 hover:scale-105 transition-all text-xs font-sans group select-none max-w-[calc(100vw-1.5rem)]"
        title="Clique para expandir as cotas oficiais Antigravity"
      >
        {fiveHourBucket && (
          <span className="flex items-center gap-1.5 font-medium text-neutral-300">
            <QuotaGauge percent={fiveHourBucket.remaining} size={18} strokeWidth={3} />
            <span>Gemini 5h: <b className="text-white">{fiveHourBucket.remaining}%</b></span>
          </span>
        )}
        {fiveHourBucket && weeklyBucket && <span className="text-neutral-600">|</span>}
        {weeklyBucket && (
          <span className="flex items-center gap-1.5 font-medium text-neutral-400">
            <QuotaGauge percent={weeklyBucket.remaining} size={18} strokeWidth={3} />
            <span>7d: <b className="text-white">{weeklyBucket.remaining}%</b></span>
          </span>
        )}
        <Maximize2 className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 transition-colors ml-0.5" />
        <button
          data-testid="quota-bubble-minimized-close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="min-h-[32px] min-w-[32px] sm:min-h-0 sm:min-w-0 p-1.5 sm:p-1 -mr-1 sm:mr-0 flex items-center justify-center rounded-full text-neutral-400 hover:text-red-400 hover:bg-neutral-800/60 transition-colors ml-0.5"
          title="Fechar balão"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // Modo Balão Expandido - Réplica Fiel do Painel Oficial Antigravity
  return (
    <div className="fixed bottom-4 sm:bottom-6 right-3 sm:right-6 left-3 sm:left-auto z-20 sm:w-96 max-w-full sm:max-w-[calc(100vw-2.5rem)] max-h-[85vh] overflow-y-auto rounded-2xl bg-[#121417]/98 backdrop-blur-xl border border-neutral-800/90 shadow-2xl p-3.5 sm:p-4 text-xs font-sans text-neutral-200 select-none animate-in fade-in slide-in-from-bottom-3 duration-200" data-testid="quota-bubble">
      
      {/* Barra de controle discreta no topo */}
      <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-neutral-800/80">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-xs font-semibold tracking-wide text-neutral-300">
            Antigravity Quotas
          </span>
          {stats?.source === 'official_google' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-medium">
              Google Oficial
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button 
            onClick={() => setShowConfig(!showConfig)}
            className={`min-h-[36px] min-w-[36px] sm:min-h-[28px] sm:min-w-[28px] p-2 sm:p-1 flex items-center justify-center rounded-md transition-colors ${showConfig ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60'}`}
            title="Ajustar / Calibrar valores manualmente"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={handleLiveRefresh}
            className={`min-h-[36px] min-w-[36px] sm:min-h-[28px] sm:min-w-[28px] p-2 sm:p-1 flex items-center justify-center rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60 transition-colors ${loading ? 'animate-spin' : ''}`}
            title="Consultar cota oficial do Google agora"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={() => setIsExpanded(false)}
            className="min-h-[36px] min-w-[36px] sm:min-h-[28px] sm:min-w-[28px] p-2 sm:p-1 flex items-center justify-center rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60 transition-colors"
            title="Minimizar balão"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button 
            data-testid="quota-bubble-close"
            onClick={onClose}
            className="min-h-[36px] min-w-[36px] sm:min-h-[28px] sm:min-w-[28px] p-2 sm:p-1 flex items-center justify-center rounded-md text-neutral-400 hover:text-red-400 hover:bg-neutral-800/60 transition-colors"
            title="Fechar balão"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Painel opcional de Calibração / Sincronização */}
      {showConfig && (
        <div className="mb-3.5 p-3 rounded-xl bg-neutral-900/90 border border-neutral-700/60 space-y-2.5 animate-in fade-in duration-150">
          <div className="text-[11px] font-semibold text-neutral-300 flex items-center justify-between">
            <span>Calibrar Valores da Conta</span>
            <span className="text-[10px] text-neutral-500">Espelhar com Antigravity</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <label className="block text-neutral-400 text-[10px] mb-1">Gemini Semanal (%)</label>
              <input 
                type="number" 
                min="0" 
                max="100" 
                value={geminiWeekly}
                onChange={(e) => setGeminiWeekly(Number(e.target.value))}
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-neutral-400 text-[10px] mb-1">Gemini 5 Horas (%)</label>
              <input 
                type="number" 
                min="0" 
                max="100" 
                value={gemini5h}
                onChange={(e) => setGemini5h(Number(e.target.value))}
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <label className="block text-neutral-400 text-[10px] mb-1">Claude/GPT Semanal (%)</label>
              <input 
                type="number" 
                min="0" 
                max="100" 
                value={claudeWeekly}
                onChange={(e) => setClaudeWeekly(Number(e.target.value))}
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-neutral-400 text-[10px] mb-1">Claude/GPT 5 Horas (%)</label>
              <input 
                type="number" 
                min="0" 
                max="100" 
                value={claude5h}
                onChange={(e) => setClaude5h(Number(e.target.value))}
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button 
              onClick={() => setShowConfig(false)}
              className="px-2 py-1 text-[11px] rounded text-neutral-400 hover:text-white"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSaveSync}
              disabled={savingSync}
              className="px-2.5 py-1 text-[11px] rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1"
            >
              <Check className="w-3 h-3" />
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* Grupos Dinâmicos de Cota (Gemini Models, Claude and GPT models, Gemini 4 Argon, etc.) */}
      <div className="space-y-4 mb-4">
        {displayGroups.map((group, gIdx) => (
          <div key={group.name || gIdx}>
            {/* Título do Grupo com Ícone de Informação */}
            <div className="flex items-center gap-1.5 mb-2 px-0.5">
              <span className="text-[13px] font-medium text-neutral-200">
                {group.name}
              </span>
              {group.description && (
                <div 
                  className="tooltip tooltip-right text-neutral-500 hover:text-neutral-400 cursor-help"
                  data-tip={group.description}
                >
                  <Info className="w-3.5 h-3.5" />
                </div>
              )}
            </div>

            {/* Card Agrupado */}
            <div className="rounded-xl bg-[#17191d] border border-neutral-800/80 overflow-hidden shadow-sm">
              {group.buckets.map((bucket, bIdx) => (
                <React.Fragment key={bucket.name || bIdx}>
                  {bIdx > 0 && <div className="border-t border-neutral-800/70" />}
                  <div className="p-3.5 flex items-center justify-between gap-3">
                    <div className="space-y-0.5 min-w-0 pr-2">
                      <div className="text-[13px] text-neutral-100 font-normal leading-tight">
                        {bucket.name}
                      </div>
                      {bucket.message && (
                        <div className="text-[11px] text-neutral-400 leading-normal">
                          {bucket.message}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[14px] font-semibold text-neutral-100 font-sans">
                        {bucket.remaining}%
                      </span>
                      <QuotaGauge percent={bucket.remaining} size={28} strokeWidth={3.5} />
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Detalhes de Tokens / Água consumidos (Opcional colapsável) */}
      {stats?.tokens && stats.tokens.recentTurns.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-neutral-800/60">
          <button 
            onClick={() => setShowTokensDetail(!showTokensDetail)}
            className="w-full flex items-center justify-between text-[11px] text-neutral-400 hover:text-neutral-200 transition-colors py-0.5"
          >
            <span className="flex items-center gap-1.5">
              {showWaterMetrics && <Droplets className="w-3.5 h-3.5 text-info shrink-0" />}
              <span>
                {showWaterMetrics
                  ? `Ver consumo de água por turnos (${stats.tokens.recentTurns.length})`
                  : `Ver consumo por turnos (${stats.tokens.recentTurns.length})`}
              </span>
            </span>
            {showTokensDetail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showTokensDetail && (
            <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {stats.tokens.recentTurns.slice(0, 5).map((turn) => (
                <div key={turn.id} className="flex items-center justify-between text-[10px] bg-neutral-900/60 px-2 py-1 rounded border border-neutral-800/50">
                  <span className="truncate max-w-[170px] text-neutral-300 font-mono">{turn.model}</span>
                  <span className={`${showWaterMetrics ? 'text-info font-bold' : 'text-emerald-400 font-medium'} font-mono`}>
                    {showWaterMetrics
                      ? `+${formatWaterLiters(turn.total_tokens, true)}`
                      : `+${turn.total_tokens.toLocaleString()} tok`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
};
