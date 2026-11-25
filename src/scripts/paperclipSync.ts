import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { parseArgs } from 'util';
import { createGithubGateway, createPaperclipGateway } from '../services/githubPaperclipGateways.js';
import { GithubPaperclipSyncService, SyncRefusedError, type SyncReport } from '../services/githubPaperclipSyncService.js';

const USAGE = `Uso: npm run paperclip:sync -- <comando> [--apply]

  plan                     Simula sync e dispatch
  sync                     Importa issues com o label configurado
  dispatch                 Entrega a próxima tarefa, se a fila estiver livre
  close <issue> --pr <n>   Encerra a entrega comprovada por PR mergeado

Sem --apply nada é gravado. Detalhes em docs/paperclip-sync.md
`;

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

type Env = Record<string, string | undefined>;

export const loadSettings = (env: Env) => {
  const problems: string[] = [];
  const read = (name: string, valid: (value: string) => boolean): string => {
    const value = env[name]?.trim() ?? '';
    if (!valid(value)) problems.push(name);
    return value;
  };
  const isUuid = (v: string): boolean => UUID.test(v);
  const settings = {
    url: read('PAPERCLIP_URL', (v) => /^https?:\/\/\S+$/.test(v)).replace(/\/+$/, ''),
    companyId: read('PAPERCLIP_COMPANY_ID', isUuid),
    token: read('PAPERCLIP_API_TOKEN', (v) => v.length > 0),
    repo: read('PAPERCLIP_SYNC_REPO', (v) => /^[\w-]+\/[\w.-]+$/.test(v)),
    projectId: read('PAPERCLIP_SYNC_PROJECT_ID', isUuid),
    agentId: env.PAPERCLIP_SYNC_AGENT_ID ? read('PAPERCLIP_SYNC_AGENT_ID', isUuid) : undefined,
    label: env.PAPERCLIP_SYNC_LABEL?.trim() || 'paperclip'
  };
  if (problems.length > 0) throw new SyncRefusedError(`Variáveis ausentes ou inválidas: ${problems.join(', ')}.`);
  return settings;
};

const githubToken = (env: Env): string => {
  const fromEnv = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (fromEnv) return fromEnv;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new SyncRefusedError('Nenhum token do GitHub disponível (GITHUB_TOKEN ou gh auth login).');
  }
};

/** Impede execuções simultâneas; uma trava antiga exige remoção manual. */
export const withLock = async <T>(file: string, run: () => Promise<T>): Promise<T> => {
  try {
    fs.writeFileSync(file, String(process.pid), { flag: 'wx', mode: 0o600 });
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'EEXIST') {
      throw new SyncRefusedError(`Outra execução está em andamento. Se não houver nenhuma, remova ${file}.`);
    }
    throw err;
  }
  try {
    return await run();
  } finally {
    fs.rmSync(file, { force: true });
  }
};

const render = (name: string, report: SyncReport): string =>
  [
    `${name} (${report.applied ? 'aplicado' : 'simulação'})`,
    ...report.actions.map((a) => `  + ${a.kind} ${a.target}: ${a.detail}`),
    ...report.skipped.map((s) => `  - ${s}`),
    ...(report.actions.length + report.skipped.length === 0 ? ['  nada a fazer'] : [])
  ].join('\n') + '\n';

const positive = (value: string | undefined, what: string): number => {
  if (!value || !/^[1-9]\d*$/.test(value)) throw new SyncRefusedError(`Informe ${what}.`);
  return Number(value);
};

export const main = async (argv: string[], env: Env): Promise<void> => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { apply: { type: 'boolean', default: false }, pr: { type: 'string' }, help: { type: 'boolean' } }
  });
  const [command, issue] = positionals;
  if (values.help || !command || !['plan', 'sync', 'dispatch', 'close'].includes(command)) {
    process.stdout.write(USAGE);
    if (!values.help) process.exitCode = 2;
    return;
  }
  const s = loadSettings(env);
  const apply = values.apply && command !== 'plan';
  const service = new GithubPaperclipSyncService(
    { repo: s.repo, label: s.label, projectId: s.projectId, agentId: s.agentId, maxCreates: 20 },
    createGithubGateway(githubToken(env)),
    createPaperclipGateway(s.url, s.companyId, s.token)
  );
  const execute = async (): Promise<void> => {
    if (command === 'plan' || command === 'sync') process.stdout.write(render('sync', await service.sync(apply)));
    if (command === 'dispatch' || (command === 'plan' && s.agentId)) process.stdout.write(render('dispatch', await service.dispatch(apply)));
    if (command === 'close') {
      process.stdout.write(render('close', await service.close(positive(issue, 'o número da issue'), positive(values.pr, 'o PR com --pr'), apply)));
    }
  };
  if (!apply) return execute();
  const lockDir = env.DATA_DIR && fs.existsSync(env.DATA_DIR) ? env.DATA_DIR : os.tmpdir();
  await withLock(path.join(lockDir, `paperclip-sync-${s.companyId}.lock`), execute);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), process.env).catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = err instanceof SyncRefusedError ? 2 : 1;
  });
}
