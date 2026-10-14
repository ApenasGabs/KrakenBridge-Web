import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const QUOTA_FILE = path.join(DATA_DIR, 'quota_history.json');
const STATE_FILE = path.join(DATA_DIR, 'quota_state.json');

// Formata intervalo de tempo restante no estilo oficial do Antigravity
function formatRefreshTime(ms, isFiveHour = false) {
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

class QuotaService {
  constructor() {
    this.records = [];
    this.initialized = false;
    this.lastAgyFetch = 0;
    this.isFetchingFromAgy = false;

    // Estado oficial dos limites Antigravity
    this.state = {
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
  }

  async init() {
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
        const parsedState = JSON.parse(rawState);
        this.state = {
          gemini: { ...this.state.gemini, ...(parsedState.gemini || {}) },
          claudeGpt: { ...this.state.claudeGpt, ...(parsedState.claudeGpt || {}) },
          source: parsedState.source || 'live',
          lastUpdated: parsedState.lastUpdated || new Date().toISOString()
        };
      }
    } catch (e) {
      console.warn('[QuotaService] Erro ao carregar cotas:', e.message);
    }
    this.initialized = true;

    // Tentar consulta oficial em background ao inicializar
    this.fetchLiveQuotaFromGoogle().catch(() => {});
  }

  async persistHistory() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const cutoff30Days = Date.now() - (30 * 24 * 60 * 60 * 1000);
      this.records = this.records.filter(r => new Date(r.timestamp).getTime() >= cutoff30Days);
      await fs.writeFile(QUOTA_FILE, JSON.stringify(this.records, null, 2), 'utf8');
    } catch (e) {
      console.error('[QuotaService] Falha ao persistir histórico de cotas:', e.message);
    }
  }

  async persistState() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      this.state.lastUpdated = new Date().toISOString();
      await fs.writeFile(STATE_FILE, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (e) {
      console.error('[QuotaService] Falha ao persistir estado de cotas:', e.message);
    }
  }

  /**
   * Consulta a cota 100% oficial e global diretamente pelo CLI agy via /usage
   */
  async fetchLiveQuotaFromGoogle(force = false) {
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
      const groups = parsed?.command?.data?.groups || [];

      for (const group of groups) {
        const groupName = (group.name || '').toLowerCase();
        const buckets = group.buckets || [];

        let target = null;
        if (groupName.includes('gemini')) {
          target = this.state.gemini;
        } else if (groupName.includes('claude') || groupName.includes('gpt')) {
          target = this.state.claudeGpt;
        }

        if (target) {
          for (const b of buckets) {
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

      this.state.source = 'live_google';
      this.lastAgyFetch = Date.now();
      await this.persistState();
    } catch (err) {
      console.warn('[QuotaService] Consulta oficial ao vivo pelo agy falhou ou demorou:', err.message);
    } finally {
      this.isFetchingFromAgy = false;
    }

    return this.state;
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
  }) {
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
    const modelBreakdown = {};
    const workspaceBreakdown = {};

    let totalTokensAllTime = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalThinkingTokens = 0;
    let totalAgentTimeMs = 0;

    // Mapa dos últimos 42 dias para o Heatmap (Orca style)
    const DAY_COUNT = 42;
    const dailyMap = new Map();
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
        const dEntry = dailyMap.get(dayKey);
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
    let bestDay = null;
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

    return {
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
}

export const quotaService = new QuotaService();
