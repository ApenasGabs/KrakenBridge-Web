export interface ModelQuotaBucket {
  percentage: number;
  resetTimeText?: string | null;
  limitMinutes?: number;
}

export interface ModelQuotaGroup {
  fiveHour: ModelQuotaBucket;
  weekly: ModelQuotaBucket;
}

export interface QuotaBucket {
  id?: string;
  name: string;
  description?: string;
  window?: 'weekly' | '5h' | string;
  remaining: number; // 0-100%
  message?: string | null;
  resetAt?: number | null;
}

export interface QuotaGroup {
  name: string;
  description?: string;
  buckets: QuotaBucket[];
}

export interface QuotaSnapshot {
  gemini: ModelQuotaGroup;
  claudeGpt: ModelQuotaGroup;
  groups?: QuotaGroup[];
  lastUpdated?: string;
  source?: string;
}

export interface TokenUsageRecord {
  id?: string;
  timestamp: string;
  model: string;
  agent: string;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens?: number;
  total_tokens: number;
}

export interface TokenAggregatedUsage {
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  sessions_count: number;
  last_recorded_at: string | null;
}

export interface QuotaStatsResponse {
  gemini: ModelQuotaGroup;
  claudeGpt: ModelQuotaGroup;
  tokenUsage: TokenAggregatedUsage;
  lastSync: number;
  isLive: boolean;
  accountEmail: string | null;
  recordsCount: number;
}
