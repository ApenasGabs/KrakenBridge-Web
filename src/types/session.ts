import type { ChatMessage, AgentType, EffortLevelId, ExecutionModeId } from './chat.js';

export interface ConversationSession {
  id: string;
  agyConvId?: string;
  title: string;
  agent: AgentType;
  model: string;
  effort?: EffortLevelId;
  mode?: ExecutionModeId;
  subproject?: string;
  tags?: string[];
  createdAt: string | number;
  updatedAt: string | number;
  messages: ChatMessage[];
  isRunning?: boolean;
}

export interface SessionListItem {
  id: string;
  title: string;
  agent: string;
  model: string;
  effort?: string;
  mode?: string;
  subproject?: string;
  tags?: string[];
  createdAt: string | number;
  updatedAt: string | number;
  messageCount: number;
  lastMessageSnippet: string;
  isRunning?: boolean;
}

export interface CreateSessionPayload {
  title?: string;
  agent?: AgentType;
  model?: string;
  effort?: EffortLevelId;
  mode?: ExecutionModeId;
  subproject?: string;
  tags?: string[];
}

export interface UpdateSessionPayload {
  title?: string;
  subproject?: string;
  tags?: string[];
}
