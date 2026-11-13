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
