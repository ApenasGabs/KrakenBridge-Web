import type { AccountInfo, AuthStatus, ChatOptions, ConversationSession, McpServer, ModelsConfig, ProjectWorkspace, QuotaStats, ToolCall, TurnTokens } from '../types';

export interface SSECallbacks {
  onSessionStart?: (data: { conversation_id: string; reqId: string; subproject?: string }) => void;
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
  onToolUpdate?: (tool: ToolCall) => void;
  onUsage?: (usage: TurnTokens) => void;
  onAuthRequired?: (data: { authUrl: string; reqId: string }) => void;
  onError?: (err: string) => void;
  onDone?: (data: { code: number; conversation_id: string }) => void;
}

function getApiBase(): string {
  // Se a rota no navegador for /chat ou /chat/, usa /chat/api, senão /api
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/chat')) {
    return '/chat/api';
  }
  return '/api';
}

function getStoredPinToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('kraken_pin_token');
}

function authHeaders(custom: Record<string, string> = {}): Record<string, string> {
  const token = getStoredPinToken();
  const headers: Record<string, string> = { ...custom };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const api = {
  getStoredPinToken,
  setPinToken(token: string) {
    localStorage.setItem('kraken_pin_token', token);
  },
  clearPinToken() {
    localStorage.removeItem('kraken_pin_token');
  },

  async getPinStatus(): Promise<{ required: boolean }> {
    const res = await fetch(`${getApiBase()}/auth/pin/status`);
    return res.json();
  },

  async verifyPin(pin: string): Promise<{ success: boolean; token?: string; error?: string }> {
    const res = await fetch(`${getApiBase()}/auth/pin/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    return res.json();
  },

  async getConfig(): Promise<{ workspaceDir: string; codeServerPort: number }> {
    const res = await fetch(`${getApiBase()}/config`, { headers: authHeaders() });
    return res.json();
  },

  async getProjects(): Promise<{ projects: ProjectWorkspace[] }> {
    const res = await fetch(`${getApiBase()}/config/projects`, { headers: authHeaders() });
    return res.json();
  },

  async getModels(): Promise<ModelsConfig> {
    const res = await fetch(`${getApiBase()}/config/models`, { headers: authHeaders() });
    if (!res.ok) return {};
    return res.json();
  },

  async getQuotaStats(): Promise<QuotaStats> {
    const res = await fetch(`${getApiBase()}/quota`, { headers: authHeaders() });
    if (!res.ok) {
      throw new Error(`Erro ao buscar dados de cota (${res.status})`);
    }
    return res.json();
  },

  async refreshQuota(): Promise<{ ok: boolean; stats: QuotaStats }> {
    const res = await fetch(`${getApiBase()}/quota/refresh`, {
      method: 'POST',
      headers: authHeaders()
    });
    if (!res.ok) {
      throw new Error(`Erro ao consultar cota ao vivo (${res.status})`);
    }
    return res.json();
  },

  async syncQuota(data: {
    gemini?: { weeklyRemaining?: number; fiveHourRemaining?: number; weeklyHoursRemaining?: number; fiveHourMinutesRemaining?: number };
    claudeGpt?: { weeklyRemaining?: number; fiveHourRemaining?: number };
  }): Promise<{ ok: boolean; stats: QuotaStats }> {
    const res = await fetch(`${getApiBase()}/quota/sync`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async getMcpServers(): Promise<McpServer[]> {
    const res = await fetch(`${getApiBase()}/mcp`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return data.servers || [];
  },

  async toggleMcpServer(name: string, enable: boolean): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`${getApiBase()}/mcp/toggle`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name, enable })
    });
    return res.json();
  },

  async getMcpAuthUrl(name: string): Promise<{ authUrl?: string; instructions?: string; type?: string }> {
    const res = await fetch(`${getApiBase()}/mcp/auth-url?server=${encodeURIComponent(name)}`, {
      headers: authHeaders()
    });
    return res.json();
  },

  async exchangeMcpCode(name: string, code: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const res = await fetch(`${getApiBase()}/mcp/exchange`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ server: name, code })
    });
    return res.json();
  },

  async getAuthStatus(): Promise<AuthStatus> {
    const res = await fetch(`${getApiBase()}/auth/status`, { headers: authHeaders() });
    return res.json();
  },

  async getAccounts(): Promise<{ activeEmail: string | null; accounts: AccountInfo[] }> {
    const res = await fetch(`${getApiBase()}/auth/accounts`, { headers: authHeaders() });
    if (!res.ok) return { activeEmail: null, accounts: [] };
    return res.json();
  },

  async switchAccount(email: string): Promise<{ success: boolean; account?: AccountInfo; message?: string }> {
    const res = await fetch(`${getApiBase()}/auth/accounts/switch`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email })
    });
    return res.json();
  },

  async removeAccount(email: string): Promise<{ success: boolean; wasActive?: boolean }> {
    const res = await fetch(`${getApiBase()}/auth/accounts/${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    return res.json();
  },

  async startAntigravityAuth(force?: boolean): Promise<{ authUrl?: string; message?: string; alreadyAuthenticated?: boolean; email?: string }> {
    const res = await fetch(`${getApiBase()}/auth/antigravity/start`, { 
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ force: !!force })
    });
    return res.json();
  },

  async submitAntigravityCode(code: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${getApiBase()}/auth/antigravity/submit-code`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ code })
    });
    return res.json();
  },

  async saveApiKeys(keys: { geminiApiKey?: string }): Promise<{ success: boolean }> {
    const res = await fetch(`${getApiBase()}/auth/keys`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(keys)
    });
    return res.json();
  },

  async getGithubStatus(): Promise<{ authenticated: boolean; username?: string; hasToken?: boolean }> {
    const res = await fetch(`${getApiBase()}/auth/github/status`, { headers: authHeaders() });
    return res.json();
  },

  async startGithubDeviceFlow(): Promise<{ success: boolean; userCode?: string; verificationUri?: string; interval?: number; error?: string }> {
    const res = await fetch(`${getApiBase()}/auth/github/device/start`, {
      method: 'POST',
      headers: authHeaders()
    });
    return res.json();
  },

  async pollGithubDevice(): Promise<{ status: string; username?: string; error?: string }> {
    const res = await fetch(`${getApiBase()}/auth/github/device/poll`, { headers: authHeaders() });
    return res.json();
  },

  async saveGithubToken(token: string): Promise<{ success: boolean; username?: string; error?: string }> {
    const res = await fetch(`${getApiBase()}/auth/github/token`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ token })
    });
    return res.json();
  },

  async logoutGithub(): Promise<{ success: boolean; message?: string }> {
    const res = await fetch(`${getApiBase()}/auth/github/logout`, {
      method: 'POST',
      headers: authHeaders()
    });
    return res.json();
  },

  async getConversations(): Promise<ConversationSession[]> {
    const res = await fetch(`${getApiBase()}/conversations`, { headers: authHeaders() });
    const data = await res.json();
    return data.conversations || [];
  },

  async getConversation(id: string): Promise<ConversationSession | null> {
    const res = await fetch(`${getApiBase()}/conversations/${id}`, { headers: authHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    return data.session;
  },

  async createConversation(data: Partial<ConversationSession> = {}): Promise<ConversationSession> {
    const res = await fetch(`${getApiBase()}/conversations`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async renameConversation(id: string, title: string): Promise<{ success: boolean }> {
    const res = await fetch(`${getApiBase()}/conversations/${id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title })
    });
    return res.json();
  },

  async updateConversation(id: string, data: { title?: string; subproject?: string }): Promise<{ session: ConversationSession }> {
    const res = await fetch(`${getApiBase()}/conversations/${id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async deleteConversation(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${getApiBase()}/conversations/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    return res.json();
  },

  async submitInlineAuth(reqId: string, code: string): Promise<{ status: string }> {
    const res = await fetch(`${getApiBase()}/chat/submit-auth`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ reqId, code })
    });
    return res.json();
  },

  async stopChat(conversationId?: string): Promise<{ status: string; terminated: number }> {
    const res = await fetch(`${getApiBase()}/chat/stop`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ conversationId })
    });
    return res.json();
  },

  /**
   * Stream de Chat com suporte a SSE via Fetch ReadableStream
   */
  async streamChat(
    payload: {
      prompt: string;
      conversationId?: string;
      options: ChatOptions;
    },
    callbacks: SSECallbacks,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const body = {
      prompt: payload.prompt,
      conversationId: payload.conversationId,
      agent: payload.options.agent,
      model: payload.options.model,
      effort: payload.options.effort,
      mode: payload.options.mode,
      sandbox: payload.options.sandbox,
      skipPermissions: payload.options.skipPermissions,
      disableSlashCommands: payload.options.disableSlashCommands,
      subproject: payload.options.subproject || undefined
    };

    const response = await fetch(`${getApiBase()}/chat`, {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      }),
      body: JSON.stringify(body),
      signal: abortSignal
    });

    if (!response.ok) {
      const errText = await response.text();
      callbacks.onError?.(`Erro HTTP ${response.status}: ${errText}`);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      callbacks.onError?.('ReadableStream não suportado neste navegador.');
      return;
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        if (!dataStr) continue;

        try {
          const parsed = JSON.parse(dataStr);

          if (parsed.event === 'session_start') {
            callbacks.onSessionStart?.(parsed);
          } else if (parsed.event === 'auth_required') {
            callbacks.onAuthRequired?.(parsed);
          } else if (parsed.event === 'step_update' && parsed.step_update) {
            const su = parsed.step_update;
            if (su.step_type === 'agent_response' && su.text_delta) {
              callbacks.onTextDelta?.(su.text_delta);
            } else if (su.step_type === 'thinking' && su.text_delta) {
              callbacks.onThinkingDelta?.(su.text_delta);
            } else if (su.step_type === 'tool') {
              const params = su.tool_info?.parameters || {};
              const command = params.CommandLine 
                || (params.toolAction ? `${params.toolAction}${params.toolSummary ? ': ' + params.toolSummary : ''}` : '')
                || params.AbsolutePath 
                || params.TargetFile 
                || '';

              callbacks.onToolUpdate?.({
                step_index: su.step_index,
                name: su.tool_name || 'tool',
                command: command,
                action: params.toolAction,
                summary: params.toolSummary,
                args: params,
                output: su.tool_info?.output,
                state: su.state,
                duration: su.duration_seconds
              });
            }
          } else if (parsed.event === 'result') {
            if (parsed.result?.usage) {
              callbacks.onUsage?.(parsed.result.usage);
            }
          } else if (parsed.event === 'raw') {
            if (parsed.text) callbacks.onTextDelta?.(parsed.text + '\n');
          } else if (parsed.event === 'done') {
            callbacks.onDone?.(parsed);
          } else if (parsed.event === 'error') {
            callbacks.onError?.(parsed.error);
          }
        } catch {
          // ignore non-json payload in SSE stream
        }
      }
    }
  }
};
