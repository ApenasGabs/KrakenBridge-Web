export interface ToolCall {
  name: string;
  command?: string;
  duration?: number;
  args?: Record<string, unknown>;
  output?: string;
  state?: 'RUNNING' | 'DONE' | 'ERROR';
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

export interface ConversationSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  agent?: string;
  model?: string;
  subproject?: string;
  agyConvId?: string;
  messages?: ChatMessage[];
  lastMessageSnippet?: string;
}

export interface AuthStatus {
  authenticated: boolean;
  email?: string;
  hasApiKey: boolean;
  isKeyValid: boolean;
  type?: string;
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

export interface QuotaWindowStats {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  count: number;
  limit?: number;
  percent?: number;
}

export interface QuotaStats {
  hourly: QuotaWindowStats;
  daily: QuotaWindowStats;
  weekly: QuotaWindowStats;
  modelBreakdown: Record<string, { totalTokens: number; count: number }>;
  recentTurns: Array<{
    id: string;
    timestamp: string;
    agent: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    thinking_tokens: number;
    total_tokens: number;
  }>;
  totalRecordedTurns: number;
}
