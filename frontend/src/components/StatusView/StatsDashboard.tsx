import React, { useState, useEffect, useCallback } from 'react';
import type { QuotaStats, DailyIntensityPoint } from '../../types';
import { api } from '../../services/api';
import { TelemetryAndSetupPanel } from './TelemetryAndSetupPanel';
import { 
  Bot, 
  Clock, 
  Coins, 
  Gauge, 
  RotateCw, 
  CalendarDays, 
  Flame, 
  Layers, 
  BarChart2, 
  FolderKanban, 
  Cpu, 
  Activity,
  Droplets
} from 'lucide-react';
import { formatWaterLiters } from '../../utils/waterConsumption';

interface StatsDashboardProps {
  runningCount: number;
  totalConversations: number;
  totalWorkspaces: number;
  onStartSetupChat?: (data: { conversationId: string; suggestedPrompt: string }) => void;
}

function formatTokens(value?: number): string {
  if (!value || value <= 0) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
}

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return '0m';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatDayLabel(dayStr: string): string {
  if (!dayStr) return '';
  const parts = dayStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dayStr;
}

const INTENSITY_CLASSES: Record<number, string> = {
  0: 'bg-base-300/40 border-base-content/5',
  1: 'bg-primary/25 border-primary/30',
  2: 'bg-primary/50 border-primary/55',
  3: 'bg-primary/75 border-primary/80',
  4: 'bg-primary border-primary text-primary-content shadow-xs'
};

export const StatsDashboard: React.FC<StatsDashboardProps> = ({
  runningCount,
  totalConversations,
  totalWorkspaces,
  onStartSetupChat
}) => {
  const [stats, setStats] = useState<QuotaStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hoveredDay, setHoveredDay] = useState<DailyIntensityPoint | null>(null);
  const [showWaterMetrics, setShowWaterMetrics] = useState<boolean>(false);

  const loadStats = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const data = isRefresh ? (await api.refreshQuota()).stats : await api.getQuotaStats();
      setStats(data);
    } catch (err) {
      console.warn('[StatsDashboard] Erro ao carregar métricas:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    const timer = setInterval(() => loadStats(), 30000);
    return () => clearInterval(timer);
  }, [loadStats]);

  const aggregates = stats?.aggregates || stats?.tokens?.aggregates;
  const dailyPoints = stats?.dailyPoints || stats?.tokens?.dailyPoints || [];
  const bestDay = stats?.bestDay || stats?.tokens?.bestDay;
  const activeDays = stats?.activeDays ?? (aggregates?.activeDays || 0);
  const recentTurns = stats?.tokens?.recentTurns || [];
  const modelBreakdown = stats?.tokens?.modelBreakdown || {};
  const workspaceBreakdown = stats?.workspaceBreakdown || stats?.tokens?.workspaceBreakdown || {};

  // Token mix & total
  const totalTokensAllTime = aggregates?.totalTokensAllTime || stats?.tokens?.weekly.totalTokens || 0;
  const totalInp = aggregates?.totalInputTokens || stats?.tokens?.weekly.inputTokens || 0;
  const totalOut = aggregates?.totalOutputTokens || stats?.tokens?.weekly.outputTokens || 0;
  const totalThk = aggregates?.totalThinkingTokens || stats?.tokens?.weekly.thinkingTokens || 0;
  const tokenMixTotal = totalInp + totalOut + totalThk || 1;

  const inpPercent = Math.round((totalInp / tokenMixTotal) * 100);
  const outPercent = Math.round((totalOut / tokenMixTotal) * 100);
  const thkPercent = Math.max(0, 100 - inpPercent - outPercent);

  // Histórico recente para gráfico de barras (últimos 10 a 14 dias)
  const recentDaily = (stats?.recentDaily || dailyPoints.slice(-12)).filter(d => d.totalTokens > 0 || true);
  const maxRecentDaily = Math.max(1, ...recentDaily.map(d => d.totalTokens));

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-3 sm:p-5 gap-4 sm:gap-5 bg-base-100/60 custom-scrollbar">
      
      {/* Cabeçalho do Painel de Status */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-base-300/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 shadow-sm">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-base-content tracking-tight">
                Status Operacional & Métricas de IA
              </h2>
              {runningCount > 0 ? (
                <span className="badge badge-sm badge-primary font-mono text-[11px] animate-pulse">
                  {runningCount} ativo{runningCount > 1 ? 's' : ''}
                </span>
              ) : (
                <span className="badge badge-sm badge-ghost text-[11px] font-mono text-base-content/60">
                  idle
                </span>
              )}
            </div>
            <p className="text-xs text-base-content/60">
              Telemetria de tokens, cotas ao vivo do Google e histórico de execuções
            </p>
          </div>
        </div>

        {/* Ações do Cabeçalho: Alternância de Água e Atualização de Cota */}
        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          {/* Botão de Alternância de Métricas: Água (Litros) vs Tokens */}
          <button
            onClick={() => setShowWaterMetrics((prev) => !prev)}
            className={`btn btn-xs sm:btn-sm gap-1.5 rounded-xl border transition-all ${
              showWaterMetrics
                ? 'btn-info text-info-content border-info shadow-xs'
                : 'btn-ghost border-base-300 hover:bg-base-200 text-base-content/80'
            }`}
            title={
              showWaterMetrics
                ? 'Alternar para contagem padrão de tokens'
                : 'Exibir consumo equivalente em litros de água (pegada hídrica estimada)'
            }
            aria-label="Alternar métrica entre tokens e litros de água"
            aria-pressed={showWaterMetrics}
            data-testid="toggle-water-metrics-btn"
          >
            <Droplets className={`w-3.5 h-3.5 ${showWaterMetrics ? 'text-info-content' : 'text-info'}`} />
            <span className="text-xs font-medium">
              {showWaterMetrics ? 'Ver Tokens' : 'Equivalente em Água (L)'}
            </span>
          </button>

          {/* Botão de Atualização Oficial */}
          <button
            onClick={() => loadStats(true)}
            disabled={refreshing || loading}
            className="btn btn-xs sm:btn-sm btn-ghost border border-base-300 gap-1.5 rounded-xl hover:bg-base-200 transition-all"
            title="Consulta ao vivo das cotas e recalibração"
          >
            <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-primary' : 'text-base-content/70'}`} />
            <span className="text-xs font-medium">
              {refreshing ? 'Consultando Google...' : 'Atualizar Cota'}
            </span>
          </button>
        </div>
      </div>

      {/* Banner Informativo de Pegada Hídrica quando ativado */}
      {showWaterMetrics && (
        <div 
          data-testid="water-metrics-banner"
          className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl bg-info/10 border border-info/20 text-xs text-info animate-in fade-in slide-in-from-top-1 duration-200"
        >
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 shrink-0 text-info" />
            <div>
              <span className="font-semibold">Pegada Hídrica Ativa:</span> Exibindo consumo de água equivalente (~0.5 L por 1.000 tokens) resultante do resfriamento e geração elétrica nos data centers de IA (UC Riverside).
            </div>
          </div>
          <button
            onClick={() => setShowWaterMetrics(false)}
            className="btn btn-ghost btn-xs h-6 min-h-0 text-[10px] text-info hover:bg-info/20 px-2 rounded-md shrink-0"
            title="Voltar para exibição de tokens"
          >
            Voltar a tokens
          </button>
        </div>
      )}

      {/* 1. CARDS DE RESUMO EXECUTIVO (ORCA STYLE STAT CARDS) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Card 1: Execuções / Agentes */}
        <div className="rounded-2xl border border-base-300/80 bg-base-200/40 p-3.5 flex flex-col justify-between shadow-xs hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between text-base-content/60 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Agentes & Turnos</span>
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-base-content font-mono tracking-tight">
              {aggregates?.totalRecordedTurns || stats?.tokens?.totalRecordedTurns || totalConversations}
            </div>
            <div className="text-[10px] sm:text-[11px] text-base-content/60 mt-0.5 flex items-center gap-1.5">
              <span>{totalWorkspaces} workspaces</span>
              <span>•</span>
              <span className="text-primary font-medium">{activeDays} dias ativos</span>
            </div>
          </div>
        </div>

        {/* Card 2: Tempo Trabalhado */}
        <div className="rounded-2xl border border-base-300/80 bg-base-200/40 p-3.5 flex flex-col justify-between shadow-xs hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between text-base-content/60 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Tempo Trabalhado</span>
            <Clock className="w-4 h-4 text-warning" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-base-content font-mono tracking-tight">
              {formatDuration(aggregates?.totalAgentTimeMs)}
            </div>
            <div className="text-[10px] sm:text-[11px] text-base-content/60 mt-0.5">
              Acumulado em sessões de agentes
            </div>
          </div>
        </div>

        {/* Card 3: Tokens Totais / Consumo de Água */}
        <div className={`rounded-2xl border ${showWaterMetrics ? 'border-info/50 bg-info/5' : 'border-base-300/80 bg-base-200/40'} p-3.5 flex flex-col justify-between shadow-xs hover:border-primary/40 transition-colors`}>
          <div className="flex items-center justify-between text-base-content/60 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider flex items-center gap-1.5">
              {showWaterMetrics ? (
                <>
                  <Droplets className="w-3.5 h-3.5 text-info" />
                  <span className="text-info font-semibold">Água Estimada (Litros)</span>
                </>
              ) : (
                'Tokens Totais'
              )}
            </span>
            <button
              onClick={() => setShowWaterMetrics((prev) => !prev)}
              className={`btn btn-ghost btn-xs h-6 min-h-0 px-2 rounded-lg transition-colors flex items-center gap-1 ${
                showWaterMetrics ? 'bg-info/20 text-info font-medium' : 'text-secondary hover:bg-base-300/60'
              }`}
              title={showWaterMetrics ? 'Alternar para tokens' : 'Ver consumo equivalente em litros de água'}
              aria-label="Alternar métrica de tokens para litros de água"
              data-testid="card-water-toggle-btn"
            >
              {showWaterMetrics ? (
                <>
                  <Coins className="w-3.5 h-3.5 text-secondary" />
                  <span className="text-[10px] font-mono">Tokens</span>
                </>
              ) : (
                <>
                  <Droplets className="w-3.5 h-3.5 text-info" />
                  <span className="text-[10px] font-mono">Água (L)</span>
                </>
              )}
            </button>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-base-content font-mono tracking-tight">
              {showWaterMetrics ? (
                <span className="text-info font-black" data-testid="water-liters-value">
                  {formatWaterLiters(totalTokensAllTime, true)}
                </span>
              ) : (
                <span data-testid="tokens-value">
                  {formatTokens(totalTokensAllTime)}
                </span>
              )}
            </div>
            <div className="text-[10px] sm:text-[11px] text-base-content/60 mt-0.5">
              {showWaterMetrics ? (
                <span title="Estimativa científica: ~0.5 litros a cada 1.000 tokens (UC Riverside)">
                  In: {formatWaterLiters(totalInp, true)} • Out: {formatWaterLiters(totalOut, true)}
                </span>
              ) : (
                <span>
                  In: {formatTokens(totalInp)} • Out: {formatTokens(totalOut)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 4: Cotas Oficiais Google */}
        <div className="rounded-2xl border border-base-300/80 bg-base-200/40 p-3.5 flex flex-col justify-between shadow-xs hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between text-base-content/60 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Cota Gemini (5h / Semanal)</span>
            <Gauge className="w-4 h-4 text-success" />
          </div>
          <div>
            <div className="flex items-baseline gap-2 font-mono">
              <span className={`text-xl sm:text-2xl font-black ${(stats?.gemini?.fiveHour?.remaining ?? 100) < 30 ? 'text-error' : 'text-success'}`}>
                {stats?.gemini?.fiveHour?.remaining ?? 100}%
              </span>
              <span className="text-xs text-base-content/40">/</span>
              <span className="text-sm font-bold text-base-content/80">
                {stats?.gemini?.weekly?.remaining ?? 100}% sem.
              </span>
            </div>
            <div className="text-[10px] sm:text-[11px] text-base-content/60 mt-0.5 truncate">
              {stats?.gemini?.fiveHour?.message || 'Limite 100% livre'}
            </div>
          </div>
        </div>
      </div>

      {/* 1.5. TELEMETRIA SRE & CONTENÇÃO CGROUPS OUT-OF-THE-BOX */}
      <TelemetryAndSetupPanel onStartSetupChat={onStartSetupChat} />

      {/* 2. HEATMAP DE INTENSIDADE DIÁRIA (42 DIAS - ORCA DAILY INTENSITY GRID) */}
      <div className="rounded-2xl border border-base-300/80 bg-base-200/30 p-4 sm:p-5 flex flex-col gap-3 shadow-xs">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-sm font-bold text-base-content flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              Intensidade Diária de Tokens (Últimos 42 dias)
            </h3>
            <p className="text-xs text-base-content/60">
              Mapa térmico de execuções de agentes e consumo de LLMs
            </p>
          </div>

          {bestDay && bestDay.totalTokens > 0 && (
            <div className="badge badge-sm badge-outline border-primary/40 text-primary gap-1 font-mono text-[11px] py-2.5">
              <Flame className="w-3 h-3 text-primary" />
              <span>Recorde: {formatDayLabel(bestDay.day)} ({formatTokens(bestDay.totalTokens)})</span>
            </div>
          )}
        </div>

        {/* Grade do Heatmap */}
        <div className="flex flex-col gap-2 pt-1">
          <div 
            className="grid grid-cols-[repeat(14,minmax(0,1fr))] sm:grid-cols-[repeat(21,minmax(0,1fr))] md:grid-cols-[repeat(42,minmax(0,1fr))] gap-1.5"
            onMouseLeave={() => setHoveredDay(null)}
          >
            {dailyPoints.map((point) => (
              <div
                key={point.day}
                onMouseEnter={() => setHoveredDay(point)}
                className={`aspect-square rounded-md border transition-all cursor-pointer hover:scale-125 hover:z-10 ${
                  INTENSITY_CLASSES[point.intensity]
                }`}
                title={`${point.day}: ${point.totalTokens.toLocaleString()} tokens (${point.turnsCount} turnos)`}
              />
            ))}
          </div>

          {/* Legenda e Tooltip do Dia em Hover */}
          <div className="flex items-center justify-between pt-1 text-xs text-base-content/60">
            <div className="min-h-5 flex items-center">
              {hoveredDay ? (
                <span className="font-mono text-primary font-medium animate-fadeIn">
                  📅 {hoveredDay.day}: {hoveredDay.totalTokens.toLocaleString()} tokens
                  {showWaterMetrics && (
                    <span className="text-info font-bold ml-1.5">
                      (~{formatWaterLiters(hoveredDay.totalTokens, true)} água)
                    </span>
                  )}
                  {' '}({hoveredDay.turnsCount} turnos)
                </span>
              ) : (
                <span className="text-[11px] text-base-content/50">
                  Passe o mouse sobre os blocos para ver detalhes
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[11px]">
              <span>Menos</span>
              <div className="flex items-center gap-1">
                {[0, 1, 2, 3, 4].map((lvl) => (
                  <span
                    key={lvl}
                    className={`w-2.5 h-2.5 rounded-xs border ${INTENSITY_CLASSES[lvl]}`}
                  />
                ))}
              </div>
              <span>Mais</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. TOKEN MIX & BARRAS DIÁRIAS (GRID DE DUAS COLUNAS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Coluna A: Mix Proporcional de Tokens */}
        <div className="rounded-2xl border border-base-300/80 bg-base-200/30 p-4 flex flex-col justify-between gap-3 shadow-xs">
          <div>
            <h3 className="text-sm font-bold text-base-content flex items-center gap-2">
              <Layers className="w-4 h-4 text-secondary" />
              Distribuição do Mix de Tokens
            </h3>
            <p className="text-xs text-base-content/60">
              Proporção entre dados de entrada, resposta gerada e raciocínio profundo
            </p>
          </div>

          {/* Barra Proporcional */}
          <div className="w-full h-4 rounded-full overflow-hidden bg-base-300/50 flex shadow-inner border border-base-content/5">
            <div 
              style={{ width: `${inpPercent}%` }} 
              className="bg-primary h-full transition-all duration-500" 
              title={`Input: ${inpPercent}% (${formatTokens(totalInp)})`}
            />
            <div 
              style={{ width: `${outPercent}%` }} 
              className="bg-secondary h-full transition-all duration-500" 
              title={`Output: ${outPercent}% (${formatTokens(totalOut)})`}
            />
            <div 
              style={{ width: `${thkPercent}%` }} 
              className="bg-warning h-full transition-all duration-500" 
              title={`Thinking: ${thkPercent}% (${formatTokens(totalThk)})`}
            />
          </div>

          {/* Indicadores do Mix */}
          <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono text-xs">
            <div className="bg-base-200/50 rounded-xl p-2 border border-base-300">
              <div className="flex items-center justify-center gap-1.5 text-primary font-bold">
                <span className="w-2 h-2 rounded-full bg-primary" />
                Input
              </div>
              <div className="font-bold text-base-content mt-1">
                {showWaterMetrics ? formatWaterLiters(totalInp, true) : formatTokens(totalInp)}
              </div>
              <div className="text-[10px] text-base-content/50">{inpPercent}%</div>
            </div>

            <div className="bg-base-200/50 rounded-xl p-2 border border-base-300">
              <div className="flex items-center justify-center gap-1.5 text-secondary font-bold">
                <span className="w-2 h-2 rounded-full bg-secondary" />
                Output
              </div>
              <div className="font-bold text-base-content mt-1">
                {showWaterMetrics ? formatWaterLiters(totalOut, true) : formatTokens(totalOut)}
              </div>
              <div className="text-[10px] text-base-content/50">{outPercent}%</div>
            </div>

            <div className="bg-base-200/50 rounded-xl p-2 border border-base-300">
              <div className="flex items-center justify-center gap-1.5 text-warning font-bold">
                <span className="w-2 h-2 rounded-full bg-warning" />
                Thinking
              </div>
              <div className="font-bold text-base-content mt-1">
                {showWaterMetrics ? formatWaterLiters(totalThk, true) : formatTokens(totalThk)}
              </div>
              <div className="text-[10px] text-base-content/50">{thkPercent}%</div>
            </div>
          </div>
        </div>

        {/* Coluna B: Gráfico de Barras dos Últimos Dias */}
        <div className="rounded-2xl border border-base-300/80 bg-base-200/30 p-4 flex flex-col justify-between gap-3 shadow-xs">
          <div>
            <h3 className="text-sm font-bold text-base-content flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" />
              Consumo Diário Recente
            </h3>
            <p className="text-xs text-base-content/60">
              Histórico diário empilhado dos últimos dias
            </p>
          </div>

          <div className="h-32 flex items-end gap-1.5 pt-4 pb-2 border-b border-base-300/80">
            {recentDaily.slice(-10).map((d) => {
              const heightPct = maxRecentDaily > 0 ? Math.max(4, Math.round((d.totalTokens / maxRecentDaily) * 100)) : 4;
              return (
                <div 
                  key={d.day} 
                  className="flex-1 flex flex-col items-center h-full justify-end group relative"
                >
                  <div className="absolute -top-8 bg-base-300 text-base-content text-[10px] font-mono py-0.5 px-1.5 rounded shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-20 whitespace-nowrap">
                    {formatDayLabel(d.day)}: {formatTokens(d.totalTokens)}
                  </div>

                  <div 
                    style={{ height: `${heightPct}%` }}
                    className="w-full rounded-t-md bg-gradient-to-t from-primary/70 to-primary group-hover:brightness-125 transition-all shadow-xs"
                  />
                  <span className="text-[9px] text-base-content/50 font-mono mt-1">
                    {formatDayLabel(d.day)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-xs text-base-content/60 font-mono">
            <span>Pico: {formatTokens(maxRecentDaily)}</span>
            <span>Total Recente: {formatTokens(recentDaily.reduce((acc, cur) => acc + cur.totalTokens, 0))}</span>
          </div>
        </div>
      </div>

      {/* 4. BREAKDOWN POR MODELO E POR WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Model Breakdown */}
        <div className="rounded-2xl border border-base-300/80 bg-base-200/30 p-4 flex flex-col gap-3 shadow-xs">
          <h3 className="text-sm font-bold text-base-content flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" />
            Consumo por Modelo de IA
          </h3>
          
          <div className="flex flex-col gap-2.5">
            {Object.keys(modelBreakdown).length === 0 ? (
              <p className="text-xs text-base-content/50 py-2">Nenhum dado registrado ainda.</p>
            ) : (
              Object.entries(modelBreakdown)
                .sort((a, b) => (b[1].totalTokens || 0) - (a[1].totalTokens || 0))
                .slice(0, 5)
                .map(([modName, modData]) => {
                  const pct = Math.round(((modData.totalTokens || 0) / tokenMixTotal) * 100);
                  return (
                    <div key={modName} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="font-bold text-base-content truncate max-w-[200px]">{modName}</span>
                        <span className="text-base-content/70">
                          {formatTokens(modData.totalTokens)} ({modData.count} turnos)
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-base-300 overflow-hidden">
                        <div 
                          style={{ width: `${Math.max(3, pct)}%` }} 
                          className="h-full bg-primary rounded-full transition-all" 
                        />
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* Workspace Breakdown */}
        <div className="rounded-2xl border border-base-300/80 bg-base-200/30 p-4 flex flex-col gap-3 shadow-xs">
          <h3 className="text-sm font-bold text-base-content flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-secondary" />
            Consumo por Workspace / Projeto
          </h3>

          <div className="flex flex-col gap-2.5">
            {Object.keys(workspaceBreakdown).length === 0 ? (
              <p className="text-xs text-base-content/50 py-2">Nenhum dado atribuído a subprojetos ainda.</p>
            ) : (
              Object.entries(workspaceBreakdown)
                .sort((a, b) => (b[1].totalTokens || 0) - (a[1].totalTokens || 0))
                .slice(0, 5)
                .map(([wsName, wsData]) => {
                  const pct = Math.round(((wsData.totalTokens || 0) / tokenMixTotal) * 100);
                  return (
                    <div key={wsName} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="font-bold text-base-content truncate max-w-[200px]">{wsName}</span>
                        <span className="text-base-content/70">
                          {formatTokens(wsData.totalTokens)} ({wsData.count} turnos)
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-base-300 overflow-hidden">
                        <div 
                          style={{ width: `${Math.max(3, pct)}%` }} 
                          className="h-full bg-secondary rounded-full transition-all" 
                        />
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>

      {/* 5. TABELA DE TURNOS & SESSÕES RECENTES (ORCA RECENT SESSIONS TABLE) */}
      <div className="rounded-2xl border border-base-300/80 bg-base-200/30 p-4 flex flex-col gap-3 shadow-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-base-content flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Últimas Execuções de Turnos
          </h3>
          <span className="text-xs text-base-content/60 font-mono">
            {recentTurns.length} turnos recentes
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="table table-xs w-full">
            <thead>
              <tr className="border-b border-base-300 text-base-content/60 text-[11px]">
                <th>Horário</th>
                <th>Workspace</th>
                <th>Modelo</th>
                <th>In / Out / Thk</th>
                <th>Total Tokens</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {recentTurns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-4 text-base-content/50">
                    Nenhum turno registrado recentemente.
                  </td>
                </tr>
              ) : (
                recentTurns.map((turn) => {
                  const date = new Date(turn.timestamp);
                  const timeStr = !isNaN(date.getTime()) 
                    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : turn.timestamp;

                  return (
                    <tr key={turn.id} className="hover:bg-base-200/50 border-b border-base-300/50">
                      <td className="text-base-content/60 whitespace-nowrap">{timeStr}</td>
                      <td>
                        <span className="badge badge-xs badge-ghost font-mono">
                          {turn.subproject || 'Geral'}
                        </span>
                      </td>
                      <td className="text-base-content font-medium truncate max-w-[150px]">
                        {turn.model}
                      </td>
                      <td className="text-base-content/60">
                        {formatTokens(turn.input_tokens)} / {formatTokens(turn.output_tokens)} / {formatTokens(turn.thinking_tokens)}
                      </td>
                      <td className="font-bold text-primary">
                        {formatTokens(turn.total_tokens)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
