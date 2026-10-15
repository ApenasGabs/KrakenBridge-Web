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
const CACHE_TTL_MS = Number(process.env.GITHUB_CACHE_TTL_MS) || 300000; // 5 minutos de cache padrão (300.000 ms)

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
  isStale?: boolean;
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
  private syncPromise: Promise<{
    overview: ProjectOverview;
    issues: GithubIssueItem[];
    prs: GithubPullRequestItem[];
  }> | null = null;

  constructor() {
    this.loadCacheFromDisk()
      .then(() => {
        const now = Date.now();
        if (!this.memoryCache.timestamp || now - this.memoryCache.timestamp >= CACHE_TTL_MS) {
          this.fetchGithubData().catch(() => {});
        }

        const timer = setInterval(() => {
          this.fetchGithubData().catch(() => {});
        }, CACHE_TTL_MS);
        if (timer.unref) timer.unref();
      })
      .catch(() => {});
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
   * Obtém token de autenticação do GitHub (variáveis de ambiente ou hosts.yml)
   */
  async getGithubToken(): Promise<string | null> {
    if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim()) {
      return process.env.GITHUB_TOKEN.trim();
    }
    if (process.env.GH_TOKEN && process.env.GH_TOKEN.trim()) {
      return process.env.GH_TOKEN.trim();
    }
    try {
      const ghDir = process.env.GH_CONFIG_DIR || '/root/.config/gh';
      const hostFile = path.join(ghDir, 'hosts.yml');
      const content = await fs.readFile(hostFile, 'utf8').catch(() => '');
      const match = content.match(/oauth_token:\s*([^\r\n]+)/);
      if (match && match[1]) {
        return match[1].trim();
      }
    } catch {}
    return null;
  }

  /**
   * Executa consulta nativa na API GraphQL do GitHub
   */
  async executeGraphQL<T>(query: string, variables?: Record<string, any>): Promise<T> {
    const token = await this.getGithubToken();
    if (!token) {
      throw new Error('Nenhuma credencial do GitHub encontrada. Conecte sua conta em Configurações > Autenticação.');
    }

    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'KrakenBridge-Web'
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 401) {
        throw new Error('Token do GitHub expirado ou inválido (401 Unauthorized). Reconecte sua conta.');
      }
      if (response.status === 403) {
        throw new Error(`Limite de requisições do GitHub atingido (403 Forbidden): ${errText}`);
      }
      throw new Error(`Erro na API do GitHub (${response.status}): ${errText}`);
    }

    const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors && json.errors.length > 0 && !json.data) {
      throw new Error(`Erro GraphQL do GitHub: ${json.errors.map(e => e.message).join('; ')}`);
    }

    return json.data as T;
  }

  /**
   * Executa requisição na API REST do GitHub para mutações e chamadas pontuais
   */
  async executeRest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getGithubToken();
    if (!token) {
      throw new Error('Nenhuma credencial do GitHub encontrada.');
    }

    const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com/${endpoint.replace(/^\//, '')}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'KrakenBridge-Web',
      ...(options.headers as Record<string, string> || {})
    };

    const res = await fetch(url, {
      ...options,
      headers
    });

    if (!res.ok) {
      const errBody = await res.text();
      let parsedMsg = errBody;
      try {
        const j = JSON.parse(errBody);
        parsedMsg = j.message || errBody;
      } catch {}
      throw new Error(`GitHub REST Error (${res.status}): ${parsedMsg}`);
    }

    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
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
   * Obtém o login do usuário autenticado no GitHub
   */
  async getAuthenticatedUser(): Promise<string> {
    // 1. Tenta obter via GraphQL/REST
    const token = await this.getGithubToken();
    if (token) {
      try {
        const userData = await this.executeRest<{ login?: string }>('user');
        if (userData?.login) return userData.login;
      } catch {}
    }

    // 2. Fallback para arquivo de configuração hosts.yml
    try {
      const ghDir = process.env.GH_CONFIG_DIR || '/root/.config/gh';
      const hostFile = path.join(ghDir, 'hosts.yml');
      const content = await fs.readFile(hostFile, 'utf8').catch(() => '');
      const match = content.match(/user:\s*([^\r\n]+)/);
      if (match && match[1]) {
        return match[1].trim();
      }
    } catch {}

    return '';
  }

  /**
   * Varre recursivamente diretórios de /workspace (nível 1 e 2) e /app
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

    // 2. Subprojetos em /workspace (varredura até nível 2)
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
   * Sincroniza dados unificados do GitHub com suporte a Stale-While-Revalidate
   */
  async syncGithubData(force = false): Promise<{
    overview: ProjectOverview;
    issues: GithubIssueItem[];
    prs: GithubPullRequestItem[];
  }> {
    const now = Date.now();
    const hasCache =
      !!this.memoryCache.overview &&
      !!this.memoryCache.issues &&
      !!this.memoryCache.prs;
    const isFresh = hasCache && now - this.memoryCache.timestamp < CACHE_TTL_MS;

    // Se temos cache válido e não foi forçado, retorna imediatamente
    if (!force && isFresh) {
      return {
        overview: { ...this.memoryCache.overview!, fromCache: true, isStale: false },
        issues: this.memoryCache.issues!,
        prs: this.memoryCache.prs!
      };
    }

    // Padrão Stale-While-Revalidate:
    // Se temos cache prévio em memória/disco e a requisição NÃO for forçada,
    // entregamos os dados instantaneamente (<1ms) e revalidamos em segundo plano.
    if (!force && hasCache) {
      if (!this.syncPromise) {
        this.fetchGithubData().catch(err => {
          console.warn('[GithubProjectService] Revalidação silenciosa em segundo plano falhou:', (err as Error).message);
        });
      }
      return {
        overview: { ...this.memoryCache.overview!, fromCache: true, isStale: true },
        issues: this.memoryCache.issues!,
        prs: this.memoryCache.prs!
      };
    }

    // Se for force=true ou se ainda não temos nenhum cache em memória, aguarda a busca completa
    return this.fetchGithubData();
  }

  /**
   * Executa a busca consolidada no GitHub via GraphQL e atualiza o cache
   */
  private async fetchGithubData(): Promise<{
    overview: ProjectOverview;
    issues: GithubIssueItem[];
    prs: GithubPullRequestItem[];
  }> {
    if (this.syncPromise) {
      return this.syncPromise;
    }

    this.syncPromise = (async () => {
      try {
        const repos = await this.getLocalGitRepositories();
        const repoMap = new Map<string, GithubRepoInfo>();
        for (const r of repos) {
          repoMap.set(r.ownerRepo.toLowerCase(), r);
        }

        const username = await this.getAuthenticatedUser();
        const token = await this.getGithubToken();

        if (!token) {
          console.warn('[GithubProjectService] Token não encontrado, retornando dados vazios.');
          const emptyOverview: ProjectOverview = {
            authenticatedUser: '',
            repositories: repos,
            issuesCount: 0,
            prsCount: 0,
            lastUpdated: Date.now(),
            fromCache: false
          };
          return { overview: emptyOverview, issues: [], prs: [] };
        }

        // Identifica repositórios locais que pertencem a outras organizações/usuários (ex: FGL-Labs)
        const externalRepos = repos.filter(
          r => username && !r.ownerRepo.toLowerCase().startsWith(`${username.toLowerCase()}/`)
        );
        const extraRepoQuery = externalRepos.map(r => `repo:${r.ownerRepo}`).join(' ');

        // Constrói a consulta GraphQL consolidada
        const extraIssuesPart = extraRepoQuery
          ? `extraIssues: search(query: "is:open is:issue ${extraRepoQuery} sort:updated-desc", type: ISSUE, first: 40) { nodes { ... on Issue { number title body url createdAt updatedAt repository { name nameWithOwner } author { login ... on User { name } } labels(first: 10) { nodes { name color description } } } } }`
          : '';

        const extraPrsPart = extraRepoQuery
          ? `extraPrs: search(query: "is:open is:pr ${extraRepoQuery} sort:updated-desc", type: ISSUE, first: 40) { nodes { ... on PullRequest { number title body url headRefName baseRefName isDraft createdAt updatedAt repository { name nameWithOwner } author { login ... on User { name } } labels(first: 10) { nodes { name color description } } } } }`
          : '';

        const graphqlQuery = `query GetGithubBacklog {
          viewer {
            login
            name
          }
          userIssues: search(query: "is:open is:issue user:@me sort:updated-desc", type: ISSUE, first: 100) {
            nodes {
              ... on Issue {
                number
                title
                body
                url
                createdAt
                updatedAt
                repository {
                  name
                  nameWithOwner
                }
                author {
                  login
                  ... on User {
                    name
                  }
                }
                labels(first: 10) {
                  nodes {
                    name
                    color
                    description
                  }
                }
              }
            }
          }
          involvesIssues: search(query: "is:open is:issue involves:@me -user:@me sort:updated-desc", type: ISSUE, first: 50) {
            nodes {
              ... on Issue {
                number
                title
                body
                url
                createdAt
                updatedAt
                repository {
                  name
                  nameWithOwner
                }
                author {
                  login
                  ... on User {
                    name
                  }
                }
                labels(first: 10) {
                  nodes {
                    name
                    color
                    description
                  }
                }
              }
            }
          }
          ${extraIssuesPart}
          userPrs: search(query: "is:open is:pr user:@me sort:updated-desc", type: ISSUE, first: 100) {
            nodes {
              ... on PullRequest {
                number
                title
                body
                url
                headRefName
                baseRefName
                isDraft
                createdAt
                updatedAt
                repository {
                  name
                  nameWithOwner
                }
                author {
                  login
                  ... on User {
                    name
                  }
                }
                labels(first: 10) {
                  nodes {
                    name
                    color
                    description
                  }
                }
              }
            }
          }
          involvesPrs: search(query: "is:open is:pr involves:@me -user:@me sort:updated-desc", type: ISSUE, first: 50) {
            nodes {
              ... on PullRequest {
                number
                title
                body
                url
                headRefName
                baseRefName
                isDraft
                createdAt
                updatedAt
                repository {
                  name
                  nameWithOwner
                }
                author {
                  login
                  ... on User {
                    name
                  }
                }
                labels(first: 10) {
                  nodes {
                    name
                    color
                    description
                  }
                }
              }
            }
          }
          ${extraPrsPart}
        }`;

        const data = await this.executeGraphQL<any>(graphqlQuery);
        const resolvedUser = data.viewer?.login || username || '';

        // 1. Processamento e deduplicação de Issues
        const issueMap = new Map<string, GithubIssueItem>();
        const allIssueNodes = [
          ...(data.userIssues?.nodes || []),
          ...(data.involvesIssues?.nodes || []),
          ...(data.extraIssues?.nodes || [])
        ];

        for (const item of allIssueNodes) {
          if (!item || !item.repository?.nameWithOwner) continue;
          const repoNameWithOwner = item.repository.nameWithOwner;
          const key = `${repoNameWithOwner.toLowerCase()}#${item.number}`;
          if (issueMap.has(key)) continue;

          const local = repoMap.get(repoNameWithOwner.toLowerCase());
          const cleanSubproject =
            local?.subproject || (repoNameWithOwner.includes('/') ? repoNameWithOwner.split('/')[1] : repoNameWithOwner);

          issueMap.set(key, {
            number: item.number,
            title: item.title,
            body: item.body || '',
            url: item.url,
            labels: Array.isArray(item.labels?.nodes) ? item.labels.nodes : [],
            author: item.author?.login
              ? { login: item.author.login, name: item.author.name }
              : { login: 'desconhecido' },
            createdAt: item.createdAt,
            updatedAt: item.updatedAt || item.createdAt,
            repository: {
              name: item.repository.name,
              nameWithOwner: repoNameWithOwner
            },
            subproject: cleanSubproject,
            isLocalWorkspace: !!local
          });
        }

        const issues = Array.from(issueMap.values());
        issues.sort((a, b) => {
          const timeA = new Date(a.updatedAt || a.createdAt).getTime();
          const timeB = new Date(b.updatedAt || b.createdAt).getTime();
          return timeB - timeA;
        });

        // 2. Processamento e deduplicação de Pull Requests
        const prMap = new Map<string, GithubPullRequestItem>();
        const allPrNodes = [
          ...(data.userPrs?.nodes || []),
          ...(data.involvesPrs?.nodes || []),
          ...(data.extraPrs?.nodes || [])
        ];

        for (const item of allPrNodes) {
          if (!item || !item.repository?.nameWithOwner) continue;
          const repoNameWithOwner = item.repository.nameWithOwner;
          const key = `${repoNameWithOwner.toLowerCase()}#${item.number}`;
          if (prMap.has(key)) continue;

          const local = repoMap.get(repoNameWithOwner.toLowerCase());
          const cleanSubproject =
            local?.subproject || (repoNameWithOwner.includes('/') ? repoNameWithOwner.split('/')[1] : repoNameWithOwner);

          prMap.set(key, {
            number: item.number,
            title: item.title,
            body: item.body || '',
            url: item.url,
            headRefName: item.headRefName || '',
            baseRefName: item.baseRefName || 'main',
            isDraft: !!item.isDraft,
            labels: Array.isArray(item.labels?.nodes) ? item.labels.nodes : [],
            author: item.author?.login
              ? { login: item.author.login, name: item.author.name }
              : { login: 'desconhecido' },
            createdAt: item.createdAt,
            updatedAt: item.updatedAt || item.createdAt,
            repository: {
              name: item.repository.name,
              nameWithOwner: repoNameWithOwner
            },
            subproject: cleanSubproject,
            isLocalWorkspace: !!local
          });
        }

        const prsList = Array.from(prMap.values());

        // 3. Vinculação com conversas locais do Kraken
        const sessions = await historyService.list().catch(() => []);
        const prs = await Promise.all(
          prsList.map(async item => {
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

        prs.sort((a, b) => {
          const timeA = new Date(a.updatedAt || a.createdAt).getTime();
          const timeB = new Date(b.updatedAt || b.createdAt).getTime();
          return timeB - timeA;
        });

        // 4. Overview consolidado
        const overview: ProjectOverview = {
          authenticatedUser: resolvedUser,
          repositories: repos,
          issuesCount: issues.length,
          prsCount: prs.length,
          lastUpdated: Date.now(),
          fromCache: false
        };

        this.memoryCache = {
          overview,
          issues,
          prs,
          timestamp: Date.now()
        };
        this.saveCacheToDisk().catch(() => {});

        return { overview, issues, prs };
      } catch (err) {
        console.error('[GithubProjectService] Erro ao sincronizar dados do GitHub:', (err as Error).message);
        if (this.memoryCache.overview && this.memoryCache.issues && this.memoryCache.prs) {
          return {
            overview: { ...this.memoryCache.overview, fromCache: true },
            issues: this.memoryCache.issues,
            prs: this.memoryCache.prs
          };
        }
        throw err;
      } finally {
        this.syncPromise = null;
      }
    })();

    return this.syncPromise;
  }

  /**
   * Obtém lista consolidada de Issues abertas
   */
  async getIssues(force = false): Promise<GithubIssueItem[]> {
    const { issues } = await this.syncGithubData(force);
    return issues;
  }

  /**
   * Obtém lista consolidada de PRs abertos
   */
  async getPullRequests(force = false): Promise<GithubPullRequestItem[]> {
    const { prs } = await this.syncGithubData(force);
    return prs;
  }

  /**
   * Obtém overview geral dos projetos
   */
  async getOverview(force = false): Promise<ProjectOverview> {
    const { overview } = await this.syncGithubData(force);
    return overview;
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
      if (
        s.title &&
        (s.title.includes(prStr) ||
          (branchLower && branchLower.length > 3 && s.title.toLowerCase().includes(branchLower)))
      ) {
        return { id: s.id, title: s.title, subproject: s.subproject };
      }
    }

    // 2. Busca nos arquivos de sessão do subprojeto correspondente
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
   * Aprova ou efetua merge de um Pull Request via API REST oficial do GitHub
   */
  async approveOrMergePR(
    repo: string,
    prNumber: number,
    action: 'approve' | 'merge',
    mergeMethod = 'squash'
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (action === 'approve') {
        try {
          await this.executeRest(`repos/${repo}/pulls/${prNumber}/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'APPROVE',
              body: 'Aprovado via KrakenBridge Dashboard'
            })
          });
          // Invalida cache de PRs para refletir imediatamente
          this.memoryCache.prs = undefined;
          this.memoryCache.timestamp = 0;
          return { success: true, message: `PR #${prNumber} em ${repo} aprovado com sucesso!` };
        } catch (reviewErr) {
          const errMsg = (reviewErr as Error).message || '';
          if (
            errMsg.includes('own pull request') ||
            errMsg.includes('Unprocessable Entity') ||
            errMsg.includes('422')
          ) {
            // O GitHub não permite auto-aprovação formal; registra comentário oficial
            await this.executeRest(`repos/${repo}/issues/${prNumber}/comments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                body: '✅ **Validação & Aprovação pelo Autor**: Aprovado via KrakenBridge Dashboard.'
              })
            });
            return {
              success: true,
              message: `PR #${prNumber} em ${repo} validado e registrado como aprovado pelo autor no GitHub!`
            };
          }
          throw reviewErr;
        }
      } else {
        const res = await this.executeRest<{ merged?: boolean; message?: string }>(
          `repos/${repo}/pulls/${prNumber}/merge`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              merge_method: mergeMethod === 'merge' ? 'merge' : mergeMethod === 'rebase' ? 'rebase' : 'squash'
            })
          }
        );
        // Invalida cache de PRs
        this.memoryCache.prs = undefined;
        this.memoryCache.timestamp = 0;
        return { success: true, message: res.message || `PR #${prNumber} em ${repo} mesclado com sucesso!` };
      }
    } catch (err) {
      throw new Error(`Falha ao executar ${action} no PR #${prNumber}: ${(err as Error).message}`);
    }
  }

  /**
   * Despacha uma solicitação de revisão para o PR
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

    const isApproval = comment.toLowerCase().includes('aprovad');
    const promptText = isApproval
      ? `Estou revisando o PR #${prNumber} ("${prTitle}") no repositório ${repo}${branch ? ` (branch: ${branch})` : ''} - [Ver PR](${prUrl}).\n\n✅ **Aprovado pelo usuário!**\n\n${comment.trim()}\n\nPor favor, realize o merge e execute o ciclo de implementação/deploy necessário.`
      : `Estou revisando o PR #${prNumber} ("${prTitle}") no repositório ${repo}${branch ? ` (branch: ${branch})` : ''} - [Ver PR](${prUrl}).\n\nPor favor, implemente o seguinte ajuste solicitado:\n\n${comment.trim()}`;

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
