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
    bestDay: { day: '2026-10-31', totalTokens: 30000 },
    tokens: {
      weekly: {
        totalTokens: 50000,
        inputTokens: 30000,
        outputTokens: 15000,
        thinkingTokens: 5000
      },
      modelBreakdown: {
        'gemini-2.5-pro': { totalTokens: 30000, count: 5 }
      },
      workspaceBreakdown: {
        'my-project': { totalTokens: 20000, count: 3 }
      },
      recentTurns: [
        {
          id: 'turn-1',
          timestamp: '2026-10-31T10:00:00Z',
          model: 'gemini-2.5-pro',
          subproject: 'my-project',
          input_tokens: 6000,
          output_tokens: 3000,
          thinking_tokens: 1000,
          total_tokens: 10000
        }
      ]
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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

  it('quando ativado o botão de água, todas as seções e títulos de tokens devem ser convertidos para litros de água', async () => {
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
    fireEvent.click(waterButton);

    // 1. Subtítulo Geral
    expect(screen.getByText(/Telemetria de pegada hídrica \(L\)/i)).toBeInTheDocument();

    // 2. Heatmap de Intensidade Diária
    expect(screen.getByText('Intensidade Diária de Água (Últimos 42 dias)')).toBeInTheDocument();
    // Recorde em litros: 30.000 tokens * 0.0005 = 15.0 L
    expect(screen.getByText(/Recorde: 31\/10 \(15\.0 L\)/i)).toBeInTheDocument();

    // 3. Distribuição do Mix
    expect(screen.getByText('Distribuição do Consumo de Água')).toBeInTheDocument();
    expect(screen.getByText('15.0 L')).toBeInTheDocument(); // Input (30.000 tokens * 0.0005)
    expect(screen.getByText('7.50 L')).toBeInTheDocument(); // Output (15.000 tokens * 0.0005)
    expect(screen.getByText('2.50 L')).toBeInTheDocument(); // Thinking (5.000 tokens * 0.0005)

    // 4. Consumo Diário Recente
    expect(screen.getByText('Consumo Hídrico Diário Recente')).toBeInTheDocument();
    expect(screen.getByText(/Pico: 15\.0 L/i)).toBeInTheDocument();

    // 5. Model Breakdown
    expect(screen.getByText('Consumo de Água por Modelo de IA')).toBeInTheDocument();
    expect(screen.getByText(/15\.0 L \(5 turnos\)/i)).toBeInTheDocument();

    // 6. Workspace Breakdown
    expect(screen.getByText('Consumo de Água por Workspace')).toBeInTheDocument();
    expect(screen.getByText(/10\.0 L \(3 turnos\)/i)).toBeInTheDocument();

    // 7. Tabela de Turnos Recentes
    expect(screen.getByText('Últimas Execuções de Turnos (Água Estimada)')).toBeInTheDocument();
    expect(screen.getByText('In / Out / Thk (Água)')).toBeInTheDocument();
    expect(screen.getByText('Total Água')).toBeInTheDocument();
    // Turno: In 6000 (3.00 L), Out 3000 (1.50 L), Thk 1000 (0.50 L), Total 10000 (5.00 L)
    expect(screen.getByText(/3\.00 L \/ 1\.50 L \/ 0\.50 L/i)).toBeInTheDocument();
    expect(screen.getByText('5.00 L')).toBeInTheDocument();
  });
});
