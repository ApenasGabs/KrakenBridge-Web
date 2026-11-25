import type {
  GithubGateway,
  GithubIssue,
  NewPaperclipTask,
  PaperclipAgentState,
  PaperclipGateway,
  PaperclipTask,
  PullRequestEvidence,
  TaskPatch
} from './githubPaperclipSyncService.js';

const TIMEOUT_MS = 15000;
const MAX_PAGES = 50;

type Fields = Record<string, unknown>;

interface RequestOptions {
  method?: string;
  body?: unknown;
}

const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

const asFields = (value: unknown, what: string): Fields => {
  if (!isFields(value)) throw new Error(`Resposta inesperada: ${what}`);
  return value;
};

const asList = (value: unknown, what: string): Fields[] => {
  if (!Array.isArray(value)) throw new Error(`Resposta inesperada: ${what} deveria ser uma lista`);
  return value.map((item) => asFields(item, what));
};

const text = (fields: Fields, key: string): string => {
  const value = fields[key];
  if (typeof value !== 'string' || !value) throw new Error(`Resposta inesperada: campo ${key} ausente`);
  return value;
};

const optionalText = (fields: Fields, key: string): string | undefined => {
  const value = fields[key];
  return typeof value === 'string' ? value : undefined;
};

const requestJson = async (base: string, path: string, token: string, { method = 'GET', body }: RequestOptions = {}): Promise<unknown> => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`${method} ${path} respondeu HTTP ${res.status}`);
  return res.json();
};

const collectPages = async (pageSize: number, load: (page: number) => Promise<Fields[]>): Promise<Fields[]> => {
  const all: Fields[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const items = await load(page);
    all.push(...items);
    if (items.length < pageSize) return all;
  }
  throw new Error('A listagem excedeu o limite de páginas; nada foi gravado.');
};

const toIssue = (raw: Fields): GithubIssue => {
  if (typeof raw.number !== 'number') throw new Error('Resposta inesperada: issue sem número');
  return {
    number: raw.number,
    title: text(raw, 'title'),
    body: optionalText(raw, 'body') ?? '',
    url: text(raw, 'html_url'),
    state: text(raw, 'state'),
    labels: asList(raw.labels, 'labels').map((l) => text(l, 'name')),
    authorAssociation: text(raw, 'author_association')
  };
};

const PR_QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){
  defaultBranchRef{name}
  pullRequest(number:$number){merged baseRefName
    closingIssuesReferences(first:100){nodes{number repository{nameWithOwner}}}
    commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}}`;

export const createGithubGateway = (token: string, base = 'https://api.github.com'): GithubGateway => {
  const request = (path: string, options?: RequestOptions): Promise<unknown> => requestJson(base, path, token, options);

  return {
    listOpenIssues: async (repo, label) => {
      const pages = await collectPages(100, async (page) =>
        asList(await request(`/repos/${repo}/issues?state=open&per_page=100&page=${page + 1}&labels=${encodeURIComponent(label)}`), 'issues')
      );
      return pages.filter((i) => i.pull_request === undefined).map(toIssue);
    },
    getIssue: async (repo, number) => {
      const raw = asFields(await request(`/repos/${repo}/issues/${number}`), 'issue');
      if (raw.pull_request !== undefined) throw new Error(`#${number} é um PR, não uma issue`);
      return toIssue(raw);
    },
    getPullRequest: async (repo, number): Promise<PullRequestEvidence> => {
      const [owner, name] = repo.split('/');
      const answer = asFields(await request('/graphql', { method: 'POST', body: { query: PR_QUERY, variables: { owner, name, number } } }), 'GraphQL');
      if (answer.errors !== undefined) throw new Error(`O GitHub recusou a consulta do PR #${number}`);
      const repository = asFields(asFields(answer.data, 'data').repository, 'repository');
      const pr = asFields(repository.pullRequest, 'pullRequest');
      const commit = asList(asFields(pr.commits, 'commits').nodes, 'commits')[0];
      const rollup = commit ? asFields(commit.commit, 'commit').statusCheckRollup : null;
      return {
        merged: pr.merged === true,
        baseRef: text(pr, 'baseRefName'),
        defaultBranch: text(asFields(repository.defaultBranchRef, 'defaultBranchRef'), 'name'),
        checksState: isFields(rollup) ? text(rollup, 'state') : null,
        closingIssues: asList(asFields(pr.closingIssuesReferences, 'closingIssuesReferences').nodes, 'issues vinculadas').map(
          (i) => `${text(asFields(i.repository, 'repository'), 'nameWithOwner')}#${String(i.number)}`
        )
      };
    },
    closeIssue: async (repo, number) => {
      await request(`/repos/${repo}/issues/${number}`, { method: 'PATCH', body: { state: 'closed', state_reason: 'completed' } });
    }
  };
};

const toTask = (raw: Fields): PaperclipTask => ({
  id: text(raw, 'id'),
  identifier: optionalText(raw, 'identifier'),
  title: text(raw, 'title'),
  status: text(raw, 'status'),
  priority: optionalText(raw, 'priority'),
  projectId: optionalText(raw, 'projectId'),
  assigneeAgentId: optionalText(raw, 'assigneeAgentId'),
  assigneeUserId: optionalText(raw, 'assigneeUserId')
});

export const createPaperclipGateway = (base: string, companyId: string, token: string): PaperclipGateway => {
  const request = (path: string, options?: RequestOptions): Promise<unknown> => requestJson(base, `/api${path}`, token, options);
  const pageSize = 500;

  return {
    listTasks: async () => {
      const raw = await collectPages(pageSize, async (page) =>
        asList(await request(`/companies/${companyId}/issues?limit=${pageSize}&offset=${page * pageSize}&sortField=id&sortDir=asc`), 'tarefas')
      );
      return [...new Map(raw.map(toTask).map((t) => [t.id, t])).values()];
    },
    listAgents: async (): Promise<PaperclipAgentState[]> =>
      asList(await request(`/companies/${companyId}/agents`), 'agentes').map((a) => ({ id: text(a, 'id'), name: text(a, 'name'), status: text(a, 'status') })),
    createTask: async (task: NewPaperclipTask) => toTask(asFields(await request(`/companies/${companyId}/issues`, { method: 'POST', body: task }), 'tarefa criada')),
    updateTask: async (id: string, patch: TaskPatch) => {
      const updated = asFields(await request(`/issues/${id}`, { method: 'PATCH', body: patch }), 'tarefa atualizada');
      if (updated.status !== patch.status) throw new Error(`O Paperclip não aplicou o status ${patch.status} na tarefa ${id}`);
      if (patch.assigneeAgentId && updated.assigneeAgentId !== patch.assigneeAgentId) throw new Error(`O Paperclip não atribuiu a tarefa ${id}`);
    }
  };
};
