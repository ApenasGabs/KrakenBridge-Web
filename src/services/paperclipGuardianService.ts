import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getPaperclipApiToken } from '../utils/paperclipToken.js';

const execFileAsync = promisify(execFile);
const MINUTE_MS = 60_000;

export const GUARDIAN_ROUTINE_ID = 'ad85d672-74dc-4f2c-9074-82558ffc15c8';

/** Mesmos papéis descritos na rotina "Guardião de Pipeline" do Paperclip. */
export const SENTINEL_POOL = ['217c4ccc-e831-4d0e-bf70-a0266f7ceb15', '0e47393e-49a5-4342-a97b-6a4af4008d76'];
export const WORKER_POOLS = [
  ['fb0ad346-e4b6-42dc-a3fa-ec26d43454d1', 'aad63e33-bf9f-4561-a660-429f3e4faa75', 'b343a652-4aec-45f6-8f32-692433ab3ad0'],
  ['a3471ae0-64bf-4d79-8acf-bd23755ea4e5', '8fec2469-c8d8-4b93-bfb2-a91d536befc9'],
  ['0e78f373-d5f2-47d8-9efb-f7211ed931ad', 'f078e615-2e6d-4a26-8c2d-73800f5181d1']
];

const SENTINEL_IDLE_MS = 5 * MINUTE_MS;
const TODO_STALE_MS = 15 * MINUTE_MS;
const CHECK_INTERVAL_MS = 5 * MINUTE_MS;
const MIN_WAKE_INTERVAL_MS = 15 * MINUTE_MS;
const ITEM_COOLDOWN_MS = 60 * MINUTE_MS;
const HISTORY_LIMIT = 100;

export type GuardianMode = 'off' | 'shadow' | 'active';
export type PrState = 'open' | 'none' | 'unknown';
export type GuardianReason = 'review_without_sentinel' | 'sentinel_idle' | 'sentinel_unavailable' | 'todo_stale' | 'todo_unassigned' | 'todo_agent_unavailable';

export interface GuardianIssue {
  id: string;
  identifier: string;
  status: string;
  description?: string | null;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  originKind?: string | null;
  originId?: string | null;
  executionState?: { currentParticipant?: { type?: string } | null } | null;
  updatedAt: string;
}
export interface GuardianAgent { id: string; status: string; lastHeartbeatAt?: string | null }
export interface GuardianRun { agentId: string; issueId?: string | null; status: string }
export interface GuardianFinding { issueId: string; identifier: string; reason: GuardianReason }
export interface GuardianReport {
  checkedAt: string;
  mode: GuardianMode;
  checkedIssues: number;
  findings: GuardianFinding[];
  unverified: string[];
  action: 'none' | 'would_wake' | 'woken' | 'cooldown' | 'error';
  error?: string;
}
export interface GuardianDecision { at: string; mode: GuardianMode; findings: GuardianFinding[] }
interface GuardianState { lastWakeAt: number; items: Record<string, number>; history: GuardianDecision[] }

const isWaitingForHuman = (issue: GuardianIssue): boolean =>
  Boolean(issue.assigneeUserId) || issue.executionState?.currentParticipant?.type === 'user';

const elapsedSince = (value: string | null | undefined, now: number): number => {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? now - time : Infinity;
};

/** Issues em revisão cujo PR precisa ser consultado (as demais esperam uma pessoa). */
export const needsPrLookup = (issue: GuardianIssue): boolean =>
  issue.status === 'in_review' && !isWaitingForHuman(issue);

/** Regras de handoff da rotina, sem IA. Função pura. */
export const findStuckIssues = (
  issues: GuardianIssue[],
  agents: GuardianAgent[],
  runs: GuardianRun[],
  prStates: Map<string, PrState>,
  now: number
): GuardianFinding[] => {
  const agentById = new Map(agents.map(agent => [agent.id, agent]));
  const activeRuns = runs.filter(run => run.status === 'running' || run.status === 'queued');
  const isBusy = (id: string) => activeRuns.some(run => run.agentId === id);
  const isIdle = (id: string) => agentById.get(id)?.status === 'idle' && !isBusy(id);
  const hasIdlePeer = (pool: string[], id: string) => pool.some(peer => peer !== id && isIdle(peer));

  const classify = (issue: GuardianIssue): GuardianReason | null => {
    if (isWaitingForHuman(issue) || activeRuns.some(run => run.issueId === issue.id)) return null;
    const agentId = issue.assigneeAgentId;

    if (issue.status === 'in_review') {
      if (prStates.get(issue.id) !== 'open') return null;
      if (!agentId || !SENTINEL_POOL.includes(agentId)) return 'review_without_sentinel';
      if (isIdle(agentId)) {
        const idleFor = Math.min(
          elapsedSince(issue.updatedAt, now),
          elapsedSince(agentById.get(agentId)?.lastHeartbeatAt, now)
        );
        return idleFor > SENTINEL_IDLE_MS ? 'sentinel_idle' : null;
      }
      return hasIdlePeer(SENTINEL_POOL, agentId) ? 'sentinel_unavailable' : null;
    }

    if (issue.status === 'todo') {
      if (elapsedSince(issue.updatedAt, now) <= TODO_STALE_MS) return null;
      if (!agentId) return 'todo_unassigned';
      if (isIdle(agentId)) return 'todo_stale';
      const status = agentById.get(agentId)?.status;
      const pool = WORKER_POOLS.find(ids => ids.includes(agentId)) ?? [];
      return (status === 'paused' || status === 'error') && hasIdlePeer(pool, agentId) ? 'todo_agent_unavailable' : null;
    }
    return null;
  };

  return issues.flatMap(issue => {
    if (issue.originKind === 'routine_execution' && issue.originId === GUARDIAN_ROUTINE_ID) return [];
    const reason = classify(issue);
    return reason ? [{ issueId: issue.id, identifier: issue.identifier, reason }] : [];
  });
};

export const extractPrUrls = (text: string): string[] =>
  [...new Set(text.match(/https:\/\/github\.com\/ApenasGabs\/[\w.-]+\/pull\/\d+/g) ?? [])];

const lookupGithubPr = async (url: string): Promise<string> => {
  const { stdout } = await execFileAsync('gh', ['pr', 'view', url, '--json', 'state', '--jq', '.state'], { timeout: 10_000 });
  return stdout.trim();
};

export interface GuardianOptions {
  paperclipUrl: string;
  companyId: string;
  mode?: GuardianMode;
  statePath?: string;
  apiToken?: string;
  lookupPr?: (url: string) => Promise<string>;
  now?: () => number;
}

export const parseGuardianMode = (value: string | undefined): GuardianMode =>
  value === 'active' || value === 'off' ? value : 'shadow';

/** Verifica a fila por código e só aciona a rotina com IA quando há trabalho (Issue #231). */
export class PaperclipGuardianService {
  private readonly mode: GuardianMode;
  private readonly statePath: string;
  private readonly now: () => number;
  private readonly lookupPr: (url: string) => Promise<string>;
  private state: GuardianState = { lastWakeAt: 0, items: {}, history: [] };
  private lastCheckAt = 0;
  private running = false;
  private report: GuardianReport | null = null;

  constructor(private readonly options: GuardianOptions) {
    this.mode = options.mode ?? parseGuardianMode(process.env.PAPERCLIP_GUARDIAN_MODE);
    this.statePath = options.statePath ?? path.join(process.env.DATA_DIR || path.resolve('data'), 'paperclip_guardian.json');
    this.now = options.now ?? Date.now;
    this.lookupPr = options.lookupPr ?? lookupGithubPr;
    this.loadState();
  }

  public getReport(): { mode: GuardianMode; report: GuardianReport | null; history: GuardianDecision[] } {
    return { mode: this.mode, report: this.report, history: [...this.state.history] };
  }

  /** Chamado a cada polling; respeita o intervalo próprio e nunca lança. */
  public async tick(): Promise<void> {
    if (this.mode === 'off' || this.running || this.now() - this.lastCheckAt < CHECK_INTERVAL_MS) return;
    this.running = true;
    this.lastCheckAt = this.now();
    try {
      this.report = await this.check();
    } catch (err) {
      this.report = { ...this.emptyReport(), action: 'error', error: (err as Error).message };
      console.warn('[PaperclipGuardian] Verificação falhou, fila desconhecida:', (err as Error).message);
    } finally {
      this.running = false;
    }
  }

  private emptyReport(): GuardianReport {
    return { checkedAt: new Date(this.now()).toISOString(), mode: this.mode, checkedIssues: 0, findings: [], unverified: [], action: 'none' };
  }

  private async check(): Promise<GuardianReport> {
    const base = `/api/companies/${this.options.companyId}`;
    const [issues, agents, runs] = await Promise.all([
      this.list<GuardianIssue>(`${base}/issues?status=in_review,todo`),
      this.list<GuardianAgent>(`${base}/agents`),
      this.list<GuardianRun>(`${base}/live-runs`)
    ]);
    const prStates = new Map<string, PrState>();
    for (const issue of issues.filter(needsPrLookup)) prStates.set(issue.id, await this.resolvePrState(issue));

    const report = this.emptyReport();
    report.checkedIssues = issues.length;
    report.findings = findStuckIssues(issues, agents, runs, prStates, this.now());
    report.unverified = issues.filter(issue => prStates.get(issue.id) === 'unknown').map(issue => issue.identifier);
    if (report.unverified.length > 0) {
      console.warn('[PaperclipGuardian] PR não verificado:', report.unverified.join(', '));
    }
    if (report.findings.length > 0) report.action = await this.handleFindings(report.findings);
    return report;
  }

  private async handleFindings(findings: GuardianFinding[]): Promise<GuardianReport['action']> {
    const now = this.now();
    const keyOf = (finding: GuardianFinding) => `${finding.issueId}:${finding.reason}`;
    const due = findings.filter(finding => now - (this.state.items[keyOf(finding)] ?? 0) >= ITEM_COOLDOWN_MS);
    if (due.length === 0 || now - this.state.lastWakeAt < MIN_WAKE_INTERVAL_MS) return 'cooldown';

    if (this.mode === 'active') {
      await this.request(`/api/routines/${GUARDIAN_ROUTINE_ID}/run`, {
        method: 'POST',
        body: JSON.stringify({ source: 'api', payload: { findings: due }, idempotencyKey: `guardian-${now}` })
      });
    }
    // Em sombra o estado também avança: o registro mostra quantas vezes a IA seria acordada.
    const items = Object.fromEntries(Object.entries(this.state.items).filter(([, at]) => now - at < ITEM_COOLDOWN_MS));
    for (const finding of due) items[keyOf(finding)] = now;
    const decision: GuardianDecision = { at: new Date(now).toISOString(), mode: this.mode, findings: due };
    this.state = { lastWakeAt: now, items, history: [decision, ...this.state.history].slice(0, HISTORY_LIMIT) };
    this.saveState();
    return this.mode === 'active' ? 'woken' : 'would_wake';
  }

  private async resolvePrState(issue: GuardianIssue): Promise<PrState> {
    try {
      const [products, comments] = await Promise.all([
        this.list<{ url?: string | null }>(`/api/issues/${issue.id}/work-products`),
        this.list<{ body?: string | null }>(`/api/issues/${issue.id}/comments`)
      ]);
      const text = [issue.description, ...products.map(item => item.url), ...comments.map(item => item.body)].join('\n');
      let failed = false;
      for (const url of extractPrUrls(text)) {
        try {
          if ((await this.lookupPr(url)) === 'OPEN') return 'open';
        } catch {
          failed = true;
        }
      }
      return failed ? 'unknown' : 'none';
    } catch (err) {
      console.warn(`[PaperclipGuardian] Falha ao consultar ${issue.identifier}:`, (err as Error).message);
      return 'unknown';
    }
  }

  private async list<T>(endpoint: string): Promise<T[]> {
    const body = await this.request(endpoint);
    if (!Array.isArray(body)) throw new Error(`Resposta inesperada de ${endpoint}`);
    return body as T[];
  }

  private async request(endpoint: string, init: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${this.options.paperclipUrl}${endpoint}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.options.apiToken || getPaperclipApiToken()}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(12_000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} em ${endpoint}`);
    return res.json();
  }

  private loadState(): void {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as Partial<GuardianState>;
      this.state = {
        lastWakeAt: Number(parsed.lastWakeAt) || 0,
        items: parsed.items ?? {},
        history: Array.isArray(parsed.history) ? parsed.history : []
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[PaperclipGuardian] Estado ilegível, recomeçando:', (err as Error).message);
      }
    }
  }

  private saveState(): void {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      fs.writeFileSync(this.statePath, JSON.stringify(this.state));
    } catch (err) {
      console.warn('[PaperclipGuardian] Falha ao salvar estado:', (err as Error).message);
    }
  }
}
