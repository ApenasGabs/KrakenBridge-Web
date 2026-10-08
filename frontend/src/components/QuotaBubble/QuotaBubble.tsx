import React, { useState, useEffect, useCallback } from 'react';
import type { QuotaStats } from '../../types';
import { api } from '../../services/api';
import { 
  Gauge, 
  Clock, 
  Calendar, 
  Sparkles, 
  X, 
  Minimize2, 
  Maximize2, 
  RotateCw, 
  Cpu, 
  Activity
} from 'lucide-react';

interface QuotaBubbleProps {
  isVisible: boolean;
  onClose: () => void;
  lastTurnTokens?: number;
}

export const QuotaBubble: React.FC<QuotaBubbleProps> = ({
  isVisible,
  onClose,
  lastTurnTokens
}) => {
  const [stats, setStats] = useState<QuotaStats | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getQuotaStats();
      setStats(data);
    } catch (err) {
      console.warn('Erro ao carregar estatísticas de cota:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isVisible) {
      fetchStats();
      // Atualiza automaticamente a cada 30 segundos
      const interval = setInterval(fetchStats, 30000);
      return () => clearInterval(interval);
    }
  }, [isVisible, fetchStats, lastTurnTokens]);

  if (!isVisible) return null;

  const formatTokens = (val: number): string => {
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
    return val.toLocaleString();
  };

  const hourlyTokens = stats?.hourly?.totalTokens || 0;
  const weeklyTokens = stats?.weekly?.totalTokens || 0;
  const hourlyPercent = stats?.hourly?.percent || 0;
  const weeklyPercent = stats?.weekly?.percent || 0;

  // Modo Balão Minimizado (Pílula Flutuante)
  if (!isExpanded) {
    return (
      <div 
        onClick={() => setIsExpanded(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-3.5 py-2.5 rounded-full bg-base-100/90 backdrop-blur-md border border-primary/40 shadow-xl cursor-pointer hover:border-primary hover:scale-105 transition-all text-xs font-mono group"
        title="Clique para expandir o balão de cotas Antigravity"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
        </span>
        <Gauge className="w-4 h-4 text-primary group-hover:rotate-12 transition-transform" />
        <span className="font-semibold text-base-content/90">
          {formatTokens(hourlyTokens)}/h
        </span>
        <span className="text-base-content/40">|</span>
        <span className="text-base-content/70">
          7d: {formatTokens(weeklyTokens)}
        </span>
        <Maximize2 className="w-3.5 h-3.5 text-base-content/50 ml-1" />
      </div>
    );
  }

  // Modo Balão Expandido (Painel Flutuante)
  return (
    <div className="fixed bottom-6 right-6 z-50 w-88 max-w-[calc(100vw-3rem)] rounded-2xl bg-base-100/95 backdrop-blur-xl border border-base-300 shadow-2xl p-4 text-xs transition-all animate-in fade-in slide-in-from-bottom-4 duration-200">
      {/* Header do Balão */}
      <div className="flex items-center justify-between pb-3 border-b border-base-200/80 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-sm flex items-center gap-1.5">
              Cotas Antigravity
              <span className="badge badge-xs badge-primary badge-outline font-mono">Live</span>
            </div>
            <div className="text-[10px] text-base-content/60">
              Janelas horária e semanal deslizantes
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button 
            onClick={fetchStats}
            className={`btn btn-ghost btn-xs btn-circle ${loading ? 'animate-spin' : ''}`}
            title="Atualizar estatísticas"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={() => setIsExpanded(false)}
            className="btn btn-ghost btn-xs btn-circle"
            title="Minimizar para balão pequeno"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={onClose}
            className="btn btn-ghost btn-xs btn-circle text-error/70 hover:text-error"
            title="Fechar balão"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Conteúdo: Cota Horária (Últimos 60 min) */}
      <div className="space-y-3">
        <div className="bg-base-200/50 rounded-xl p-3 border border-base-300/50">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold flex items-center gap-1.5 text-base-content/80">
              <Clock className="w-3.5 h-3.5 text-primary" />
              Cota Horária (60 min)
            </span>
            <span className="font-mono font-bold text-primary">
              {hourlyPercent}%
            </span>
          </div>

          <progress 
            className="progress progress-primary w-full h-2 bg-base-300" 
            value={hourlyTokens} 
            max={stats?.hourly?.limit || 1_000_000}
          />

          <div className="flex items-center justify-between text-[11px] text-base-content/60 mt-1.5 font-mono">
            <span>{formatTokens(hourlyTokens)} consumidos</span>
            <span>Teto: {formatTokens(stats?.hourly?.limit || 1_000_000)}</span>
          </div>

          {stats?.hourly && (
            <div className="grid grid-cols-3 gap-1 mt-2 pt-2 border-t border-base-300/40 text-[10px] text-center text-base-content/70">
              <div className="bg-base-100/60 rounded px-1.5 py-1">
                <span className="block text-base-content/40">Input</span>
                <span className="font-mono font-semibold">{formatTokens(stats.hourly.inputTokens)}</span>
              </div>
              <div className="bg-base-100/60 rounded px-1.5 py-1">
                <span className="block text-base-content/40">Output</span>
                <span className="font-mono font-semibold">{formatTokens(stats.hourly.outputTokens)}</span>
              </div>
              <div className="bg-base-100/60 rounded px-1.5 py-1">
                <span className="block text-base-content/40">Thinking</span>
                <span className="font-mono font-semibold text-accent">{formatTokens(stats.hourly.thinkingTokens)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Conteúdo: Cota Semanal (Últimos 7 dias) */}
        <div className="bg-base-200/50 rounded-xl p-3 border border-base-300/50">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold flex items-center gap-1.5 text-base-content/80">
              <Calendar className="w-3.5 h-3.5 text-secondary" />
              Cota Semanal (7 dias)
            </span>
            <span className="font-mono font-bold text-secondary">
              {weeklyPercent}%
            </span>
          </div>

          <progress 
            className="progress progress-secondary w-full h-2 bg-base-300" 
            value={weeklyTokens} 
            max={stats?.weekly?.limit || 10_000_000}
          />

          <div className="flex items-center justify-between text-[11px] text-base-content/60 mt-1.5 font-mono">
            <span>{formatTokens(weeklyTokens)} consumidos</span>
            <span>Teto: {formatTokens(stats?.weekly?.limit || 10_000_000)}</span>
          </div>
        </div>

        {/* Breakdown de Modelos */}
        {stats?.modelBreakdown && Object.keys(stats.modelBreakdown).length > 0 && (
          <div className="bg-base-200/30 rounded-xl p-2.5 border border-base-300/30">
            <div className="text-[11px] font-semibold flex items-center gap-1.5 text-base-content/70 mb-2">
              <Cpu className="w-3.5 h-3.5 text-primary" />
              Consumo por Modelo (7 dias)
            </div>
            <div className="space-y-1.5">
              {Object.entries(stats.modelBreakdown).map(([modelName, info]) => (
                <div key={modelName} className="flex items-center justify-between text-[11px] bg-base-100/70 px-2 py-1 rounded">
                  <span className="font-mono truncate max-w-[150px] text-base-content/80" title={modelName}>
                    {modelName}
                  </span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-[10px] text-base-content/50">{info.count} turnos</span>
                    <span className="font-semibold text-primary">{formatTokens(info.totalTokens)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rodapé Informativo */}
        <div className="text-[10px] text-base-content/50 text-center flex items-center justify-center gap-1.5 pt-1">
          <Sparkles className="w-3 h-3 text-warning" />
          <span>Contabilizado automaticamente em cada resposta do CLI</span>
        </div>
      </div>
    </div>
  );
};
