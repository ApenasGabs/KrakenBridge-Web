import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const QUOTA_FILE = path.join(DATA_DIR, 'quota_history.json');

// Limites sugeridos / estimativas de referência para modelos Antigravity
// (Baseado nas janelas horárias e semanais típicas do Gemini Code Assist / AGY)
const DEFAULT_LIMITS = {
  hourlySoftLimit: 1_000_000, // 1 milhão de tokens por hora
  weeklySoftLimit: 10_000_000 // 10 milhões de tokens por semana
};

class QuotaService {
  constructor() {
    this.records = [];
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const exists = await fs.access(QUOTA_FILE).then(() => true).catch(() => false);
      if (exists) {
        const raw = await fs.readFile(QUOTA_FILE, 'utf8');
        this.records = JSON.parse(raw);
        if (!Array.isArray(this.records)) this.records = [];
      } else {
        this.records = [];
      }
    } catch (e) {
      console.warn('[QuotaService] Erro ao carregar histórico de cotas:', e.message);
      this.records = [];
    }
    this.initialized = true;
  }

  async persist() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      // Mantém apenas os últimos 30 dias para evitar crescimento indefinido
      const cutoff30Days = Date.now() - (30 * 24 * 60 * 60 * 1000);
      this.records = this.records.filter(r => new Date(r.timestamp).getTime() >= cutoff30Days);
      await fs.writeFile(QUOTA_FILE, JSON.stringify(this.records, null, 2), 'utf8');
    } catch (e) {
      console.error('[QuotaService] Falha ao persistir cotas:', e.message);
    }
  }

  async recordUsage({ model = 'gemini-3.8-flash-high', agent = 'antigravity', input_tokens = 0, output_tokens = 0, thinking_tokens = 0, total_tokens = 0, timestamp }) {
    await this.init();

    const record = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      timestamp: timestamp || new Date().toISOString(),
      agent,
      model,
      input_tokens: Number(input_tokens) || 0,
      output_tokens: Number(output_tokens) || 0,
      thinking_tokens: Number(thinking_tokens) || 0,
      total_tokens: Number(total_tokens) || ((Number(input_tokens) || 0) + (Number(output_tokens) || 0) + (Number(thinking_tokens) || 0))
    };

    this.records.push(record);
    await this.persist();
    return record;
  }

  async getStats() {
    await this.init();

    const now = Date.now();
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

      // Agregação semanal (últimos 7 dias)
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

      // Agregação diária (últimas 24 horas)
      if (time >= oneDayAgo) {
        daily.totalTokens += tokens;
        daily.inputTokens += inp;
        daily.outputTokens += out;
        daily.thinkingTokens += thk;
        daily.count += 1;
      }

      // Agregação horária (últimos 60 minutos)
      if (time >= oneHourAgo) {
        hourly.totalTokens += tokens;
        hourly.inputTokens += inp;
        hourly.outputTokens += out;
        hourly.thinkingTokens += thk;
        hourly.count += 1;
      }
    }

    const hourlyPercent = Math.min(100, Math.round((hourly.totalTokens / DEFAULT_LIMITS.hourlySoftLimit) * 100));
    const weeklyPercent = Math.min(100, Math.round((weekly.totalTokens / DEFAULT_LIMITS.weeklySoftLimit) * 100));

    // Últimos 10 turnos registrados
    const recentTurns = this.records.slice(-10).reverse();

    return {
      hourly: {
        ...hourly,
        limit: DEFAULT_LIMITS.hourlySoftLimit,
        percent: hourlyPercent
      },
      daily,
      weekly: {
        ...weekly,
        limit: DEFAULT_LIMITS.weeklySoftLimit,
        percent: weeklyPercent
      },
      modelBreakdown,
      recentTurns,
      totalRecordedTurns: this.records.length
    };
  }
}

export const quotaService = new QuotaService();
