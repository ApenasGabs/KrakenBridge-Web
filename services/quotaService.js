import fs from 'fs/promises';
import path from 'path';

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

    // Estado oficial dos limites Antigravity
    // Inicializado com os valores reais da conta do usuário conforme captura de tela
    this.state = {
      gemini: {
        weeklyRemaining: 57,
        weeklyResetAt: Date.now() + (47 * 60 * 60 * 1000), // ~1 dia, 23 horas
        fiveHourRemaining: 85,
        fiveHourResetAt: Date.now() + ((4 * 60 + 32) * 60 * 1000) // ~4 horas, 32 minutos
      },
      claudeGpt: {
        weeklyRemaining: 100,
        weeklyResetAt: null,
        fiveHourRemaining: 100,
        fiveHourResetAt: null
      },
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

      // Carregar estado persistido das cotas (5h e semanal por família de modelo)
      const existsState = await fs.access(STATE_FILE).then(() => true).catch(() => false);
      if (existsState) {
        const rawState = await fs.readFile(STATE_FILE, 'utf8');
        const parsedState = JSON.parse(rawState);
        this.state = {
          gemini: { ...this.state.gemini, ...(parsedState.gemini || {}) },
          claudeGpt: { ...this.state.claudeGpt, ...(parsedState.claudeGpt || {}) },
          lastUpdated: parsedState.lastUpdated || new Date().toISOString()
        };
      } else {
        await this.persistState();
      }
    } catch (e) {
      console.warn('[QuotaService] Erro ao carregar cotas:', e.message);
    }
    this.initialized = true;
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
   * Sincroniza / recalibra os valores das cotas manualmente pelo usuário ou por telemetria
   */
  async syncQuota({ gemini, claudeGpt }) {
    await this.init();

    if (gemini) {
      if (typeof gemini.weeklyRemaining === 'number') {
        this.state.gemini.weeklyRemaining = Math.max(0, Math.min(100, Math.round(gemini.weeklyRemaining)));
      }
      if (typeof gemini.fiveHourRemaining === 'number') {
        this.state.gemini.fiveHourRemaining = Math.max(0, Math.min(100, Math.round(gemini.fiveHourRemaining)));
      }
      if (gemini.weeklyHoursRemaining !== undefined) {
        this.state.gemini.weeklyResetAt = Date.now() + (Number(gemini.weeklyHoursRemaining) * 3600 * 1000);
      }
      if (gemini.fiveHourMinutesRemaining !== undefined) {
        this.state.gemini.fiveHourResetAt = Date.now() + (Number(gemini.fiveHourMinutesRemaining) * 60 * 1000);
      }
    }

    if (claudeGpt) {
      if (typeof claudeGpt.weeklyRemaining === 'number') {
        this.state.claudeGpt.weeklyRemaining = Math.max(0, Math.min(100, Math.round(claudeGpt.weeklyRemaining)));
      }
      if (typeof claudeGpt.fiveHourRemaining === 'number') {
        this.state.claudeGpt.fiveHourRemaining = Math.max(0, Math.min(100, Math.round(claudeGpt.fiveHourRemaining)));
      }
    }

    await this.persistState();
    return this.getStats();
  }

  /**
   * Registra o consumo de um turno e desconta da cota correspondente
   */
  async recordUsage({ model = 'gemini-3.8-flash-high', agent = 'antigravity', input_tokens = 0, output_tokens = 0, thinking_tokens = 0, total_tokens = 0, timestamp }) {
    await this.init();

    const total = Number(total_tokens) || ((Number(input_tokens) || 0) + (Number(output_tokens) || 0) + (Number(thinking_tokens) || 0));

    const record = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      timestamp: timestamp || new Date().toISOString(),
      agent,
      model,
      input_tokens: Number(input_tokens) || 0,
      output_tokens: Number(output_tokens) || 0,
      thinking_tokens: Number(thinking_tokens) || 0,
      total_tokens: total
    };

    this.records.push(record);
    await this.persistHistory();

    // Desconta levemente da cota correspondente
    // Em média, um turno com ~10k tokens consome ~1% da janela de 5h e ~0.2% da semanal
    const normalizedModel = (model || '').toLowerCase();
    const isClaudeOrGpt = normalizedModel.includes('claude') || normalizedModel.includes('gpt');
    const targetGroup = isClaudeOrGpt ? this.state.claudeGpt : this.state.gemini;

    const fiveHourDeduction = Math.max(0.5, Math.min(5, Math.round((total / 15000) * 10) / 10));
    const weeklyDeduction = Math.max(0.1, Math.min(2, Math.round((total / 60000) * 10) / 10));

    targetGroup.fiveHourRemaining = Math.max(0, Math.round((targetGroup.fiveHourRemaining - fiveHourDeduction) * 10) / 10);
    targetGroup.weeklyRemaining = Math.max(0, Math.round((targetGroup.weeklyRemaining - weeklyDeduction) * 10) / 10);

    // Se estiver gastando e não tinha reset agendado, agenda nova janela de 5h
    if (!targetGroup.fiveHourResetAt || Date.now() >= targetGroup.fiveHourResetAt) {
      targetGroup.fiveHourResetAt = Date.now() + (5 * 60 * 60 * 1000);
    }
    if (!targetGroup.weeklyResetAt || Date.now() >= targetGroup.weeklyResetAt) {
      targetGroup.weeklyResetAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
    }

    await this.persistState();
    return record;
  }

  /**
   * Retorna os dados completos de cotas oficiais Antigravity + detalhamento de tokens
   */
  async getStats() {
    await this.init();

    const now = Date.now();

    // Recuperação temporal para Gemini
    let gemini5hTimeRemaining = 0;
    if (this.state.gemini.fiveHourResetAt) {
      gemini5hTimeRemaining = Math.max(0, this.state.gemini.fiveHourResetAt - now);
      if (gemini5hTimeRemaining === 0 && this.state.gemini.fiveHourRemaining < 100) {
        this.state.gemini.fiveHourRemaining = 100;
        this.state.gemini.fiveHourResetAt = null;
      }
    }

    let geminiWeeklyTimeRemaining = 0;
    if (this.state.gemini.weeklyResetAt) {
      geminiWeeklyTimeRemaining = Math.max(0, this.state.gemini.weeklyResetAt - now);
      if (geminiWeeklyTimeRemaining === 0 && this.state.gemini.weeklyRemaining < 100) {
        this.state.gemini.weeklyRemaining = 100;
        this.state.gemini.weeklyResetAt = null;
      }
    }

    // Mensagens oficiais idênticas às da interface do Google Antigravity
    const gemini5hMessage = this.state.gemini.fiveHourRemaining < 100 && gemini5hTimeRemaining > 0
      ? `You have used some of your 5-hour limit, it will fully refresh in ${formatRefreshTime(gemini5hTimeRemaining, true)}.`
      : null;

    const geminiWeeklyMessage = this.state.gemini.weeklyRemaining < 100 && geminiWeeklyTimeRemaining > 0
      ? `You have used some of your weekly limit, it will fully refresh in ${formatRefreshTime(geminiWeeklyTimeRemaining, false)}.`
      : null;

    // Claude e GPT
    const claude5hMessage = this.state.claudeGpt.fiveHourRemaining < 100
      ? 'You have used some of your 5-hour limit.'
      : null;

    const claudeWeeklyMessage = this.state.claudeGpt.weeklyRemaining < 100
      ? 'You have used some of your weekly limit.'
      : null;

    // Agregações de tokens (para quem quiser acompanhar métricas adicionais)
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

    const hourly = { totalTokens: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, count: 0 };
    const daily = { totalTokens: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, count: 0 };
    const weekly = { totalTokens: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, count: 0 };
    const modelBreakdown = {};

    for (const item of this.records) {
      const time = new Date(item.timestamp).getTime();
      const tokens = item.total_tokens || 0;
      const inp = item.input_tokens || 0;
      const out = item.output_tokens || 0;
      const thk = item.thinking_tokens || 0;

      if (time >= sevenDaysAgo) {
        weekly.totalTokens += tokens;
        weekly.inputTokens += inp;
        weekly.outputTokens += out;
        weekly.thinkingTokens += thk;
        weekly.count += 1;

        if (!modelBreakdown[item.model]) {
          modelBreakdown[item.model] = { totalTokens: 0, count: 0 };
        }
        modelBreakdown[item.model].totalTokens += tokens;
        modelBreakdown[item.model].count += 1;
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

    const recentTurns = this.records.slice(-10).reverse();

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
      tokens: {
        hourly,
        daily,
        weekly,
        modelBreakdown,
        recentTurns,
        totalRecordedTurns: this.records.length
      }
    };
  }
}

export const quotaService = new QuotaService();
