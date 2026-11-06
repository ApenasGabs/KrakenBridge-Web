export type AgentStatus = 'idle' | 'running' | 'error' | 'paused' | 'offline' | string;

export interface PaperclipAgent {
  id: string;
  companyId: string;
  name: string;
  role: string;
  title?: string;
  status: AgentStatus;
  lifecycleState?: string;
  reportsTo?: string | null;
  adapterType?: string;
  lastHeartbeatAt?: string;
  currentRunId?: string;
  currentIssueId?: string;
  currentIssueIdentifier?: string;
  currentIssueTitle?: string;
  runDurationMs?: number;
  lastError?: string;
  lastErrorDetails?: string;
  icon?: string | null;
}

export type IssueStatus = 'todo' | 'in_progress' | 'blocked' | 'in_review' | 'done' | string;
export type IssuePriority = 'low' | 'medium' | 'high' | 'critical' | string;

export interface PaperclipIssue {
  id: string;
  identifier: string; // Ex: "APE-47"
  title: string;
  description?: string;
  status: IssueStatus;
  priority: IssuePriority;
  projectId?: string;
  projectName?: string;
  parentId?: string | null;
  assigneeAgentId?: string | null;
  assigneeAgentName?: string | null;
  executionRunId?: string | null;
  activeRecoveryAction?: {
    kind: string;
    nextAction?: string;
    wakePolicy?: {
      type: string;
      reason: string;
      preservesSourceAssignee?: boolean;
    };
  } | null;
  blocks?: Array<{
    id: string;
    identifier: string;
    title: string;
    status: string;
    priority: string;
  }>;
  blockedBy?: Array<{
    id: string;
    identifier: string;
    title: string;
    status: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface PaperclipRun {
  id: string;
  companyId: string;
  agentId: string;
  issueId?: string;
  scopeKind?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | string;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number;
  error?: string | null;
  exitCode?: number | null;
  stderr?: string;
  execution?: {
    phase: string;
    cause: string;
    attempt: number;
    maxAttempts: number;
    lastConfirmedActivityAt?: string;
  };
  retryExhaustedReason?: string | null;
}

export interface PaperclipProjectProgress {
  projectId: string;
  projectName: string;
  totalIssues: number;
  completedIssues: number;
  inProgressIssues: number;
  blockedIssues: number;
  todoIssues: number;
  percentage: number;
}

export interface EnrichedPullRequest {
  number: number;
  title: string;
  url: string;
  repo: string;
  headRefName?: string;
  issueIdentifier?: string;
  ciStatus: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'UNKNOWN';
  ciWorkflowName?: string;
  ciDetailsUrl?: string;
  updatedAt?: string;
}

export type PaperclipEventType =
  | 'agent.status_changed'
  | 'run.started'
  | 'run.finished'
  | 'run.failed'
  | 'issue.status_changed'
  | 'issue.blocked'
  | 'pr.opened'
  | 'pr.merged'
  | 'ci.failed'
  | 'stall.detected';

export interface PaperclipTimelineEvent {
  id: string;
  type: PaperclipEventType;
  timestamp: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  agentName?: string;
  issueIdentifier?: string;
  issueUrl?: string;
  prUrl?: string;
  runId?: string;
  metadata?: Record<string, any>;
}

export interface DetectedStall {
  id: string;
  issueId: string;
  issueIdentifier: string;
  issueTitle: string;
  agentId: string;
  agentName: string;
  issueStatus: IssueStatus;
  lastActivityAt: string;
  inactiveMinutes: number;
  reason: string;
  recoverySuggestion?: string;
  detectedAt: string;
}

export interface PaperclipStateSnapshot {
  connected: boolean;
  lastPollAt: string;
  lastError?: string;
  companyId: string;
  paperclipUrl: string;
  agents: PaperclipAgent[];
  issues: PaperclipIssue[];
  activeRuns: PaperclipRun[];
  recentRuns: PaperclipRun[];
  projectsProgress: PaperclipProjectProgress[];
  openPrs: EnrichedPullRequest[];
  stalls: DetectedStall[];
  timeline: PaperclipTimelineEvent[];
}
