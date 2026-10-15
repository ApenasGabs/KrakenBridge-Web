import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { historyService } from './historyService.js';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';
const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const CACHE_FILE = path.join(DATA_DIR, 'github_cache.json');
const CACHE_TTL_MS = Number(process.env.GITHUB_CACHE_TTL_MS) || 180000; // 3 minutos de cache padrão

export interface GithubRepoInfo {
  name: string;
  path: string;
  remoteUrl: string;
  ownerRepo: string;
  subproject: string;
}

export interface GithubIssueItem {
  number: number;
  title: string;
  body: string;
  url: string;
  labels: Array<{ name: string; color: string; description?: string }>;
  author: { login: string; name?: string };
  createdAt: string;
  updatedAt?: string;
  repository: { name: string; nameWithOwner: string };
  subproject?: string;
  isLocalWorkspace?: boolean;
}

export interface GithubPullRequestItem {
  number: number;
  title: string;
  body: string;
  url: string;
  headRefName?: string;
  baseRefName?: string;
  isDraft: boolean;
  labels: Array<{ name: string; color: string; description?: string }>;
  author: { login: string; name?: string };
  createdAt: string;
  updatedAt?: string;
  repository: { name: string; nameWithOwner: string };
  subproject?: string;
  isLocalWorkspace?: boolean;
  linkedConversation?: {
    id: string;
    title: string;
    subproject?: string;
  } | null;
}

export interface ProjectOverview {
  authenticatedUser: string;
  repositories: GithubRepoInfo[];
  issuesCount: number;
  prsCount: number;
  lastUpdated: number;
  fromCache?: boolean;
}

interface PersistentCacheData {
  overview?: ProjectOverview;
  issues?: GithubIssueItem[];
  prs?: GithubPullRequestItem[];
  timestamp: number;
}

class GithubProjectService {
  private memoryCache: PersistentCacheData = { timestamp: 0 };
  private isSafeDirectoryConfigured = false;
  private isFetching = false;

  constructor() {
    this.loadCacheFromDisk().catch(() => {});
  }

  /**
   * Carrega cache persistido em disco para resposta instantânea mesmo após reinício
   */
  private async loadCacheFromDisk(): Promise<void> {
    try {
      const exists = await fs.stat(CACHE_FILE).catch(() => null);
      if (exists) {
        const raw = await fs.readFile(CACHE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.timestamp === 'number') {
          this.memoryCache = parsed;
        }
      }
    } catch (err) {
      console.warn('[GithubProjectService] Aviso ao carregar cache do disco:', (err as Error).message);
    }
  }

  /**
   * Salva cache atual em disco de forma assíncrona sem travar requisições
   */
  private async saveCacheToDisk(): Promise<void> {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(CACHE_FILE, JSON.stringify(this.memoryCache, null, 2), 'utf8');
    } catch (err) {
      console.warn('[GithubProjectService] Aviso ao gravar cache no disco:', (err as Error).message);
    }
  }

  /**
   * Garante que o Git não bloqueie diretórios com permissões diferentes (dubious ownership)
   */
  private async ensureSafeDirectory(): Promise<void> {
    if (this.isSafeDirectoryConfigured) return;
    try {
      await execAsync('git config --global --add safe.directory "*"');
      this.isSafeDirectoryConfigured = true;
    } catch {
      // Ignora erro caso git global já esteja configurado
    }
  }

  /**
   * Obtém o login do usuário atualmente autenticado no GitHub CLI de maneira 100% dinâmica
   */
  async getAuthenticatedUser(): Promise<string> {
    try {
      const { stdout } = await execAsync('gh api user --jq .login', { timeout: 6000 });
      const user = stdout.trim();
      if (user) return user;
    } catch {}

    try {
      const { stdout } = await execAsync('gh auth status', { timeout: 6000 });
      const match = stdout.match(/account\s+([a-zA-Z0-9_\-]+)/i) || stdout.match(/as\s+([a-zA-Z0-9_\-]+)/i);
      if (match) return match[1];
    } catch {}

    return '';
  }

  /**
   * Varre recursivamente diretórios de /workspace (nível 1 e 2) e /app
   * Totalmente agnóstico a nomes de projetos e proprietários
   */
  async getLocalGitRepositories(): Promise<GithubRepoInfo[]> {
    await this.ensureSafeDirectory();

    const repos: GithubRepoInfo[] = [];
    const visitedDirs = new Set<string>();
    const seenOwnerRepos = new Set<string>();

    const checkDir = async (dirPath: string, subprojectName: string) => {
      if (visitedDirs.has(dirPath)) return false;
      visitedDirs.add(dirPath);

      try {
        const gitDir = path.join(dirPath, '.git');
        const stat = await fs.stat(gitDir).catch(() => null);
        if (stat) {
          const { stdout } = await execAsync('git config --get remote.origin.url', { cwd: dirPath, timeout: 3000 });
          const remote = stdout.trim();
          const ownerRepo = this.parseOwnerRepo(remote);
          if (ownerRepo && !seenOwnerRepos.has(ownerRepo.toLowerCase())) {
            seenOwnerRepos.add(ownerRepo.toLowerCase());
            repos.push({
              name: path.basename(dirPath),
              path: dirPath,
              remoteUrl: remote,
              ownerRepo,
              subproject: subprojectName
            });
            return true;
          }
        }
      } catch {}
      return false;
    };

    // 1. Repositório da própria aplicação
    await checkDir('/app', 'KrakenBridge-Web');

    // 2. Subprojetos em /workspace (varredura profunda até nível 2)
    try {
      const entries = await fs.readdir(WORKSPACE_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

        const p1 = path.join(WORKSPACE_DIR, entry.name);
        const isGit = await checkDir(p1, entry.name);
        if (!isGit) {
          try {
            const subEntries = await fs.readdir(p1, { withFileTypes: true });
            for (const sub of subEntries) {
              if (!sub.isDirectory() && !sub.isSymbolicLink()) continue;
              if (sub.name.startsWith('.') || sub.name === 'node_modules') continue;
              const p2 = path.join(p1, sub.name);
              await checkDir(p2, `${entry.name}/${sub.name}`);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.warn('[GithubProjectService] Erro ao varrer workspace:', (err as Error).message);
    }

    return repos;
  }

  /**
   * Extrai owner/repo de URLs HTTPS ou SSH git@github.com de forma genérica
   */
  private parseOwnerRepo(remoteUrl: string): string | null {
    if (!remoteUrl) return null;
    const match = remoteUrl.match(/github\.com[:/]([a-zA-Z0-9_\-\.]+)\/([a-zA-Z0-9_\-\.]+?)(?:\.git)?$/i);
    if (match) {
      return `${match[1]}/${match[2]}`;
    }
    return null;
  }

  /**
   * Obtém lista consolidada de Issues abertas com proteção contra Rate Limit e Cache
   */
  async getIssues(force = false): Promise<GithubIssueItem[]> {
    const now = Date.now();
    const hasValidCache = !!this.memoryCache.issues && (now - this.memoryCache.timestamp < CACHE_TTL_MS);

    if (!force && hasValidCache) {
      return this.memoryCache.issues!;
    }

    try {
      const repos = await this.getLocalGitRepositories();
      const repoMap = new Map<string, GithubRepoInfo>();
      for (const r of repos) {
        repoMap.set(r.ownerRepo.toLowerCase(), r);
      }

      const username = await this.getAuthenticatedUser();
      const issueMap = new Map<string, GithubIssueItem>();

      // 1. Coleta direta e em lote nas issues dos repositórios locais detectados
      const localPromises = repos.map(async (r) => {
        try {
          const { stdout } = await execAsync(
            `gh issue list --repo "${r.ownerRepo}" --state open --json number,title,labels,createdAt,updatedAt,url,body,author --limit 30`,
            { timeout: 9000 }
          );
          const list = JSON.parse(stdout || '[]') as any[];
          for (const item of list) {
            const key = `${r.ownerRepo.toLowerCase()}#${item.number}`;
            issueMap.set(key, {
              number: item.number,
              title: item.title,
              body: item.body || '',
              url: item.url,
              labels: Array.isArray(item.labels) ? item.labels : [],
              author: item.author || { login: username || 'user' },
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              repository: {
                name: r.name,
                nameWithOwner: r.ownerRepo
              },
              subproject: r.subproject,
              isLocalWorkspace: true
            });
          }
        } catch {}
      });

      await Promise.all(localPromises);

      // 2. Coleta abrangente usando @me e owner para repositórios fora do workspace
      try {
        const queries: string[] = ['--involves @me'];
        if (username) {
          queries.push(`--owner ${username}`);
        }

        const searchPromises = queries.map(q => 
          execAsync(
            `gh search issues --state open ${q} --json repository,number,title,labels,createdAt,updatedAt,url,body,author --limit 50`,
            { timeout: 15000 }
          ).then(r => JSON.parse(r.stdout || '[]') as any[]).catch(() => [] as any[])
        );

        const searchResults = await Promise.all(searchPromises);
        const combined = searchResults.flat();

        for (const item of combined) {
          const repoNameWithOwner = item.repository?.nameWithOwner || '';
          if (!repoNameWithOwner) continue;
          const key = `${repoNameWithOwner.toLowerCase()}#${item.number}`;
          if (issueMap.has(key)) continue;

          const local = repoMap.get(repoNameWithOwner.toLowerCase());
          issueMap.set(key, {
            number: item.number,
            title: item.title,
            body: item.body || '',
            url: item.url,
            labels: Array.isArray(item.labels) ? item.labels : [],
            author: item.author || { login: username || 'user' },
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            repository: {
              name: item.repository?.name || (repoNameWithOwner.includes('/') ? repoNameWithOwner.split('/')[1] : repoNameWithOwner),
              nameWithOwner: repoNameWithOwner
            },
            subproject: local?.subproject || (repoNameWithOwner.includes('/') ? repoNameWithOwner.split('/')[1] : repoNameWithOwner),
            isLocalWorkspace: !!local
          });
        }
      } catch (err) {
        console.warn('[GithubProjectService] Aviso na busca ampla de issues:', (err as Error).message);
      }

      const issues = Array.from(issueMap.values());

      // Ordenação padrão: locais primeiro, mais recentes primeiro
      issues.sort((a, b) => {
        const aLocal = a.isLocalWorkspace ? 1 : 0;
        const bLocal = b.isLocalWorkspace ? 1 : 0;
        if (aLocal !== bLocal) return bLocal - aLocal;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      this.memoryCache.issues = issues;
      this.memoryCache.timestamp = Date.now();
      this.saveCacheToDisk().catch(() => {});

      return issues;
    } catch (err) {
      console.error('[GithubProjectService] Erro ao buscar issues (usando fallback de cache):', (err as Error).message);
      if (this.memoryCache.issues) return this.memoryCache.issues;
      return [];
    }
  }

  /**
   * Obtém lista consolidada de PRs abertos com lote otimizado (zero N+1) e cache
   */
  async getPullRequests(force = false): Promise<GithubPullRequestItem[]> {
    const now = Date.now();
    const hasValidCache = !!this.memoryCache.prs && (now - this.memoryCache.timestamp < CACHE_TTL_MS);

    if (!force && hasValidCache) {
      return this.memoryCache.prs!;
    }

    try {
      const repos = await this.getLocalGitRepositories();
      const repoMap = new Map<string, GithubRepoInfo>();
      for (const r of repos) {
        repoMap.set(r.ownerRepo.toLowerCase(), r);
      }

      const username = await this.getAuthenticatedUser();
      const prMap = new Map<string, GithubPullRequestItem>();

      // 1. Busca em lote de todos os repositórios locais
      // gh pr list já retorna headRefName e baseRefName em 1 chamada única!
      const localPromises = repos.map(async (r) => {
        try {
          const { stdout } = await execAsync(
            `gh pr list --repo "${r.ownerRepo}" --state open --json number,title,labels,createdAt,updatedAt,url,body,isDraft,author,headRefName,baseRefName --limit 30`,
            { timeout: 9000 }
          );
          const list = JSON.parse(stdout || '[]') as any[];
          for (const item of list) {
            const key = `${r.ownerRepo.toLowerCase()}#${item.number}`;
            prMap.set(key, {
              number: item.number,
              title: item.title,
              body: item.body || '',
              url: item.url,
              headRefName: item.headRefName || '',
              baseRefName: item.baseRefName || 'main',
              isDraft: !!item.isDraft,
              labels: Array.isArray(item.labels) ? item.labels : [],
              author: item.author || { login: username || 'user' },
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              repository: {
                name: r.name,
                nameWithOwner: r.ownerRepo
              },
              subproject: r.subproject,
              isLocalWorkspace: true
            });
          }
        } catch {}
      });

      await Promise.all(localPromises);

      // 2. Busca abrangente em lote para PRs de outras organizações/repositórios
      try {
        const queries: string[] = ['--involves @me'];
        if (username) {
          queries.push(`--owner ${username}`);
        }

        const searchPromises = queries.map(q =>
          execAsync(
            `gh search prs --state open ${q} --json repository,number,title,labels,createdAt,updatedAt,url,body,isDraft,author --limit 50`,
            { timeout: 15000 }
          ).then(r => JSON.parse(r.stdout || '[]') as any[]).catch(() => [] as any[])
        );

        const searchResults = await Promise.all(searchPromises);
        const combined = searchResults.flat();

        for (const item of combined) {
          const repoNameWithOwner = item.repository?.nameWithOwner || '';
          if (!repoNameWithOwner) continue;
          const key = `${repoNameWithOwner.toLowerCase()}#${item.number}`;
          if (prMap.has(key)) continue;

          const local = repoMap.get(repoNameWithOwner.toLowerCase());
          prMap.set(key, {
            number: item.number,
            title: item.title,
            body: item.body || '',
            url: item.url,
            headRefName: '',
            baseRefName: 'main',
            isDraft: !!item.isDraft,
            labels: Array.isArray(item.labels) ? item.labels : [],
            author: item.author || { login: username || 'user' },
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            repository: {
              name: item.repository?.name || (repoNameWithOwner.includes('/') ? repoNameWithOwner.split('/')[1] : repoNameWithOwner),
              nameWithOwner: repoNameWithOwner
            },
            subproject: local?.subproject || (repoNameWithOwner.includes('/') ? repoNameWithOwner.split('/')[1] : repoNameWithOwner),
            isLocalWorkspace: !!local
          });
        }
      } catch (err) {
        console.warn('[GithubProjectService] Aviso na busca ampla de PRs:', (err as Error).message);
      }

      const prsList = Array.from(prMap.values());

      // 3. Vinculação com sessões do Kraken em memória/disco
      const sessions = await historyService.list().catch(() => []);

      const prs = await Promise.all(
        prsList.map(async (item) => {
          const linkedConversation = await this.findLinkedConversation(sessions, {
            prNumber: item.number,
            prTitle: item.title,
            branch: item.headRefName,
            subproject: item.subproject
          });

          return {
            ...item,
            linkedConversation
          };
        })
      );

      // Ordenação padrão: locais primeiro, mais recentes primeiro
      prs.sort((a, b) => {
        const aLocal = a.isLocalWorkspace ? 1 : 0;
        const bLocal = b.isLocalWorkspace ? 1 : 0;
        if (aLocal !== bLocal) return bLocal - aLocal;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      this.memoryCache.prs = prs;
      this.memoryCache.timestamp = Date.now();
      this.saveCacheToDisk().catch(() => {});

      return prs;
    } catch (err) {
      console.error('[GithubProjectService] Erro ao buscar PRs (usando fallback de cache):', (err as Error).message);
      if (this.memoryCache.prs) return this.memoryCache.prs;
      return [];
    }
  }

  /**
   * Heurística inteligente para vincular PR com sessão do Kraken
   */
  private async findLinkedConversation(
    sessions: Array<{ id: string; title: string; subproject?: string; tags?: string[] }>,
    info: { prNumber: number; prTitle: string; branch?: string; subproject?: string }
  ): Promise<{ id: string; title: string; subproject?: string } | null> {
    const prTag = `pr-${info.prNumber}`;
    const prStr = `#${info.prNumber}`;
    const prUrlPattern = `pull/${info.prNumber}`;
    const branchLower = (info.branch || '').toLowerCase();

    // 1. Match direto por tag ou título da sessão
    for (const s of sessions) {
      if (s.tags && s.tags.includes(prTag)) {
        return { id: s.id, title: s.title, subproject: s.subproject };
      }
      if (s.title && (s.title.includes(prStr) || (branchLower && branchLower.length > 3 && s.title.toLowerCase().includes(branchLower)))) {
        return { id: s.id, title: s.title, subproject: s.subproject };
      }
    }

    // 2. Busca profunda nos arquivos de sessão do subprojeto correspondente
    const sessionsDir = path.resolve('data/sessions');
    for (const s of sessions) {
      if (s.subproject && info.subproject && s.subproject.toLowerCase() !== info.subproject.toLowerCase()) {
        continue;
      }

      try {
        const filePath = path.join(sessionsDir, `${s.id}.json`);
        const raw = await fs.readFile(filePath, 'utf8');
        if (
          raw.includes(prUrlPattern) ||
          (branchLower && branchLower.length > 3 && raw.toLowerCase().includes(branchLower))
        ) {
          return { id: s.id, title: s.title, subproject: s.subproject };
        }
      } catch {}
    }

    return null;
  }

  /**
   * Overview geral com suporte a cache e rate-limit shield
   */
  async getOverview(force = false): Promise<ProjectOverview> {
    const now = Date.now();
    const hasValidCache = !!this.memoryCache.overview && (now - this.memoryCache.timestamp < CACHE_TTL_MS);

    if (!force && hasValidCache) {
      return {
        ...this.memoryCache.overview!,
        fromCache: true
      };
    }

    const [user, repos, issues, prs] = await Promise.all([
      this.getAuthenticatedUser(),
      this.getLocalGitRepositories(),
      this.getIssues(force),
      this.getPullRequests(force)
    ]);

    const overview: ProjectOverview = {
      authenticatedUser: user,
      repositories: repos,
      issuesCount: issues.length,
      prsCount: prs.length,
      lastUpdated: Date.now(),
      fromCache: false
    };

    this.memoryCache.overview = overview;
    this.memoryCache.timestamp = Date.now();
    this.saveCacheToDisk().catch(() => {});

    return overview;
  }

  /**
   * Aprova ou efetua merge de um Pull Request via GitHub CLI
   */
  async approveOrMergePR(repo: string, prNumber: number, action: 'approve' | 'merge', mergeMethod = 'squash'): Promise<{ success: boolean; message: string }> {
    try {
      if (action === 'approve') {
        await execAsync(`gh pr review ${prNumber} --repo "${repo}" --approve --body "Aprovado via KrakenBridge Dashboard"`, {
          timeout: 12000
        });
        return { success: true, message: `PR #${prNumber} em ${repo} aprovado com sucesso!` };
      } else {
        const methodFlag = mergeMethod === 'merge' ? '--merge' : mergeMethod === 'rebase' ? '--rebase' : '--squash';
        await execAsync(`gh pr merge ${prNumber} --repo "${repo}" ${methodFlag}`, {
          timeout: 20000
        });
        return { success: true, message: `PR #${prNumber} em ${repo} mesclado com sucesso!` };
      }
    } catch (err) {
      throw new Error(`Falha ao executar ${action} no PR #${prNumber}: ${(err as Error).message}`);
    }
  }

  /**
   * Despacha uma solicitação de revisão para o PR:
   * Localiza a conversa original ou cria uma nova já contextualizada
   */
  async dispatchReview(params: {
    repo: string;
    prNumber: number;
    prTitle: string;
    prUrl: string;
    branch?: string;
    comment: string;
  }): Promise<{
    conversationId: string;
    isNew: boolean;
    subproject: string;
    suggestedPrompt: string;
  }> {
    const { repo, prNumber, prTitle, prUrl, branch, comment } = params;
    const repos = await this.getLocalGitRepositories();
    const local = repos.find(r => r.ownerRepo.toLowerCase() === repo.toLowerCase());
    const subproject = local?.subproject || (repo.includes('/') ? repo.split('/')[1] : repo);

    // 1. Verifica se já existe conversa vinculada
    const sessions = await historyService.list().catch(() => []);
    const linked = await this.findLinkedConversation(sessions, {
      prNumber,
      prTitle,
      branch,
      subproject
    });

    const promptText = `Estou revisando o PR #${prNumber} ("${prTitle}") no repositório ${repo}${branch ? ` (branch: ${branch})` : ''} - [Ver PR](${prUrl}).\n\nPor favor, implemente o seguinte ajuste solicitado:\n\n${comment.trim()}`;

    if (linked) {
      return {
        conversationId: linked.id,
        isNew: false,
        subproject: linked.subproject || subproject,
        suggestedPrompt: promptText
      };
    }

    // 2. Cria nova conversa contextualizada
    const newId = randomUUID();
    const newSession = await historyService.save({
      id: newId,
      title: `Revisão PR #${prNumber}: ${prTitle.slice(0, 32)}`,
      agent: 'antigravity',
      model: 'gemini-3.8-flash-high',
      effort: 'high',
      mode: 'default',
      subproject,
      tags: ['review', 'pr', `pr-${prNumber}`, 'github'],
      messages: []
    });

    return {
      conversationId: newSession?.id || newId,
      isNew: true,
      subproject,
      suggestedPrompt: promptText
    };
  }
}

export const githubProjectService = new GithubProjectService();
