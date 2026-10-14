import type { ChildProcess } from 'child_process';
import type { Response } from 'express';

export type AgentType = 'antigravity' | 'claude' | 'aider';
export type EffortLevelId = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'default';
export type ExecutionModeId = 'default' | 'plan' | 'accept-edits';

export interface ToolCall {
  step_index?: number;
  name: string;
  command: string;
  parameters: Record<string, unknown>;
  output: string;
  duration?: number;
  state?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content?: string;
  text?: string;
  thinking?: string;
  agent?: string;
  model?: string;
  toolCalls?: ToolCall[];
  tokens?: Record<string, unknown>;
  timestamp: string | number;
}

export interface ActiveSession {
  child: ChildProcess;
  res?: Response | null;
  conversationId?: string;
  reqId?: string;
  agent?: AgentType;
  model?: string;
  startedAt?: string;
  startTime?: number;
  isStream?: boolean;
}

export interface AgentDriverArgs {
  prompt: string;
  conversationId?: string;
  agyConvId?: string | null;
  continueSession?: boolean;
  model?: string;
  effort?: string;
  mode?: string;
  sandbox?: boolean;
  skipPermissions?: boolean;
  disableSlashCommands?: boolean;
}

export interface AgentDriver {
  cmd: string;
  buildArgs: (args: AgentDriverArgs) => string[];
  buildEnv: (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
}

export interface ChatRequestBody {
  prompt: string;
  conversationId?: string;
  continueSession?: boolean;
  model?: string;
  effort?: EffortLevelId;
  mode?: ExecutionModeId;
  chatMode?: 'agent' | 'chat';
  agent?: AgentType;
  subproject?: string;
  tags?: string[];
  sandbox?: boolean;
  skipPermissions?: boolean;
  disableSlashCommands?: boolean;
  accountEmail?: string;
  force?: boolean;
}
