export interface ToolCall {
  step_index?: number;
  name: string;
  command?: string;
  action?: string;
  summary?: string;
  duration?: number;
  args?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  output?: string;
  state?: 'ACTIVE' | 'RUNNING' | 'DONE' | 'ERROR';
}

export interface TurnTokens {
  input_tokens?: number;
  output_tokens?: number;
  thinking_tokens?: number;
  total_tokens?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  agent?: string;
  model?: string;
  toolCalls?: ToolCall[];
  thinking?: string;
  tokens?: TurnTokens;
  isStreaming?: boolean;
}

export interface QueuedMessage {
  id: string;
  conversationId?: string | null;
  text: string;
  timestamp: string;
  model?: string;
  subproject?: string;
  status?: 'pending' | 'sending' | 'error';
  error?: string;
}

export interface ConversationSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  agent?: string;
  model?: string;
  subproject?: string;
  tags?: string[];
  agyConvId?: string;
  chatMode?: 'agent' | 'chat';
  accountEmail?: string;
  messages?: ChatMessage[];
  lastMessageSnippet?: string;
  isRunning?: boolean;
}

export interface AccountInfo {
  email: string;
  name?: string;
  picture?: string;
  expiry?: string;
  updatedAt?: string;
  isActive: boolean;
}

export interface GithubAuthStatus {
  authenticated: boolean;
  username?: string;
  hasToken?: boolean;
}

export interface AuthStatus {
  authenticated: boolean;
  email?: string;
  name?: string;
  picture?: string;
  hasApiKey: boolean;
  isKeyValid: boolean;
  type?: string;
  github?: GithubAuthStatus;
}

export interface ModelOption {
  id: string;
  name: string;
}

export interface ModelsConfig {
  antigravity?: ModelOption[];
  claude?: ModelOption[];
  aider?: ModelOption[];
  models?: string[];
}

export interface ChatOptions {
  agent: string;
  model: string;
  effort: string;
  mode: string;
  sandbox: boolean;
  skipPermissions: boolean;
  disableSlashCommands: boolean;
  subproject: string;
  chatMode?: 'agent' | 'chat';
  accountEmail?: string;
  showQuotaBubble?: boolean;
}

export interface ProjectWorkspace {
  name: string;
  path: string;
  isGit: boolean;
}

export interface SessionUsage {
  sessionInputTokens: number;
  sessionOutputTokens: number;
  sessionThinkingTokens: number;
  sessionTotalTokens: number;
  lastTurnTokens: number;
}

export interface QuotaLimitItem {
  remaining: number;
  message?: string | null;
  resetAt?: number | null;
}

export interface QuotaModelGroup {
  title: string;
  weekly: QuotaLimitItem;
  fiveHour: QuotaLimitItem;
}

export interface QuotaWindowStats {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  count: number;
  limit?: number;
  percent?: number;
}

export interface DailyIntensityPoint {
  day: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  turnsCount: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface StatsAggregates {
  totalTokensAllTime: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalThinkingTokens: number;
  totalRecordedTurns: number;
  totalAgentTimeMs: number;
  firstEventAt: string | null;
  activeDays: number;
}

export interface QuotaStats {
  source?: string;
  lastOfficialSync?: string;
  lastFetchedAt?: string;
  gemini: QuotaModelGroup;
  claudeGpt: QuotaModelGroup;
  aggregates?: StatsAggregates;
  dailyPoints?: DailyIntensityPoint[];
  bestDay?: { day: string; totalTokens: number } | null;
  activeDays?: number;
  recentDaily?: DailyIntensityPoint[];
  workspaceBreakdown?: Record<string, { totalTokens: number; count: number }>;
  tokens?: {
    hourly: QuotaWindowStats;
    daily: QuotaWindowStats;
    weekly: QuotaWindowStats;
    modelBreakdown: Record<string, { totalTokens: number; count: number }>;
    workspaceBreakdown?: Record<string, { totalTokens: number; count: number }>;
    recentTurns: Array<{
      id: string;
      timestamp: string;
      agent: string;
      model: string;
      subproject?: string;
      durationMs?: number;
      input_tokens: number;
      output_tokens: number;
      thinking_tokens: number;
      total_tokens: number;
    }>;
    totalRecordedTurns: number;
    dailyPoints?: DailyIntensityPoint[];
    bestDay?: { day: string; totalTokens: number } | null;
    aggregates?: StatsAggregates;
  };
}

export interface McpServer {
  name: string;
  type: string;
  status: 'enabled' | 'disabled';
  commandOrUrl?: string;
  authStatus?: 'authenticated' | 'unauthenticated' | 'none';
}

export interface SlashCommand {
  command: string;
  title: string;
  description: string;
  category: 'workflow' | 'mode' | 'system';
}

