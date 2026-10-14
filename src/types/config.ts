export interface SupportedAgent {
  id: string;
  name: string;
  cmd: string;
}

export interface EffortLevel {
  id: string;
  name: string;
}

export interface ExecutionMode {
  id: string;
  name: string;
  description: string;
}

export interface SystemConfigResponse {
  appName: string;
  workspaceDir: string;
  codeServerPort: string;
  supportedAgents: SupportedAgent[];
  effortLevels: EffortLevel[];
  modes: ExecutionMode[];
}

export interface ProjectItem {
  name: string;
  path: string;
}

export interface ModelItem {
  id: string;
  name: string;
}

export interface ModelsMap {
  antigravity: ModelItem[];
  claude: ModelItem[];
  aider: ModelItem[];
}
