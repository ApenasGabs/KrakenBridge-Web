import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TelemetryAndSetupPanel } from '../TelemetryAndSetupPanel';
import { api } from '../../../services/api';

vi.mock('../../../services/api', () => ({
  api: {
    getTelemetryStatus: vi.fn(),
    getSetupConfig: vi.fn(),
    provisionTelemetry: vi.fn(),
    applySetupConfig: vi.fn(),
    startSetupChat: vi.fn()
  }
}));

describe('TelemetryAndSetupPanel (Out-of-the-Box Telemetry & Cgroups)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(api.getTelemetryStatus).mockResolvedValue({
      enabled: true,
      autoProvision: true,
      telemetryDir: '/DATA/AppData/telemetria',
      dockerAvailable: true,
      containerdSocketHealthy: true,
      activeSeriesCount: 42,
      totalStackMemMb: 192.4,
      stackMemTargetMb: 250,
      services: [
        {
          id: 'cadvisor',
          name: 'cAdvisor (Métricas Docker)',
          containerName: 'cadvisor',
          running: true,
          status: 'running',
          port: 8082,
          url: 'http://localhost:8082',
          memUsageMb: 44.2,
          memLimitMb: 96
        },
        {
          id: 'victoriametrics',
          name: 'VictoriaMetrics (TSDB PromQL)',
          containerName: 'victoriametrics',
          running: true,
          status: 'running',
          port: 8428,
          url: 'http://localhost:8428',
          memUsageMb: 31.8,
          memLimitMb: 64
        },
        {
          id: 'grafana',
          name: 'Grafana (Dashboards & Alertas)',
          containerName: 'grafana',
          running: true,
          status: 'running',
          port: 3003,
          url: 'http://localhost:3003',
          memUsageMb: 32.1,
          memLimitMb: 128
        },
        {
          id: 'uptime-kuma',
          name: 'Uptime Kuma (Status Page)',
          containerName: 'uptime-kuma',
          running: true,
          status: 'running',
          port: 3002,
          url: 'http://localhost:3002',
          memUsageMb: 84.3,
          memLimitMb: 128
        }
      ],
      containers: [
        {
          id: 'c1',
          name: 'gabot',
          status: 'running',
          cpuPercent: 4.1,
          memUsageBytes: 160 * 1024 * 1024,
          memLimitBytes: 512 * 1024 * 1024,
          memUsageFormatted: '160MiB',
          memLimitFormatted: '512MiB',
          memPercent: 31.2,
          hasExplicitLimit: true,
          preDegradationAlert: false,
          alertSeverity: 'ok'
        }
      ],
      preDegradationAlerts: [],
      urls: {
        grafana: 'http://localhost:3003',
        uptimeKuma: 'http://localhost:3002',
        victoriaMetrics: 'http://localhost:8428',
        cadvisor: 'http://localhost:8082'
      },
      gapsResolved: {
        containerdSocketMounted: true,
        grafanaAlertRulesProvisioned: true,
        cgroupsPersisted: true,
        realisticStackLimits: true,
        casaosDualAppRegistered: true
      },
      lastCheckedAt: new Date().toISOString()
    });

    vi.mocked(api.getSetupConfig).mockResolvedValue({
      workspacePath: '/workspace',
      codeServerPort: 8089,
      krakenPinConfigured: false,
      hasGeminiKey: true,
      hasAnthropicKey: false,
      hasOpenaiKey: false,
      hasGithubToken: true,
      hasVercelToken: true,
      autoProvisionTelemetry: true,
      telemetryDir: '/DATA/AppData/telemetria',
      grafanaPort: 3003,
      uptimeKumaPort: 3002,
      victoriaMetricsPort: 8428,
      cadvisorPort: 8082,
      defaultContainerMemLimit: '512M',
      defaultContainerCpuLimit: '1.0',
      protectedContainers: ['gabot', 'quero-vagas-crawler'],
      setupCompleted: true
    });
  });

  it('deve renderizar a stack de telemetria Out-of-the-Box, séries ativas e garantias SRE', async () => {
    render(<TelemetryAndSetupPanel />);

    await waitFor(() => {
      expect(screen.getByText(/42 séries PromQL/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/cAdvisor containerd.sock \+ cgroup v2/i)).toBeInTheDocument();
    expect(screen.getByText(/Alertas PromQL \(>80% & predict_linear 30m\)/i)).toBeInTheDocument();
    expect(screen.getByText('gabot')).toBeInTheDocument();
  });

  it('deve disparar provisionamento Out-of-the-Box ao clicar no botão de auto-configuração', async () => {
    vi.mocked(api.provisionTelemetry).mockResolvedValue({
      success: true,
      message: 'Stack de telemetria Out-of-the-Box provisionada com sucesso!'
    });

    render(<TelemetryAndSetupPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('provision-telemetry-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('provision-telemetry-btn'));

    await waitFor(() => {
      expect(api.provisionTelemetry).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/provisionada com sucesso!/i)).toBeInTheDocument();
    });
  });

  it('deve iniciar o Chat de Configuração ao clicar em Chat de Config', async () => {
    const onStartSetupChat = vi.fn();
    vi.mocked(api.startSetupChat).mockResolvedValue({
      success: true,
      conversationId: 'conv-setup-123',
      suggestedPrompt: 'Olá Kraken! Quero configurar meu ambiente.'
    });

    render(<TelemetryAndSetupPanel onStartSetupChat={onStartSetupChat} />);

    await waitFor(() => {
      expect(screen.getByTestId('start-setup-chat-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('start-setup-chat-btn'));

    await waitFor(() => {
      expect(api.startSetupChat).toHaveBeenCalledTimes(1);
      expect(onStartSetupChat).toHaveBeenCalledWith({
        conversationId: 'conv-setup-123',
        suggestedPrompt: 'Olá Kraken! Quero configurar meu ambiente.'
      });
    });
  });
});
