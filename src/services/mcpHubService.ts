import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface JsonRpcRequest {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface McpHubOptions {
  aiMemoryUrl?: string;
  aiMemoryToken?: string;
  anytypeCliPath?: string;
  anytypeBaseUrl?: string;
  anytypeHeaders?: string;
}

const resolveAiMemoryToken = (): string => {
  if (process.env.AI_MEMORY_TOKEN) return process.env.AI_MEMORY_TOKEN.trim();
  if (process.env.AI_MEMORY_AUTH_TOKEN) return process.env.AI_MEMORY_AUTH_TOKEN.trim();
  const tokenFile = process.env.AI_MEMORY_TOKEN_FILE || '/DATA/AppData/ai-memory/auth-tokens/default';
  try {
    if (fs.existsSync(tokenFile)) {
      return fs.readFileSync(tokenFile, 'utf8').trim();
    }
  } catch {}
  return '';
};

const resolveAnytypeHeaders = (): string => {
  if (process.env.OPENAPI_MCP_HEADERS) return process.env.OPENAPI_MCP_HEADERS.trim();
  if (process.env.ANYTYPE_API_KEY) {
    return JSON.stringify({
      Authorization: `Bearer ${process.env.ANYTYPE_API_KEY.trim()}`,
      'Anytype-Version': '2025-11-08'
    });
  }
  try {
    const configPath = process.env.MCP_CONFIG_PATH || '/root/.gemini/config/mcp_config.json';
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const anytypeEnv = parsed.mcpServers?.anytype?.env;
      if (anytypeEnv?.OPENAPI_MCP_HEADERS) {
        return anytypeEnv.OPENAPI_MCP_HEADERS;
      }
    }
  } catch {}
  return '';
};

export class McpHubService {
  private aiMemoryUrl: string;
  private aiMemoryToken: string;
  private anytypeCliPath: string;
  private anytypeBaseUrl: string;
  private anytypeHeaders: string;

  private anytypeProcess: ChildProcess | null = null;
  private anytypeInitPromise: Promise<ChildProcess> | null = null;
  private anytypePendingRequests = new Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private anytypeStdoutBuffer = '';
  private anytypeNextId = 1;
  private anytypeReady = false;

  private cachedTools: McpToolDefinition[] | null = null;
  private cacheExpiresAt = 0;
  private toolSourceMap = new Map<string, 'ai-memory' | 'anytype'>();

  constructor(options?: McpHubOptions) {
    this.aiMemoryUrl =
      options?.aiMemoryUrl ||
      process.env.AI_MEMORY_MCP_URL ||
      'http://192.168.31.5:49374/mcp';
    this.aiMemoryToken =
      options?.aiMemoryToken ||
      resolveAiMemoryToken();
    this.anytypeCliPath =
      options?.anytypeCliPath ||
      process.env.ANYTYPE_MCP_CLI_PATH ||
      '/workspace/anytype-mcp/bin/cli.mjs';
    this.anytypeBaseUrl =
      options?.anytypeBaseUrl ||
      process.env.ANYTYPE_API_BASE_URL ||
      'http://192.168.31.5:31009';
    this.anytypeHeaders =
      options?.anytypeHeaders ||
      resolveAnytypeHeaders();
  }

  public updateConfig(options: McpHubOptions): void {
    if (options.aiMemoryUrl) this.aiMemoryUrl = options.aiMemoryUrl;
    if (options.aiMemoryToken) this.aiMemoryToken = options.aiMemoryToken;
    if (options.anytypeCliPath) this.anytypeCliPath = options.anytypeCliPath;
    if (options.anytypeBaseUrl) this.anytypeBaseUrl = options.anytypeBaseUrl;
    if (options.anytypeHeaders) this.anytypeHeaders = options.anytypeHeaders;
    this.invalidateCache();
    this.stopAnytypeProcess();
  }

  public invalidateCache(): void {
    this.cachedTools = null;
    this.cacheExpiresAt = 0;
    this.toolSourceMap.clear();
  }

  /**
   * Comunicação HTTP com o downstream ai-memory
   */
  public async callAiMemory(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(this.aiMemoryUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${this.aiMemoryToken}`
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          method,
          params: params || {}
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`ai-memory HTTP ${response.status}: ${response.statusText}`);
      }

      let json: JsonRpcResponse;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream')) {
        const text = await response.text();
        const lines = text.split('\n');
        let dataPayload = '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            dataPayload = trimmed.slice(5).trim();
            break;
          }
        }
        if (!dataPayload) {
          throw new Error('ai-memory SSE response did not contain data payload');
        }
        json = JSON.parse(dataPayload) as JsonRpcResponse;
      } else {
        json = (await response.json()) as JsonRpcResponse;
      }

      if (json.error) {
        throw new Error(`ai-memory RPC error: ${json.error.message}`);
      }

      return json.result;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Gerenciamento do processo child Anytype MCP via Stdio com single-flight (mutex)
   */
  private async ensureAnytypeProcess(): Promise<ChildProcess> {
    if (this.anytypeProcess && !this.anytypeProcess.killed && this.anytypeReady) {
      return this.anytypeProcess;
    }

    if (this.anytypeInitPromise) {
      return this.anytypeInitPromise;
    }

    this.anytypeInitPromise = this.startAnytypeProcess();
    try {
      return await this.anytypeInitPromise;
    } finally {
      this.anytypeInitPromise = null;
    }
  }

  private async startAnytypeProcess(): Promise<ChildProcess> {
    if (!fs.existsSync(this.anytypeCliPath)) {
      throw new Error(`Anytype MCP CLI não encontrado em: ${this.anytypeCliPath}`);
    }

    this.stopAnytypeProcess();

    const env = {
      ...process.env,
      ANYTYPE_API_BASE_URL: this.anytypeBaseUrl,
      OPENAPI_MCP_HEADERS: this.anytypeHeaders
    };

    const child = spawn('node', [this.anytypeCliPath], {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.anytypeProcess = child;
    this.anytypeStdoutBuffer = '';
    this.anytypeReady = false;

    child.stdout?.on('data', (data: Buffer) => {
      this.handleAnytypeStdout(data.toString());
    });

    child.stderr?.on('data', (data: Buffer) => {
      // Ignora avisos operacionais do Anytype em stderr
      const text = data.toString().trim();
      if (text && !text.includes('deprecated')) {
        // debug logging se necessário
      }
    });

    child.on('close', () => {
      this.cleanupAnytypeProcess();
    });

    child.on('error', () => {
      this.cleanupAnytypeProcess();
    });

    // Inicializa o protocolo MCP com o child process
    await new Promise<void>((resolve, reject) => {
      const initId = this.anytypeNextId++;
      const timeout = setTimeout(() => {
        this.anytypePendingRequests.delete(initId);
        reject(new Error('Timeout ao inicializar Anytype MCP child process'));
      }, 10000);

      this.anytypePendingRequests.set(initId, {
        resolve: () => {
          this.anytypeReady = true;
          // Envia notificação initialized
          child.stdin?.write(
            JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'
          );
          resolve();
        },
        reject: (err) => {
          reject(err);
        },
        timeout
      });

      child.stdin?.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: initId,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'kraken-mcp-hub', version: '1.0.0' }
          }
        }) + '\n'
      );
    });

    return child;
  }

  private handleAnytypeStdout(chunk: string): void {
    this.anytypeStdoutBuffer += chunk;
    const lines = this.anytypeStdoutBuffer.split('\n');
    this.anytypeStdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse;
        if (msg.id !== undefined && msg.id !== null) {
          const pending = this.anytypePendingRequests.get(msg.id);
          if (pending) {
            clearTimeout(pending.timeout);
            this.anytypePendingRequests.delete(msg.id);

            if (msg.error) {
              pending.reject(new Error(msg.error.message || 'Erro RPC Anytype'));
            } else {
              pending.resolve(msg.result);
            }
          }
        }
      } catch {
        // Linha não-JSON (possível log) ignorada
      }
    }
  }

  private cleanupAnytypeProcess(): void {
    this.anytypeReady = false;
    this.anytypeProcess = null;
    this.anytypeInitPromise = null;
    for (const [, req] of this.anytypePendingRequests) {
      clearTimeout(req.timeout);
      req.reject(new Error('Processo Anytype MCP encerrado inesperadamente'));
    }
    this.anytypePendingRequests.clear();
  }

  public stopAnytypeProcess(): void {
    if (this.anytypeProcess) {
      try {
        this.anytypeProcess.kill();
      } catch {
        // noop
      }
    }
    this.cleanupAnytypeProcess();
  }

  /**
   * Comunicação Stdio com o downstream Anytype
   */
  public async callAnytype(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const child = await this.ensureAnytypeProcess();

    return new Promise((resolve, reject) => {
      const id = this.anytypeNextId++;
      const timeout = setTimeout(() => {
        this.anytypePendingRequests.delete(id);
        reject(new Error(`Timeout na chamada Anytype MCP (${method})`));
      }, 30000);

      this.anytypePendingRequests.set(id, {
        resolve,
        reject,
        timeout
      });

      const payload = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params: params || {}
      }) + '\n';

      child.stdin?.write(payload);
    });
  }

  /**
   * Catálogo de ferramentas unificado com agregação resiliente
   */
  public async listTools(): Promise<McpToolDefinition[]> {
    const now = Date.now();
    if (this.cachedTools && now < this.cacheExpiresAt) {
      return this.cachedTools;
    }

    const aggregatedTools: McpToolDefinition[] = [];
    this.toolSourceMap.clear();

    // 1. Busca ferramentas do ai-memory
    try {
      const memoryResult = (await this.callAiMemory('tools/list')) as { tools?: McpToolDefinition[] };
      if (Array.isArray(memoryResult?.tools)) {
        for (const tool of memoryResult.tools) {
          aggregatedTools.push(tool);
          this.toolSourceMap.set(tool.name, 'ai-memory');
        }
      }
    } catch (err) {
      console.warn('[McpHubService] Aviso: Falha ao listar ferramentas do ai-memory:', (err as Error).message);
    }

    // 2. Busca ferramentas do Anytype
    try {
      const anytypeResult = (await this.callAnytype('tools/list')) as { tools?: McpToolDefinition[] };
      if (Array.isArray(anytypeResult?.tools)) {
        for (const tool of anytypeResult.tools) {
          aggregatedTools.push(tool);
          this.toolSourceMap.set(tool.name, 'anytype');
        }
      }
    } catch (err) {
      console.warn('[McpHubService] Aviso: Falha ao listar ferramentas do Anytype:', (err as Error).message);
    }

    this.cachedTools = aggregatedTools;
    this.cacheExpiresAt = now + 45000; // Cache de 45 segundos

    return aggregatedTools;
  }

  /**
   * Execução de ferramenta com roteamento automático
   */
  public async callTool(
    name: string,
    args?: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    let source = this.toolSourceMap.get(name);

    if (!source) {
      if (name.startsWith('memory_')) {
        source = 'ai-memory';
      } else if (name.startsWith('API-') || name.startsWith('safe_')) {
        source = 'anytype';
      } else {
        // Atualiza a lista para tentar encontrar
        await this.listTools();
        source = this.toolSourceMap.get(name);
      }
    }

    if (!source) {
      return {
        content: [{ type: 'text', text: `Ferramenta '${name}' não encontrada no catálogo do MCP Hub.` }],
        isError: true
      };
    }

    try {
      if (source === 'ai-memory') {
        const result = (await this.callAiMemory('tools/call', { name, arguments: args || {} })) as {
          content?: Array<{ type: string; text: string }>;
          isError?: boolean;
        };
        return {
          content: result?.content || [{ type: 'text', text: JSON.stringify(result) }],
          isError: !!result?.isError
        };
      } else {
        const result = (await this.callAnytype('tools/call', { name, arguments: args || {} })) as {
          content?: Array<{ type: string; text: string }>;
          isError?: boolean;
        };
        return {
          content: result?.content || [{ type: 'text', text: JSON.stringify(result) }],
          isError: !!result?.isError
        };
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Erro na execução da ferramenta [${name}]: ${(err as Error).message}` }],
        isError: true
      };
    }
  }

  /**
   * Tratamento principal de mensagens JSON-RPC 2.0 (MCP Protocol)
   */
  public async handleJsonRpc(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const { id, method, params } = request;

    switch (method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {
                listChanged: false
              }
            },
            serverInfo: {
              name: 'kraken-mcp-hub',
              version: '1.0.0'
            },
            instructions:
              'Kraken Unified MCP Hub (ai-memory + anytype for Homelab). ' +
              'Memory tools (memory_*) handle persistent knowledge, decisions, and session context. ' +
              'Anytype tools (API-*, safe_*) handle note objects, tags, and spaces with automated safety backups.'
          }
        };
      }

      case 'notifications/initialized': {
        // Notificação não requer retorno
        return null;
      }

      case 'ping': {
        return {
          jsonrpc: '2.0',
          id,
          result: {}
        };
      }

      case 'tools/list': {
        const tools = await this.listTools();
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools
          }
        };
      }

      case 'tools/call': {
        const toolName = (params?.name as string) || '';
        const toolArgs = (params?.arguments as Record<string, unknown>) || {};
        if (!toolName) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: "Parâmetro obrigatório 'name' ausente em tools/call"
            }
          };
        }

        const result = await this.callTool(toolName, toolArgs);
        return {
          jsonrpc: '2.0',
          id,
          result
        };
      }

      default: {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Método não suportado: ${method}`
          }
        };
      }
    }
  }

  public getStatus(): {
    aiMemoryUrl: string;
    anytypeBaseUrl: string;
    anytypeReady: boolean;
    cachedToolCount: number;
  } {
    return {
      aiMemoryUrl: this.aiMemoryUrl,
      anytypeBaseUrl: this.anytypeBaseUrl,
      anytypeReady: this.anytypeReady,
      cachedToolCount: this.cachedTools ? this.cachedTools.length : 0
    };
  }
}

export const mcpHubService = new McpHubService();
