import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { historyService } from './historyService.js';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';

export interface GithubRepoInfo {
  name: string;
  path: string;
  remoteUrl: string;
  ownerRepo: string; // ex: 'ApenasGabs/ocarina-tabs'
  subproject: string; // ex: 'ocarina-tabs' ou 'KrakenBridge-Web'
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
}

class GithubProjectService {
  private cachedOverview: ProjectOverview | null = null;
  private cachedIssues: GithubIssueItem[] | null = null;
  private cachedPrs: GithubPullRequestItem[] | null = null;
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 25000; // 25s de cache

  /**
   * Obtém o login do usuário autenticado no GitHub CLI
   */
  async getAuthenticatedUser(): Promise<string> {
    try {
      const { stdout } = await execAsync('gh api user --jq .login', { timeout: 8000 });
      return stdout.trim() || 'ApenasGabs';
    } catch {
      return 'ApenasGabs';
    }
  }

  /**
   * Mapeia repositórios locais em /workspace e /app com remote git
   */
  async getLocalGitRepositories(): Promise<GithubRepoInfo[]> {
    const repos: GithubRepoInfo[] = [];

    // 1. Repositório do próprio Kraken
    try {
      const { stdout } = await execAsync('git config --get remote.origin.url', { cwd: '/app', timeout: 3000 });
      const remote = stdout.trim();
      const ownerRepo = this.parseOwnerRepo(remote);
      if (ownerRepo) {
        repos.push({
          name: 'KrakenBridge-Web',
          path: '/app',
          remoteUrl: remote,
          ownerRepo,
          subproject: 'KrakenBridge-Web'
        });
      }
    } catch {}

    // 2. Subprojetos em /workspace
    try {
      const entries = await fs.readdir(WORKSPACE_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        if (entry.name.startsWith('.')) continue;

        const dirPath = path.join(WORKSPACE_DIR, entry.name);
        try {
          const { stdout } = await execAsync('git config --get remote.origin.url', { cwd: dirPath, timeout: 3000 });
          const remote = stdout.trim();
          const ownerRepo = this.parseOwnerRepo(remote);
          if (ownerRepo) {
            repos.push({
              name: entry.name,
              path: dirPath,
              remoteUrl: remote,
              ownerRepo,
              subproject: entry.name
            });
          }
        } catch {}
      }
    } catch (err) {
      console.warn('[GithubProjectService] Erro ao ler /workspace:', (err as Error).message);
    }

    return repos;
  }

  /**
   * Extrai owner/repo de URLs https ou git@github.com
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
   * Obtém a lista consolidada de Issues abertas dos projetos
   */
  async getIssues(force = false): Promise<GithubIssueItem[]> {
    const now = Date.now();
    if (!force && this.cachedIssues && now - this.lastFetchTime < this.CACHE_TTL_MS) {
      return this.cachedIssues;
    }

    const repos = await this.getLocalGitRepositories();
    const repoMap = new Map<string, GithubRepoInfo>();
    for (const r of repos) {
      repoMap.set(r.ownerRepo.toLowerCase(), r);
    }

    const username = await this.getAuthenticatedUser();
    let issues: GithubIssueItem[] = [];

    try {
      const cmd = `gh search issues --state open --owner ${username} --json repository,number,title,labels,createdAt,updatedAt,url,body,author --limit 50`;
      const { stdout } = await execAsync(cmd, { timeout: 15000 });
      const raw = JSON.parse(stdout || '[]') as any[];

      issues = raw.map(item => {
        const repoNameWithOwner = item.repository?.nameWithOwner || '';
        const local = repoMap.get(repoNameWithOwner.toLowerCase());
        return {
          number: item.number,
          title: item.title,
          body: item.body || '',
          url: item.url,
          labels: Array.isArray(item.labels) ? item.labels : [],
          author: item.author || { login: username },
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          repository: {
            name: item.repository?.name || '',
            nameWithOwner: repoNameWithOwner
          },
          subproject: local?.subproject || (repoNameWithOwner.includes('/') ? repoNameWithOwner.split('/')[1] : repoNameWithOwner)
        };
      });

      // Prioriza issues dos repositórios que estão montados localmente no workspace
      issues.sort((a, b) => {
        const aLocal = repoMap.has(a.repository.nameWithOwner.toLowerCase()) ? 1 : 0;
        const bLocal = repoMap.has(b.repository.nameWithOwner.toLowerCase()) ? 1 : 0;
        if (aLocal !== bLocal) return bLocal - aLocal;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      this.cachedIssues = issues;
      this.lastFetchTime = now;
    } catch (err) {
      console.error('[GithubProjectService] Erro ao buscar issues:', (err as Error).message);
      if (this.cachedIssues) return this.cachedIssues;
    }

    return issues;
  }

  /**
   * Obtém a lista consolidada de PRs abertos e vincula com sessões ativas do Kraken
   */
  async getPullRequests(force = false): Promise<GithubPullRequestItem[]> {
    const now = Date.now();
    if (!force && this.cachedPrs && now - this.lastFetchTime < this.CACHE_TTL_MS) {
      return this.cachedPrs;
    }

    const repos = await this.getLocalGitRepositories();
    const repoMap = new Map<string, GithubRepoInfo>();
    for (const r of repos) {
      repoMap.set(r.ownerRepo.toLowerCase(), r);
    }

    const username = await this.getAuthenticatedUser();
    let prs: GithubPullRequestItem[] = [];

    try {
      const cmd = `gh search prs --state open --owner ${username} --json repository,number,title,labels,createdAt,updatedAt,url,body,isDraft,author --limit 40`;
      const { stdout } = await execAsync(cmd, { timeout: 15000 });
      const raw = JSON.parse(stdout || '[]') as any[];

      // Carrega sessões de histórico para correlacionar
      const sessions = await historyService.list().catch(() => []);

      prs = await Promise.all(
        raw.map(async item => {
          const repoNameWithOwner = item.repository?.nameWithOwner || '';
          const local = repoMap.get(repoNameWithOwner.toLowerCase());
          const subproject = local?.subproject || (repoNameWithOwner.includes('/') ? repoNameWithOwner.split('/')[1] : repoNameWithOwner);

          // Tenta buscar a headRefName (branch) com comando rápido
          let headRefName = '';
          try {
            const { stdout: prDetails } = await execAsync(
              `gh pr view ${item.number} --repo ${repoNameWithOwner} --json headRefName --jq .headRefName`,
              { timeout: 4000 }
            );
            headRefName = prDetails.trim();
          } catch {}

          // Encontra conversa vinculada por branch, id do PR ou subprojeto + título
          const linkedConversation = await this.findLinkedConversation(sessions, {
            prNumber: item.number,
            prTitle: item.title,
            branch: headRefName,
            subproject
          });

          return {
            number: item.number,
            title: item.title,
            body: item.body || '',
            url: item.url,
            headRefName,
            isDraft: !!item.isDraft,
            labels: Array.isArray(item.labels) ? item.labels : [],
            author: item.author || { login: username },
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            repository: {
              name: item.repository?.name || '',
              nameWithOwner: repoNameWithOwner
            },
            subproject,
            linkedConversation
          };
        })
      );

      prs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      this.cachedPrs = prs;
    } catch (err) {
      console.error('[GithubProjectService] Erro ao buscar PRs:', (err as Error).message);
      if (this.cachedPrs) return this.cachedPrs;
    }

    return prs;
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

    // 1. Match direto por tag ou título do resumo da sessão
    for (const s of sessions) {
      if (s.tags && s.tags.includes(prTag)) {
        return { id: s.id, title: s.title, subproject: s.subproject };
      }
      if (s.title && (s.title.includes(prStr) || (branchLower && s.title.toLowerCase().includes(branchLower)))) {
        return { id: s.id, title: s.title, subproject: s.subproject };
      }
    }

    // 2. Busca profunda rápida nos arquivos de sessão do subprojeto correspondente
    const sessionsDir = path.resolve('data/sessions');
    for (const s of sessions) {
      // Prioriza sessões do mesmo subprojeto ou gerais
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
   * Overview geral para o Dashboard What's Next
   */
  async getOverview(force = false): Promise<ProjectOverview> {
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
      lastUpdated: Date.now()
    };

    this.cachedOverview = overview;
    return overview;
  }

  /**
   * Aprova ou efetua merge de um Pull Request via GitHub CLI
   */
  async approveOrMergePR(repo: string, prNumber: number, action: 'approve' | 'merge'): Promise<{ success: boolean; message: string }> {
    try {
      if (action === 'approve') {
        await execAsync(`gh pr review ${prNumber} --repo ${repo} --approve --body "Aprovado via KrakenBridge Dashboard"`, {
          timeout: 12000
        });
        return { success: true, message: `PR #${prNumber} em ${repo} aprovado com sucesso!` };
      } else {
        await execAsync(`gh pr merge ${prNumber} --repo ${repo} --merge`, {
          timeout: 20000
        });
        return { success: true, message: `PR #${prNumber} em ${repo} mergeado com sucesso!` };
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
