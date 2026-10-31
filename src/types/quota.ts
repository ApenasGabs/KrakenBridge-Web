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

export interface AccountModelQuotaSummary {
  remaining: number; // Menor entre weekly e 5h, ou 0 se bloqueado
  weeklyRemaining: number;
  fiveHourRemaining: number;
  resetAt: number | null;
  isAvailable: boolean;
  message?: string | null;
}

export interface AccountQuotaProfile {
  email: string;
  name: string;
  picture: string | null;
  isActive: boolean;
  groups: QuotaGroup[];
  modelSummary: {
    gemini: AccountModelQuotaSummary;
    claudeGpt: AccountModelQuotaSummary;
    geminiArgon: AccountModelQuotaSummary;
  };
  lastUpdated: string;
}

export interface MultiAccountQuotaOverview {
  activeEmail: string | null;
  accounts: AccountQuotaProfile[];
  bestAccountsByFamily: {
    gemini: { email: string; remaining: number; name: string } | null;
    claudeGpt: { email: string; remaining: number; name: string } | null;
    geminiArgon: { email: string; remaining: number; name: string } | null;
  };
  modelQuotaMap: Record<string, {
    family: 'gemini' | 'claudeGpt' | 'geminiArgon';
    currentAccountRemaining: number;
    bestPoolRemaining: number;
    bestAccountEmail: string | null;
    bestAccountName: string | null;
    isBlocked: boolean; // se todas as contas no pool têm <= threshold
  }>;
}

export interface RouteByModelRequest {
  model: string;
  minQuotaThreshold?: number; // Padrão 5%
}

export interface RouteByModelResponse {
  success: boolean;
  model: string;
  family: 'gemini' | 'claudeGpt' | 'geminiArgon';
  switched: boolean;
  previousEmail: string | null;
  currentEmail: string;
  accountName: string;
  remainingQuota: number;
  isBlocked: boolean;
  message: string;
}

