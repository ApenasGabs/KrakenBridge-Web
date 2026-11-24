import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StatsDashboard } from '../StatsDashboard';
import { api } from '../../../services/api';
import type { QuotaStats } from '../../../types';

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

describe('StatsDashboard - Estimativa de Custo (USD) por 1M tokens', () => {
  const mockQuotaStats: QuotaStats = {
    source: 'official_google',
    aggregates: {
      totalRecordedTurns: 3,
      activeDays: 1,
      totalAgentTimeMs: 120000,
      totalTokensAllTime: 1600000,
      totalInputTokens: 1200000,
      totalOutputTokens: 300000,
      totalThinkingTokens: 100000,
      estimatedCostUsd: 4.5,
      unpricedTurnsCount: 1,
      firstEventAt: '2026-11-24T09:50:00Z'
    },
    gemini: {
      title: 'Gemini Models',
      fiveHour: { remaining: 95, message: '95% restante' },
      weekly: { remaining: 88, message: '88% restante' }
    },
    claudeGpt: {
      title: 'Claude and GPT models',
      fiveHour: { remaining: 100, message: null },
      weekly: { remaining: 100, message: null }
    },
    dailyPoints: [
      {
        day: '2026-11-24',
        totalTokens: 1600000,
        inputTokens: 1200000,
        outputTokens: 300000,
        thinkingTokens: 100000,
        turnsCount: 3,
        intensity: 4,
        estimatedCostUsd: 4.5
      }
    ],
    bestDay: { day: '2026-11-24', totalTokens: 1600000 },
    tokens: {
      hourly: { totalTokens: 1600000, inputTokens: 1200000, outputTokens: 300000, thinkingTokens: 100000, count: 3, estimatedCostUsd: 4.5 },
      daily: { totalTokens: 1600000, inputTokens: 1200000, outputTokens: 300000, thinkingTokens: 100000, count: 3, estimatedCostUsd: 4.5 },
      weekly: {
        totalTokens: 1600000,
        inputTokens: 1200000,
        outputTokens: 300000,
        thinkingTokens: 100000,
        count: 3,
        estimatedCostUsd: 4.5
      },
      modelBreakdown: {
        'gemini-4-hydrogen-high': {
          totalTokens: 1400000,
          count: 2,
          estimatedCostUsd: 4.5,
          isPriced: true,
          canonicalModel: 'gemini-4-hydrogen'
        },
        auto: {
          totalTokens: 200000,
          count: 1,
          estimatedCostUsd: null,
          isPriced: false,
          canonicalModel: null
        }
      },
      workspaceBreakdown: {
        'KrakenBridge-Web': {
          totalTokens: 1600000,
          count: 3,
          estimatedCostUsd: 4.5,
          unpricedTurnsCount: 1
        }
      },
      recentTurns: [
        {
          id: 'turn-priced',
          timestamp: '2026-11-24T10:00:00Z',
          agent: 'antigravity',
          model: 'gemini-4-hydrogen-high',
          subproject: 'KrakenBridge-Web',
          input_tokens: 1000000,
          output_tokens: 300000,
          thinking_tokens: 100000,
          total_tokens: 1400000,
          estimatedCostUsd: 4.5,
          isPriced: true
        },
        {
          id: 'turn-auto',
          timestamp: '2026-11-24T09:50:00Z',
          agent: 'antigravity',
          model: 'auto',
          subproject: 'KrakenBridge-Web',
          input_tokens: 200000,
          output_tokens: 0,
          thinking_tokens: 0,
          total_tokens: 200000,
          estimatedCostUsd: null,
          isPriced: false
        }
      ],
      totalRecordedTurns: 3
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(api.getQuotaStats).mockResolvedValue(mockQuotaStats);
  });

  it('exibe o card de resumo de Custo Estimado (USD), breakdowns e coluna na tabela de turnos', async () => {
    render(
      <StatsDashboard
        runningCount={0}
        totalConversations={3}
        totalWorkspaces={1}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimated-cost-card')).toBeInTheDocument();
    });

    expect(screen.getByTestId('estimated-cost-value')).toHaveTextContent('$4.50');
    expect(screen.getByText(/1 não tarifado\(s\)/i)).toBeInTheDocument();

    expect(screen.getByTestId('model-cost-gemini-4-hydrogen-high')).toHaveTextContent('$4.50');
    expect(screen.getByTestId('workspace-cost-KrakenBridge-Web')).toHaveTextContent('$4.50');

    expect(screen.getByText('Custo Est.')).toBeInTheDocument();
    expect(screen.getAllByText('Não tarifado').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('$4.50').length).toBeGreaterThanOrEqual(3);
  });
});
