import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WhatsNextView } from '../WhatsNextView';
import { api } from '../../../services/api';

vi.mock('../../../services/api', () => ({
  api: {
    getGithubOverview: vi.fn(),
    getGithubIssues: vi.fn(),
    getGithubPrs: vi.fn(),
    resolveGithubIssue: vi.fn(),
    actionGithubPr: vi.fn(),
    reviewGithubPr: vi.fn(),
    actionGithubIssue: vi.fn(),
    closeGithubIssue: vi.fn()
  }
}));

// Mock do localStorage para testes limpos
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('WhatsNextView - Fechar Issues e PRs', () => {
  const mockOverview = {
    authenticatedUser: 'ApenasGabs',
    repositories: [],
    issuesCount: 1,
    prsCount: 1,
    lastUpdated: Date.now(),
    fromCache: false
  };

  const mockIssues = [
    {
      number: 101,
      title: 'Bug na tela inicial',
      body: 'Descrição do bug',
      url: 'https://github.com/ApenasGabs/KrakenBridge-Web/issues/101',
      createdAt: '2026-10-10T10:00:00Z',
      updatedAt: '2026-10-12T10:00:00Z',
      labels: [{ name: 'bug', color: 'd73a4a' }],
      author: { login: 'ApenasGabs' },
      repository: {
        name: 'KrakenBridge-Web',
        nameWithOwner: 'ApenasGabs/KrakenBridge-Web'
      },
      subproject: 'KrakenBridge-Web',
      isLocalWorkspace: true
    }
  ];

  const mockPrs = [
    {
      number: 202,
      title: 'feat: nova funcionalidade',
      body: 'Descrição da PR',
      url: 'https://github.com/ApenasGabs/KrakenBridge-Web/pull/202',
      headRefName: 'feat/nova-func',
      baseRefName: 'main',
      isDraft: false,
      createdAt: '2026-10-11T10:00:00Z',
      updatedAt: '2026-10-12T10:00:00Z',
      labels: [{ name: 'feature', color: 'a2eeef' }],
      author: { login: 'ApenasGabs' },
      repository: {
        name: 'KrakenBridge-Web',
        nameWithOwner: 'ApenasGabs/KrakenBridge-Web'
      },
      subproject: 'KrakenBridge-Web',
      isLocalWorkspace: true
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    vi.mocked(api.getGithubOverview).mockResolvedValue(mockOverview);
    vi.mocked(api.getGithubIssues).mockResolvedValue({ issues: mockIssues, count: 1 });
    vi.mocked(api.getGithubPrs).mockResolvedValue({ prs: mockPrs, count: 1 });
    vi.mocked(api.closeGithubIssue).mockResolvedValue({ success: true, message: 'Issue fechada com sucesso' });
    vi.mocked(api.actionGithubPr).mockResolvedValue({ success: true, message: 'PR fechada com sucesso' });
  });

  it('deve renderizar a listagem de issues com o botão Fechar Issue', async () => {
    render(
      <WhatsNextView
        onResolveIssue={vi.fn()}
        onReviewPr={vi.fn()}
        onOpenConversation={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Bug na tela inicial')).toBeInTheDocument();
    });

    const closeBtn = screen.getByTitle('Encerrar / Fechar esta Issue no GitHub');
    expect(closeBtn).toBeInTheDocument();
  });

  it('deve exibir confirmação e chamar closeGithubIssue ao confirmar fechamento da issue', async () => {
    render(
      <WhatsNextView
        onResolveIssue={vi.fn()}
        onReviewPr={vi.fn()}
        onOpenConversation={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Bug na tela inicial')).toBeInTheDocument();
    });

    // Clica em "Fechar Issue"
    const closeBtn = screen.getByTitle('Encerrar / Fechar esta Issue no GitHub');
    fireEvent.click(closeBtn);

    // Deve exibir o aviso de confirmação inline
    expect(screen.getByText('Fechar issue?')).toBeInTheDocument();
    const confirmBtn = screen.getByText('Sim, fechar');
    expect(confirmBtn).toBeInTheDocument();

    // Clica em "Sim, fechar"
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.closeGithubIssue).toHaveBeenCalledWith('ApenasGabs/KrakenBridge-Web', 101);
    });
  });

  it('deve exibir confirmação e chamar actionGithubPr com action close na aba de PRs', async () => {
    render(
      <WhatsNextView
        onResolveIssue={vi.fn()}
        onReviewPr={vi.fn()}
        onOpenConversation={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Bug na tela inicial')).toBeInTheDocument();
    });

    // Alterna para aba de PRs
    const prsTabBtn = screen.getByText(/Central de Revisão \(PRs\/MRs\)/i);
    fireEvent.click(prsTabBtn);

    await waitFor(() => {
      expect(screen.getByText('feat: nova funcionalidade')).toBeInTheDocument();
    });

    // Clica em "Fechar PR"
    const closePrBtn = screen.getByTitle('Encerrar / Fechar Pull Request no GitHub');
    expect(closePrBtn).toBeDefined();
    fireEvent.click(closePrBtn);

    // Deve exibir o aviso de confirmação inline
    expect(screen.getByText('Fechar PR?')).toBeInTheDocument();
    const confirmBtn = screen.getByText('Sim, fechar');
    expect(confirmBtn).toBeInTheDocument();

    // Clica em "Sim, fechar"
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.actionGithubPr).toHaveBeenCalledWith(
        'ApenasGabs/KrakenBridge-Web',
        202,
        'close',
        'squash'
      );
    });
  });
});
