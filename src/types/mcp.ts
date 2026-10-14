export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  serverUrl?: string;
  url?: string;
  headers?: Record<string, string>;
  token?: string;
  [key: string]: unknown;
}

export interface McpConfigFile {
  mcpServers?: Record<string, McpServerConfig>;
}

export interface McpServerItem {
  name: string;
  type: string;
  status: 'enabled' | 'disabled';
  commandOrUrl: string;
  authStatus: 'authenticated' | 'unauthenticated' | 'none';
  url?: string;
}

export interface McpAuthUrlResponse {
  server: string;
  authUrl?: string;
  instructions?: string;
  requireCode?: boolean;
  message?: string;
}

export interface McpExchangeResponse {
  success: boolean;
  message: string;
  tokenSet?: boolean;
}
