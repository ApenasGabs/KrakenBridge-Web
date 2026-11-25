import { saoPauloDayKey, saoPauloDayStart } from '../utils/saoPauloDay.js';
import type { ExternalTurn, ExternalUsageItem, ExternalUsageSnapshot } from '../types/quota.js';

/** Mesma retenção do histórico do Kraken (30 dias), para comparar períodos iguais. */
export const PAPERCLIP_USAGE_DAYS = 30;
export const PAPERCLIP_WORKSPACE = 'Paperclip (agentes)';

const SNAPSHOT_TTL_MS = 60_000;
const CLOSED_DAY_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CONCURRENCY = 5;
const RECENT_RUNS_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CompanyFetcher = (path: string) => Promise<unknown>;

const toCount = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
};

const asRows = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) throw new Error('Resposta inesperada da API do Paperclip');
  return value as Record<string, unknown>[];
};

const toItem = (row: Record<string, unknown>, day: string): ExternalUsageItem => {
  const input = toCount(row.inputTokens);
  const cached = toCount(row.cachedInputTokens);
  const output = toCount(row.outputTokens);
  return {
    day,
    model: typeof row.model === 'string' && row.model ? row.model : 'desconhecido',
    subproject: PAPERCLIP_WORKSPACE,
    count: toCount(row.eventCount),
    input_tokens: input,
    cached_input_tokens: cached,
    output_tokens: output,
    total_tokens: input + cached + output
  };
};

/**
 * Lê o consumo dos agentes direto da API do Paperclip. Nada é gravado no histórico
 * do Kraken, o que evita contagem dupla.
 */
export class PaperclipUsageService {
  private closedDays = new Map<string, { fetchedAt: number; items: ExternalUsageItem[] }>();
  private snapshot: ExternalUsageSnapshot | null = null;
  private fetchedAt = 0;
  private inFlight: Promise<ExternalUsageSnapshot> | null = null;

  constructor(private readonly fetchCompany: CompanyFetcher) {}

  /** Nunca rejeita: em falha, devolve o último dado bom (stale) ou available=false. */
  async getSnapshot(): Promise<ExternalUsageSnapshot> {
    if (this.snapshot && Date.now() - this.fetchedAt < SNAPSHOT_TTL_MS) return this.snapshot;
    this.inFlight ??= this.refresh().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  private async refresh(): Promise<ExternalUsageSnapshot> {
    const now = Date.now();
    try {
      const [items, hourly, daily, weekly, recentTurns] = await Promise.all([
        this.loadDays(now),
        this.loadRange(now - 60 * 60 * 1000, now),
        this.loadRange(now - DAY_MS, now),
        this.loadRange(now - 7 * DAY_MS, now),
        this.loadRecentTurns()
      ]);
      this.snapshot = { available: true, stale: false, items, windows: { hourly, daily, weekly }, recentTurns };
    } catch (err) {
      console.warn('[PaperclipUsage] Falha ao ler consumo:', (err as Error).message);
      this.snapshot = this.snapshot?.available
        ? { ...this.snapshot, stale: true }
        : { available: false, stale: false, items: [], windows: { hourly: [], daily: [], weekly: [] }, recentTurns: [] };
    }
    this.fetchedAt = now;
    return this.snapshot;
  }

  private async loadRange(from: number, to: number, day = saoPauloDayKey(to)): Promise<ExternalUsageItem[]> {
    const query = new URLSearchParams({ from: new Date(from).toISOString(), to: new Date(to).toISOString() });
    return asRows(await this.fetchCompany(`costs/by-agent-model?${query}`)).map((row) => toItem(row, day));
  }

  private async loadDays(now: number): Promise<ExternalUsageItem[]> {
    const days = Array.from({ length: PAPERCLIP_USAGE_DAYS }, (_, i) => saoPauloDayKey(now - i * DAY_MS));
    for (const key of this.closedDays.keys()) {
      if (!days.includes(key)) this.closedDays.delete(key);
    }
    const results: ExternalUsageItem[][] = new Array(days.length);
    let next = 0;
    const worker = async () => {
      while (next < days.length) {
        const index = next++;
        results[index] = await this.loadDay(days[index], index >= 2, now);
      }
    };
    await Promise.all(Array.from({ length: MAX_CONCURRENCY }, worker));
    return results.flat();
  }

  private async loadDay(day: string, closed: boolean, now: number): Promise<ExternalUsageItem[]> {
    const cached = this.closedDays.get(day);
    if (closed && cached && now - cached.fetchedAt < CLOSED_DAY_TTL_MS) return cached.items;
    const start = saoPauloDayStart(day);
    const items = await this.loadRange(start, start + DAY_MS - 1, day);
    if (closed) this.closedDays.set(day, { fetchedAt: now, items });
    return items;
  }

  private async loadRecentTurns(): Promise<ExternalTurn[]> {
    const [runs, agents] = await Promise.all([
      this.fetchCompany(`heartbeat-runs?limit=${RECENT_RUNS_LIMIT}`).then(asRows),
      this.fetchCompany('agents').then(asRows)
    ]);
    const agentById = new Map(agents.map((agent) => [String(agent.id), agent]));

    return runs.flatMap((run): ExternalTurn[] => {
      if (typeof run.startedAt !== 'string') return [];
      const usage = (run.usageJson ?? {}) as Record<string, unknown>;
      const input = toCount(run.inputTokens ?? usage.inputTokens);
      const cached = toCount(run.cachedInputTokens ?? usage.cachedInputTokens);
      const output = toCount(run.outputTokens ?? usage.outputTokens);
      const total = input + cached + output;
      if (total === 0) return [];

      const agent = agentById.get(String(run.agentId));
      const config = (agent?.adapterConfig ?? {}) as Record<string, unknown>;
      const started = Date.parse(run.startedAt);
      const finished = typeof run.finishedAt === 'string' ? Date.parse(run.finishedAt) : NaN;
      return [{
        id: `paperclip-${String(run.id)}`,
        timestamp: run.startedAt,
        agent: String(agent?.name ?? 'Agente Paperclip'),
        model: String(usage.model || config.model || 'desconhecido'),
        subproject: PAPERCLIP_WORKSPACE,
        durationMs: Number.isFinite(finished - started) ? Math.max(0, finished - started) : 0,
        input_tokens: input,
        cached_input_tokens: cached,
        output_tokens: output,
        thinking_tokens: 0,
        total_tokens: total,
        source: 'paperclip'
      }];
    });
  }
}
