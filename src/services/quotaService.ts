import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import type { 
  TokenUsageRecord, 
  QuotaGroup, 
  QuotaBucket,
  MultiAccountQuotaOverview,
  AccountQuotaProfile,
  AccountModelQuotaSummary,
  RouteByModelResponse
} from '../types/quota.js';
import { accountService } from './accountService.js';

const execPromise = util.promisify(exec);

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const QUOTA_FILE = path.join(DATA_DIR, 'quota_history.json');
const STATE_FILE = path.join(DATA_DIR, 'quota_state.json');

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
    } catch (e) {
      console.warn('[QuotaService] Erro ao carregar cotas:', (e as Error).message);
    }
    this.initialized = true;

    // Tentar consulta oficial em background ao inicializar
    this.fetchLiveQuotaFromGoogle().catch(() => {});
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
  async getStats() {
    await this.init();

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

    const hourly = { totalTokens: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, count: 0 };
    const daily = { totalTokens: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, count: 0 };
    const weekly = { totalTokens: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, count: 0 };
    const modelBreakdown: Record<string, { totalTokens: number; count: number; inputTokens: number; outputTokens: number; thinkingTokens: number }> = {};
    const workspaceBreakdown: Record<string, { totalTokens: number; count: number }> = {};

    let totalTokensAllTime = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalThinkingTokens = 0;
    let totalAgentTimeMs = 0;

    // Mapa dos últimos 42 dias para o Heatmap (Orca style)
    const DAY_COUNT = 42;
    const dailyMap = new Map<string, {
      day: string;
      totalTokens: number;
      inputTokens: number;
      outputTokens: number;
      thinkingTokens: number;
      turnsCount: number;
    }>();

    for (let i = DAY_COUNT - 1; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const dayStr = d.toISOString().slice(0, 10);
      dailyMap.set(dayStr, {
        day: dayStr,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        turnsCount: 0
      });
    }

    for (const item of this.records) {
      const time = new Date(item.timestamp).getTime();
      const tokens = item.total_tokens || 0;
      const inp = item.input_tokens || 0;
      const out = item.output_tokens || 0;
      const thk = item.thinking_tokens || 0;
      const dur = item.durationMs || 0;
      const model = item.model || 'desconhecido';
      const subproject = item.subproject || 'Geral';

      totalTokensAllTime += tokens;
      totalInputTokens += inp;
      totalOutputTokens += out;
      totalThinkingTokens += thk;
      totalAgentTimeMs += dur;

      // Agregações por modelo
      if (!modelBreakdown[model]) {
        modelBreakdown[model] = { totalTokens: 0, count: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
      }
      modelBreakdown[model].totalTokens += tokens;
      modelBreakdown[model].count += 1;
      modelBreakdown[model].inputTokens += inp;
      modelBreakdown[model].outputTokens += out;
      modelBreakdown[model].thinkingTokens += thk;

      // Agregações por workspace
      if (!workspaceBreakdown[subproject]) {
        workspaceBreakdown[subproject] = { totalTokens: 0, count: 0 };
      }
      workspaceBreakdown[subproject].totalTokens += tokens;
      workspaceBreakdown[subproject].count += 1;

      // Mapa diário para o heatmap
      const dayKey = (item.timestamp || '').slice(0, 10);
      if (dailyMap.has(dayKey)) {
        const dEntry = dailyMap.get(dayKey)!;
        dEntry.totalTokens += tokens;
        dEntry.inputTokens += inp;
        dEntry.outputTokens += out;
        dEntry.thinkingTokens += thk;
        dEntry.turnsCount += 1;
      }

      if (time >= sevenDaysAgo) {
        weekly.totalTokens += tokens;
        weekly.inputTokens += inp;
        weekly.outputTokens += out;
        weekly.thinkingTokens += thk;
        weekly.count += 1;
      }

      if (time >= oneDayAgo) {
        daily.totalTokens += tokens;
        daily.inputTokens += inp;
        daily.outputTokens += out;
        daily.thinkingTokens += thk;
        daily.count += 1;
      }

      if (time >= oneHourAgo) {
        hourly.totalTokens += tokens;
        hourly.inputTokens += inp;
        hourly.outputTokens += out;
        hourly.thinkingTokens += thk;
        hourly.count += 1;
      }
    }

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
    const recentTurns = this.records.slice(-15).reverse();
    const firstEventAt = this.records.length > 0 ? this.records[0].timestamp : null;

    const aggregates = {
      totalTokensAllTime,
      totalInputTokens,
      totalOutputTokens,
      totalThinkingTokens,
      totalRecordedTurns: this.records.length,
      totalAgentTimeMs,
      firstEventAt,
      activeDays
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
        totalRecordedTurns: this.records.length,
        dailyPoints,
        bestDay,
        aggregates
      }
    };
  }

  // Cache de cotas por conta: email -> { groups, lastFetchedAt }
  private accountQuotaCache = new Map<string, { groups: QuotaGroup[]; lastFetchedAt: number }>();

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
   * Consulta cotas oficiais para uma conta específica
   */
  async fetchLiveQuotaForAccount(email?: string | null, force = false): Promise<QuotaGroup[]> {
    const activeEmail = await accountService.getActiveEmail();
    const targetEmail = (email || activeEmail || '').toLowerCase();

    const now = Date.now();
    const cached = this.accountQuotaCache.get(targetEmail);
    if (!force && cached && now - cached.lastFetchedAt < 60000) {
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
        this.accountQuotaCache.set(targetEmail, { groups: dynamicGroups, lastFetchedAt: now });
        return dynamicGroups;
      }
    } catch (e) {
      console.warn(`[QuotaService] Falha ao consultar cotas para conta ${targetEmail}:`, (e as Error).message);
    }

    // Se falhou ou cache não existe, retorna cotas do estado atual como fallback
    return (this.state.groups && this.state.groups.length > 0) ? this.state.groups : [];
  }

  /**
   * Consolida visão multi-contas de cotas de todo o pool
   */
  async getMultiAccountQuotaOverview(forceRefresh = false): Promise<MultiAccountQuotaOverview> {
    await this.init();
    const { activeEmail, accounts } = await accountService.listAccounts();

    const profiles: AccountQuotaProfile[] = [];

    for (const acc of accounts) {
      const email = acc.email;
      let groups: QuotaGroup[];

      if (acc.isActive) {
        // Se for a conta ativa, usa os grupos oficiais conhecidos do state
        groups = (this.state.groups && this.state.groups.length > 0) 
          ? this.state.groups 
          : await this.fetchLiveQuotaForAccount(email, forceRefresh);
      } else {
        groups = await this.fetchLiveQuotaForAccount(email, forceRefresh);
      }

      const modelSummary = this.extractModelSummaryFromGroups(groups);

      profiles.push({
        email: acc.email,
        name: acc.name,
        picture: acc.picture,
        isActive: acc.isActive,
        groups,
        modelSummary,
        lastUpdated: new Date().toISOString()
      });
    }

    // Identificar a melhor conta por família
    const getBest = (family: 'gemini' | 'claudeGpt' | 'geminiArgon') => {
      if (profiles.length === 0) return null;
      let best = profiles[0];
      let maxQuota = best.modelSummary[family]?.remaining ?? -1;

      for (const p of profiles) {
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
      'gemini-3.8-flash-high',
      'gemini-3.8-flash-medium',
      'gemini-3.7-flash-high',
      'gemini-3.1-pro-high',
      'gemini-4-argon-high',
      'claude-opus-5-5-high',
      'claude-opus-5-5-medium',
      'claude-sonnet-5-5-high',
      'gpt-oss-120b-medium'
    ];

    const modelQuotaMap: MultiAccountQuotaOverview['modelQuotaMap'] = {};
    const activeProfile = profiles.find(p => p.isActive) || profiles[0];

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

    const activeProfile = overview.accounts.find(p => p.isActive);
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
