import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StatsDashboard } from '../StatsDashboard';
import { api } from '../../../services/api';

vi.mock('../../../services/api', () => ({
  api: {
    getQuotaStats: vi.fn(),
    refreshQuota: vi.fn(),
    getSetupConfig: vi.fn().mockResolvedValue({}),
    getTelemetryStatus: vi.fn().mockResolvedValue({
      enabled: true,
      autoProvision: false,
      services: []
    })
  }
}));

describe('StatsDashboard - Water Footprint & Metrics (Litros de Água)', () => {
  const mockQuotaStats = {
    source: 'official_google',
    aggregates: {
      totalRecordedTurns: 42,
      activeDays: 7,
      totalAgentTimeMs: 3600000,
      totalTokensAllTime: 50000, // 50.000 tokens * 0.0005 = 25.0 L
      totalInputTokens: 30000,   // 30.000 tokens * 0.0005 = 15.0 L
      totalOutputTokens: 15000,  // 15.000 tokens * 0.0005 = 7.5 L
      totalThinkingTokens: 5000  // 5.000 tokens * 0.0005 = 2.5 L
    },
    gemini: {
      fiveHour: { remaining: 90, message: '90% restante' },
      weekly: { remaining: 75, message: '75% restante' }
    },
    dailyPoints: [
      { day: '2026-10-30', totalTokens: 20000, turnsCount: 15, intensity: 3 },
      { day: '2026-10-31', totalTokens: 30000, turnsCount: 27, intensity: 4 }
    ],
    bestDay: { day: '2026-10-31', totalTokens: 30000 }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getQuotaStats).mockResolvedValue(mockQuotaStats as any);
  });

  it('deve renderizar a visualização padrão de tokens inicialmente', async () => {
    render(
      <StatsDashboard 
        runningCount={1}
        totalConversations={10}
        totalWorkspaces={3}
      />
    );

    // Aguarda o carregamento das métricas
    await waitFor(() => {
      expect(screen.getByText('Status Operacional & Métricas de IA')).toBeInTheDocument();
    });

    // O botão de alternância de água deve estar visível e clicável
    const waterButton = screen.getByTestId('toggle-water-metrics-btn');
    expect(waterButton).toBeInTheDocument();
    expect(waterButton).toHaveTextContent('Equivalente em Água (L)');

    // Na visualização padrão, mostra Tokens Totais
    expect(screen.getByText('Tokens Totais')).toBeInTheDocument();
    expect(screen.getByTestId('tokens-value')).toBeInTheDocument();
  });

  it('ao clicar no botão da seção de métricas, deve alternar para a exibição em litros de água', async () => {
    render(
      <StatsDashboard 
        runningCount={1}
        totalConversations={10}
        totalWorkspaces={3}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('toggle-water-metrics-btn')).toBeInTheDocument();
    });

    const waterButton = screen.getByTestId('toggle-water-metrics-btn');
    
    // Clica no botão para alternar para água
    fireEvent.click(waterButton);

    // O botão deve atualizar seu texto
    expect(waterButton).toHaveTextContent('Ver Tokens');

    // O card deve atualizar para "Água Estimada (Litros)"
    expect(screen.getByText('Água Estimada (Litros)')).toBeInTheDocument();

    // O valor deve ser exibido em litros (50.000 tokens * 0.0005 = 25.0 L)
    const waterValue = screen.getByTestId('water-liters-value');
    expect(waterValue).toBeInTheDocument();
    expect(waterValue).toHaveTextContent('25.0 L');

    // O banner de conscientização de pegada hídrica deve estar visível
    expect(screen.getByTestId('water-metrics-banner')).toBeInTheDocument();
    expect(screen.getByText(/Pegada Hídrica Ativa/i)).toBeInTheDocument();
  });

  it('deve permitir alternar de volta para tokens usando o botão do card ou o botão principal', async () => {
    render(
      <StatsDashboard 
        runningCount={0}
        totalConversations={5}
        totalWorkspaces={2}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('card-water-toggle-btn')).toBeInTheDocument();
    });

    // Alterna para água via botão do card
    const cardToggle = screen.getByTestId('card-water-toggle-btn');
    fireEvent.click(cardToggle);

    expect(screen.getByTestId('water-liters-value')).toBeInTheDocument();
    expect(screen.getByTestId('water-liters-value')).toHaveTextContent('25.0 L');

    // Clica novamente no botão do card para voltar para tokens
    fireEvent.click(cardToggle);

    expect(screen.getByTestId('tokens-value')).toBeInTheDocument();
    expect(screen.getByText('Tokens Totais')).toBeInTheDocument();
  });
});
