import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { Response } from 'express';
import { pushNotificationService } from './pushNotificationService.js';
import type {
  PaperclipAgent,
  PaperclipIssue,
  PaperclipRun,
  PaperclipProjectProgress,
  EnrichedPullRequest,
  PaperclipTimelineEvent,
  DetectedStall,
  PaperclipStateSnapshot,
  PaperclipEventType
} from '../types/paperclip.js';

const execAsync = promisify(exec);

// Constantes e URLs Padrão
const DEFAULT_PAPERCLIP_URL = 'http://192.168.31.5:3101';
const DEFAULT_COMPANY_ID = '4034eb89-a640-48d2-8b4d-f2bb0f10a119'; // APE
const DEFAULT_API_TOKEN = 'pcp_5df95fac0e950db0d8e9770214678a478ccb79d6d6ce9f3a';
const DEFAULT_GABOT_URL = 'http://192.168.31.5:3091/api/admin/notify';

// Known repos to enrich
const MONITORED_REPOSITORIES = [
  'ApenasGabs/kraken-cleanroom',
  'ApenasGabs/KrakenBridge-Web',
  'ApenasGabs/status-hub',
  'ApenasGabs/paperclip'
];

interface FailureTracker {
  count: number;
  firstFailedAt: number;
  lastFailedAt: number;
  reported: boolean;
}

export class PaperclipService {
  private paperclipUrl: string;
  private companyId: string;
  private apiToken: string;
  private gabotWebhookUrl: string;
  private gabotWebhookSecret: string;

  private pollIntervalMs = 35000; // 35 segundos
  private pollTimer: NodeJS.Timeout | null = null;
  private initialPollTimeout: NodeJS.Timeout | null = null;
  private isPolling = false;

  // SSE Clients
  private sseClients: Set<Response> = new Set();

  // Memória de estado
  private snapshot: PaperclipStateSnapshot;
  private previousAgentStatus: Map<string, string> = new Map();
  private previousIssueStatus: Map<string, string> = new Map();
  private previousPrCiStatus: Map<string, string> = new Map();
  private recentFailureRuns: Map<string, FailureTracker> = new Map();

  // Deduplicação de alertas (alertKey -> timestamp de envio)
  private alertDebounceMap: Map<string, number> = new Map();
  private readonly ALERT_DEBOUNCE_MS = 20 * 60 * 1000; // 20 minutos

  constructor() {
    this.paperclipUrl = (process.env.PAPERCLIP_URL || process.env.PAPERCLIP_API_URL || DEFAULT_PAPERCLIP_URL).replace(/\/+$/, '');
    this.companyId = process.env.PAPERCLIP_COMPANY_ID || DEFAULT_COMPANY_ID;
    this.apiToken = process.env.PAPERCLIP_API_TOKEN || DEFAULT_API_TOKEN;
    this.gabotWebhookUrl = process.env.GABOT_WEBHOOK_URL || DEFAULT_GABOT_URL;
    this.gabotWebhookSecret = process.env.GABOT_WEBHOOK_SECRET || this.tryReadGabotSecretFromStatusHub();

    this.snapshot = {
      connected: false,
      lastPollAt: new Date(0).toISOString(),
      companyId: this.companyId,
      paperclipUrl: this.paperclipUrl,
      agents: [],
      issues: [],
      activeRuns: [],
      recentRuns: [],
      projectsProgress: [],
      openPrs: [],
      stalls: [],
      timeline: []
    };

    if (process.env.NODE_ENV !== 'test') {
      this.startBackgroundPolling();
    }
  }

  /**
   * Tenta recuperar GABOT_WEBHOOK_SECRET de /workspace/status-hub/.env caso não tenha sido injetado via env
   */
  private tryReadGabotSecretFromStatusHub(): string {
    const candidatePaths = [
      path.resolve('/workspace/status-hub/.env'),
      path.resolve('../status-hub/.env'),
      path.resolve('.env')
    ];

    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf-8');
          const match = content.match(/GABOT_WEBHOOK_SECRET\s*=\s*([^\r\n]+)/);
          if (match && match[1]) {
            const secret = match[1].trim().replace(/^["']|["']$/g, '');
            if (secret) return secret;
          }
        }
      } catch {}
    }
    return '';
  }

  /**
   * Helper para chamadas autenticadas na API do Paperclip
   */
  private async fetchPaperclip<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.paperclipUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiToken}`,
      'Accept': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    const res = await fetch(url, {
      ...options,
      headers,
      signal: AbortSignal.timeout(12000)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Paperclip API HTTP ${res.status} [${url}]: ${errText.slice(0, 200)}`);
    }

    return (await res.json()) as T;
  }

  /**
   * Inicia o ciclo de background polling
   */
  public startBackgroundPolling() {
    if (this.pollTimer || this.initialPollTimeout) return;
    // Executa primeira busca em 1s
    this.initialPollTimeout = setTimeout(() => {
      this.initialPollTimeout = null;
      this.poll().catch(err => {
        console.warn('[PaperclipService] Aviso no primeiro poll:', (err as Error).message);
      });
    }, 1000);
    this.initialPollTimeout.unref();

    this.pollTimer = setInterval(() => {
      this.poll().catch(err => {
        console.warn('[PaperclipService] Erro no polling de rotina:', (err as Error).message);
      });
    }, this.pollIntervalMs);
    this.pollTimer.unref();
  }

  public stopBackgroundPolling() {
    if (this.initialPollTimeout) {
      clearTimeout(this.initialPollTimeout);
      this.initialPollTimeout = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Retorna o snapshot atual da memória
   */
  public getSnapshot(): PaperclipStateSnapshot {
    return this.snapshot;
  }

  /**
   * Adiciona um novo evento na timeline e faz o broadcast via SSE
   */
  public addTimelineEvent(event: Omit<PaperclipTimelineEvent, 'id'>): PaperclipTimelineEvent {
    const fullEvent: PaperclipTimelineEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      ...event
    };

    // Prepend mantendo os últimos 100 eventos
    this.snapshot.timeline = [fullEvent, ...this.snapshot.timeline.slice(0, 99)];

    // Broadcast para clientes conectados
    this.broadcastSSE('paperclip_event', fullEvent);

    return fullEvent;
  }

  /**
   * Ciclo principal de sincronização e detecção
   */
  public async poll(): Promise<PaperclipStateSnapshot> {
    if (this.isPolling) return this.snapshot;
    this.isPolling = true;

    try {
      const now = new Date().toISOString();

      // 1. Busca Agentes
      const rawAgents = await this.fetchPaperclip<any[]>(`/api/companies/${this.companyId}/agents`).catch(() => []);
      
      // 2. Busca Issues
      const rawIssues = await this.fetchPaperclip<any[]>(`/api/companies/${this.companyId}/issues`).catch(() => []);

      // 3. Busca Heartbeat Runs (últimas 25)
      const rawRuns = await this.fetchPaperclip<any[]>(`/api/companies/${this.companyId}/heartbeat-runs?limit=25`).catch(() => []);

      // 4. Busca Live Runs (execuções ativas agora)
      const rawLiveRuns = await this.fetchPaperclip<any[]>(`/api/companies/${this.companyId}/live-runs`).catch(() => []);

      // 5. Busca PRs dos repositórios monitorados
      const openPrs = await this.fetchEnrichedPRs();

      // Normaliza agentes
      const agents: PaperclipAgent[] = rawAgents.map(a => {
        // Encontra run atual se o agente estiver em live runs
        const activeRun = rawLiveRuns.find(r => r.agentId === a.id);
        const lastRun = rawRuns.find(r => r.agentId === a.id);
        const assignedIssue = a.currentIssueId ? rawIssues.find(i => i.id === a.currentIssueId) : undefined;

        // Desmascara erro real
        let realError = a.lastError || null;
        let realErrorDetails: string | undefined = undefined;

        if (a.status === 'error' && lastRun?.status === 'failed') {
          realError = lastRun.execution?.cause || lastRun.error || 'Falha na execução';
          realErrorDetails = lastRun.resultJson?.stderr || lastRun.stderr || lastRun.error || lastRun.retryExhaustedReason;
        }

        return {
          id: a.id,
          companyId: a.companyId,
          name: a.name || 'Agente Desconhecido',
          role: a.role || 'worker',
          title: a.title || '',
          status: a.status || 'idle',
          lifecycleState: a.lifecycleState,
          reportsTo: a.reportsTo,
          adapterType: a.adapterType,
          lastHeartbeatAt: a.lastHeartbeatAt || lastRun?.finishedAt || lastRun?.startedAt,
          currentRunId: activeRun?.id,
          currentIssueId: activeRun?.issueId || a.currentIssueId,
          currentIssueIdentifier: assignedIssue?.identifier,
          currentIssueTitle: assignedIssue?.title,
          runDurationMs: activeRun?.startedAt ? Date.now() - new Date(activeRun.startedAt).getTime() : undefined,
          lastError: realError,
          lastErrorDetails: realErrorDetails,
          icon: a.icon
        };
      });

      // Normaliza issues
      const issues: PaperclipIssue[] = rawIssues.map(i => {
        const assignedAgent = agents.find(ag => ag.id === i.assigneeAgentId);
        return {
          id: i.id,
          identifier: i.identifier || `APE-${i.id.slice(0, 4)}`,
          title: i.title || 'Sem Título',
          description: i.description,
          status: i.status || 'todo',
          priority: i.priority || 'medium',
          projectId: i.projectId,
          projectName: i.project?.name,
          parentId: i.parentId,
          assigneeAgentId: i.assigneeAgentId,
          assigneeAgentName: assignedAgent?.name,
          executionRunId: i.executionRunId,
          activeRecoveryAction: i.activeRecoveryAction,
          blocks: i.blocks,
          blockedBy: i.blockedBy,
          createdAt: i.createdAt,
          updatedAt: i.updatedAt
        };
      });

      // Normaliza runs
      const recentRuns: PaperclipRun[] = rawRuns.map(r => ({
        id: r.id,
        companyId: r.companyId,
        agentId: r.agentId,
        issueId: r.issueId,
        scopeKind: r.scopeKind,
        status: r.status,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        durationMs: r.finishedAt && r.startedAt ? new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime() : undefined,
        error: r.error,
        exitCode: r.exitCode,
        stderr: r.resultJson?.stderr || r.stderr,
        execution: r.execution,
        retryExhaustedReason: r.retryExhaustedReason
      }));

      const activeRuns: PaperclipRun[] = rawLiveRuns.map(r => ({
        id: r.id,
        companyId: r.companyId,
        agentId: r.agentId,
        issueId: r.issueId,
        status: r.status || 'running',
        startedAt: r.startedAt,
        finishedAt: null
      }));

      // Progresso dos Projetos / Épicos
      const projectsProgress = this.calculateProjectProgress(issues);

      // Detector de Stalls (Inatividade > 30 min sem run em issue atribuída ou agente sem heartbeat > 60 min)
      const detectedStalls = this.detectStalls(issues, agents, activeRuns, recentRuns);

      // Atualiza o snapshot
      this.snapshot = {
        connected: true,
        lastPollAt: now,
        companyId: this.companyId,
        paperclipUrl: this.paperclipUrl,
        agents,
        issues,
        activeRuns,
        recentRuns,
        projectsProgress,
        openPrs,
        stalls: detectedStalls,
        timeline: this.snapshot.timeline
      };

      // Dispara detecção de transições de eventos e notificações
      await this.processEventTransitions(agents, issues, openPrs, recentRuns, detectedStalls);

      // Notifica todos os SSE clients conectados com o snapshot atualizado
      this.broadcastSSE('status', this.snapshot);

    } catch (err: any) {
      this.snapshot.connected = false;
      this.snapshot.lastError = err?.message || String(err);
      console.warn('[PaperclipService] Falha ao sincronizar com Paperclip:', this.snapshot.lastError);
      this.broadcastSSE('error', { message: this.snapshot.lastError });
    } finally {
      this.isPolling = false;
    }

    return this.snapshot;
  }

  /**
   * Busca e enriquece Pull Requests e status do CI via GitHub CLI
   */
  private async fetchEnrichedPRs(): Promise<EnrichedPullRequest[]> {
    const enrichedList: EnrichedPullRequest[] = [];

    for (const repo of MONITORED_REPOSITORIES) {
      try {
        const cmd = `gh pr list --repo "${repo}" --state open --json number,title,url,headRefName,statusCheckRollup,updatedAt`;
        const { stdout } = await execAsync(cmd, { timeout: 10000 });
        if (!stdout.trim()) continue;

        const prs = JSON.parse(stdout);
        for (const pr of prs) {
          let ciStatus: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'UNKNOWN' = 'UNKNOWN';
          let workflowName: string | undefined = undefined;
          let detailsUrl: string | undefined = undefined;

          if (Array.isArray(pr.statusCheckRollup) && pr.statusCheckRollup.length > 0) {
            const hasFailure = pr.statusCheckRollup.some((c: any) => c.conclusion === 'FAILURE');
            const hasPending = pr.statusCheckRollup.some((c: any) => c.status !== 'COMPLETED' || !c.conclusion);
            const allSuccess = pr.statusCheckRollup.every((c: any) => c.conclusion === 'SUCCESS');

            if (hasFailure) {
              ciStatus = 'FAILURE';
              const failCheck = pr.statusCheckRollup.find((c: any) => c.conclusion === 'FAILURE');
              workflowName = failCheck?.name || failCheck?.workflowName;
              detailsUrl = failCheck?.detailsUrl;
            } else if (hasPending) {
              ciStatus = 'PENDING';
            } else if (allSuccess) {
              ciStatus = 'SUCCESS';
            }
          }

          // Extrai identificador da issue (ex: F0-05, APE-47, #141)
          const issueMatch = pr.title.match(/\b(APE-\d+|F\d+-\d+|#\d+)\b/i) ||
                             pr.headRefName?.match(/\b(APE-\d+|F\d+-\d+|#\d+)\b/i);

          enrichedList.push({
            number: pr.number,
            title: pr.title,
            url: pr.url,
            repo,
            headRefName: pr.headRefName,
            issueIdentifier: issueMatch ? issueMatch[1].toUpperCase() : undefined,
            ciStatus,
            ciWorkflowName: workflowName,
            ciDetailsUrl: detailsUrl,
            updatedAt: pr.updatedAt
          });
        }
      } catch {
        // Ignora repositórios sem permissão ou sem PRs
      }
    }

    return enrichedList;
  }

  /**
   * Calcula o progresso por projeto / épico
   */
  private calculateProjectProgress(issues: PaperclipIssue[]): PaperclipProjectProgress[] {
    const map = new Map<string, { total: number; done: number; inProgress: number; blocked: number; todo: number; name: string }>();

    for (const issue of issues) {
      const pId = issue.projectId || 'general';
      const pName = issue.projectName || 'Geral / Outros';

      if (!map.has(pId)) {
        map.set(pId, { total: 0, done: 0, inProgress: 0, blocked: 0, todo: 0, name: pName });
      }

      const current = map.get(pId)!;
      current.total++;

      if (issue.status === 'done') current.done++;
      else if (issue.status === 'in_progress') current.inProgress++;
      else if (issue.status === 'blocked') current.blocked++;
      else current.todo++;
    }

    const result: PaperclipProjectProgress[] = [];
    for (const [projectId, stats] of map.entries()) {
      const percentage = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
      result.push({
        projectId,
        projectName: stats.name,
        totalIssues: stats.total,
        completedIssues: stats.done,
        inProgressIssues: stats.inProgress,
        blockedIssues: stats.blocked,
        todoIssues: stats.todo,
        percentage
      });
    }

    return result;
  }

  /**
   * Detector de Stalls:
   * - Issue in_progress ou todo atribuída a agente sem run há mais de 30 minutos
   * - Issue marcada com activeRecoveryAction (ex: stranded_assigned_issue / lost wake)
   * - Agente sem heartbeat há mais de 60 minutos com trabalho atribuído
   */
  public detectStalls(
    issues: PaperclipIssue[],
    agents: PaperclipAgent[],
    activeRuns: PaperclipRun[],
    recentRuns: PaperclipRun[]
  ): DetectedStall[] {
    const stalls: DetectedStall[] = [];
    const now = Date.now();
    const STALL_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutos
    const AGENT_HEARTBEAT_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutos

    for (const issue of issues) {
      if (issue.status === 'done' || issue.status === 'cancelled') continue;

      // Se a issue tem recovery action de issue stranded, stall direto
      if (issue.activeRecoveryAction && issue.activeRecoveryAction.kind === 'stranded_assigned_issue') {
        const agent = agents.find(a => a.id === issue.assigneeAgentId);
        const lastRun = recentRuns.find(r => r.issueId === issue.id);
        const refTime = lastRun?.finishedAt || issue.updatedAt || issue.createdAt;
        const inactiveMin = Math.round((now - new Date(refTime).getTime()) / 60000);

        stalls.push({
          id: `stall-rec-${issue.id}`,
          issueId: issue.id,
          issueIdentifier: issue.identifier,
          issueTitle: issue.title,
          agentId: issue.assigneeAgentId || '',
          agentName: agent?.name || 'Agente Atribuído',
          issueStatus: issue.status,
          lastActivityAt: refTime,
          inactiveMinutes: Math.max(inactiveMin, 30),
          reason: 'Lost wake / stranded assigned issue detectado pelo supervisor do Paperclip',
          recoverySuggestion: issue.activeRecoveryAction.nextAction || 'Inspecione as evidências do run, libere o agente e retente o despacho.',
          detectedAt: new Date().toISOString()
        });
        continue;
      }

      // Se está atribuída (in_progress ou todo com agente)
      if (issue.assigneeAgentId && (issue.status === 'in_progress' || issue.status === 'todo')) {
        const isRunActive = activeRuns.some(r => r.issueId === issue.id || r.agentId === issue.assigneeAgentId);
        if (isRunActive) continue;

        // Verifica a última atividade (último run concluído ou updatedAt da issue)
        const lastRun = recentRuns.find(r => r.issueId === issue.id || r.agentId === issue.assigneeAgentId);
        const lastActivity = lastRun?.finishedAt || lastRun?.startedAt || issue.updatedAt || issue.createdAt;
        const diffMs = now - new Date(lastActivity).getTime();

        if (diffMs > STALL_THRESHOLD_MS) {
          const agent = agents.find(a => a.id === issue.assigneeAgentId);
          const inactiveMinutes = Math.round(diffMs / 60000);

          stalls.push({
            id: `stall-${issue.id}`,
            issueId: issue.id,
            issueIdentifier: issue.identifier,
            issueTitle: issue.title,
            agentId: issue.assigneeAgentId,
            agentName: agent?.name || 'Agente Atribuído',
            issueStatus: issue.status,
            lastActivityAt: lastActivity,
            inactiveMinutes,
            reason: `Issue atribuída em status '${issue.status}' sem execuções ativas há ${inactiveMinutes} min`,
            recoverySuggestion: `Disparar wakeup para o agente ${agent?.name || 'responsável'} ou reatribuir a issue.`,
            detectedAt: new Date().toISOString()
          });
        }
      }
    }

    // Checagem de agentes sem heartbeat há mais de 60 min
    for (const agent of agents) {
      if (agent.lastHeartbeatAt) {
        const heartbeatAgeMs = now - new Date(agent.lastHeartbeatAt).getTime();
        if (heartbeatAgeMs > AGENT_HEARTBEAT_THRESHOLD_MS) {
          // Verifica se o agente possui issues atribuídas pendentes
          const hasPendingWork = issues.some(i => i.assigneeAgentId === agent.id && (i.status === 'in_progress' || i.status === 'todo'));
          if (hasPendingWork) {
            const inactiveMinutes = Math.round(heartbeatAgeMs / 60000);
            stalls.push({
              id: `stall-agent-${agent.id}`,
              issueId: '',
              issueIdentifier: 'AGENT',
              issueTitle: `Agente ${agent.name} sem batimento cardíaco`,
              agentId: agent.id,
              agentName: agent.name,
              issueStatus: agent.status,
              lastActivityAt: agent.lastHeartbeatAt,
              inactiveMinutes,
              reason: `Agente com tarefas atribuídas sem heartbeat há ${inactiveMinutes} min (esperado < 60 min)`,
              recoverySuggestion: `Verifique o contêiner e o adapter do agente ${agent.name}.`,
              detectedAt: new Date().toISOString()
            });
          }
        }
      }
    }

    return stalls;
  }

  /**
   * Processa transições de estado, emite eventos para a timeline e dispara notificações
   */
  private async processEventTransitions(
    agents: PaperclipAgent[],
    issues: PaperclipIssue[],
    prs: EnrichedPullRequest[],
    recentRuns: PaperclipRun[],
    stalls: DetectedStall[]
  ) {
    // 1. Transição de status de Agentes
    for (const agent of agents) {
      const prevStatus = this.previousAgentStatus.get(agent.id);
      if (prevStatus !== undefined && prevStatus !== agent.status) {
        const isError = agent.status === 'error';
        const event = this.addTimelineEvent({
          type: 'agent.status_changed',
          timestamp: new Date().toISOString(),
          title: `Agente ${agent.name} mudou para ${agent.status.toUpperCase()}`,
          description: isError 
            ? `Erro: ${agent.lastError || 'Falha no adapter'}${agent.lastErrorDetails ? `\nDetalhes: ${agent.lastErrorDetails.slice(0, 150)}` : ''}`
            : `Status alterado de ${prevStatus} para ${agent.status}`,
          severity: isError ? 'error' : 'info',
          agentName: agent.name
        });

        if (isError) {
          await this.notifyAlert({
            key: `agent-error-${agent.id}`,
            severity: 'red',
            title: `🔴 Agente ${agent.name} entrou em ERRO`,
            body: `O agente ${agent.name} falhou: ${agent.lastError || 'adapter_failed'}.`,
            linkPaperclip: `${this.paperclipUrl}/APE/agents/${agent.id}`
          });
        }
      }
      this.previousAgentStatus.set(agent.id, agent.status);
    }

    // 2. Transição de status de Issues
    for (const issue of issues) {
      const prevStatus = this.previousIssueStatus.get(issue.id);
      if (prevStatus !== undefined && prevStatus !== issue.status) {
        const isBlocked = issue.status === 'blocked';
        const isDone = issue.status === 'done';

        this.addTimelineEvent({
          type: isBlocked ? 'issue.blocked' : 'issue.status_changed',
          timestamp: new Date().toISOString(),
          title: `Issue ${issue.identifier} ${isBlocked ? 'BLOQUEADA' : `movida para ${issue.status}`}`,
          description: `${issue.title}${issue.activeRecoveryAction?.nextAction ? ` (${issue.activeRecoveryAction.nextAction})` : ''}`,
          severity: isBlocked ? 'warning' : isDone ? 'success' : 'info',
          issueIdentifier: issue.identifier,
          issueUrl: `${this.paperclipUrl}/APE/issues/${issue.identifier}`
        });

        if (isBlocked) {
          await this.notifyAlert({
            key: `issue-blocked-${issue.id}`,
            severity: 'yellow',
            title: `🟠 Issue ${issue.identifier} BLOQUEADA`,
            body: `A issue ${issue.identifier} (${issue.title}) foi bloqueada.\nMotivo: ${issue.activeRecoveryAction?.nextAction || 'Aguardando dependência'}`,
            linkPaperclip: `${this.paperclipUrl}/APE/issues/${issue.identifier}`
          });
        } else if (isDone && (issue.title.toLowerCase().includes('epic') || issue.identifier === 'APE-41')) {
          await this.notifyAlert({
            key: `epic-done-${issue.id}`,
            severity: 'green',
            title: `🟢 Épico Concluído: ${issue.identifier}`,
            body: `O épico ${issue.identifier} (${issue.title}) foi 100% concluído com sucesso!`,
            linkPaperclip: `${this.paperclipUrl}/APE/issues/${issue.identifier}`
          });
        }
      }
      this.previousIssueStatus.set(issue.id, issue.status);
    }

    // 3. Checagem de Falhas de Run (com agrupamento: 3 falhas em 10 min = 1 alerta)
    for (const run of recentRuns) {
      if (run.status === 'failed') {
        const trackerKey = `agent-run-fail-${run.agentId}`;
        const now = Date.now();
        const tracker = this.recentFailureRuns.get(trackerKey) || {
          count: 0,
          firstFailedAt: now,
          lastFailedAt: now,
          reported: false
        };

        if (now - tracker.firstFailedAt > 10 * 60 * 1000) {
          // Reset window
          tracker.count = 1;
          tracker.firstFailedAt = now;
          tracker.lastFailedAt = now;
          tracker.reported = false;
        } else {
          tracker.count++;
          tracker.lastFailedAt = now;
        }

        this.recentFailureRuns.set(trackerKey, tracker);

        if (tracker.count >= 3 && !tracker.reported) {
          tracker.reported = true;
          const agent = agents.find(a => a.id === run.agentId);
          await this.notifyAlert({
            key: `grouped-run-fail-${run.agentId}`,
            severity: 'red',
            title: `🔴 Múltiplas Falhas Consecutivas (${agent?.name || 'Agente'})`,
            body: `O agente ${agent?.name} acumulou ${tracker.count} falhas de run em menos de 10 min.\nÚltimo erro: ${run.execution?.cause || run.error || 'adapter_failed'}`,
            linkPaperclip: `${this.paperclipUrl}/APE/runs/${run.id}`
          });
        }
      }
    }

    // 4. Stalls Detectados
    for (const stall of stalls) {
      const alertKey = `stall-${stall.id}`;
      // Emite evento na timeline se não estiver registrado recentemente
      const alreadyInTimeline = this.snapshot.timeline.some(t => t.type === 'stall.detected' && t.issueIdentifier === stall.issueIdentifier);
      if (!alreadyInTimeline) {
        this.addTimelineEvent({
          type: 'stall.detected',
          timestamp: new Date().toISOString(),
          title: `⚠️ Stall Detectado: ${stall.issueIdentifier}`,
          description: `${stall.issueTitle} atribuída a ${stall.agentName} parada há ${stall.inactiveMinutes} min. ${stall.reason}`,
          severity: 'warning',
          agentName: stall.agentName,
          issueIdentifier: stall.issueIdentifier,
          issueUrl: stall.issueId ? `${this.paperclipUrl}/APE/issues/${stall.issueIdentifier}` : undefined
        });
      }

      await this.notifyAlert({
        key: alertKey,
        severity: 'yellow',
        title: `🟠 Stall Detectado: ${stall.issueIdentifier} (${stall.inactiveMinutes} min parado)`,
        body: `A tarefa ${stall.issueIdentifier} atribuída ao ${stall.agentName} está sem atividade há ${stall.inactiveMinutes} min.\nMotivo: ${stall.reason}\nAção sugerida: ${stall.recoverySuggestion || 'Acordar agente'}`,
        linkPaperclip: stall.issueId ? `${this.paperclipUrl}/APE/issues/${stall.issueIdentifier}` : undefined
      });
    }

    // 5. CI do GitHub
    for (const pr of prs) {
      const prevCi = this.previousPrCiStatus.get(pr.url);
      if (prevCi !== undefined && prevCi !== pr.ciStatus) {
        if (pr.ciStatus === 'FAILURE') {
          this.addTimelineEvent({
            type: 'ci.failed',
            timestamp: new Date().toISOString(),
            title: `CI com Falha no PR #${pr.number} (${pr.repo})`,
            description: `${pr.title} - Workflow: ${pr.ciWorkflowName || 'CI'}.`,
            severity: 'error',
            prUrl: pr.url
          });

          await this.notifyAlert({
            key: `ci-fail-${pr.repo}-${pr.number}`,
            severity: 'yellow',
            title: `🟠 CI com Falha no PR #${pr.number} (${pr.repo})`,
            body: `O CI do PR #${pr.number} (${pr.title}) falhou na verificação.\nWorkflow: ${pr.ciWorkflowName || 'CI'}\nDetalhes: ${pr.ciDetailsUrl || pr.url}`,
            linkPr: pr.url
          });
        }
      }
      this.previousPrCiStatus.set(pr.url, pr.ciStatus);
    }
  }

  /**
   * Dispara notificação in-app (PWA) e WhatsApp com deduplicação e link direto
   */
  public async notifyAlert(options: {
    key: string;
    severity: 'red' | 'yellow' | 'green';
    title: string;
    body: string;
    linkPaperclip?: string;
    linkPr?: string;
    force?: boolean;
  }): Promise<{ sent: boolean; deduped: boolean }> {
    const now = Date.now();
    const lastSent = this.alertDebounceMap.get(options.key) || 0;

    if (!options.force && now - lastSent < this.ALERT_DEBOUNCE_MS) {
      return { sent: false, deduped: true };
    }

    this.alertDebounceMap.set(options.key, now);

    // 1. In-App Web Push Notification
    try {
      await pushNotificationService.sendPushNotification({
        title: options.title,
        body: options.body,
        data: {
          url: options.linkPaperclip || options.linkPr || '/status'
        }
      });
    } catch (err) {
      console.warn('[PaperclipService] Falha ao enviar Web Push in-app:', (err as Error).message);
    }

    // 2. Notificação no WhatsApp Grupo ADM via G_aBot
    if (this.gabotWebhookUrl && this.gabotWebhookSecret) {
      try {
        const textParts = [
          options.title,
          '',
          options.body,
          ''
        ];

        if (options.linkPaperclip) {
          textParts.push(`📌 Paperclip: ${options.linkPaperclip}`);
        }
        if (options.linkPr) {
          textParts.push(`🔀 GitHub PR: ${options.linkPr}`);
        }

        const payload = {
          severity: options.severity,
          onlyImportant: true,
          force: true,
          text: textParts.join('\n')
        };

        const res = await fetch(this.gabotWebhookUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.gabotWebhookSecret}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000)
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.warn(`[PaperclipService] G_aBot WhatsApp HTTP ${res.status}:`, errText);
        }
      } catch (err) {
        console.warn('[PaperclipService] Erro ao despachar WhatsApp via G_aBot:', (err as Error).message);
      }
    }

    return { sent: true, deduped: false };
  }

  /**
   * Registra cliente SSE para transmissão ao vivo
   */
  public registerSSEClient(res: Response) {
    this.sseClients.add(res);

    // Envia snapshot inicial
    res.write(`event: status\ndata: ${JSON.stringify(this.snapshot)}\n\n`);

    res.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  /**
   * Broadcast seguro para todos os clientes conectados via SSE
   */
  private broadcastSSE(event: string, data: any) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        if (!client.writableEnded && !client.destroyed) {
          client.write(message);
        }
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  /**
   * Simula um evento para testes e validação de critérios de aceite
   */
  public async simulateEvent(type: 'error' | 'blocked' | 'stall' | 'ci_failed', customData?: any) {
    if (type === 'error') {
      const event = this.addTimelineEvent({
        type: 'agent.status_changed',
        timestamp: new Date().toISOString(),
        title: '🔴 Simulação: Agente Kraken Forge em ERRO',
        description: 'Erro simulado: adapter_failed (RESOURCE_EXHAUSTED 429)',
        severity: 'error',
        agentName: 'Kraken Forge'
      });

      await this.notifyAlert({
        key: `sim-error-${Date.now()}`,
        severity: 'red',
        title: '🔴 [SIMULAÇÃO] Agente Kraken Forge em ERRO',
        body: 'Kraken Forge entrou em status ERROR por esgotamento de quota ou falha no adapter.',
        linkPaperclip: `${this.paperclipUrl}/APE/agents/fb0ad346-e4b6-42dc-a3fa-ec26d43454d1`,
        force: true
      });

      return event;
    }

    if (type === 'blocked') {
      const event = this.addTimelineEvent({
        type: 'issue.blocked',
        timestamp: new Date().toISOString(),
        title: '🟠 Simulação: Issue APE-47 BLOQUEADA',
        description: 'Issue bloqueada por lost wake e dependência travada.',
        severity: 'warning',
        issueIdentifier: 'APE-47',
        issueUrl: `${this.paperclipUrl}/APE/issues/APE-47`
      });

      await this.notifyAlert({
        key: `sim-blocked-${Date.now()}`,
        severity: 'yellow',
        title: '🟠 [SIMULAÇÃO] Issue APE-47 BLOQUEADA',
        body: 'A issue APE-47 foi movida para BLOCKED após falha consecutiva.',
        linkPaperclip: `${this.paperclipUrl}/APE/issues/APE-47`,
        force: true
      });

      return event;
    }

    if (type === 'stall') {
      const event = this.addTimelineEvent({
        type: 'stall.detected',
        timestamp: new Date().toISOString(),
        title: '🟠 Simulação: Stall Detectado em APE-47',
        description: 'Issue in_progress atribuída a Kraken Forge sem run há mais de 30 min.',
        severity: 'warning',
        issueIdentifier: 'APE-47',
        agentName: 'Kraken Forge'
      });

      await this.notifyAlert({
        key: `sim-stall-${Date.now()}`,
        severity: 'yellow',
        title: '🟠 [SIMULAÇÃO] Stall Detectado no Paperclip: APE-47',
        body: 'Issue APE-47 atribuída sem run há mais de 35 min.',
        linkPaperclip: `${this.paperclipUrl}/APE/issues/APE-47`,
        force: true
      });

      return event;
    }

    return null;
  }

  /**
   * Gera o relatório resumo estruturado para o comando de chat /paperclip status
   */
  public getPaperclipSummary(): string {
    const { agents, issues, stalls, openPrs, projectsProgress, connected, lastPollAt } = this.snapshot;

    const lines: string[] = [];
    lines.push(`## 📎 Status em Tempo Real do Paperclip`);
    lines.push(`> **Conexão:** ${connected ? '🟢 Online' : '🔴 Desconectado'} | **Atualizado:** ${new Date(lastPollAt).toLocaleTimeString('pt-BR')} | **Servidor:** \`${this.paperclipUrl}\`\n`);

    // 1. Agentes
    lines.push(`### 🤖 Esquadrão de Agentes`);
    if (agents.length === 0) {
      lines.push(`_Nenhum agente retornado pelo Paperclip._`);
    } else {
      for (const a of agents) {
        const icon = a.status === 'running' ? '🔵' : a.status === 'error' ? '🔴' : '🟢';
        let detail = `**${icon} ${a.name}** (\`${a.role}\`): status **${a.status.toUpperCase()}**`;
        if (a.currentIssueIdentifier) {
          detail += ` — Executando **${a.currentIssueIdentifier}** (${a.currentIssueTitle || ''})`;
        }
        if (a.status === 'error' && a.lastError) {
          detail += `\n   ⚠️ _Erro real:_ \`${a.lastError}\``;
        }
        lines.push(`- ${detail}`);
      }
    }
    lines.push('');

    // 2. Stalls Críticos
    if (stalls.length > 0) {
      lines.push(`### ⚠️ Stalls e Travamentos Detectados`);
      for (const s of stalls) {
        lines.push(`- 🟠 **${s.issueIdentifier}** (${s.agentName}): parado há **${s.inactiveMinutes} min**.`);
        lines.push(`  - _Motivo:_ ${s.reason}`);
        if (s.recoverySuggestion) {
          lines.push(`  - _Sugestão:_ ${s.recoverySuggestion}`);
        }
      }
      lines.push('');
    }

    // 3. Progresso dos Épicos e Projetos
    if (projectsProgress.length > 0) {
      lines.push(`### 📊 Progresso dos Projetos & Épicos`);
      for (const p of projectsProgress) {
        lines.push(`- **${p.projectName}**: **${p.completedIssues}/${p.totalIssues}** issues (${p.percentage}%) | Andamento: ${p.inProgressIssues} | Bloqueadas: ${p.blockedIssues}`);
      }
      lines.push('');
    }

    // 4. Issues Bloqueadas & Em Andamento
    const inProgress = issues.filter(i => i.status === 'in_progress');
    const blocked = issues.filter(i => i.status === 'blocked');

    if (inProgress.length > 0 || blocked.length > 0) {
      lines.push(`### 📋 Issues em Destaque`);
      if (inProgress.length > 0) {
        lines.push(`**Em Andamento:**`);
        for (const i of inProgress) {
          lines.push(`- [${i.identifier}](${this.paperclipUrl}/APE/issues/${i.identifier}) — ${i.title} (${i.assigneeAgentName || 'Sem agente'})`);
        }
      }
      if (blocked.length > 0) {
        lines.push(`**Bloqueadas:**`);
        for (const i of blocked) {
          lines.push(`- 🚫 [${i.identifier}](${this.paperclipUrl}/APE/issues/${i.identifier}) — ${i.title} (${i.activeRecoveryAction?.nextAction || 'Dependência pendente'})`);
        }
      }
      lines.push('');
    }

    // 5. Pull Requests & CI
    if (openPrs.length > 0) {
      lines.push(`### 🔀 Pull Requests & Estado do CI`);
      for (const pr of openPrs) {
        const ciIcon = pr.ciStatus === 'SUCCESS' ? '🟢' : pr.ciStatus === 'FAILURE' ? '🔴' : '🟡';
        lines.push(`- [PR #${pr.number} (${pr.repo})](${pr.url}): ${pr.title}`);
        lines.push(`  - Estado do CI: ${ciIcon} **${pr.ciStatus}** ${pr.ciWorkflowName ? `(${pr.ciWorkflowName})` : ''}`);
      }
      lines.push('');
    }

    lines.push(`💡 _Dica: Você pode visualizar os painéis completos na aba **Status > Paperclip Live** ou consultar a timeline de eventos ao vivo._`);

    return lines.join('\n');
  }
}

export const paperclipService = new PaperclipService();
