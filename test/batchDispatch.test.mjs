process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { githubProjectService } from '../dist-server/services/githubProjectService.js';

test('githubProjectService: dispatchBatchActions deve processar lote misto com aprovações, revisões com notas e fechamento', async () => {
  // Salva métodos originais
  const originalApprove = githubProjectService.approveOrMergePR;
  const originalReview = githubProjectService.dispatchReview;
  const originalClose = githubProjectService.closeIssue;

  const calls = {
    approve: [],
    review: [],
    close: []
  };

  githubProjectService.approveOrMergePR = async (repo, number, action) => {
    calls.approve.push({ repo, number, action });
    return { success: true, message: `PR #${number} aprovada com sucesso` };
  };

  githubProjectService.dispatchReview = async (params) => {
    calls.review.push(params);
    return {
      conversationId: 'mock-conv-123',
      isNew: true,
      subproject: 'backend',
      suggestedPrompt: 'Prompt sugerido'
    };
  };

  githubProjectService.closeIssue = async (repo, number, stateReason) => {
    calls.close.push({ repo, number, stateReason });
    return { success: true, message: `Issue #${number} fechada` };
  };

  try {
    const items = [
      {
        itemKey: 'ApenasGabs/repo#10',
        itemType: 'pr',
        repo: 'ApenasGabs/repo',
        number: 10,
        title: 'PR Aprovada',
        action: 'approve'
      },
      {
        itemKey: 'ApenasGabs/repo#11',
        itemType: 'pr',
        repo: 'ApenasGabs/repo',
        number: 11,
        title: 'PR com Ajustes',
        action: 'request_changes',
        notes: 'ajuste item pipipopopo no header'
      },
      {
        itemKey: 'ApenasGabs/repo#12',
        itemType: 'issue',
        repo: 'ApenasGabs/repo',
        number: 12,
        title: 'Issue Concluída',
        action: 'close'
      }
    ];

    const res = await githubProjectService.dispatchBatchActions(items);

    assert.equal(res.total, 3);
    assert.equal(res.successful, 3);
    assert.equal(res.failed, 0);
    assert.equal(res.results.length, 3);

    // Valida chamadas interceptadas
    assert.equal(calls.approve.length, 1);
    assert.equal(calls.approve[0].number, 10);

    assert.equal(calls.review.length, 1);
    assert.equal(calls.review[0].prNumber, 11);
    assert.equal(calls.review[0].comment, 'ajuste item pipipopopo no header');

    assert.equal(calls.close.length, 1);
    assert.equal(calls.close[0].number, 12);
  } finally {
    // Restaura métodos originais
    githubProjectService.approveOrMergePR = originalApprove;
    githubProjectService.dispatchReview = originalReview;
    githubProjectService.closeIssue = originalClose;
  }
});

test('githubProjectService: dispatchBatchActions deve lidar com falhas parciais sem interromper os demais itens', async () => {
  const originalApprove = githubProjectService.approveOrMergePR;

  githubProjectService.approveOrMergePR = async (repo, number, action) => {
    if (number === 99) {
      throw new Error('Falha de rede ao aprovar no GitHub');
    }
    return { success: true, message: `PR #${number} aprovada` };
  };

  try {
    const items = [
      {
        itemKey: 'ApenasGabs/repo#1',
        itemType: 'pr',
        repo: 'ApenasGabs/repo',
        number: 1,
        action: 'approve'
      },
      {
        itemKey: 'ApenasGabs/repo#99',
        itemType: 'pr',
        repo: 'ApenasGabs/repo',
        number: 99,
        action: 'approve'
      }
    ];

    const res = await githubProjectService.dispatchBatchActions(items);

    assert.equal(res.total, 2);
    assert.equal(res.successful, 1);
    assert.equal(res.failed, 1);

    const failedItem = res.results.find(r => r.itemKey === 'ApenasGabs/repo#99');
    assert.equal(failedItem.success, false);
    assert.match(failedItem.message, /Falha de rede/);
  } finally {
    githubProjectService.approveOrMergePR = originalApprove;
  }
});

test('githubProjectService: dispatchBatchActions deve tratar refine, reevaluate e delegate_paperclip em issues', async () => {
  const { paperclipDelegationService } = await import('../dist-server/services/paperclipDelegationService.js');
  const originalAgent = githubProjectService.dispatchIssueAgent;
  const originalDelegate = paperclipDelegationService.delegateGithubIssue;

  const agentCalls = [];
  const delegateCalls = [];

  githubProjectService.dispatchIssueAgent = async (params) => {
    agentCalls.push(params);
    return { conversationId: `conv-${params.issueNumber}`, subproject: 'backend', suggestedPrompt: 'p' };
  };
  paperclipDelegationService.delegateGithubIssue = async (params) => {
    delegateCalls.push(params);
    if (params.number === 23) throw new Error('Paperclip indisponível');
    return { paperclipIssueId: 'pc-1', identifier: 'APE-1', message: 'Delegada ao Paperclip como APE-1' };
  };

  try {
    const base = { itemType: 'issue', repo: 'ApenasGabs/repo' };
    const res = await githubProjectService.dispatchBatchActions([
      { ...base, number: 20, action: 'refine', notes: 'foque em critérios de aceitação' },
      { ...base, number: 21, action: 'reevaluate' },
      { ...base, number: 22, action: 'delegate_paperclip', title: 'Tarefa', body: 'corpo' },
      { ...base, number: 23, action: 'delegate_paperclip' },
      { itemType: 'pr', repo: 'ApenasGabs/repo', number: 24, action: 'refine' }
    ]);

    assert.equal(res.total, 5);
    assert.equal(res.successful, 3);
    assert.equal(res.failed, 2);

    assert.equal(agentCalls.length, 2);
    assert.equal(agentCalls[0].mode, 'refine');
    assert.equal(agentCalls[0].notes, 'foque em critérios de aceitação');
    assert.equal(agentCalls[1].mode, 'reevaluate');

    assert.equal(delegateCalls.length, 2);
    assert.equal(delegateCalls[0].body, 'corpo');

    const refined = res.results.find(r => r.itemKey === 'ApenasGabs/repo#20');
    assert.equal(refined.conversationId, 'conv-20');

    const failedDelegate = res.results.find(r => r.itemKey === 'ApenasGabs/repo#23');
    assert.equal(failedDelegate.success, false);
    assert.match(failedDelegate.message, /indisponível/);

    const prRefine = res.results.find(r => r.itemKey === 'ApenasGabs/repo#24');
    assert.equal(prRefine.success, false);
    assert.match(prRefine.message, /só se aplica a issues/);
  } finally {
    githubProjectService.dispatchIssueAgent = originalAgent;
    paperclipDelegationService.delegateGithubIssue = originalDelegate;
  }
});

test('paperclipDelegationService: delegateGithubIssue cria issue atribuída ao CEO e dispara wakeup', async () => {
  const { paperclipDelegationService } = await import('../dist-server/services/paperclipDelegationService.js');
  const { DEFAULT_CEO_AGENT_ID } = await import('../dist-server/services/paperclipAutoRemediationService.js');
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init?.body || '{}') });
    if (String(url).includes('/issues')) {
      return new Response(JSON.stringify({ id: 'pc-issue-42', identifier: 'APE-42' }), { status: 201 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const res = await paperclipDelegationService.delegateGithubIssue({
      repo: 'ApenasGabs/KrakenBridge-Web',
      number: 198,
      title: 'Ações em lote',
      url: 'https://github.com/ApenasGabs/KrakenBridge-Web/issues/198',
      body: 'Corpo da issue',
      notes: 'Priorizar mobile'
    });

    assert.equal(res.paperclipIssueId, 'pc-issue-42');
    assert.equal(res.identifier, 'APE-42');
    assert.equal(requests.length, 2);
    assert.equal(requests[0].body.status, 'todo');
    assert.equal(requests[0].body.assigneeAgentId, DEFAULT_CEO_AGENT_ID);
    assert.match(requests[0].body.description, /Priorizar mobile/);
    assert.ok(requests[1].url.includes(`/api/agents/${DEFAULT_CEO_AGENT_ID}/wakeup`));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
