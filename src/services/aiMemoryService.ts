import fs from 'fs/promises';
import path from 'path';
import type { MemoryStatus, MemorySearchResult, MemoryPage, MemoryHandoff } from '../types/memory.js';

const AI_MEMORY_HOST = process.env.AI_MEMORY_HOST || '172.17.0.1';
const AI_MEMORY_PORT = process.env.AI_MEMORY_PORT || '49374';
const AI_MEMORY_URL = process.env.AI_MEMORY_SERVER_URL || `http://${AI_MEMORY_HOST}:${AI_MEMORY_PORT}`;
const TOKEN_FILE = process.env.AI_MEMORY_TOKEN_FILE || '/DATA/AppData/ai-memory/auth-tokens/default';

class AiMemoryService {
  private cachedToken: string | null = null;
  private tokenLoadTime = 0;

  async getToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && (now - this.tokenLoadTime < 60000)) {
      return this.cachedToken;
    }

    if (process.env.AI_MEMORY_AUTH_TOKEN) {
      this.cachedToken = process.env.AI_MEMORY_AUTH_TOKEN.trim();
      this.tokenLoadTime = now;
      return this.cachedToken;
    }

    try {
      const raw = await fs.readFile(TOKEN_FILE, 'utf8');
      this.cachedToken = raw.trim();
      this.tokenLoadTime = now;
      return this.cachedToken;
    } catch {
      return '';
    }
  }

  private async callMcpTool<T = any>(name: string, args: Record<string, any> = {}): Promise<T> {
    const token = await this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${AI_MEMORY_URL}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name,
          arguments: args
        }
      })
    });

    if (!res.ok) {
      throw new Error(`MCP Tool call ${name} failed with HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json() as any;
    if (data.error) {
      throw new Error(data.error.message || `MCP Error in ${name}`);
    }

    const content = data.result?.content?.[0]?.text;
    if (!content) return {} as T;

    try {
      return JSON.parse(content) as T;
    } catch {
      return content as unknown as T;
    }
  }

  async getStatus(): Promise<MemoryStatus> {
    const webUrl = `${AI_MEMORY_URL}/web`;
    const dataDir = '/DATA/AppData/ai-memory';

    try {
      const healthRes = await fetch(`${AI_MEMORY_URL}/healthz`, { signal: AbortSignal.timeout(3000) });
      const online = healthRes.ok;

      if (!online) {
        return {
          online: false,
          serverUrl: AI_MEMORY_URL,
          webUrl,
          dataDir,
          authenticated: false,
          error: `HTTP ${healthRes.status}`
        };
      }

      const statusData = await this.callMcpTool('memory_status').catch(() => null);
      const counts = statusData?.counts || {};

      return {
        online: true,
        serverUrl: AI_MEMORY_URL,
        webUrl,
        dataDir,
        authenticated: !!(await this.getToken()),
        version: '3.0.1',
        stats: {
          pagesLatest: counts.pages_latest ?? 0,
          pagesAllVersions: counts.pages_all ?? 0,
          sessions: counts.sessions ?? 0,
          observations: counts.observations ?? 0
        }
      };
    } catch (err) {
      return {
        online: false,
        serverUrl: AI_MEMORY_URL,
        webUrl,
        dataDir,
        authenticated: false,
        error: (err as Error).message
      };
    }
  }

  async getBriefing(workspace = 'default', project = 'scratch'): Promise<any> {
    try {
      return await this.callMcpTool('memory_briefing', { workspace, project });
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  async search(query: string, limit = 20): Promise<MemorySearchResult[]> {
    if (!query || !query.trim()) return [];
    try {
      const data = await this.callMcpTool('memory_query', { query: query.trim() });
      const hits = data?.hits || [];
      return hits.map((h: any) => ({
        title: h.title || path.basename(h.path, '.md'),
        path: h.path,
        snippet: h.snippet,
        score: h.rank
      })).slice(0, limit);
    } catch (e) {
      console.warn('[AiMemoryService] Erro ao pesquisar memória:', (e as Error).message);
      return [];
    }
  }

  async listRecentPages(limit = 20): Promise<MemorySearchResult[]> {
    try {
      const data = await this.callMcpTool('memory_recent', { limit });
      const hits = data?.hits || [];
      return hits.map((h: any) => ({
        title: h.title || path.basename(h.path, '.md'),
        path: h.path,
        snippet: h.abstract || h.snippet,
        updatedAt: h.updated_at
      }));
    } catch (e) {
      console.warn('[AiMemoryService] Erro ao listar páginas recentes:', (e as Error).message);
      return [];
    }
  }

  async readPage(pagePath: string): Promise<MemoryPage | null> {
    try {
      const data = await this.callMcpTool('memory_read_page', { path: pagePath });
      if (!data) return null;
      return {
        path: pagePath,
        title: data.title || path.basename(pagePath, '.md'),
        content: data.body || (typeof data === 'string' ? data : ''),
        updatedAt: data.updated_at
      };
    } catch (e) {
      console.warn(`[AiMemoryService] Erro ao ler página ${pagePath}:`, (e as Error).message);
      return null;
    }
  }

  async writePage(params: {
    path: string;
    body: string;
    tags?: string[];
    pinned?: boolean;
    workspace?: string;
    project?: string;
  }): Promise<{ success: boolean; pageId?: string; checkpoint?: string; error?: string }> {
    try {
      const result = await this.callMcpTool('memory_write_page', {
        path: params.path,
        body: params.body,
        tags: params.tags || [],
        pinned: params.pinned ?? false,
        workspace: params.workspace || 'default',
        project: params.project || 'scratch'
      });

      return {
        success: true,
        pageId: result.page_id,
        checkpoint: result.checkpoint
      };
    } catch (e) {
      return {
        success: false,
        error: (e as Error).message
      };
    }
  }

  async listHandoffs(): Promise<MemoryHandoff[]> {
    try {
      const data = await this.callMcpTool('memory_handoff_list', {});
      const handoffs = data?.handoffs || [];
      return handoffs.map((h: any) => ({
        id: h.id || h.handoff_id,
        title: h.title || 'Handoff sem título',
        status: h.status || 'open',
        createdAt: h.created_at || new Date().toISOString(),
        authorAgent: h.author_agent,
        targetAgent: h.target_agent,
        summary: h.summary || ''
      }));
    } catch (e) {
      console.warn('[AiMemoryService] Erro ao listar handoffs:', (e as Error).message);
      return [];
    }
  }

  async createHandoff(params: {
    title: string;
    summary: string;
    targetAgent?: string;
  }): Promise<{ success: boolean; handoffId?: string; error?: string }> {
    try {
      const result = await this.callMcpTool('memory_handoff_begin', {
        title: params.title,
        summary: params.summary,
        target_agent: params.targetAgent
      });
      return {
        success: true,
        handoffId: result.handoff_id || result.id
      };
    } catch (e) {
      return {
        success: false,
        error: (e as Error).message
      };
    }
  }
}

export const aiMemoryService = new AiMemoryService();
