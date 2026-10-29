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
  private isUpdating = false;

  constructor() {
    this.ensureDataDir();
  }

  public isUpdateInProgress(): boolean {
    return this.isUpdating;
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
    if (this.isUpdating) {
      const err = new Error('Já existe uma atualização de versão em andamento. Aguarde a conclusão.');
      (err as any).statusCode = 409;
      throw err;
    }

    const status = await this.getStatus();
    const selectedTag = targetTag || (status.releases[0] ? status.releases[0].tag : `v${status.latestVersion}`);
    const cleanTarget = selectedTag.replace(/^v/, '');

    // Valida se a versão está fixada e o usuário não especificou tag explícita
    if (!targetTag && status.policy === 'pinned') {
      throw new Error(`O sistema está fixado na versão ${status.pinnedVersion}. Altere a política para 'auto' ou informe uma versão alvo.`);
    }

    this.isUpdating = true;
    let originalRef: string | null = null;

    try {
      // 0. Salva ref atual para rollback atômico em caso de falha de build
      try {
        const refRes = await execAsync('git rev-parse HEAD');
        originalRef = refRes.stdout.trim();
      } catch (refErr) {
        console.warn('[SystemVersionService] Não foi possível capturar commit atual do HEAD:', refErr);
      }

      console.log(`[SystemVersionService] Iniciando atualização de sistema para a versão "${selectedTag}"...`);

      // 1. Git fetch das tags remotas com feedback dinâmico
      console.log('[SystemVersionService] Buscando tags do repositório...');
      await evolutionService.setProgress({
        stage: 'fetching',
        message: `Buscando tags e commits mais recentes para ${selectedTag}...`,
        stepNumber: 1,
        totalSteps: 5,
        percent: 20,
        targetTag: selectedTag
      });
      await execAsync('git fetch --tags origin');

      // 2. Checkout forçado da tag alvo (resiliente contra drift em arquivos rastreados no runtime de produção)
      console.log(`[SystemVersionService] Realizando checkout forçado de ${selectedTag}...`);
      await evolutionService.setProgress({
        stage: 'checking_out',
        message: `Aplicando código da versão ${selectedTag}...`,
        stepNumber: 2,
        totalSteps: 5,
        percent: 40,
        targetTag: selectedTag
      });
      await execAsync(`git checkout -f ${selectedTag}`);
      await execAsync(`git reset --hard ${selectedTag}`);

      // Garante sanitização de quebras de linha em scripts shell contra falhas de CRLF
      try {
        await execAsync("sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true");
      } catch {}

      // 3. Compilação do backend TypeScript com limites controlados de heap
      console.log('[SystemVersionService] Compilando backend TypeScript...');
      await evolutionService.setProgress({
        stage: 'building_backend',
        message: 'Compilando backend TypeScript (dist-server)...',
        stepNumber: 3,
        totalSteps: 5,
        percent: 65,
        targetTag: selectedTag
      });
      await execAsync('npx tsc', {
        env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=1536' }
      });

      // 4. Compilação do frontend
      console.log('[SystemVersionService] Compilando frontend...');
      await evolutionService.setProgress({
        stage: 'building_frontend',
        message: 'Compilando interface web (Vite build)...',
        stepNumber: 4,
        totalSteps: 5,
        percent: 85,
        targetTag: selectedTag
      });
      await execAsync('npm run --prefix frontend build', {
        env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=1536' }
      });

      // 5. Disparo do Graceful Pod Drain Reload
      console.log('[SystemVersionService] Acionando Graceful Reload via Pod Drain...');
      await evolutionService.setProgress({
        stage: 'restarting',
        message: 'Reiniciando servidor na nova versão...',
        stepNumber: 5,
        totalSteps: 5,
        percent: 98,
        targetTag: selectedTag
      });
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

      await evolutionService.setProgress({
        stage: 'error',
        message: `Falha na atualização para ${selectedTag}: ${err?.message || err}`,
        stepNumber: 0,
        totalSteps: 5,
        percent: 0,
        targetTag: selectedTag,
        error: err?.message || String(err)
      });

      // Rollback do checkout caso tenha falhado após trocar de branch/tag
      if (originalRef) {
        try {
          console.log(`[SystemVersionService] Restaurando ref anterior (${originalRef}) devido a falha no update...`);
          await execAsync(`git checkout -f ${originalRef}`);
          await execAsync(`git reset --hard ${originalRef}`);
        } catch (rollbackErr: any) {
          console.error('[SystemVersionService] Falha crítica ao restaurar ref anterior:', rollbackErr);
        }
      }

      const isOOM = err?.message?.includes('JavaScript heap out of memory') ||
                    err?.code === 134 ||
                    err?.stderr?.includes('JavaScript heap out of memory');

      if (isOOM) {
        throw new Error(`Falha no build da versão ${selectedTag} por estouro de memória (Out of Memory). O repositório foi restaurado para a versão anterior.`);
      }

      throw new Error(`Falha durante a atualização de versão: ${err?.message || err}`);
    } finally {
      this.isUpdating = false;
    }
  }
}

export const systemVersionService = new SystemVersionService();
