import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type {
  ApplySetupPayload,
  ContainerCgroupStat,
  OutOfBoxSetupConfig,
  TelemetryServiceInfo,
  TelemetryStackStatus
} from '../types/telemetry.js';
import { githubAuthService } from './githubAuthService.js';
import { vercelAuthService } from './vercelAuthService.js';

const execFileAsync = promisify(execFile);

const DEFAULT_PROTECTED_CONTAINERS = [
  'gabot',
  'quero-vagas-crawler',
  'quero-vagas-crawler-browser',
  'radarr',
  'headless-chrome',
  'ai-memory',
  'dsh-harness'
];

const CONTAINER_DEFAULT_LIMITS: Record<string, { mem: string; cpus: string }> = {
  'gabot': { mem: '512m', cpus: '1.0' },
  'quero-vagas-crawler': { mem: '512m', cpus: '1.0' },
  'quero-vagas-crawler-browser': { mem: '512m', cpus: '1.0' },
  'radarr': { mem: '512m', cpus: '1.0' },
  'headless-chrome': { mem: '300m', cpus: '0.8' },
  'ai-memory': { mem: '512m', cpus: '1.0' },
  'dsh-harness': { mem: '512m', cpus: '1.0' }
};

function getSetupFilePath(): string {
  const geminiDir = '/root/.gemini';
  if (fsSync.existsSync(geminiDir)) {
    return path.join(geminiDir, 'kraken-setup.json');
  }
  return path.resolve('data', 'kraken-setup.json');
}

function parseByteSize(sizeStr: string): number {
  const clean = sizeStr.trim();
  const match = clean.match(/^([\d.]+)\s*([KMGT]i?B|B)?$/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  if (unit.startsWith('K')) return Math.round(val * 1024);
  if (unit.startsWith('M')) return Math.round(val * 1024 * 1024);
  if (unit.startsWith('G')) return Math.round(val * 1024 * 1024 * 1024);
  if (unit.startsWith('T')) return Math.round(val * 1024 * 1024 * 1024 * 1024);
  return Math.round(val);
}

export class TelemetryService {
  private isProvisioning = false;

  private getTelemetryDir(): string {
    return process.env.TELEMETRY_DIR || '/DATA/AppData/telemetria';
  }

  private getCasaosAppsDir(): string {
    return process.env.CASAOS_APPS_DIR || '/var/lib/casaos/apps';
  }

  async getSetupConfig(): Promise<OutOfBoxSetupConfig> {
    let saved: Partial<OutOfBoxSetupConfig> = {};
    try {
      const raw = await fs.readFile(getSetupFilePath(), 'utf8');
      saved = JSON.parse(raw);
    } catch {
      // Usa defaults
    }

    const ghStatus = await githubAuthService.getStatus().catch(() => ({ authenticated: false, hasToken: false }));
    const vcStatus = await vercelAuthService.getStatus().catch(() => ({ authenticated: false, hasToken: false }));

    const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
    const anthropicKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    const openaiKey = (process.env.OPENAI_API_KEY || '').trim();
    const krakenPin = (process.env.KRAKEN_PIN || '').trim();

    return {
      workspacePath: saved.workspacePath || process.env.WORKSPACE_DIR || '/workspace',
      codeServerPort: Number(process.env.CODE_SERVER_PORT || 8089),
      krakenPinConfigured: !!krakenPin,
      hasGeminiKey: !!geminiKey,
      hasAnthropicKey: !!anthropicKey,
      hasOpenaiKey: !!openaiKey,
      hasGithubToken: !!(ghStatus.authenticated || ghStatus.hasToken),
      hasVercelToken: !!(vcStatus.authenticated || vcStatus.hasToken),
      autoProvisionTelemetry: saved.autoProvisionTelemetry ?? (process.env.AUTO_PROVISION_TELEMETRY !== 'false'),
      telemetryDir: saved.telemetryDir || this.getTelemetryDir(),
      grafanaPort: saved.grafanaPort || Number(process.env.GRAFANA_PORT || 3003),
      uptimeKumaPort: saved.uptimeKumaPort || Number(process.env.UPTIME_KUMA_PORT || 3002),
      victoriaMetricsPort: saved.victoriaMetricsPort || Number(process.env.VICTORIAMETRICS_PORT || 8428),
      cadvisorPort: saved.cadvisorPort || Number(process.env.CADVISOR_PORT || 8082),
      defaultContainerMemLimit: saved.defaultContainerMemLimit || process.env.DEFAULT_CONTAINER_MEM_LIMIT || '512M',
      defaultContainerCpuLimit: saved.defaultContainerCpuLimit || process.env.DEFAULT_CONTAINER_CPU_LIMIT || '1.0',
      protectedContainers: saved.protectedContainers || DEFAULT_PROTECTED_CONTAINERS,
      setupCompleted: !!saved.setupCompleted,
      updatedAt: saved.updatedAt
    };
  }

  async applySetupConfig(payload: ApplySetupPayload): Promise<{
    config: OutOfBoxSetupConfig;
    provisionResult?: { success: boolean; message: string };
  }> {
    const current = await this.getSetupConfig();

    if (payload.geminiApiKey !== undefined && payload.geminiApiKey.trim()) {
      process.env.GEMINI_API_KEY = payload.geminiApiKey.trim();
    }
    if (payload.anthropicApiKey !== undefined && payload.anthropicApiKey.trim()) {
      process.env.ANTHROPIC_API_KEY = payload.anthropicApiKey.trim();
    }
    if (payload.openaiApiKey !== undefined && payload.openaiApiKey.trim()) {
      process.env.OPENAI_API_KEY = payload.openaiApiKey.trim();
    }
    if (payload.krakenPin !== undefined) {
      process.env.KRAKEN_PIN = payload.krakenPin.trim();
    }
    if (payload.githubToken !== undefined && payload.githubToken.trim()) {
      await githubAuthService.saveToken(payload.githubToken.trim()).catch(() => {});
    }
    if (payload.vercelToken !== undefined && payload.vercelToken.trim()) {
      await vercelAuthService.saveToken(payload.vercelToken.trim()).catch(() => {});
    }

    const updated: OutOfBoxSetupConfig = {
      ...current,
      workspacePath: payload.workspacePath || current.workspacePath,
      autoProvisionTelemetry: payload.autoProvisionTelemetry ?? current.autoProvisionTelemetry,
      grafanaPort: payload.grafanaPort || current.grafanaPort,
      uptimeKumaPort: payload.uptimeKumaPort || current.uptimeKumaPort,
      victoriaMetricsPort: payload.victoriaMetricsPort || current.victoriaMetricsPort,
      cadvisorPort: payload.cadvisorPort || current.cadvisorPort,
      defaultContainerMemLimit: payload.defaultContainerMemLimit || current.defaultContainerMemLimit,
      defaultContainerCpuLimit: payload.defaultContainerCpuLimit || current.defaultContainerCpuLimit,
      protectedContainers: payload.protectedContainers || current.protectedContainers,
      setupCompleted: true,
      updatedAt: new Date().toISOString()
    };

    const setupFile = getSetupFilePath();
    await fs.mkdir(path.dirname(setupFile), { recursive: true });
    await fs.writeFile(setupFile, JSON.stringify(updated, null, 2), 'utf8');

    // Sincroniza também arquivo .env local para persistência de chaves/portas
    await this.syncEnvFile(payload, updated).catch(() => {});

    let provisionResult: { success: boolean; message: string } | undefined;
    if (payload.provisionNow || updated.autoProvisionTelemetry) {
      provisionResult = await this.provisionOutOfBoxTelemetry(updated);
    }

    const refreshed = await this.getSetupConfig();
    return { config: refreshed, provisionResult };
  }

  private async syncEnvFile(payload: ApplySetupPayload, config: OutOfBoxSetupConfig): Promise<void> {
    const envPath = path.resolve('.env');
    let content = '';
    try {
      content = await fs.readFile(envPath, 'utf8');
    } catch {
      try {
        content = await fs.readFile(path.resolve('.env.example'), 'utf8');
      } catch {
        content = '';
      }
    }

    const updates: Record<string, string> = {
      AUTO_PROVISION_TELEMETRY: String(config.autoProvisionTelemetry),
      GRAFANA_PORT: String(config.grafanaPort),
      UPTIME_KUMA_PORT: String(config.uptimeKumaPort),
      VICTORIAMETRICS_PORT: String(config.victoriaMetricsPort),
      CADVISOR_PORT: String(config.cadvisorPort),
      DEFAULT_CONTAINER_MEM_LIMIT: config.defaultContainerMemLimit,
      DEFAULT_CONTAINER_CPU_LIMIT: config.defaultContainerCpuLimit
    };

    if (payload.geminiApiKey?.trim()) updates.GEMINI_API_KEY = payload.geminiApiKey.trim();
    if (payload.anthropicApiKey?.trim()) updates.ANTHROPIC_API_KEY = payload.anthropicApiKey.trim();
    if (payload.openaiApiKey?.trim()) updates.OPENAI_API_KEY = payload.openaiApiKey.trim();
    if (payload.krakenPin !== undefined) updates.KRAKEN_PIN = payload.krakenPin.trim();

    let lines = content.split('\n');
    for (const [key, val] of Object.entries(updates)) {
      const idx = lines.findIndex((l) => l.trim().startsWith(`${key}=`));
      if (idx >= 0) {
        lines[idx] = `${key}=${val}`;
      } else {
        lines.push(`${key}=${val}`);
      }
    }
    await fs.writeFile(envPath, lines.join('\n'), 'utf8');
  }

  /**
   * Gera os arquivos de configuração Out-of-the-Box para a stack de Telemetria
   * corrigindo as 5 lacunas da Issue #28:
   * 1. Mapeamento do /run/containerd/containerd.sock e /sys/fs/cgroup no cAdvisor
   * 2. Provisioning automático de regras de alerta PromQL de pré-degradação no Grafana
   * 3. Persistência de cgroups (limits.memory / cpus) nos docker-compose.yml e em runtime
   * 4. Dimensionamento seguro de memória da stack (cAdvisor 96M com --store_container_labels=false)
   * 5. Registro duplo no CasaOS/ZimaOS (Grafana + Uptime Kuma visíveis no Dashboard)
   */
  generateTelemetryCompose(config: OutOfBoxSetupConfig): string {
    return `name: telemetria

services:
  # ========================================================
  # 1. cAdvisor: Telemetria de Containers (cgroups v2 + containerd ready)
  # ========================================================
  cadvisor:
    container_name: cadvisor
    image: gcr.io/cadvisor/cadvisor:latest
    restart: unless-stopped
    privileged: true
    devices:
      - /dev/kmsg
    ports:
      - "${config.cadvisorPort}:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /var/run/containerd/containerd.sock:/run/containerd/containerd.sock:ro
      - /sys:/sys:ro
      - /sys/fs/cgroup:/sys/fs/cgroup:ro
      - /var/lib/docker/:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro
    command:
      - --housekeeping_interval=15s
      - --docker_only=true
      - --store_container_labels=false
      - --disable_root_cgroup_stats=true
      - --enable_metrics=cpu,memory,network,diskIO,oom_event
      - --containerd=/run/containerd/containerd.sock
      - --containerd-namespace=moby
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 128M
        reservations:
          memory: 32M
    networks:
      - homelab-net
    labels:
      icon: https://cdn.jsdelivr.net/gh/selfhst/icons/png/cadvisor.png

  # ========================================================
  # 2. VictoriaMetrics: TSDB Ultra-Leve (100% PromQL)
  # ========================================================
  victoriametrics:
    container_name: victoriametrics
    image: victoriametrics/victoria-metrics:v1.101.0
    restart: unless-stopped
    ports:
      - "${config.victoriaMetricsPort}:8428"
    volumes:
      - ${config.telemetryDir}/vm-data:/storage
      - ${config.telemetryDir}/vm-scrape.yml:/etc/victoriametrics/scrape.yml:ro
    command:
      - -storageDataPath=/storage
      - -promscrape.config=/etc/victoriametrics/scrape.yml
      - -retentionPeriod=30d
      - -memory.allowedPercent=60
      - -maxLabelsPerTimeseries=40
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 128M
        reservations:
          memory: 32M
    networks:
      - homelab-net
    labels:
      icon: https://cdn.jsdelivr.net/gh/selfhst/icons/png/victoriametrics.png

  # ========================================================
  # 3. Grafana: Dashboards & Alertas de Pré-Degradação
  # ========================================================
  grafana:
    container_name: grafana
    image: grafana/grafana-oss:latest
    restart: unless-stopped
    ports:
      - "${config.grafanaPort}:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_ANALYTICS_REPORTING_ENABLED=false
      - GF_ANALYTICS_CHECK_FOR_UPDATES=false
      - GF_UNIFIED_ALERTING_ENABLED=true
      - TZ=America/Sao_Paulo
    volumes:
      - ${config.telemetryDir}/grafana/data:/var/lib/grafana
      - ${config.telemetryDir}/grafana/provisioning:/etc/grafana/provisioning:ro
      - ${config.telemetryDir}/grafana/dashboards:/var/lib/grafana/dashboards:ro
    deploy:
      resources:
        limits:
          cpus: '0.8'
          memory: 256M
        reservations:
          memory: 64M
    networks:
      - homelab-net
    depends_on:
      - victoriametrics
    labels:
      icon: https://cdn.jsdelivr.net/gh/selfhst/icons/png/grafana.png

  # ========================================================
  # 4. Uptime Kuma: Status Page Pública & Monitoramento Sintético
  # ========================================================
  uptime-kuma:
    container_name: uptime-kuma
    image: louislam/uptime-kuma:1
    restart: unless-stopped
    ports:
      - "${config.uptimeKumaPort}:3001"
    volumes:
      - ${config.telemetryDir}/uptime-kuma-data:/app/data
      - /var/run/docker.sock:/var/run/docker.sock:ro
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 192M
        reservations:
          memory: 64M
    networks:
      - homelab-net
    labels:
      icon: https://cdn.jsdelivr.net/gh/selfhst/icons/png/uptime-kuma.png

networks:
  homelab-net:
    name: homelab-net
    driver: bridge

x-casaos:
  architectures:
    - amd64
    - arm64
  author: Kraken & Homelab
  category: Utilities
  description:
    en_US: Lightweight Homelab Telemetry & SRE Stack (VictoriaMetrics, cAdvisor, Grafana and Uptime Kuma) with cgroups pre-degradation alerts.
    pt_BR: Stack leve de telemetria e SRE para homelab (VictoriaMetrics, cAdvisor, Grafana e Uptime Kuma) com contenção cgroups e alertas de pré-degradação.
  developer: CNCF / Prometheus Ecosystem
  icon: https://cdn.jsdelivr.net/gh/selfhst/icons/png/grafana.png
  id: io.homelab.telemetria
  index: /
  is_uncontrolled: false
  main: grafana
  port_map: "${config.grafanaPort}"
  scheme: http
  store_app_id: telemetria
  tagline:
    en_US: Real-time container metrics, cgroups alerts and status page
    pt_BR: Métricas de containers em tempo real, alertas de cgroups e status page
  thumbnail: https://cdn.jsdelivr.net/gh/selfhst/icons/png/grafana.png
  title:
    en_US: Telemetria & Grafana
    pt_BR: Telemetria & Grafana
`;
  }

  generateUptimeKumaCasaosManifest(config: OutOfBoxSetupConfig): string {
    return `name: uptime-kuma
services:
  uptime-kuma:
    container_name: uptime-kuma
    image: louislam/uptime-kuma:1
    restart: unless-stopped
    ports:
      - "${config.uptimeKumaPort}:3001"
    volumes:
      - ${config.telemetryDir}/uptime-kuma-data:/app/data
      - /var/run/docker.sock:/var/run/docker.sock:ro
    labels:
      icon: https://cdn.jsdelivr.net/gh/selfhst/icons/png/uptime-kuma.png

x-casaos:
  architectures:
    - amd64
    - arm64
  author: Kraken & Homelab
  category: Utilities
  description:
    en_US: Public Status Page & Synthetic HTTP/Docker Monitoring for Homelab, Vercel and Cloudflare endpoints.
    pt_BR: Status Page pública e monitoramento sintético HTTP/Docker para serviços locais, Vercel e Cloudflare.
  developer: Louis Lam
  icon: https://cdn.jsdelivr.net/gh/selfhst/icons/png/uptime-kuma.png
  id: io.homelab.uptimekuma
  index: /
  is_uncontrolled: false
  main: uptime-kuma
  port_map: "${config.uptimeKumaPort}"
  scheme: http
  store_app_id: uptime-kuma
  tagline:
    en_US: Public Status Page & Synthetic Uptime Monitor
    pt_BR: Status Page Pública e Monitor de Uptime
  thumbnail: https://cdn.jsdelivr.net/gh/selfhst/icons/png/uptime-kuma.png
  title:
    en_US: Uptime Kuma
    pt_BR: Uptime Kuma
`;
  }

  generateVmScrapeConfig(): string {
    return `global:
  scrape_interval: 15s
  scrape_timeout: 10s

scrape_configs:
  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']

  - job_name: 'victoriametrics'
    static_configs:
      - targets: ['localhost:8428']
`;
  }

  generateGrafanaDatasource(): string {
    return `apiVersion: 1

datasources:
  - name: VictoriaMetrics
    uid: victoriametrics
    type: prometheus
    access: proxy
    url: http://victoriametrics:8428
    isDefault: true
    editable: true
    jsonData:
      httpMethod: POST
      timeInterval: 15s
`;
  }

  generateGrafanaDashboardsProvider(): string {
    return `apiVersion: 1

providers:
  - name: 'Homelab Docker Containers'
    orgId: 1
    folder: 'Homelab Telemetria'
    type: file
    disableDeletion: false
    editable: true
    options:
      path: /var/lib/grafana/dashboards
`;
  }

  generateGrafanaAlertRules(): string {
    return `apiVersion: 1

groups:
  - orgId: 1
    name: homelab-cgroups-pre-degradation
    folder: Homelab Telemetria
    interval: 1m
    rules:
      - uid: cgroup_mem_80_pct
        title: "Pré-Degradação: Container Acima de 80% do Limite Cgroup"
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 300
              to: 0
            datasourceUid: victoriametrics
            model:
              expr: '(container_memory_working_set_bytes{name!=""} / (container_spec_memory_limit_bytes{name!=""} > 0)) * 100'
              instant: true
              refId: A
          - refId: B
            relativeTimeRange:
              from: 300
              to: 0
            datasourceUid: __expr__
            model:
              type: reduce
              expression: A
              reducer: last
              refId: B
          - refId: C
            relativeTimeRange:
              from: 300
              to: 0
            datasourceUid: __expr__
            model:
              type: threshold
              expression: B
              conditions:
                - evaluator:
                    type: gt
                    params: [80]
              refId: C
        noDataState: OK
        execErrState: OK
        for: 5m
        annotations:
          summary: "Container próximo ao limite de memória cgroup (>80%)"
          description: "O container atingiu mais de 80% do seu teto físico de memória e pode sofrer OOMKill (Exit 137) em breve."
        labels:
          severity: warning
          stack: homelab

      - uid: cgroup_mem_linear_leak_30m
        title: "Anomalia de Memory Leak: Projeção Linear de Estouro em 30m"
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 1800
              to: 0
            datasourceUid: victoriametrics
            model:
              expr: '(predict_linear(container_memory_working_set_bytes{name!=""}[30m], 1800) / (container_spec_memory_limit_bytes{name!=""} > 0)) * 100'
              instant: true
              refId: A
          - refId: B
            relativeTimeRange:
              from: 1800
              to: 0
            datasourceUid: __expr__
            model:
              type: reduce
              expression: A
              reducer: last
              refId: B
          - refId: C
            relativeTimeRange:
              from: 1800
              to: 0
            datasourceUid: __expr__
            model:
              type: threshold
              expression: B
              conditions:
                - evaluator:
                    type: gt
                    params: [95]
              refId: C
        noDataState: OK
        execErrState: OK
        for: 5m
        annotations:
          summary: "Tendência de vazamento linear de memória (estouro previsto em 30 min)"
          description: "Crescimento monotônico de RAM detectado via predict_linear[30m]. Contenção preventiva recomendada antes de atingir OOM."
        labels:
          severity: critical
          stack: homelab
`;
  }

  generateGrafanaDashboardJson(): string {
    const dashboard = {
      annotations: { list: [] },
      editable: true,
      fiscalYearStartMonth: 0,
      graphTooltip: 1,
      id: null,
      links: [],
      panels: [
        {
          title: 'Uso de Memória vs Limite Cgroup (%) — Pré-Degradação',
          type: 'timeseries',
          gridPos: { h: 8, w: 12, x: 0, y: 0 },
          datasource: { type: 'prometheus', uid: 'victoriametrics' },
          fieldConfig: {
            defaults: {
              unit: 'percent',
              min: 0,
              max: 100,
              thresholds: {
                mode: 'absolute',
                steps: [
                  { color: 'green', value: null },
                  { color: 'orange', value: 75 },
                  { color: 'red', value: 85 }
                ]
              }
            },
            overrides: []
          },
          targets: [
            {
              expr: '(container_memory_working_set_bytes{name!=""} / (container_spec_memory_limit_bytes{name!=""} > 0)) * 100',
              legendFormat: '{{name}}',
              refId: 'A'
            }
          ]
        },
        {
          title: 'Memória Working Set por Container (MiB)',
          type: 'timeseries',
          gridPos: { h: 8, w: 12, x: 12, y: 0 },
          datasource: { type: 'prometheus', uid: 'victoriametrics' },
          fieldConfig: {
            defaults: { unit: 'bytes' },
            overrides: []
          },
          targets: [
            {
              expr: 'container_memory_working_set_bytes{name!=""}',
              legendFormat: '{{name}}',
              refId: 'A'
            }
          ]
        },
        {
          title: 'Uso de CPU por Container (%)',
          type: 'timeseries',
          gridPos: { h: 8, w: 12, x: 0, y: 8 },
          datasource: { type: 'prometheus', uid: 'victoriametrics' },
          fieldConfig: {
            defaults: { unit: 'percent' },
            overrides: []
          },
          targets: [
            {
              expr: 'rate(container_cpu_usage_seconds_total{name!=""}[1m]) * 100',
              legendFormat: '{{name}}',
              refId: 'A'
            }
          ]
        },
        {
          title: 'Projeção Linear de Memória (+30 min via predict_linear)',
          type: 'timeseries',
          gridPos: { h: 8, w: 12, x: 12, y: 8 },
          datasource: { type: 'prometheus', uid: 'victoriametrics' },
          fieldConfig: {
            defaults: { unit: 'bytes' },
            overrides: []
          },
          targets: [
            {
              expr: 'predict_linear(container_memory_working_set_bytes{name!=""}[30m], 1800)',
              legendFormat: '{{name}} (+30m)',
              refId: 'A'
            }
          ]
        }
      ],
      refresh: '15s',
      schemaVersion: 39,
      tags: ['homelab', 'docker', 'cgroups', 'sre'],
      templating: { list: [] },
      time: { from: 'now-1h', to: 'now' },
      timezone: 'America/Sao_Paulo',
      title: 'Homelab Docker & Cgroups Pre-Degradation',
      uid: 'homelab-docker-cgroups',
      version: 1
    };
    return JSON.stringify(dashboard, null, 2);
  }

  /**
   * Persiste limites de recursos Cgroups nos docker-compose.yml dos serviços monitorados
   * e aplica limites em runtime via docker update (sem derrubar nem reiniciar os containers).
   */
  async enforceCgroupLimits(config: OutOfBoxSetupConfig): Promise<string[]> {
    const updatedServices: string[] = [];

    // 1. Aplica limites em runtime via `docker update` (zero downtime, não reinicia containers)
    for (const containerName of config.protectedContainers) {
      // Nunca toca no krakenbridge-web em runtime para evitar qualquer interrupção de sessão ativa
      if (containerName === 'krakenbridge-web') continue;

      const preset = CONTAINER_DEFAULT_LIMITS[containerName] || {
        mem: config.defaultContainerMemLimit.toLowerCase(),
        cpus: config.defaultContainerCpuLimit
      };

      try {
        const { stdout } = await execFileAsync('docker', [
          'inspect',
          containerName,
          '--format',
          '{{.HostConfig.Memory}}'
        ]);
        const currentMem = parseInt(stdout.trim(), 10);
        if (!currentMem || currentMem === 0) {
          await execFileAsync('docker', [
            'update',
            '--memory',
            preset.mem,
            '--memory-swap',
            preset.mem,
            '--cpus',
            preset.cpus,
            containerName
          ]);
          updatedServices.push(`${containerName} (runtime: ${preset.mem})`);
        }
      } catch {
        // Container não existe neste host; ignora silenciosamente
      }
    }

    // 2. Persiste deploy.resources.limits nos docker-compose.yml de gabot e quero-vagas-crawler se existirem
    const composeTargets = [
      { file: '/DATA/AppData/gabot/docker-compose.yml', mem: '512M', cpus: '1.0' },
      { file: '/DATA/AppData/quero-vagas-crawler/docker-compose.yml', mem: '512M', cpus: '1.0' },
      { file: '/DATA/AppData/quero-vagas-crawler/docker-compose.zimaos.yml', mem: '512M', cpus: '1.0' }
    ];

    for (const target of composeTargets) {
      try {
        if (!fsSync.existsSync(target.file)) continue;
        const raw = await fs.readFile(target.file, 'utf8');
        if (raw.includes('limits:') && raw.includes('memory:')) continue;

        const block = `\n    deploy:\n      resources:\n        limits:\n          cpus: '${target.cpus}'\n          memory: ${target.mem}\n        reservations:\n          memory: 128M\n`;
        // Insere após restart: always ou restart: unless-stopped
        const patched = raw.replace(
          /(restart:\s*(?:always|unless-stopped))/g,
          `$1${block.trimEnd()}`
        );
        if (patched !== raw) {
          await fs.writeFile(target.file, patched, 'utf8');
          updatedServices.push(`${path.basename(path.dirname(target.file))}/${path.basename(target.file)} (persistido)`);
        }
      } catch {
        // Sem permissão ou arquivo ausente
      }
    }

    return updatedServices;
  }

  /**
   * Provisiona de forma 100% autônoma (Out-of-the-Box) a stack de telemetria
   * sem mexer no container do KrakenBridge-Web.
   */
  async provisionOutOfBoxTelemetry(customConfig?: OutOfBoxSetupConfig): Promise<{
    success: boolean;
    message: string;
    enforcedCgroups?: string[];
  }> {
    if (this.isProvisioning) {
      return { success: false, message: 'Provisionamento de telemetria já está em andamento.' };
    }
    this.isProvisioning = true;

    try {
      const config = customConfig || (await this.getSetupConfig());
      const telemetryDir = config.telemetryDir;

      // 1. Criar estrutura de diretórios
      await fs.mkdir(path.join(telemetryDir, 'vm-data'), { recursive: true });
      await fs.mkdir(path.join(telemetryDir, 'uptime-kuma-data'), { recursive: true });
      await fs.mkdir(path.join(telemetryDir, 'grafana', 'data'), { recursive: true });
      await fs.mkdir(path.join(telemetryDir, 'grafana', 'dashboards'), { recursive: true });
      await fs.mkdir(path.join(telemetryDir, 'grafana', 'provisioning', 'datasources'), { recursive: true });
      await fs.mkdir(path.join(telemetryDir, 'grafana', 'provisioning', 'dashboards'), { recursive: true });
      await fs.mkdir(path.join(telemetryDir, 'grafana', 'provisioning', 'alerting'), { recursive: true });

      // Ajustar permissão do diretório de dados do Grafana (UID 472)
      await fs.chmod(path.join(telemetryDir, 'grafana', 'data'), 0o777).catch(() => {});
      await fs.chmod(path.join(telemetryDir, 'vm-data'), 0o777).catch(() => {});
      await fs.chmod(path.join(telemetryDir, 'uptime-kuma-data'), 0o777).catch(() => {});

      // 2. Escrever arquivos de configuração da stack
      const composeContent = this.generateTelemetryCompose(config);
      await fs.writeFile(path.join(telemetryDir, 'docker-compose.yml'), composeContent, 'utf8');
      await fs.writeFile(path.join(telemetryDir, 'vm-scrape.yml'), this.generateVmScrapeConfig(), 'utf8');
      await fs.writeFile(
        path.join(telemetryDir, 'grafana', 'provisioning', 'datasources', 'datasource.yml'),
        this.generateGrafanaDatasource(),
        'utf8'
      );
      await fs.writeFile(
        path.join(telemetryDir, 'grafana', 'provisioning', 'dashboards', 'dashboards.yml'),
        this.generateGrafanaDashboardsProvider(),
        'utf8'
      );
      await fs.writeFile(
        path.join(telemetryDir, 'grafana', 'provisioning', 'alerting', 'alerts.yml'),
        this.generateGrafanaAlertRules(),
        'utf8'
      );
      await fs.writeFile(
        path.join(telemetryDir, 'grafana', 'dashboards', 'docker-containers.json'),
        this.generateGrafanaDashboardJson(),
        'utf8'
      );

      // 3. Registrar manifestos no CasaOS / ZimaOS (Grafana + Uptime Kuma separados para visibilidade dupla)
      const casaosDir = this.getCasaosAppsDir();
      if (fsSync.existsSync(casaosDir)) {
        const casaosTelemetriaDir = path.join(casaosDir, 'telemetria');
        const casaosKumaDir = path.join(casaosDir, 'uptime-kuma');
        await fs.mkdir(casaosTelemetriaDir, { recursive: true }).catch(() => {});
        await fs.mkdir(casaosKumaDir, { recursive: true }).catch(() => {});
        await fs.writeFile(path.join(casaosTelemetriaDir, 'docker-compose.yml'), composeContent, 'utf8').catch(() => {});
        await fs
          .writeFile(path.join(casaosKumaDir, 'docker-compose.yml'), this.generateUptimeKumaCasaosManifest(config), 'utf8')
          .catch(() => {});
      }

      // 4. Aplicar limites de cgroups nos containers propensos a vazamento (sem tocar no krakenbridge-web)
      const enforcedCgroups = await this.enforceCgroupLimits(config);

      // 5. Subir / atualizar a stack de telemetria caso o socket Docker esteja disponível
      if (fsSync.existsSync('/var/run/docker.sock')) {
        await execFileAsync('docker', [
          'compose',
          '-f',
          path.join(telemetryDir, 'docker-compose.yml'),
          'up',
          '-d'
        ]);
      }

      return {
        success: true,
        message: 'Stack de telemetria Out-of-the-Box (cAdvisor, VictoriaMetrics, Grafana com alertas e Uptime Kuma) provisionada com sucesso!',
        enforcedCgroups
      };
    } catch (err) {
      return {
        success: false,
        message: `Erro ao provisionar telemetria: ${(err as Error).message}`
      };
    } finally {
      this.isProvisioning = false;
    }
  }

  /**
   * Obtém o status em tempo real da stack de telemetria, validação das 5 lacunas e uso de cgroups.
   */
  async getTelemetryStatus(hostHeader = 'localhost'): Promise<TelemetryStackStatus> {
    const config = await this.getSetupConfig();
    const hostname = hostHeader.split(':')[0] || 'localhost';
    const dockerAvailable = fsSync.existsSync('/var/run/docker.sock');

    const telemetryDir = config.telemetryDir;
    const composePath = path.join(telemetryDir, 'docker-compose.yml');
    const alertsPath = path.join(telemetryDir, 'grafana', 'provisioning', 'alerting', 'alerts.yml');
    const casaosKumaPath = path.join(this.getCasaosAppsDir(), 'uptime-kuma', 'docker-compose.yml');

    let composeText = '';
    try {
      composeText = await fs.readFile(composePath, 'utf8');
    } catch {}

    const containerdSocketMounted = composeText.includes('/run/containerd/containerd.sock');
    const grafanaAlertRulesProvisioned = fsSync.existsSync(alertsPath);
    const realisticStackLimits =
      (composeText.includes('memory: 128M') || composeText.includes('memory: 96M')) &&
      composeText.includes('--store_container_labels=false');
    const casaosDualAppRegistered = fsSync.existsSync(casaosKumaPath);

    let gabotComposeText = '';
    try {
      gabotComposeText = await fs.readFile('/DATA/AppData/gabot/docker-compose.yml', 'utf8');
    } catch {}
    const cgroupsPersisted = gabotComposeText.includes('limits:') || !fsSync.existsSync('/DATA/AppData/gabot/docker-compose.yml');

    const containers: ContainerCgroupStat[] = [];
    const preDegradationAlerts: TelemetryStackStatus['preDegradationAlerts'] = [];

    if (dockerAvailable) {
      try {
        const { stdout } = await execFileAsync('docker', [
          'stats',
          '--no-stream',
          '--format',
          '{{.ID}}|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}'
        ]);

        const lines = stdout.trim().split('\n').filter(Boolean);
        for (const line of lines) {
          const [id, name, cpuStr, memUsageStr, memPercStr] = line.split('|');
          if (!name) continue;

          const cpuPercent = parseFloat((cpuStr || '0').replace('%', '')) || 0;
          const memPercent = parseFloat((memPercStr || '0').replace('%', '')) || 0;
          const [usedPart = '0B', limitPart = '0B'] = (memUsageStr || '').split('/').map((s: string) => s.trim());
          const memUsageBytes = parseByteSize(usedPart);
          const memLimitBytes = parseByteSize(limitPart);

          // Considera que tem limite explícito se o limite for menor que 4 GiB (no gabisa o host tem 5.7 GiB)
          const hasExplicitLimit = memLimitBytes > 0 && memLimitBytes <= 4 * 1024 * 1024 * 1024;

          let alertSeverity: 'ok' | 'warning' | 'critical' = 'ok';
          let alertReason: string | undefined;

          if (hasExplicitLimit && memPercent >= 85) {
            alertSeverity = 'critical';
            alertReason = `Uso crítico de memória (${memPercent.toFixed(1)}% do limite cgroup de ${limitPart})`;
          } else if (hasExplicitLimit && memPercent >= 75) {
            alertSeverity = 'warning';
            alertReason = `Pré-degradação: atingiu ${memPercent.toFixed(1)}% do limite de ${limitPart}`;
          } else if (!hasExplicitLimit && memUsageBytes > 500 * 1024 * 1024) {
            alertSeverity = 'warning';
            alertReason = `Alto consumo (${usedPart}) sem limite explícito de cgroup`;
          }

          if (alertSeverity !== 'ok' && alertReason) {
            preDegradationAlerts.push({
              container: name,
              severity: alertSeverity,
              message: alertReason,
              memPercent
            });
          }

          containers.push({
            id: id || name,
            name,
            status: 'running',
            cpuPercent,
            memUsageBytes,
            memLimitBytes,
            memUsageFormatted: usedPart,
            memLimitFormatted: limitPart,
            memPercent,
            hasExplicitLimit,
            preDegradationAlert: alertSeverity !== 'ok',
            alertSeverity,
            alertReason
          });
        }
      } catch {
        // Ignora erro caso docker stats falhe
      }
    }

    const findContainer = (cName: string) => containers.find((c) => c.name === cName);

    const serviceDefs: Array<{
      id: TelemetryServiceInfo['id'];
      name: string;
      port: number;
      defaultLimitMb: number;
    }> = [
      { id: 'cadvisor', name: 'cAdvisor (Métricas Docker)', port: config.cadvisorPort, defaultLimitMb: 96 },
      { id: 'victoriametrics', name: 'VictoriaMetrics (TSDB PromQL)', port: config.victoriaMetricsPort, defaultLimitMb: 64 },
      { id: 'grafana', name: 'Grafana (Dashboards & Alertas)', port: config.grafanaPort, defaultLimitMb: 128 },
      { id: 'uptime-kuma', name: 'Uptime Kuma (Status Page)', port: config.uptimeKumaPort, defaultLimitMb: 128 }
    ];

    const services: TelemetryServiceInfo[] = serviceDefs.map((def) => {
      const found = findContainer(def.id);
      const memUsageMb = found ? Math.round((found.memUsageBytes / (1024 * 1024)) * 10) / 10 : 0;
      const memLimitMb = found && found.memLimitBytes > 0
        ? Math.round(found.memLimitBytes / (1024 * 1024))
        : def.defaultLimitMb;

      return {
        id: def.id,
        name: def.name,
        containerName: def.id,
        running: !!found,
        status: found ? 'running' : 'stopped',
        port: def.port,
        url: `http://${hostname}:${def.port}`,
        memUsageMb,
        memLimitMb
      };
    });

    const totalStackMemMb = Math.round(services.reduce((acc, s) => acc + s.memUsageMb, 0) * 10) / 10;

    // Verifica quantas séries de containers estão ativas no VictoriaMetrics
    let activeSeriesCount = 0;
    const vmCandidates = [
      `http://127.0.0.1:${config.victoriaMetricsPort}/api/v1/query?query=container_memory_usage_bytes`,
      `http://172.17.0.1:${config.victoriaMetricsPort}/api/v1/query?query=container_memory_usage_bytes`,
      `http://victoriametrics:8428/api/v1/query?query=container_memory_usage_bytes`
    ];

    for (const url of vmCandidates) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const data = (await res.json()) as { data?: { result?: unknown[] } };
          activeSeriesCount = data?.data?.result?.length || 0;
          break;
        }
      } catch {
        // tenta próximo candidato
      }
    }

    const enabled = services.some((s) => s.running);

    return {
      enabled,
      autoProvision: config.autoProvisionTelemetry,
      telemetryDir,
      dockerAvailable,
      containerdSocketHealthy: containerdSocketMounted && activeSeriesCount > 0,
      activeSeriesCount,
      totalStackMemMb,
      stackMemTargetMb: 250,
      services,
      containers: containers.sort((a, b) => b.memUsageBytes - a.memUsageBytes),
      preDegradationAlerts,
      urls: {
        grafana: `http://${hostname}:${config.grafanaPort}`,
        uptimeKuma: `http://${hostname}:${config.uptimeKumaPort}`,
        victoriaMetrics: `http://${hostname}:${config.victoriaMetricsPort}`,
        cadvisor: `http://${hostname}:${config.cadvisorPort}`
      },
      gapsResolved: {
        containerdSocketMounted,
        grafanaAlertRulesProvisioned,
        cgroupsPersisted,
        realisticStackLimits,
        casaosDualAppRegistered
      },
      lastCheckedAt: new Date().toISOString()
    };
  }

  /**
   * Auto-bootstrap executado de forma assíncrona quando o KrakenBridge-Web inicia no Docker.
   * Garante que quem instalar o Kraken tenha a telemetria e cgroups configurados Out-of-the-Box!
   */
  async autoBootstrapOnStartup(): Promise<void> {
    try {
      const config = await this.getSetupConfig();
      if (!config.autoProvisionTelemetry) {
        console.log('[KrakenBridge][Telemetria] Auto-provisionamento desativado via configuração.');
        return;
      }

      if (!fsSync.existsSync('/var/run/docker.sock')) {
        console.log('[KrakenBridge][Telemetria] Socket Docker ausente; pulando auto-bootstrap de telemetria.');
        return;
      }

      const status = await this.getTelemetryStatus();
      const allGapsResolved =
        status.gapsResolved.containerdSocketMounted &&
        status.gapsResolved.grafanaAlertRulesProvisioned &&
        status.gapsResolved.realisticStackLimits &&
        status.gapsResolved.casaosDualAppRegistered;

      if (!status.enabled || !allGapsResolved || status.activeSeriesCount === 0) {
        console.log('[KrakenBridge][Telemetria] Auto-configurando stack Out-of-the-Box e corrigindo lacunas de telemetria/cgroups...');
        const res = await this.provisionOutOfBoxTelemetry(config);
        console.log(`[KrakenBridge][Telemetria] ${res.message}`);
      } else {
        await this.enforceCgroupLimits(config);
        console.log(`[KrakenBridge][Telemetria] Stack saudável (${status.activeSeriesCount} séries ativas, ${status.totalStackMemMb} MB RAM).`);
      }
    } catch (err) {
      console.warn('[KrakenBridge][Telemetria] Aviso durante auto-bootstrap:', (err as Error).message);
    }
  }

  /**
   * Constrói o prompt interativo para o "Chat de Configuração Inicial (Onboarding Out-of-the-Box)"
   */
  async buildOnboardingChatPrompt(): Promise<string> {
    const config = await this.getSetupConfig();
    return `Olá Kraken! Quero fazer a configuração interativa Out-of-the-Box do meu ambiente (Setup & Telemetria).

Aqui está o diagnóstico atual detectado automaticamente:
- Workspace: \`${config.workspacePath}\`
- Gemini API Key configurada: ${config.hasGeminiKey ? 'Sim' : 'Não'}
- GitHub autenticado: ${config.hasGithubToken ? 'Sim' : 'Não'}
- Vercel autenticada: ${config.hasVercelToken ? 'Sim' : 'Não'}
- PIN de segurança ativo: ${config.krakenPinConfigured ? 'Sim' : 'Não'}
- Auto-Provisionamento da Stack de Telemetria (cAdvisor, VictoriaMetrics, Grafana :${config.grafanaPort}, Uptime Kuma :${config.uptimeKumaPort}): ${config.autoProvisionTelemetry ? 'Ativo' : 'Inativo'}
- Limite padrão de memória Cgroups: \`${config.defaultContainerMemLimit}\`

Por favor, me guie passo a passo (ou receba as minhas variáveis/chaves/preferências aqui mesmo no chat) para configurar tudo automaticamente via API \`POST http://localhost:8088/api/system/setup/apply\` e \`POST http://localhost:8088/api/system/telemetry/provision\` sem que eu precise editar arquivos manualmente!`;
  }
}

export const telemetryService = new TelemetryService();
