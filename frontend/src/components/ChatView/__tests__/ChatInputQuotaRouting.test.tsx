import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatInput } from '../ChatInput';
import { api } from '../../../services/api';
import type { MultiAccountQuotaOverview } from '../../../types';

vi.mock('../../../services/api', () => ({
  api: {
    getMultiAccountQuotaOverview: vi.fn(),
    routeByModel: vi.fn(),
  }
}));

describe('ChatInput - Smart Quota Routing & Model Selection UI (Issue #112)', () => {
  const mockQuotaOverview: MultiAccountQuotaOverview = {
    activeEmail: 'conta1@gmail.com',
    accounts: [
      {
        email: 'conta1@gmail.com',
        name: 'Conta Principal',
        picture: null,
        isActive: true,
        groups: [],
        modelSummary: {
          gemini: { remaining: 50, weeklyRemaining: 50, fiveHourRemaining: 50, resetAt: null, isAvailable: true },
          claudeGpt: { remaining: 0, weeklyRemaining: 0, fiveHourRemaining: 0, resetAt: null, isAvailable: false },
          geminiArgon: { remaining: 0, weeklyRemaining: 0, fiveHourRemaining: 0, resetAt: null, isAvailable: false }
        },
        lastUpdated: new Date().toISOString()
      },
      {
        email: 'conta2@gmail.com',
        name: 'Conta Secundária',
        picture: null,
        isActive: false,
        groups: [],
        modelSummary: {
          gemini: { remaining: 80, weeklyRemaining: 80, fiveHourRemaining: 80, resetAt: null, isAvailable: true },
          claudeGpt: { remaining: 95, weeklyRemaining: 95, fiveHourRemaining: 95, resetAt: null, isAvailable: true },
          geminiArgon: { remaining: 0, weeklyRemaining: 0, fiveHourRemaining: 0, resetAt: null, isAvailable: false }
        },
        lastUpdated: new Date().toISOString()
      }
    ],
    bestAccountsByFamily: {
      gemini: { email: 'conta2@gmail.com', name: 'Conta Secundária', remaining: 80 },
      claudeGpt: { email: 'conta2@gmail.com', name: 'Conta Secundária', remaining: 95 },
      geminiArgon: null
    },
    modelQuotaMap: {
      'gemini-3.8-flash-high': {
        family: 'gemini',
        currentAccountRemaining: 50,
        bestPoolRemaining: 80,
        bestAccountEmail: 'conta2@gmail.com',
        bestAccountName: 'Conta Secundária',
        isBlocked: false
      },
      'claude-opus-5-5-high': {
        family: 'claudeGpt',
        currentAccountRemaining: 0,
        bestPoolRemaining: 95,
        bestAccountEmail: 'conta2@gmail.com',
        bestAccountName: 'Conta Secundária',
        isBlocked: false
      },
      'gemini-4-argon-high': {
        family: 'geminiArgon',
        currentAccountRemaining: 0,
        bestPoolRemaining: 0,
        bestAccountEmail: null,
        bestAccountName: null,
        isBlocked: true
      }
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (api.getMultiAccountQuotaOverview as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockQuotaOverview);
  });

  it('deve renderizar o botão do seletor e abrir o popover com o toggle de auto-roteamento e badges de cota', async () => {
    render(
      <ChatInput
        prompt=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onStop={vi.fn()}
        isLoading={false}
        currentModel="gemini-3.8-flash-high"
      />
    );

    // Botão seletor de modelo
    const modelSelectorBtn = screen.getByTitle('Clique para trocar o modelo diretamente aqui');
    expect(modelSelectorBtn).toBeInTheDocument();

    // Abre o popover
    fireEvent.click(modelSelectorBtn);

    // O popover deve estar visível
    const popover = await screen.findByTestId('model-selection-popover');
    expect(popover).toBeInTheDocument();

    // Toggle de auto-rotear por cota
    expect(screen.getByText('Auto-Rotear por Cota')).toBeInTheDocument();

    // Badges de cota nos modelos
    await waitFor(() => {
      const geminiBadge = screen.getByTestId('model-quota-badge-gemini-3.8-flash-high');
      expect(geminiBadge).toHaveTextContent('80%'); // pool tem 80%

      const claudeBadge = screen.getByTestId('model-quota-badge-claude-opus-5-5-high');
      expect(claudeBadge).toHaveTextContent('95%'); // pool tem 95%
    });
  });

  it('deve alternar automaticamente a conta e exibir banner de notificação ao escolher modelo com auto-roteamento ativo', async () => {
    (api.routeByModel as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      model: 'claude-opus-5-5-high',
      family: 'claudeGpt',
      switched: true,
      previousEmail: 'conta1@gmail.com',
      currentEmail: 'conta2@gmail.com',
      accountName: 'Conta Secundária',
      remainingQuota: 95,
      isBlocked: false,
      message: 'Roteamento por Cota: alternado automaticamente para Conta Secundária (95% disponível).'
    });

    const onModelChangeMock = vi.fn();

    render(
      <ChatInput
        prompt=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onStop={vi.fn()}
        isLoading={false}
        currentModel="gemini-3.8-flash-high"
        onModelChange={onModelChangeMock}
      />
    );

    // Abre popover
    fireEvent.click(screen.getByTitle('Clique para trocar o modelo diretamente aqui'));

    // Clica no Claude Opus
    const claudeBtn = await screen.findByText('Claude Opus 5.5 High');
    fireEvent.click(claudeBtn);

    await waitFor(() => {
      expect(api.routeByModel).toHaveBeenCalledWith('claude-opus-5-5-high', 5);
      expect(onModelChangeMock).toHaveBeenCalledWith('claude-opus-5-5-high');
    });

    // Banner de transição de conta exibido na tela
    const notice = await screen.findByTestId('quota-routing-notice');
    expect(notice).toHaveTextContent('Conta Secundária (95% disponível)');
  });
});
