process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PaperclipGuardianService, findStuckIssues, extractPrUrls, parseGuardianMode, SENTINEL_POOL, WORKER_POOLS, GUARDIAN_ROUTINE_ID } from '../dist-server/services/paperclipGuardianService.js';

const NOW = Date.parse('2026-11-25T15:00:00Z');
const ago = min => new Date(NOW - min * 60000).toISOString();
const [S1, S2] = SENTINEL_POOL;
const [F1, F2] = WORKER_POOLS[0];
const agent = (id, status = 'idle', min = 30) => ({ id, status, lastHeartbeatAt: ago(min) });
const issue = extra => ({ id: 'i1', identifier: 'APE-1', status: 'in_review', updatedAt: ago(30), ...extra });
const reason = (i, agents = [], runs = [], pr = 'open') => findStuckIssues([i], agents, runs, new Map([['i1', pr]]), NOW)[0]?.reason ?? null;

test('Guardião: in_review segue as regras de handoff', () => {
  assert.equal(reason(issue({ assigneeAgentId: F1 })), 'review_without_sentinel');
  assert.equal(reason(issue({})), 'review_without_sentinel');
  assert.equal(reason(issue({ assigneeAgentId: S1 }), [agent(S1)]), 'sentinel_idle');
  assert.equal(reason(issue({ assigneeAgentId: S1 }), [agent(S1, 'idle', 2)]), null);
  assert.equal(reason(issue({ assigneeAgentId: S1, updatedAt: ago(2) }), [agent(S1)]), null);
  assert.equal(reason(issue({ assigneeAgentId: S1 }), [agent(S1, 'running'), agent(S2)]), 'sentinel_unavailable');
  assert.equal(reason(issue({ assigneeAgentId: S1 }), [agent(S1, 'running'), agent(S2, 'paused')]), null);
  assert.equal(reason(issue({ assigneeAgentId: S1 }), [agent(S1)], [{ agentId: S1, issueId: 'i1', status: 'running' }]), null);
});

test('Guardião: espera humana e PR ausente não acordam a IA', () => {
  assert.equal(reason(issue({ assigneeUserId: 'u' })), null);
  assert.equal(reason(issue({ executionState: { currentParticipant: { type: 'user' } } })), null);
  assert.equal(reason(issue({}), [], [], 'none'), null);
  assert.equal(reason(issue({}), [], [], 'unknown'), null);
});

test('Guardião: todo parado', () => {
  const todo = extra => issue({ status: 'todo', assigneeAgentId: F1, ...extra });
  assert.equal(reason(todo(), [agent(F1)]), 'todo_stale');
  assert.equal(reason(todo({ updatedAt: ago(10) }), [agent(F1)]), null);
  assert.equal(reason(todo(), [agent(F1, 'running')]), null);
  assert.equal(reason(todo(), [agent(F1, 'paused'), agent(F2)]), 'todo_agent_unavailable');
  assert.equal(reason(todo({ assigneeAgentId: null })), 'todo_unassigned');
  assert.equal(reason(todo({ originKind: 'routine_execution', originId: GUARDIAN_ROUTINE_ID }), [agent(F1)]), null);
});

test('Guardião: URLs de PR e modo padrão', () => {
  const url = 'https://github.com/ApenasGabs/querovagas/pull/42';
  assert.deepEqual(extractPrUrls(`(${url}) ${url} https://github.com/outro/x/pull/1`), [url]);
  assert.equal(parseGuardianMode(undefined), 'shadow');
  assert.equal(parseGuardianMode('ACTIVE?'), 'shadow');
  assert.equal(parseGuardianMode('active'), 'active');
});

const setup = (t, mode, { issues = [issue({ assigneeAgentId: F1, description: 'https://github.com/ApenasGabs/a/pull/1' })], fail = false, lookupPr = async () => 'OPEN' } = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-'));
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; fs.rmSync(dir, { recursive: true }); });
  const posts = [];
  const clock = { now: NOW };
  globalThis.fetch = async (url, init) => {
    if (init?.method === 'POST') { posts.push(url); return new Response('{}', { status: 202 }); }
    if (fail) return new Response('', { status: 500 });
    return Response.json(url.includes('/issues?') ? issues : url.endsWith('/agents') ? [agent(F1)] : []);
  };
  const make = () => new PaperclipGuardianService({ paperclipUrl: 'http://x', companyId: 'c', apiToken: 'k', mode, statePath: path.join(dir, 's.json'), now: () => clock.now, lookupPr });
  return { posts, clock, make };
};

test('Guardião: sombra nunca aciona a rotina', async t => {
  const { posts, make } = setup(t, 'shadow');
  const service = make();
  await service.tick();
  assert.equal(service.getReport().report.action, 'would_wake');
  assert.equal(posts.length, 0);
});

test('Guardião: ativo aciona uma vez e respeita cooldown após reinício', async t => {
  const { posts, clock, make } = setup(t, 'active');
  await make().tick();
  assert.equal(posts.length, 1);
  assert.ok(posts[0].endsWith(`/routines/${GUARDIAN_ROUTINE_ID}/run`));
  clock.now += 20 * 60000;
  const restarted = make();
  await restarted.tick();
  assert.equal(restarted.getReport().report.action, 'cooldown');
  assert.equal(restarted.getReport().history[0].findings[0].identifier, 'APE-1');
  clock.now += 41 * 60000;
  await restarted.tick();
  assert.equal(posts.length, 2);
});

test('Guardião: fila vazia não aciona', async t => {
  const { posts, make } = setup(t, 'active', { issues: [] });
  const service = make();
  await service.tick();
  assert.equal(service.getReport().report.action, 'none');
  assert.equal(posts.length, 0);
});

test('Guardião: falha de API é erro, não fila vazia', async t => {
  const { posts, make } = setup(t, 'active', { fail: true });
  const service = make();
  await service.tick();
  assert.equal(service.getReport().report.action, 'error');
  assert.equal(posts.length, 0);
});

test('Guardião: falha do GitHub fica como não verificada', async t => {
  const { make } = setup(t, 'active', { lookupPr: async () => { throw new Error('gh'); } });
  const service = make();
  await service.tick();
  assert.deepEqual(service.getReport().report.unverified, ['APE-1']);
});
