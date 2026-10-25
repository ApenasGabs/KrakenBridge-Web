import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { evolutionService } from './evolutionService.js';

const execAsync = promisify(exec);

export type UpdatePolicy = 'auto' | 'pinned';

export interface ReleaseInfo {
  tag: string;
  name: string;
  changelog: string;
  publishedAt: string;
  isCurrent: boolean;
  isLatest: boolean;
}

export interface SystemVersionStatus {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  policy: UpdatePolicy;
  pinnedVersion: string | null;
  releases: ReleaseInfo[];
  lastCheckedAt: string;
}

export interface VersionPolicyState {
  policy: UpdatePolicy;
  pinnedVersion?: string | null;
  lastCheckedAt?: string;
}

class SystemVersionService {
  private dataDir = path.resolve('data');
  private policyFilePath = path.join(this.dataDir, 'system_version_policy.json');
  private cachedReleases: ReleaseInfo[] = [];
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

  constructor() {
    this.ensureDataDir();
  }

  private ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch {}
    }
  }

  public getCurrentVersion(): string {
    try {
      const pkgPath = path.resolve('package.json');
      const raw = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(raw);
      return pkg.version || '1.0.0';
    } catch {
      return '1.0.0';
    }
  }

  public getPolicyState(): VersionPolicyState {
    if (fs.existsSync(this.policyFilePath)) {
      try {
        const raw = fs.readFileSync(this.policyFilePath, 'utf-8');
        return JSON.parse(raw);
      } catch {}
    }
    return {
      policy: 'auto',
      pinnedVersion: null,
      lastCheckedAt: new Date().toISOString()
    };
  }

  public setPolicy(policy: UpdatePolicy, pinnedVersion?: string | null): VersionPolicyState {
    const current = this.getPolicyState();
    const updated: VersionPolicyState = {
      policy,
      pinnedVersion: policy === 'pinned' ? (pinnedVersion || `v${this.getCurrentVersion()}`) : null,
      lastCheckedAt: new Date().toISOString()
    };

    try {
      fs.writeFileSync(this.policyFilePath, JSON.stringify(updated, null, 2), 'utf-8');
    } catch (err) {
      console.error('[SystemVersionService] Falha ao persistir política de versão:', err);
    }

    return updated;
  }

  public compareSemver(v1: string, v2: string): number {
    const clean1 = (v1 || '').replace(/^v/, '').trim();
    const clean2 = (v2 || '').replace(/^v/, '').trim();

    const parts1 = clean1.split('.').map(n => parseInt(n, 10) || 0);
    const parts2 = clean2.split('.').map(n => parseInt(n, 10) || 0);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  public async getAvailableReleases(): Promise<ReleaseInfo[]> {
    const now = Date.now();
    if (this.cachedReleases.length > 0 && now - this.lastFetchTime < this.CACHE_TTL_MS) {
      return this.cachedReleases;
    }

    const currentVer = this.getCurrentVersion();
    let releases: ReleaseInfo[] = [];

    // Tentativa 1: Buscar do GitHub API
    try {
      const res = await fetch('https://api.github.com/repos/ApenasGabs/KrakenBridge-Web/releases?per_page=15', {
        headers: {
          'User-Agent': 'KrakenBridge-Web-System',
          'Accept': 'application/vnd.github.v3+json'
        },
        signal: AbortSignal.timeout(6000)
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          releases = data.map((r: any) => ({
            tag: r.tag_name,
            name: r.name || r.tag_name,
            changelog: r.body || 'Sem notas de release informadas.',
            publishedAt: r.published_at || new Date().toISOString(),
            isCurrent: this.compareSemver(r.tag_name, currentVer) === 0,
            isLatest: false
          }));
        }
      }
    } catch {
      // Fallback para tags locais e CHANGELOG.md caso rede externa esteja indisponível
    }

    // Fallback local caso a API do GitHub falhe ou seja rate-limited
    if (releases.length === 0) {
      releases = this.getLocalReleasesFromChangelogAndGit();
    }

    // Ordena releases decrescente por semver
    releases.sort((a, b) => this.compareSemver(b.tag, a.tag));

    if (releases.length > 0) {
      releases[0].isLatest = true;
    }

    this.cachedReleases = releases;
    this.lastFetchTime = now;
    return releases;
  }

  private getLocalReleasesFromChangelogAndGit(): ReleaseInfo[] {
    const currentVer = this.getCurrentVersion();
    const releases: ReleaseInfo[] = [];

    try {
      const changelogPath = path.resolve('CHANGELOG.md');
      if (fs.existsSync(changelogPath)) {
        const raw = fs.readFileSync(changelogPath, 'utf-8');
        const sections = raw.split(/^##\s+\[?v?(\d+\.\d+\.\d+)\]?/gm);

        for (let i = 1; i < sections.length; i += 2) {
          const ver = sections[i];
          const content = sections[i + 1] ? sections[i + 1].trim().slice(0, 500) : '';
          const tag = `v${ver}`;

          releases.push({
            tag,
            name: `Release ${tag}`,
            changelog: content || 'Notas de versão documentadas no CHANGELOG.md',
            publishedAt: new Date().toISOString(),
            isCurrent: this.compareSemver(tag, currentVer) === 0,
            isLatest: false
          });
        }
      }
    } catch {}

    if (releases.length === 0) {
      releases.push({
        tag: `v${currentVer}`,
        name: `Versão Atual (v${currentVer})`,
        changelog: 'Versão em execução ativa.',
        publishedAt: new Date().toISOString(),
        isCurrent: true,
        isLatest: true
      });
    }

    return releases;
  }

  public async getStatus(): Promise<SystemVersionStatus> {
    const currentVersion = this.getCurrentVersion();
    const policyState = this.getPolicyState();
    const releases = await this.getAvailableReleases();

    const latestRelease = releases[0];
    const latestVersion = latestRelease ? latestRelease.tag.replace(/^v/, '') : currentVersion;

    const hasNewerAvailable = this.compareSemver(latestVersion, currentVersion) > 0;
    const hasUpdate = policyState.policy === 'auto' && hasNewerAvailable;

    return {
      currentVersion,
      latestVersion,
      hasUpdate,
      policy: policyState.policy,
      pinnedVersion: policyState.pinnedVersion || null,
      releases,
      lastCheckedAt: policyState.lastCheckedAt || new Date().toISOString()
    };
  }

  public async updateToVersion(targetTag?: string): Promise<{ success: boolean; message: string; targetVersion: string }> {
    const status = await this.getStatus();
    const selectedTag = targetTag || (status.releases[0] ? status.releases[0].tag : `v${status.latestVersion}`);
    const cleanTarget = selectedTag.replace(/^v/, '');

    console.log(`[SystemVersionService] Iniciando atualização de sistema para a versão "${selectedTag}"...`);

    // Valida se a versão está fixada e o usuário não especificou tag explícita
    if (!targetTag && status.policy === 'pinned') {
      throw new Error(`O sistema está fixado na versão ${status.pinnedVersion}. Altere a política para 'auto' ou informe uma versão alvo.`);
    }

    try {
      // 1. Git fetch das tags remotas
      console.log('[SystemVersionService] Buscando tags do repositório...');
      await execAsync('git fetch --tags origin');

      // 2. Checkout da tag alvo
      console.log(`[SystemVersionService] Realizando checkout de ${selectedTag}...`);
      await execAsync(`git checkout ${selectedTag}`);

      // 3. Compilação do servidor e frontend
      console.log('[SystemVersionService] Compilando nova versão...');
      console.log('[SystemVersionService] Compilando backend TypeScript...');
      await execAsync('npx tsc');
      console.log('[SystemVersionService] Compilando frontend...');
      await execAsync('npm run --prefix frontend build', {
        env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=1024' }
      }).catch((buildErr) => {
        console.warn('[SystemVersionService] Aviso no build do frontend (mantendo fallback):', buildErr?.message);
      });

      // 4. Disparo do Graceful Pod Drain Reload
      console.log('[SystemVersionService] Acionando Graceful Reload via Pod Drain...');
      await evolutionService.triggerReload({
        taskDescription: `Atualização de versão para ${selectedTag}`,
        rebuildFrontend: false
      });

      return {
        success: true,
        message: `Atualização para ${selectedTag} realizada com sucesso. O sistema está concluindo as tarefas ativas e reiniciando graciosamente.`,
        targetVersion: cleanTarget
      };
    } catch (err: any) {
      console.error('[SystemVersionService] Erro ao executar atualização:', err);
      throw new Error(`Falha durante a atualização de versão: ${err?.message || err}`);
    }
  }
}

export const systemVersionService = new SystemVersionService();
