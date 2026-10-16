export interface ContainerCgroupStat {
  id: string;
  name: string;
  status: string;
  cpuPercent: number;
  memUsageBytes: number;
  memLimitBytes: number;
  memUsageFormatted: string;
  memLimitFormatted: string;
  memPercent: number;
  hasExplicitLimit: boolean;
  preDegradationAlert: boolean;
  alertSeverity: 'ok' | 'warning' | 'critical';
  alertReason?: string;
}

export interface TelemetryServiceInfo {
  id: 'cadvisor' | 'victoriametrics' | 'grafana' | 'uptime-kuma';
  name: string;
  containerName: string;
  running: boolean;
  status: string;
  port: number;
  url: string;
  memUsageMb: number;
  memLimitMb: number;
}

export interface TelemetryStackStatus {
  enabled: boolean;
  autoProvision: boolean;
  telemetryDir: string;
  dockerAvailable: boolean;
  containerdSocketHealthy: boolean;
  activeSeriesCount: number;
  totalStackMemMb: number;
  stackMemTargetMb: number;
  services: TelemetryServiceInfo[];
  containers: ContainerCgroupStat[];
  preDegradationAlerts: Array<{
    container: string;
    severity: 'warning' | 'critical';
    message: string;
    memPercent: number;
  }>;
  urls: {
    grafana: string;
    uptimeKuma: string;
    victoriaMetrics: string;
    cadvisor: string;
  };
  gapsResolved: {
    containerdSocketMounted: boolean;
    grafanaAlertRulesProvisioned: boolean;
    cgroupsPersisted: boolean;
    realisticStackLimits: boolean;
    casaosDualAppRegistered: boolean;
  };
  lastCheckedAt: string;
}

export interface OutOfBoxSetupConfig {
  workspacePath: string;
  codeServerPort: number;
  krakenPinConfigured: boolean;
  hasGeminiKey: boolean;
  hasAnthropicKey: boolean;
  hasOpenaiKey: boolean;
  hasGithubToken: boolean;
  hasVercelToken: boolean;
  autoProvisionTelemetry: boolean;
  telemetryDir: string;
  grafanaPort: number;
  uptimeKumaPort: number;
  victoriaMetricsPort: number;
  cadvisorPort: number;
  defaultContainerMemLimit: string;
  defaultContainerCpuLimit: string;
  protectedContainers: string[];
  setupCompleted: boolean;
  updatedAt?: string;
}

export interface ApplySetupPayload {
  workspacePath?: string;
  krakenPin?: string;
  geminiApiKey?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  githubToken?: string;
  vercelToken?: string;
  autoProvisionTelemetry?: boolean;
  grafanaPort?: number;
  uptimeKumaPort?: number;
  victoriaMetricsPort?: number;
  cadvisorPort?: number;
  defaultContainerMemLimit?: string;
  defaultContainerCpuLimit?: string;
  protectedContainers?: string[];
  provisionNow?: boolean;
}
