import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BottomNav } from '../Navbar/BottomNav';
import { Header } from '../Navbar/Header';
import { OptionsBar } from '../OptionsBar/OptionsBar';
import { QuotaBubble } from '../QuotaBubble/QuotaBubble';
import { IdeView } from '../IdeView/IdeView';
import { OfficeView } from '../OfficeView/OfficeView';
import { WhatsNextView } from '../WhatsNextView/WhatsNextView';
import { api } from '../../services/api';
import type { ChatOptions, AuthStatus, SessionUsage, QuotaStats } from '../../types';

vi.mock('../../services/api', () => ({
  api: {
    getQuotaStats: vi.fn(),
    getPaperclipStatus: vi.fn().mockResolvedValue({ online: false, agents: [], issues: [] }),
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

vi.mock('../OfficeView/OfficeFloor', () => ({
  OfficeFloor: () => <div data-testid="office-floor-canvas-mock">PixiJS Canvas</div>
}));

const setViewportWidth = (width: number) => {
  act(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width
    });
    window.dispatchEvent(new Event('resize'));
  });
};

const baseOptions: ChatOptions = {
  model: 'gemini-3-flash',
  subproject: '',
  autoApprove: false,
  sandbox: false,
  checkpointing: false,
  yoloMode: false,
  showQuotaBubble: false
};

const baseAuthStatus: AuthStatus = {
  authenticated: true,
  email: 'dev@kraken.local'
};

const baseSessionUsage: SessionUsage = {
  sessionInputTokens: 800,
  sessionOutputTokens: 400,
  sessionThinkingTokens: 0,
  sessionTotalTokens: 1200,
  lastTurnTokens: 250
};

const mockQuotaStats: QuotaStats = {
  gemini: {
    fiveHour: { remaining: 82, resetAt: new Date(Date.now() + 3600_000).toISOString() },
    weekly: { remaining: 70, resetAt: new Date(Date.now() + 86400_000).toISOString() }
  }
};

describe('Mobile & Tablet Layout Redesign (Issue #180 / APE-123)', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getQuotaStats).mockResolvedValue(mockQuotaStats);
    vi.mocked(api.getGithubOverview).mockResolvedValue({
      authenticatedUser: 'ApenasGabs',
      repositories: [],
      issuesCount: 1,
      prsCount: 0,
      lastUpdated: Date.now(),
      fromCache: false
    });
    vi.mocked(api.getGithubIssues).mockResolvedValue([
      {
        number: 180,
        title: 'Reformulação Mobile/Tablet',
        body: 'Detalhes da issue #180',
        url: 'https://github.com/ApenasGabs/KrakenBridge-Web/issues/180',
        createdAt: '2026-11-10T10:00:00Z',
        updatedAt: '2026-11-14T10:00:00Z',
        labels: [{ name: 'enhancement', color: 'a2eeef' }],
        author: { login: 'ApenasGabs' },
        repository: { name: 'KrakenBridge-Web', nameWithOwner: 'ApenasGabs/KrakenBridge-Web' },
        comments: { totalCount: 0 }
      }
    ]);
    vi.mocked(api.getGithubPrs).mockResolvedValue([]);
  });

  afterEach(() => {
    setViewportWidth(originalInnerWidth);
  });

  describe('1. Bottom Navigation Bar (< 768px)', () => {
    it('renderiza as 4 visões essenciais com targets >= 44x44px e dispara onTabChange', () => {
      const onTabChange = vi.fn();
      render(<BottomNav activeTab="chat" onTabChange={onTabChange} />);

      const nav = screen.getByTestId('bottom-nav');
      expect(nav).toBeInTheDocument();

      const tabChat = screen.getByTestId('tab-chat');
      const tabWhatsNext = screen.getByTestId('tab-whatsnext');
      const tabStatus = screen.getByTestId('tab-status');
      const tabMemory = screen.getByTestId('tab-memory');

      expect(tabChat).toHaveTextContent('Chat');
      expect(tabWhatsNext).toHaveTextContent("What's Next");
      expect(tabStatus).toHaveTextContent('Status');
      expect(tabMemory).toHaveTextContent('Memória');

      for (const tab of [tabChat, tabWhatsNext, tabStatus, tabMemory]) {
        expect(tab.className).toContain('min-h-[48px]');
        expect(tab.className).toContain('min-w-[44px]');
      }

      fireEvent.click(tabStatus);
      expect(onTabChange).toHaveBeenCalledWith('status');
    });
  });

  describe('2. Header responsivo (Mobile 375px vs Tablet 768px vs Desktop 1440px)', () => {
    const renderHeader = () =>
      render(
        <Header
          activeTab="chat"
          onTabChange={vi.fn()}
          onToggleSidebar={vi.fn()}
          isOptionsOpen={false}
          onToggleOptions={vi.fn()}
          authStatus={baseAuthStatus}
          onOpenAuth={vi.fn()}
          sessionUsage={baseSessionUsage}
          currentModel="gemini-3-flash"
          onToggleQuota={vi.fn()}
          quotaFiveHourPercent={82}
          codeServerPort={8443}
          workspaceDir="/workspace/KrakenBridge-Web"
        />
      );

    it('em 375px oculta as abas centrais do topo e exibe chip de cota e auth mobile', () => {
      setViewportWidth(375);
      renderHeader();

      expect(screen.queryByTestId('tab-chat')).not.toBeInTheDocument();
      expect(screen.getByTestId('header-quota-chip-mobile')).toBeInTheDocument();
      expect(screen.getByTestId('header-quota-chip-mobile')).toHaveTextContent('82%');
      expect(screen.getByTestId('header-auth-btn-mobile')).toBeInTheDocument();
    });

    it('em 768px (Tablet) usa bloco compacto lg:hidden com header-auth-btn único sem duplicatas', () => {
      setViewportWidth(768);
      renderHeader();

      expect(screen.getAllByTestId('tab-chat')).toHaveLength(1);
      expect(screen.getAllByTestId('header-auth-btn')).toHaveLength(1);
      expect(screen.queryByTestId('header-auth-btn-mobile')).not.toBeInTheDocument();
      expect(screen.queryByTestId('header-quota-chip-mobile')).not.toBeInTheDocument();
    });

    it('em 1440px (Desktop) exibe bloco completo desktop com header-auth-btn único', () => {
      setViewportWidth(1440);
      renderHeader();

      expect(screen.getAllByTestId('tab-chat')).toHaveLength(1);
      expect(screen.getAllByTestId('header-auth-btn')).toHaveLength(1);
    });
  });

  describe('3. QuotaBubble no Mobile & Tablet (< 1024px)', () => {
    it('em 375px não renderiza pílula flutuante inferior quando fechado e abre modal superior ao ativar', async () => {
      setViewportWidth(375);
      const onClose = vi.fn();

      const { rerender } = render(
        <QuotaBubble isVisible={false} onClose={onClose} lastTurnTokens={250} />
      );

      expect(screen.queryByTestId('quota-mobile-backdrop')).not.toBeInTheDocument();
      expect(screen.queryByTestId('quota-bubble-minimized')).not.toBeInTheDocument();
      expect(screen.queryByText(/Cotas/i)).not.toBeInTheDocument();

      rerender(<QuotaBubble isVisible={true} onClose={onClose} lastTurnTokens={250} />);

      await waitFor(() => {
        expect(screen.getByTestId('quota-mobile-backdrop')).toBeInTheDocument();
      });
    });

    it('em 768px (Tablet) também suprime a pílula flutuante inferior e abre em modal superior', async () => {
      setViewportWidth(768);
      const onClose = vi.fn();

      const { rerender } = render(
        <QuotaBubble isVisible={false} onClose={onClose} lastTurnTokens={250} />
      );

      expect(screen.queryByTestId('quota-mobile-backdrop')).not.toBeInTheDocument();
      expect(screen.queryByTestId('quota-bubble-minimized')).not.toBeInTheDocument();

      rerender(<QuotaBubble isVisible={true} onClose={onClose} lastTurnTokens={250} />);

      await waitFor(() => {
        expect(screen.getByTestId('quota-mobile-backdrop')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('quota-bubble-minimized')).not.toBeInTheDocument();
    });
  });

  describe('4. OptionsBar & WhatsNextView retráteis no Mobile', () => {
    it('OptionsBar no mobile abre em gaveta com accordion de flags e botão fechar', () => {
      setViewportWidth(375);
      const onClose = vi.fn();

      render(
        <OptionsBar
          options={baseOptions}
          availableModels={[]}
          accounts={[]}
          onChange={vi.fn()}
          isOpen={true}
          onClose={onClose}
        />
      );

      const bar = screen.getByTestId('options-bar');
      expect(bar).toBeInTheDocument();

      const flagsToggle = screen.getByTestId('options-advanced-toggle');
      expect(flagsToggle).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(flagsToggle);
      expect(flagsToggle).toHaveAttribute('aria-expanded', 'true');

      fireEvent.click(screen.getByTestId('options-bar-close'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('WhatsNextView inicia painel de filtros colapsado no mobile e expande ao clicar no botão', async () => {
      setViewportWidth(375);
      render(<WhatsNextView onResolve={vi.fn()} />);

      const toggle = await screen.findByTestId('whatsnext-filters-toggle');
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      const panel = screen.getByTestId('whatsnext-filters-panel');
      expect(panel.className).toContain('hidden md:block');

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(panel.className).toContain('block');
    });
  });

  describe('5. Limpeza funcional em telas < 768px (IdeView & OfficeView)', () => {
    it('IdeView no mobile oculta iframe e exibe botão Abrir VS Code em nova aba com badge sem clipping', () => {
      setViewportWidth(375);
      render(<IdeView codeServerPort={8443} workspaceDir="/workspace/KrakenBridge-Web" />);

      expect(screen.queryByTitle(/Code Server IDE/i)).not.toBeInTheDocument();
      expect(screen.getByTestId('ide-mobile-fallback')).toBeInTheDocument();
      const portBadge = screen.getByText('Porta: 8443');
      expect(portBadge.className).toContain('whitespace-nowrap');
      expect(portBadge.className).toContain('shrink-0');
      expect(portBadge.parentElement?.className).toContain('flex-wrap');
      const link = screen.getByTestId('ide-open-external-btn');
      expect(link).toHaveTextContent('Abrir VS Code em nova aba');
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('OfficeView no mobile oculta canvas PixiJS (The Floor) e exibe fallback acessível', () => {
      setViewportWidth(375);
      render(
        <OfficeView
          localActiveTool={null}
          localSubagents={[]}
          conversations={[]}
          isLoading={false}
          activeConversationTitle={null}
          onFocusChat={vi.fn()}
          onOpenStatus={vi.fn()}
        />
      );

      expect(screen.queryByTestId('office-floor-canvas-mock')).not.toBeInTheDocument();
      expect(screen.getByTestId('office-mobile-fallback')).toBeInTheDocument();
    });
  });
});
