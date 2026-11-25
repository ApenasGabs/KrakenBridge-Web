import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import type { 
  TokenUsageRecord, 
  QuotaGroup, 
  QuotaBucket,
  QuotaEngine,
  QuotaCacheStatus,
  QuotaCacheMeta,
  MultiAccountQuotaOverview,
  AccountQuotaProfile,
  AccountModelQuotaSummary,
  RouteByModelResponse
} from '../types/quota.js';
import { accountService } from './accountService.js';
import { claudeAuthService } from './claudeAuthService.js';
import { calculateTokenCostUsd, roundUsd } from '../utils/modelPricing.js';
import { saoPauloDayKey } from '../utils/saoPauloDay.js';
import type { ExternalUsageItem, StatsOptions } from '../types/quota.js';

const execPromise = util.promisify(exec);

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const QUOTA_FILE = path.join(DATA_DIR, 'quota_history.json');
const STATE_FILE = path.join(DATA_DIR, 'quota_state.json');
const ACCOUNTS_CACHE_FILE = path.join(DATA_DIR, 'quota_accounts_cache.json');
const DEFAULT_REFRESH_INTERVAL_MS = Math.max(
  30_000,
  Number(process.env.QUOTA_REFRESH_INTERVAL_MS) || 5 * 60 * 1000
);
const MAX_REFRESH_CONCURRENCY = 3;

interface CachedAccountEntry {
  engine: QuotaEngine;
  email: string;
  name: string;
  picture: string | null;
  isActive: boolean;
  planTier?: string | null;
  groups: QuotaGroup[];
  lastFetchedAt: number;
  status: QuotaCacheStatus;
  errorMessage: string | null;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await worker(current);
    }
  });
  await Promise.all(workers);
}

// Formata intervalo de tempo restante no estilo oficial do Antigravity
function formatRefreshTime(ms: number, isFiveHour = false): string | null {
  if (ms <= 0) return null;
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (isFiveHour) {
    if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}, ${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
    return `${Math.max(1, minutes)} minute${minutes > 1 ? 's' : ''}`;
  }

  // Semanal
  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''}, ${hours} hour${hours > 1 ? 's' : ''}`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}, ${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  return `${Math.max(1, minutes)} minute${minutes > 1 ? 's' : ''}`;
}

export interface InternalQuotaBucketState {
  weeklyRemaining: number;
  weeklyResetAt: number | null;
  fiveHourRemaining: number;
  fiveHourResetAt: number | null;
}

export interface InternalQuotaState {
  gemini: InternalQuotaBucketState;
  claudeGpt: InternalQuotaBucketState;
  groups?: QuotaGroup[];
  source: string;
  lastUpdated: string;
}

export interface RecordUsageOptions {
  model?: string;
  agent?: string;
  subproject?: string;
  conversationId?: string | null;
  durationMs?: number;
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  thinking_tokens?: number;
  total_tokens?: number;
  timestamp?: string;
}

class QuotaService {
  private records: (TokenUsageRecord & { subproject?: string; durationMs?: number; conversationId?: string | null })[] = [];
  private initialized = false;
  private lastAgyFetch = 0;
  private isFetchingFromAgy = false;

  // Estado oficial dos limites Antigravity
  private state: InternalQuotaState = {
    gemini: {
      weeklyRemaining: 100,
      weeklyResetAt: null,
      fiveHourRemaining: 100,
      fiveHourResetAt: null
    },
    claudeGpt: {
      weeklyRemaining: 100,
      weeklyResetAt: null,
      fiveHourRemaining: 100,
      fiveHourResetAt: null
    },
    source: 'live',
    lastUpdated: new Date().toISOString()
  };

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });

      // Carregar histórico de tokens
      const existsHistory = await fs.access(QUOTA_FILE).then(() => true).catch(() => false);
      if (existsHistory) {
        const raw = await fs.readFile(QUOTA_FILE, 'utf8');
        this.records = JSON.parse(raw);
        if (!Array.isArray(this.records)) this.records = [];
      } else {
        this.records = [];
      }

      // Carregar estado persistido
      const existsState = await fs.access(STATE_FILE).then(() => true).catch(() => false);
      if (existsState) {
        const rawState = await fs.readFile(STATE_FILE, 'utf8');
        const parsedState = JSON.parse(rawState) as Partial<InternalQuotaState>;
        this.state = {
          gemini: { ...this.state.gemini, ...(parsedState.gemini || {}) },
          claudeGpt: { ...this.state.claudeGpt, ...(parsedState.claudeGpt || {}) },
          source: parsedState.source || 'live',
          lastUpdated: parsedState.lastUpdated || new Date().toISOString()
        };
      }

      // Carregar cache persistido de múltiplas contas (AGY + Claude)
      const existsAccountsCache = await fs.access(ACCOUNTS_CACHE_FILE).then(() => true).catch(() => false);
      if (existsAccountsCache) {
        const rawCache = await fs.readFile(ACCOUNTS_CACHE_FILE, 'utf8');
        const parsedCache = JSON.parse(rawCache) as {
          lastRefreshedAt?: number;
          accounts?: CachedAccountEntry[];
        };
        if (typeof parsedCache.lastRefreshedAt === 'number') {
          this.lastAccountsRefreshAt = parsedCache.lastRefreshedAt;
        }
        if (Array.isArray(parsedCache.accounts)) {
          for (const entry of parsedCache.accounts) {
            if (entry?.email) {
              const engine: QuotaEngine = entry.engine === 'claude' ? 'claude' : 'agy';
              this.accountQuotaCache.set(this.getCacheKey(engine, entry.email), {
                ...entry,
                engine,
                groups: Array.isArray(entry.groups) ? entry.groups : [],
                status: entry.status || 'stale',
                errorMessage: entry.errorMessage ?? null
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn('[QuotaService] Erro ao carregar cotas:', (e as Error).message);
    }
    this.initialized = true;

    // Iniciar agendador periódico em background e tentar consulta inicial
    this.startAutoRefresh();
    this.fetchLiveQuotaFromGoogle().catch(() => {});
    this.refreshAllAccounts(false).catch(() => {});
  }

  async persistHistory(): Promise<void> {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const cutoff30Days = Date.now() - (30 * 24 * 60 * 60 * 1000);
      this.records = this.records.filter(r => new Date(r.timestamp).getTime() >= cutoff30Days);
      await fs.writeFile(QUOTA_FILE, JSON.stringify(this.records, null, 2), 'utf8');
    } catch (e) {
      console.error('[QuotaService] Falha ao persistir histórico de cotas:', (e as Error).message);
    }
  }

  async persistState(): Promise<void> {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      this.state.lastUpdated = new Date().toISOString();
      await fs.writeFile(STATE_FILE, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (e) {
      console.error('[QuotaService] Falha ao persistir estado de cotas:', (e as Error).message);
    }
  }

  /**
   * Consulta a cota 100% oficial e global diretamente pelo CLI agy via /usage
   */
  async fetchLiveQuotaFromGoogle(force = false): Promise<InternalQuotaState> {
    const now = Date.now();
    // Cache de 30 segundos para não onerar o CLI agy desnecessariamente em refresh contínuo
    if (!force && now - this.lastAgyFetch < 30000) {
      return this.state;
    }

    if (this.isFetchingFromAgy) return this.state;
    this.isFetchingFromAgy = true;

    try {
      const { stdout } = await execPromise('agy --print "/usage" --output-format json', {
        env: { ...process.env, HOME: '/root' },
        timeout: 15000
      });

      const parsed = JSON.parse(stdout.trim());
      const rawGroups = parsed?.command?.data?.groups || [];
      const dynamicGroups: QuotaGroup[] = [];

      for (const group of rawGroups) {
        const groupName = (group.name || '').trim();
        const groupDesc = group.description ? String(group.description).trim() : undefined;
        const buckets: QuotaBucket[] = [];

        for (const b of (group.buckets || [])) {
          const fraction = typeof b.remaining_fraction === 'number' ? b.remaining_fraction : 1;
          const percent = Math.round(fraction * 100);
          const resetAt = b.reset_time ? new Date(b.reset_time).getTime() : null;
          const windowType = b.window || (b.id && b.id.includes('weekly') ? 'weekly' : '5h');
          const isFiveHour = windowType === '5h' || (b.id && b.id.includes('5h'));

          let message = b.description || null;
          if (!message && percent < 100 && resetAt) {
            const remainingMs = Math.max(0, resetAt - now);
            const refreshFormatted = formatRefreshTime(remainingMs, isFiveHour);
            if (refreshFormatted) {
              message = isFiveHour
                ? `You have used some of your 5-hour limit, it will fully refresh in ${refreshFormatted}.`
                : `You have used some of your weekly limit, it will fully refresh in ${refreshFormatted}.`;
            }
          }

          buckets.push({
            id: b.id || undefined,
            name: b.name || (windowType === 'weekly' ? 'Weekly Limit Remaining' : 'Five Hour Limit Remaining'),
            description: b.description || undefined,
            window: windowType,
            remaining: percent,
            message,
            resetAt
          });
        }

        dynamicGroups.push({
          name: groupName,
          description: groupDesc,
          buckets
        });

        // Atualização retrocompatível dos buckets canônicos
        const lowerName = groupName.toLowerCase();
        let target: InternalQuotaBucketState | null = null;
        if (lowerName.includes('gemini') && !lowerName.includes('argon')) {
          target = this.state.gemini;
        } else if (lowerName.includes('claude') || lowerName.includes('gpt')) {
          target = this.state.claudeGpt;
        }

        if (target) {
          for (const b of (group.buckets || [])) {
            const fraction = typeof b.remaining_fraction === 'number' ? b.remaining_fraction : 1;
            const percent = Math.round(fraction * 100);
            const resetAt = b.reset_time ? new Date(b.reset_time).getTime() : null;

            if (b.window === 'weekly' || (b.id && b.id.includes('weekly'))) {
              target.weeklyRemaining = percent;
              target.weeklyResetAt = resetAt;
            } else if (b.window === '5h' || (b.id && b.id.includes('5h'))) {
              target.fiveHourRemaining = percent;
              target.fiveHourResetAt = resetAt;
            }
          }
        }
      }

      if (dynamicGroups.length > 0) {
        this.state.groups = dynamicGroups;
      }

      this.state.source = 'live_google';
      this.lastAgyFetch = Date.now();
      await this.persistState();
    } catch (err) {
      console.warn('[QuotaService] Consulta oficial ao vivo pelo agy falhou ou demorou:', (err as Error).message);
    } finally {
      this.isFetchingFromAgy = false;
    }

    return this.state;
  }

  /**
   * Permite calibrar manualmente cotas se necessário
   */
  async syncQuota({ gemini, claudeGpt }: { gemini?: Partial<InternalQuotaBucketState>; claudeGpt?: Partial<InternalQuotaBucketState> }) {
    await this.init();
    if (gemini) {
      this.state.gemini = { ...this.state.gemini, ...gemini };
    }
    if (claudeGpt) {
      this.state.claudeGpt = { ...this.state.claudeGpt, ...claudeGpt };
    }
    await this.persistState();
    return this.getStats();
  }

  /**
   * Registra o consumo de um turno
   */
  async recordUsage({
    model = 'gemini-3.8-flash-high',
    agent = 'antigravity',
    subproject = '',
    conversationId = null,
    durationMs = 0,
    input_tokens = 0,
    cached_input_tokens = 0,
    output_tokens = 0,
    thinking_tokens = 0,
    total_tokens = 0,
    timestamp
  }: RecordUsageOptions) {
    await this.init();

    const total = Number(total_tokens) || ((Number(input_tokens) || 0) + (Number(output_tokens) || 0) + (Number(thinking_tokens) || 0));

    const record = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      timestamp: timestamp || new Date().toISOString(),
      agent,
      model,
      subproject: subproject || 'Geral',
      conversationId: conversationId || null,
      durationMs: Number(durationMs) || 0,
      input_tokens: Number(input_tokens) || 0,
      cached_input_tokens: Number(cached_input_tokens) || 0,
      output_tokens: Number(output_tokens) || 0,
      thinking_tokens: Number(thinking_tokens) || 0,
      total_tokens: total
    };

    this.records.push(record);
    await this.persistHistory();

    // Dispara atualização ao vivo em background após o turno terminar
    setTimeout(() => {
      this.fetchLiveQuotaFromGoogle(true).catch(() => {});
    }, 1500);

    return record;
  }

  /**
   * Retorna os dados completos de cotas oficiais Antigravity + detalhamento de tokens
   */
  async getStats({ source = 'kraken', external }: StatsOptions = {}) {
    await this.init();

    const krakenRecords = source === 'paperclip' ? [] : this.records;
    const externalUsage = source === 'kraken' ? undefined : external;

    // Tenta atualizar do Google ao vivo se estiver stale
    if (Date.now() - this.lastAgyFetch > 60000) {
      await this.fetchLiveQuotaFromGoogle(false);
    }

    const now = Date.now();

    // Tempos restantes
    let gemini5hTimeRemaining = 0;
    if (this.state.gemini.fiveHourResetAt) {
      gemini5hTimeRemaining = Math.max(0, this.state.gemini.fiveHourResetAt - now);
    }

    let geminiWeeklyTimeRemaining = 0;
    if (this.state.gemini.weeklyResetAt) {
      geminiWeeklyTimeRemaining = Math.max(0, this.state.gemini.weeklyResetAt - now);
    }

    let claude5hTimeRemaining = 0;
    if (this.state.claudeGpt.fiveHourResetAt) {
      claude5hTimeRemaining = Math.max(0, this.state.claudeGpt.fiveHourResetAt - now);
    }

    let claudeWeeklyTimeRemaining = 0;
    if (this.state.claudeGpt.weeklyResetAt) {
      claudeWeeklyTimeRemaining = Math.max(0, this.state.claudeGpt.weeklyResetAt - now);
    }

    // Mensagens oficiais idênticas às da interface do Google Antigravity
    const gemini5hMessage = this.state.gemini.fiveHourRemaining < 100 && gemini5hTimeRemaining > 0
      ? `You have used some of your 5-hour limit, it will fully refresh in ${formatRefreshTime(gemini5hTimeRemaining, true)}.`
      : null;

    const geminiWeeklyMessage = this.state.gemini.weeklyRemaining < 100 && geminiWeeklyTimeRemaining > 0
      ? `You have used some of your weekly limit, it will fully refresh in ${formatRefreshTime(geminiWeeklyTimeRemaining, false)}.`
      : null;

    const claude5hMessage = this.state.claudeGpt.fiveHourRemaining < 100 && claude5hTimeRemaining > 0
      ? `You have used some of your 5-hour limit, it will fully refresh in ${formatRefreshTime(claude5hTimeRemaining, true)}.`
      : null;

    const claudeWeeklyMessage = this.state.claudeGpt.weeklyRemaining < 100 && claudeWeeklyTimeRemaining > 0
      ? `You have used some of your weekly limit, it will fully refresh in ${formatRefreshTime(claudeWeeklyTimeRemaining, false)}.`
      : null;

    // Agregações de tokens
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

    const hourly = { totalTokens: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, count: 0, estimatedCostUsd: 0 };
    const daily = { totalTokens: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, count: 0, estimatedCostUsd: 0 };
    const weekly = { totalTokens: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, count: 0, estimatedCostUsd: 0 };
    const modelBreakdown: Record<string, {
      totalTokens: number;
      count: number;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      thinkingTokens: number;
      estimatedCostUsd: number | null;
      isPriced: boolean;
      canonicalModel: string | null;
    }> = {};
    const workspaceBreakdown: Record<string, {
      totalTokens: number;
      count: number;
      estimatedCostUsd: number;
      unpricedTurnsCount: number;
    }> = {};

    let totalTokensAllTime = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalThinkingTokens = 0;
    let totalAgentTimeMs = 0;
    let totalEstimatedCostUsd = 0;
    let unpricedTurnsCount = 0;
    let unpricedTokens = 0;

    // Mapa dos últimos 42 dias para o Heatmap (Orca style)
    const DAY_COUNT = 42;
    const dailyMap = new Map<string, {
      day: string;
      totalTokens: number;
      inputTokens: number;
      outputTokens: number;
      thinkingTokens: number;
      turnsCount: number;
      estimatedCostUsd: number;
    }>();

    for (let i = DAY_COUNT - 1; i >= 0; i--) {
      const dayStr = saoPauloDayKey(now - i * 86400000);
      dailyMap.set(dayStr, {
        day: dayStr,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        turnsCount: 0,
        estimatedCostUsd: 0
      });
    }

    const usageItems = [
      ...krakenRecords.map((r) => ({
        ...r,
        count: 1,
        day: saoPauloDayKey(r.timestamp),
        time: new Date(r.timestamp).getTime()
      })),
      // Itens externos já vêm agregados por dia; as janelas móveis são somadas à parte.
      ...(externalUsage?.items ?? []).map((item) => ({
        ...item,
        thinking_tokens: 0,
        durationMs: 0,
        time: Number.NEGATIVE_INFINITY
      }))
    ];

    for (const item of usageItems) {
      const { time, count } = item;
      const tokens = item.total_tokens || 0;
      const inp = item.input_tokens || 0;
      const cachedInp = item.cached_input_tokens || 0;
      const out = item.output_tokens || 0;
      const thk = item.thinking_tokens || 0;
      const dur = item.durationMs || 0;
      const model = item.model || 'desconhecido';
      const subproject = item.subproject || 'Geral';

      const costCalc = calculateTokenCostUsd({
        model,
        inputTokens: inp,
        cachedInputTokens: cachedInp,
        outputTokens: out,
        thinkingTokens: thk
      });

      totalTokensAllTime += tokens;
      totalInputTokens += inp;
      totalOutputTokens += out;
      totalThinkingTokens += thk;
      totalAgentTimeMs += dur;

      if (costCalc.isPriced && costCalc.costUsd !== null) {
        totalEstimatedCostUsd = roundUsd(totalEstimatedCostUsd + costCalc.costUsd);
      } else {
        unpricedTurnsCount += count;
        unpricedTokens += tokens;
      }

      // Agregações por modelo
      if (!modelBreakdown[model]) {
        modelBreakdown[model] = {
          totalTokens: 0,
          count: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          thinkingTokens: 0,
          estimatedCostUsd: costCalc.isPriced ? 0 : null,
          isPriced: costCalc.isPriced,
          canonicalModel: costCalc.canonicalModel
        };
      }
      modelBreakdown[model].totalTokens += tokens;
      modelBreakdown[model].count += count;
      modelBreakdown[model].inputTokens += inp;
      modelBreakdown[model].cachedInputTokens += cachedInp;
      modelBreakdown[model].outputTokens += out;
      modelBreakdown[model].thinkingTokens += thk;
      if (costCalc.isPriced && costCalc.costUsd !== null) {
        modelBreakdown[model].isPriced = true;
        modelBreakdown[model].canonicalModel = costCalc.canonicalModel;
        modelBreakdown[model].estimatedCostUsd = roundUsd((modelBreakdown[model].estimatedCostUsd ?? 0) + costCalc.costUsd);
      }

      // Agregações por workspace
      if (!workspaceBreakdown[subproject]) {
        workspaceBreakdown[subproject] = { totalTokens: 0, count: 0, estimatedCostUsd: 0, unpricedTurnsCount: 0 };
      }
      workspaceBreakdown[subproject].totalTokens += tokens;
      workspaceBreakdown[subproject].count += count;
      if (costCalc.isPriced && costCalc.costUsd !== null) {
        workspaceBreakdown[subproject].estimatedCostUsd = roundUsd(workspaceBreakdown[subproject].estimatedCostUsd + costCalc.costUsd);
      } else {
        workspaceBreakdown[subproject].unpricedTurnsCount += count;
      }

      // Mapa diário para o heatmap
      const dayKey = item.day;
      if (dailyMap.has(dayKey)) {
        const dEntry = dailyMap.get(dayKey)!;
        dEntry.totalTokens += tokens;
        dEntry.inputTokens += inp;
        dEntry.outputTokens += out;
        dEntry.thinkingTokens += thk;
        dEntry.turnsCount += count;
        if (costCalc.isPriced && costCalc.costUsd !== null) {
          dEntry.estimatedCostUsd = roundUsd(dEntry.estimatedCostUsd + costCalc.costUsd);
        }
      }

      if (time >= sevenDaysAgo) {
        weekly.totalTokens += tokens;
        weekly.inputTokens += inp;
        weekly.outputTokens += out;
        weekly.thinkingTokens += thk;
        weekly.count += 1;
        if (costCalc.isPriced && costCalc.costUsd !== null) {
          weekly.estimatedCostUsd = roundUsd(weekly.estimatedCostUsd + costCalc.costUsd);
        }
      }

      if (time >= oneDayAgo) {
        daily.totalTokens += tokens;
        daily.inputTokens += inp;
        daily.outputTokens += out;
        daily.thinkingTokens += thk;
        daily.count += 1;
        if (costCalc.isPriced && costCalc.costUsd !== null) {
          daily.estimatedCostUsd = roundUsd(daily.estimatedCostUsd + costCalc.costUsd);
        }
      }

      if (time >= oneHourAgo) {
        hourly.totalTokens += tokens;
        hourly.inputTokens += inp;
        hourly.outputTokens += out;
        hourly.thinkingTokens += thk;
        hourly.count += 1;
        if (costCalc.isPriced && costCalc.costUsd !== null) {
          hourly.estimatedCostUsd = roundUsd(hourly.estimatedCostUsd + costCalc.costUsd);
        }
      }
    }

    const addExternalWindow = (target: typeof hourly, items: ExternalUsageItem[] = []) => {
      for (const item of items) {
        const cost = calculateTokenCostUsd({
          model: item.model,
          inputTokens: item.input_tokens,
          cachedInputTokens: item.cached_input_tokens,
          outputTokens: item.output_tokens
        });
        target.totalTokens += item.total_tokens;
        target.inputTokens += item.input_tokens;
        target.outputTokens += item.output_tokens;
        target.count += item.count;
        target.estimatedCostUsd = roundUsd(target.estimatedCostUsd + (cost.costUsd ?? 0));
      }
    };
    addExternalWindow(hourly, externalUsage?.windows.hourly);
    addExternalWindow(daily, externalUsage?.windows.daily);
    addExternalWindow(weekly, externalUsage?.windows.weekly);

    // Calcula intensidade (0 a 4) e melhor dia (Best Day)
    const rawDailyPoints = Array.from(dailyMap.values());
    let maxDailyTokens = 0;
    let bestDay: { day: string; totalTokens: number } | null = null;
    let activeDays = 0;

    for (const p of rawDailyPoints) {
      if (p.totalTokens > maxDailyTokens) {
        maxDailyTokens = p.totalTokens;
        bestDay = { day: p.day, totalTokens: p.totalTokens };
      }
      if (p.totalTokens > 0) {
        activeDays += 1;
      }
    }

    const dailyPoints = rawDailyPoints.map(p => {
      let intensity = 0;
      if (p.totalTokens > 0) {
        if (maxDailyTokens <= 0) {
          intensity = 1;
        } else {
          const ratio = p.totalTokens / maxDailyTokens;
          if (ratio >= 0.75) intensity = 4;
          else if (ratio >= 0.5) intensity = 3;
          else if (ratio >= 0.25) intensity = 2;
          else intensity = 1;
        }
      }
      return { ...p, intensity };
    });

    const recentDaily = dailyPoints.slice(-14);
    const mergedTurns = [
      ...krakenRecords.slice(-15).reverse().map((turn) => ({ ...turn, source: 'kraken' as const })),
      ...(externalUsage?.recentTurns ?? [])
    ]
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, 15);
    const recentTurns = mergedTurns.map((turn) => {
      const costCalc = calculateTokenCostUsd({
        model: turn.model,
        inputTokens: turn.input_tokens,
        cachedInputTokens: turn.cached_input_tokens,
        outputTokens: turn.output_tokens,
        thinkingTokens: turn.thinking_tokens
      });
      return {
        ...turn,
        estimatedCostUsd: costCalc.costUsd,
        isPriced: costCalc.isPriced,
        canonicalModel: costCalc.canonicalModel
      };
    });
    const firstExternalDay = (externalUsage?.items ?? []).reduce<string | null>(
      (min, item) => (min === null || item.day < min ? item.day : min),
      null
    );
    const firstEventAt = [krakenRecords[0]?.timestamp, firstExternalDay ? `${firstExternalDay}T03:00:00.000Z` : null]
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;
    const totalRecordedTurns = usageItems.reduce((sum, item) => sum + item.count, 0);

    const aggregates = {
      totalTokensAllTime,
      totalInputTokens,
      totalOutputTokens,
      totalThinkingTokens,
      totalRecordedTurns,
      totalAgentTimeMs,
      firstEventAt,
      activeDays,
      estimatedCostUsd: totalEstimatedCostUsd,
      unpricedTurnsCount,
      unpricedTokens
    };

    const fallbackGroups: QuotaGroup[] = [
      {
        name: 'Gemini Models',
        description: 'Models within this group: Gemini Flash, Gemini Pro',
        buckets: [
          {
            name: 'Weekly Limit Remaining',
            window: 'weekly',
            remaining: this.state.gemini.weeklyRemaining,
            message: geminiWeeklyMessage,
            resetAt: this.state.gemini.weeklyResetAt
          },
          {
            name: 'Five Hour Limit Remaining',
            window: '5h',
            remaining: this.state.gemini.fiveHourRemaining,
            message: gemini5hMessage,
            resetAt: this.state.gemini.fiveHourResetAt
          }
        ]
      },
      {
        name: 'Claude and GPT models',
        description: 'Models within this group: Claude Opus, Claude Sonnet, GPT-OSS',
        buckets: [
          {
            name: 'Weekly Limit Remaining',
            window: 'weekly',
            remaining: this.state.claudeGpt.weeklyRemaining,
            message: claudeWeeklyMessage,
            resetAt: this.state.claudeGpt.weeklyResetAt
          },
          {
            name: 'Five Hour Limit Remaining',
            window: '5h',
            remaining: this.state.claudeGpt.fiveHourRemaining,
            message: claude5hMessage,
            resetAt: this.state.claudeGpt.fiveHourResetAt
          }
        ]
      }
    ];

    const groups = (this.state.groups && this.state.groups.length > 0) ? this.state.groups : fallbackGroups;

    return {
      groups,
      gemini: {
        title: 'Gemini Models',
        weekly: {
          remaining: this.state.gemini.weeklyRemaining,
          message: geminiWeeklyMessage,
          resetAt: this.state.gemini.weeklyResetAt
        },
        fiveHour: {
          remaining: this.state.gemini.fiveHourRemaining,
          message: gemini5hMessage,
          resetAt: this.state.gemini.fiveHourResetAt
        }
      },
      claudeGpt: {
        title: 'Claude and GPT models',
        weekly: {
          remaining: this.state.claudeGpt.weeklyRemaining,
          message: claudeWeeklyMessage,
          resetAt: this.state.claudeGpt.weeklyResetAt
        },
        fiveHour: {
          remaining: this.state.claudeGpt.fiveHourRemaining,
          message: claude5hMessage,
          resetAt: this.state.claudeGpt.fiveHourResetAt
        }
      },
      source: 'official_google',
      usageSource: source,
      paperclipUsage: externalUsage
        ? { available: externalUsage.available, stale: externalUsage.stale }
        : null,
      lastFetchedAt: this.lastAgyFetch ? new Date(this.lastAgyFetch).toISOString() : this.state.lastUpdated,
      aggregates,
      dailyPoints,
      bestDay,
      activeDays,
      recentDaily,
      workspaceBreakdown,
      tokens: {
        hourly,
        daily,
        weekly,
        modelBreakdown,
        workspaceBreakdown,
        recentTurns,
        totalRecordedTurns,
        dailyPoints,
        bestDay,
        aggregates
      }
    };
  }

  // Cache persistente de cotas por conta: `${engine}:${email}` -> CachedAccountEntry
  private accountQuotaCache = new Map<string, CachedAccountEntry>();
  private lastAccountsRefreshAt = 0;
  private refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS;
  private refreshTimer: NodeJS.Timeout | null = null;
  private activeRefreshPromise: Promise<void> | null = null;

  private getCacheKey(engine: QuotaEngine, email: string): string {
    return `${engine}:${email.toLowerCase()}`;
  }

  private async persistAccountsCache(): Promise<void> {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const payload = {
        lastRefreshedAt: this.lastAccountsRefreshAt,
        accounts: Array.from(this.accountQuotaCache.values())
      };
      await fs.writeFile(ACCOUNTS_CACHE_FILE, JSON.stringify(payload, null, 2), 'utf8');
    } catch (e) {
      console.warn('[QuotaService] Falha ao persistir cache multi-contas:', (e as Error).message);
    }
  }

  startAutoRefresh(intervalMs?: number): void {
    if (typeof intervalMs === 'number' && intervalMs >= 30_000) {
      this.refreshIntervalMs = intervalMs;
    }
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(() => {
      this.refreshAllAccounts(false).catch(() => {});
    }, this.refreshIntervalMs);
    this.refreshTimer.unref?.();
  }

  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  getCacheMeta(): QuotaCacheMeta {
    const lastRefreshedAt = this.lastAccountsRefreshAt > 0
      ? new Date(this.lastAccountsRefreshAt).toISOString()
      : null;
    const nextRefreshAt = this.lastAccountsRefreshAt > 0
      ? new Date(this.lastAccountsRefreshAt + this.refreshIntervalMs).toISOString()
      : null;
    return {
      lastRefreshedAt,
      nextRefreshAt,
      refreshIntervalMs: this.refreshIntervalMs,
      isRefreshing: this.activeRefreshPromise !== null
    };
  }

  /**
   * Identifica a família a que pertence um determinado modelo
   */
  getModelFamily(modelId?: string): 'gemini' | 'claudeGpt' | 'geminiArgon' {
    if (!modelId) return 'gemini';
    const lower = modelId.toLowerCase();
    if (lower.includes('argon')) return 'geminiArgon';
    if (lower.includes('claude') || lower.includes('gpt')) return 'claudeGpt';
    return 'gemini';
  }

  /**
   * Extrai o resumo por família a partir dos grupos de cotas oficiais
   */
  extractModelSummaryFromGroups(groups: QuotaGroup[]): {
    gemini: AccountModelQuotaSummary;
    claudeGpt: AccountModelQuotaSummary;
    geminiArgon: AccountModelQuotaSummary;
  } {
    const summarizeGroup = (nameRegex: RegExp): AccountModelQuotaSummary => {
      const group = groups.find(g => nameRegex.test(g.name));
      if (!group || !group.buckets || group.buckets.length === 0) {
        return {
          remaining: 100,
          weeklyRemaining: 100,
          fiveHourRemaining: 100,
          resetAt: null,
          isAvailable: true
        };
      }

      let weeklyRemaining = 100;
      let fiveHourRemaining = 100;
      let resetAt: number | null = null;
      let message: string | null = null;

      for (const b of group.buckets) {
        const isWeekly = b.window === 'weekly' || (b.name && b.name.toLowerCase().includes('weekly'));
        if (isWeekly) {
          weeklyRemaining = b.remaining;
          if (b.resetAt) resetAt = b.resetAt;
          if (b.message) message = b.message;
        } else {
          fiveHourRemaining = b.remaining;
          if (b.resetAt && !resetAt) resetAt = b.resetAt;
          if (b.message && !message) message = b.message;
        }
      }

      // O percentual efetivo é o menor entre o limite semanal e o limite de 5h
      const remaining = Math.min(weeklyRemaining, fiveHourRemaining);
      const isAvailable = remaining > 0;

      return {
        remaining,
        weeklyRemaining,
        fiveHourRemaining,
        resetAt,
        isAvailable,
        message
      };
    };

    return {
      gemini: summarizeGroup(/gemini models/i),
      claudeGpt: summarizeGroup(/claude.*gpt/i),
      geminiArgon: summarizeGroup(/gemini 4 argon/i)
    };
  }

  /**
   * Consulta cotas oficiais para uma conta AGY específica
   */
  async fetchLiveQuotaForAccount(email?: string | null, force = false): Promise<QuotaGroup[]> {
    const activeEmail = await accountService.getActiveEmail();
    const targetEmail = (email || activeEmail || '').toLowerCase();
    if (!targetEmail) return [];

    const cacheKey = this.getCacheKey('agy', targetEmail);
    const now = Date.now();
    const cached = this.accountQuotaCache.get(cacheKey);
    if (!force && cached && now - cached.lastFetchedAt < this.refreshIntervalMs && cached.groups.length > 0) {
      return cached.groups;
    }

    try {
      let envHome = '/root';
      if (email && (!activeEmail || email.toLowerCase() !== activeEmail.toLowerCase())) {
        envHome = await accountService.prepareAccountHome(email);
      }

      const { stdout } = await execPromise('agy --print "/usage" --output-format json', {
        env: { ...process.env, HOME: envHome },
        timeout: 12000
      });

      const parsed = JSON.parse(stdout.trim());
      const rawGroups = parsed?.command?.data?.groups || [];
      const dynamicGroups: QuotaGroup[] = [];

      for (const group of rawGroups) {
        const groupName = (group.name || '').trim();
        const groupDesc = group.description ? String(group.description).trim() : undefined;
        const buckets: QuotaBucket[] = [];

        for (const b of (group.buckets || [])) {
          const fraction = typeof b.remaining_fraction === 'number' ? b.remaining_fraction : 1;
          const percent = Math.round(fraction * 100);
          const resetAt = b.reset_time ? new Date(b.reset_time).getTime() : null;
          const windowType = b.window || (b.id && b.id.includes('weekly') ? 'weekly' : '5h');

          buckets.push({
            id: b.id || undefined,
            name: b.name || (windowType === 'weekly' ? 'Weekly Limit Remaining' : 'Five Hour Limit Remaining'),
            description: b.description || undefined,
            window: windowType,
            remaining: percent,
            message: b.description || null,
            resetAt
          });
        }

        dynamicGroups.push({
          name: groupName,
          description: groupDesc,
          buckets
        });
      }

      if (dynamicGroups.length > 0) {
        this.accountQuotaCache.set(cacheKey, {
          engine: 'agy',
          email: email || activeEmail || targetEmail,
          name: cached?.name || email || activeEmail || targetEmail,
          picture: cached?.picture ?? null,
          isActive: Boolean(activeEmail && targetEmail === activeEmail.toLowerCase()),
          groups: dynamicGroups,
          lastFetchedAt: now,
          status: 'ok',
          errorMessage: null
        });
        return dynamicGroups;
      }
    } catch (e) {
      const msg = (e as Error).message;
      console.warn(`[QuotaService] Falha ao consultar cotas para conta ${targetEmail}:`, msg);
      if (cached) {
        this.accountQuotaCache.set(cacheKey, {
          ...cached,
          status: msg.includes('429') ? 'rate_limited' : 'error',
          errorMessage: msg
        });
        return cached.groups;
      }
    }

    // Se falhou ou cache não existe, retorna cotas do estado atual como fallback
    return (this.state.groups && this.state.groups.length > 0) ? this.state.groups : [];
  }

  /**
   * Consulta estado/cota da conta autenticada do Claude Code
   */
  async fetchLiveQuotaForClaude(force = false): Promise<CachedAccountEntry | null> {
    const authStatus = await claudeAuthService.getStatus();
    if (!authStatus.authenticated) {
      return null;
    }

    const email = authStatus.email || (authStatus.hasKey ? 'anthropic-api-key' : 'claude-oauth');
    const cacheKey = this.getCacheKey('claude', email);
    const now = Date.now();
    const cached = this.accountQuotaCache.get(cacheKey);
    if (!force && cached && now - cached.lastFetchedAt < this.refreshIntervalMs) {
      return cached;
    }

    const planTier = authStatus.planTier || authStatus.subscriptionType || authStatus.authMethod || null;
    const name = authStatus.orgName || authStatus.email || 'Claude Code';

    let groups: QuotaGroup[] = cached?.groups || [];
    let status: QuotaCacheStatus = 'ok';
    let errorMessage: string | null = null;

    if (authStatus.hasToken) {
      const token = await claudeAuthService.getOAuthAccessToken();
      if (token) {
        try {
          const resp = await fetch('https://api.anthropic.com/api/oauth/usage', {
            headers: {
              Authorization: `Bearer ${token}`,
              'anthropic-beta': 'oauth-2025-04-20',
              Accept: 'application/json',
              'User-Agent': 'KrakenBridge-Web/1.0'
            },
            signal: AbortSignal.timeout(8000)
          });

          if (resp.ok) {
            const usage = await resp.json() as {
              five_hour?: { utilization?: number; resets_at?: string | null };
              seven_day?: { utilization?: number; resets_at?: string | null };
            };
            const buckets: QuotaBucket[] = [];

            if (usage.five_hour && typeof usage.five_hour.utilization === 'number') {
              const remaining = Math.max(0, Math.min(100, Math.round(100 - usage.five_hour.utilization)));
              const resetAt = usage.five_hour.resets_at ? new Date(usage.five_hour.resets_at).getTime() : null;
              buckets.push({
                id: 'claude_5h',
                name: 'Five Hour Limit Remaining',
                window: '5h',
                remaining,
                resetAt,
                message: resetAt ? `Resets in ${formatRefreshTime(resetAt - now, true) || 'soon'}` : null
              });
            }

            if (usage.seven_day && typeof usage.seven_day.utilization === 'number') {
              const remaining = Math.max(0, Math.min(100, Math.round(100 - usage.seven_day.utilization)));
              const resetAt = usage.seven_day.resets_at ? new Date(usage.seven_day.resets_at).getTime() : null;
              buckets.push({
                id: 'claude_weekly',
                name: 'Weekly Limit Remaining',
                window: 'weekly',
                remaining,
                resetAt,
                message: resetAt ? `Resets in ${formatRefreshTime(resetAt - now, false) || 'soon'}` : null
              });
            }

            if (buckets.length > 0) {
              groups = [{
                name: 'Claude Code',
                description: planTier ? `Plano ${planTier} (OAuth)` : 'Claude Code (OAuth)',
                buckets
              }];
            }
          } else if (resp.status === 429) {
            status = 'rate_limited';
            errorMessage = 'Rate limit ao consultar OAuth usage (HTTP 429)';
          } else {
            status = groups.length > 0 ? 'stale' : 'ok';
            errorMessage = `OAuth usage indisponível (HTTP ${resp.status})`;
          }
        } catch (err) {
          status = groups.length > 0 ? 'stale' : 'error';
          errorMessage = (err as Error).message;
        }
      }
    }

    if (groups.length === 0) {
      groups = [{
        name: 'Claude Code',
        description: authStatus.hasKey
          ? 'Autenticado via Anthropic API Key (uso por demanda)'
          : `Autenticado via ${authStatus.authMethod || 'OAuth'}`,
        buckets: []
      }];
    }

    const entry: CachedAccountEntry = {
      engine: 'claude',
      email,
      name,
      picture: null,
      isActive: true,
      planTier,
      groups,
      lastFetchedAt: now,
      status,
      errorMessage
    };
    this.accountQuotaCache.set(cacheKey, entry);
    return entry;
  }

  /**
   * Atualiza o cache de todas as contas logadas (AGY + Claude Code) com single-flight e concorrência limitada
   */
  async refreshAllAccounts(force = false): Promise<void> {
    if (this.activeRefreshPromise) {
      return this.activeRefreshPromise;
    }

    this.activeRefreshPromise = (async () => {
      try {
        const now = Date.now();
        const { activeEmail, accounts } = await accountService.listAccounts();
        const validKeys = new Set<string>();

        const agyTasks = accounts.filter(acc => {
          const key = this.getCacheKey('agy', acc.email);
          validKeys.add(key);
          const cached = this.accountQuotaCache.get(key);
          if (cached) {
            cached.name = acc.name;
            cached.picture = acc.picture;
            cached.isActive = acc.isActive;
          }
          if (force) return true;
          return !cached || cached.groups.length === 0 || (now - cached.lastFetchedAt >= this.refreshIntervalMs);
        });

        await runWithConcurrency(agyTasks, MAX_REFRESH_CONCURRENCY, async (acc) => {
          const groups = await this.fetchLiveQuotaForAccount(acc.email, true);
          const key = this.getCacheKey('agy', acc.email);
          const existing = this.accountQuotaCache.get(key);
          if (existing) {
            existing.name = acc.name;
            existing.picture = acc.picture;
            existing.isActive = acc.isActive;
          } else if (groups.length > 0) {
            this.accountQuotaCache.set(key, {
              engine: 'agy',
              email: acc.email,
              name: acc.name,
              picture: acc.picture,
              isActive: acc.isActive,
              groups,
              lastFetchedAt: Date.now(),
              status: 'ok',
              errorMessage: null
            });
          }
        });

        // Se a conta ativa tem grupos mais recentes no state, garante metadados sincronizados
        if (activeEmail) {
          const activeKey = this.getCacheKey('agy', activeEmail);
          const activeAcc = accounts.find(a => a.isActive);
          const activeCached = this.accountQuotaCache.get(activeKey);
          if (!activeCached && activeAcc && this.state.groups && this.state.groups.length > 0) {
            this.accountQuotaCache.set(activeKey, {
              engine: 'agy',
              email: activeAcc.email,
              name: activeAcc.name,
              picture: activeAcc.picture,
              isActive: true,
              groups: this.state.groups,
              lastFetchedAt: Date.now(),
              status: 'ok',
              errorMessage: null
            });
          }
        }

        // Atualizar conta Claude Code logada (se houver)
        const claudeEntry = await this.fetchLiveQuotaForClaude(force).catch(() => null);
        if (claudeEntry) {
          validKeys.add(this.getCacheKey('claude', claudeEntry.email));
        }

        // Remover contas que não estão mais logadas
        for (const key of Array.from(this.accountQuotaCache.keys())) {
          if (!validKeys.has(key)) {
            this.accountQuotaCache.delete(key);
          }
        }

        this.lastAccountsRefreshAt = Date.now();
        await this.persistAccountsCache();
      } finally {
        this.activeRefreshPromise = null;
      }
    })();

    return this.activeRefreshPromise;
  }

  /**
   * Consolida visão multi-contas de cotas de todo o pool (AGY + Claude Code) usando cache SWR
   */
  async getMultiAccountQuotaOverview(forceRefresh = false): Promise<MultiAccountQuotaOverview> {
    await this.init();

    if (forceRefresh) {
      await this.refreshAllAccounts(true);
    } else {
      const now = Date.now();
      const { accounts } = await accountService.listAccounts();
      const hasMissingOrStaleAgy = accounts.some(acc => {
        const cached = this.accountQuotaCache.get(this.getCacheKey('agy', acc.email));
        return !cached || (now - cached.lastFetchedAt >= this.refreshIntervalMs);
      });
      const hasAnyCached = this.accountQuotaCache.size > 0;

      if (!hasAnyCached) {
        await this.refreshAllAccounts(false);
      } else if (hasMissingOrStaleAgy || (now - this.lastAccountsRefreshAt >= this.refreshIntervalMs)) {
        // Stale-While-Revalidate: responde instantaneamente e atualiza em background
        this.refreshAllAccounts(false).catch(() => {});
      }
    }

    const { activeEmail, accounts } = await accountService.listAccounts();
    const profiles: AccountQuotaProfile[] = [];

    for (const acc of accounts) {
      const cached = this.accountQuotaCache.get(this.getCacheKey('agy', acc.email));
      const groups = cached?.groups?.length
        ? cached.groups
        : (acc.isActive && this.state.groups?.length ? this.state.groups : []);

      profiles.push({
        engine: 'agy',
        email: acc.email,
        name: acc.name,
        picture: acc.picture,
        isActive: acc.isActive,
        cacheStatus: cached?.status || (groups.length > 0 ? 'ok' : 'stale'),
        errorMessage: cached?.errorMessage ?? null,
        groups,
        modelSummary: this.extractModelSummaryFromGroups(groups),
        lastUpdated: cached?.lastFetchedAt
          ? new Date(cached.lastFetchedAt).toISOString()
          : new Date().toISOString()
      });
    }

    // Incluir contas Claude Code do cache
    for (const entry of this.accountQuotaCache.values()) {
      if (entry.engine === 'claude') {
        const claudeBucketGroup = entry.groups[0];
        const claudeSummary = claudeBucketGroup && claudeBucketGroup.buckets.length > 0
          ? this.extractModelSummaryFromGroups([{ name: 'Claude and GPT models', buckets: claudeBucketGroup.buckets }]).claudeGpt
          : { remaining: 100, weeklyRemaining: 100, fiveHourRemaining: 100, resetAt: null, isAvailable: true };

        profiles.push({
          engine: 'claude',
          email: entry.email,
          name: entry.name,
          picture: entry.picture,
          isActive: entry.isActive,
          planTier: entry.planTier ?? null,
          cacheStatus: entry.status,
          errorMessage: entry.errorMessage,
          groups: entry.groups,
          modelSummary: {
            gemini: { remaining: 0, weeklyRemaining: 0, fiveHourRemaining: 0, resetAt: null, isAvailable: false },
            claudeGpt: claudeSummary,
            geminiArgon: { remaining: 0, weeklyRemaining: 0, fiveHourRemaining: 0, resetAt: null, isAvailable: false }
          },
          lastUpdated: new Date(entry.lastFetchedAt).toISOString()
        });
      }
    }

    // Identificar a melhor conta AGY por família (roteamento AGY considera apenas contas AGY)
    const agyProfiles = profiles.filter(p => (p.engine ?? 'agy') === 'agy');
    const getBest = (family: 'gemini' | 'claudeGpt' | 'geminiArgon') => {
      if (agyProfiles.length === 0) return null;
      let best = agyProfiles[0];
      let maxQuota = best.modelSummary[family]?.remaining ?? -1;

      for (const p of agyProfiles) {
        const q = p.modelSummary[family]?.remaining ?? -1;
        if (q > maxQuota) {
          maxQuota = q;
          best = p;
        }
      }
      return {
        email: best.email,
        name: best.name,
        remaining: Math.max(0, maxQuota)
      };
    };

    const bestAccountsByFamily = {
      gemini: getBest('gemini'),
      claudeGpt: getBest('claudeGpt'),
      geminiArgon: getBest('geminiArgon')
    };

    // Mapeamento dos modelos conhecidos para suas cotas
    const knownModels = [
      'gemini-4-hydrogen-high',
      'gemini-4-hydrogen-xhigh',
      'gemini-4-hydrogen-medium',
      'gemini-4-hydrogen-low',
      'gemini-3.8-flash-high',
      'gemini-3.8-flash-medium',
      'gemini-3.7-flash-high',
      'gemini-3.1-pro-high',
      'gemini-4-argon-high',
      'gemini-4-argon-medium',
      'claude-opus-5-5-high',
      'claude-opus-5-5-medium',
      'claude-sonnet-5-5-high',
      'gpt-oss-120b-medium'
    ];

    const modelQuotaMap: MultiAccountQuotaOverview['modelQuotaMap'] = {};
    const activeProfile = agyProfiles.find(p => p.isActive) || agyProfiles[0];

    for (const modelId of knownModels) {
      const family = this.getModelFamily(modelId);
      const currentRemaining = activeProfile?.modelSummary[family]?.remaining ?? 0;
      const best = bestAccountsByFamily[family];
      const bestRemaining = best?.remaining ?? currentRemaining;

      modelQuotaMap[modelId] = {
        family,
        currentAccountRemaining: currentRemaining,
        bestPoolRemaining: bestRemaining,
        bestAccountEmail: best?.email ?? null,
        bestAccountName: best?.name ?? null,
        isBlocked: bestRemaining <= 5
      };
    }

    return {
      activeEmail,
      accounts: profiles,
      cacheMeta: this.getCacheMeta(),
      bestAccountsByFamily,
      modelQuotaMap
    };
  }

  /**
   * Roteia automaticamente para a conta do pool com maior cota para o modelo selecionado
   */
  async routeByModel(modelId: string, minQuotaThreshold = 5): Promise<RouteByModelResponse> {
    await this.init();
    const family = this.getModelFamily(modelId);
    const overview = await this.getMultiAccountQuotaOverview(false);

    const agyAccounts = overview.accounts.filter(p => (p.engine ?? 'agy') === 'agy');
    const activeProfile = agyAccounts.find(p => p.isActive);
    const currentEmail = overview.activeEmail || (activeProfile ? activeProfile.email : '');
    const currentQuota = activeProfile?.modelSummary[family]?.remaining ?? 0;

    const best = overview.bestAccountsByFamily[family];
    const bestQuota = best?.remaining ?? 0;

    // Se a melhor conta do pool tiver cota crítica/esgotada (ex <= 5%)
    if (bestQuota < minQuotaThreshold) {
      return {
        success: false,
        model: modelId,
        family,
        switched: false,
        previousEmail: currentEmail,
        currentEmail,
        accountName: activeProfile?.name || 'Conta Atual',
        remainingQuota: currentQuota,
        isBlocked: true,
        message: `Cota esgotada para ${modelId} em todas as contas cadastradas (< ${minQuotaThreshold}% restante).`
      };
    }

    // Se a conta atual já tem cota suficiente e é a melhor (ou tem pelo menos 20% e a diferença é pequena)
    if (activeProfile && activeProfile.email.toLowerCase() === best?.email.toLowerCase()) {
      return {
        success: true,
        model: modelId,
        family,
        switched: false,
        previousEmail: currentEmail,
        currentEmail,
        accountName: activeProfile.name,
        remainingQuota: currentQuota,
        isBlocked: false,
        message: `Conta atual (${activeProfile.name}) já possui a melhor cota (${currentQuota}% restante).`
      };
    }

    // Se outra conta tiver significativamente mais cota (ou a atual estiver <= 5%)
    if (best && best.email && best.email.toLowerCase() !== currentEmail.toLowerCase()) {
      const switchResult = await accountService.switchAccount(best.email);
      // Atualiza o estado da cota para refletir a nova conta
      await this.fetchLiveQuotaFromGoogle(true).catch(() => {});

      return {
        success: true,
        model: modelId,
        family,
        switched: true,
        previousEmail: currentEmail,
        currentEmail: switchResult.email,
        accountName: switchResult.name,
        remainingQuota: bestQuota,
        isBlocked: false,
        message: `Roteamento por Cota: alternado automaticamente para ${switchResult.name} (${bestQuota}% disponível).`
      };
    }

    return {
      success: true,
      model: modelId,
      family,
      switched: false,
      previousEmail: currentEmail,
      currentEmail,
      accountName: activeProfile?.name || 'Conta Atual',
      remainingQuota: currentQuota,
      isBlocked: false,
      message: `Conta mantida com ${currentQuota}% disponível.`
    };
  }
}

export const quotaService = new QuotaService();
