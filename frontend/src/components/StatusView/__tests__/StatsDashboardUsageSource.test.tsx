import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StatsDashboard } from '../StatsDashboard';
import { api } from '../../../services/api';
import type { QuotaStats } from '../../../types';

vi.mock('../../../services/api', () => ({
  api: {
    getQuotaStats: vi.fn(),
    refreshQuota: vi.fn(),
    getSetupConfig: vi.fn().mockResolvedValue({}),
    getTelemetryStatus: vi.fn().mockResolvedValue({ enabled: true, autoProvision: false, services: [] })
  }
}));

const makeStats = (overrides: Partial<QuotaStats> = {}): QuotaStats => ({
  usageSource: 'all',
  paperclipUsage: { available: true, stale: false },
  gemini: { title: 'Gemini', fiveHour: { remaining: 100, message: null }, weekly: { remaining: 100, message: null } },
  claudeGpt: { title: 'Claude', fiveHour: { remaining: 100, message: null }, weekly: { remaining: 100, message: null } },
  ...overrides
});

const renderDashboard = () => render(<StatsDashboard runningCount={0} totalConversations={0} totalWorkspaces={1} />);

describe('StatsDashboard - filtro por origem (#226)', () => {
  beforeEach(() => {
    vi.mocked(api.getQuotaStats).mockReset();
  });

  it('começa em Tudo e consulta a origem escolhida', async () => {
    vi.mocked(api.getQuotaStats).mockResolvedValue(makeStats());
    renderDashboard();
    await waitFor(() => expect(api.getQuotaStats).toHaveBeenCalledWith('all'));

    fireEvent.click(screen.getByTestId('usage-source-paperclip'));
    await waitFor(() => expect(api.getQuotaStats).toHaveBeenCalledWith('paperclip'));
    expect(screen.getByTestId('usage-source-paperclip')).toHaveAttribute('aria-pressed', 'true');
  });

  it('avisa quando o Paperclip está indisponível', async () => {
    vi.mocked(api.getQuotaStats).mockResolvedValue(makeStats({ paperclipUsage: { available: false, stale: false } }));
    renderDashboard();
    expect(await screen.findByTestId('paperclip-usage-warning')).toHaveTextContent('Paperclip indisponível');
  });

  it('execuções do Paperclip aparecem na lista com agente, modelo e horário', async () => {
    const timestamp = '2026-11-25T05:15:00.000Z';
    const empty = { totalTokens: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, count: 0 };
    vi.mocked(api.getQuotaStats).mockResolvedValue(makeStats({
      tokens: {
        hourly: empty,
        daily: empty,
        weekly: empty,
        modelBreakdown: {},
        totalRecordedTurns: 1,
        recentTurns: [{
          id: 'paperclip-r1',
          timestamp,
          agent: 'Kraken Sentinel',
          source: 'paperclip',
          model: 'gemini-4-hydrogen-high',
          subproject: 'Paperclip (agentes)',
          input_tokens: 10,
          output_tokens: 5,
          thinking_tokens: 0,
          total_tokens: 15
        }]
      }
    }));
    renderDashboard();

    const row = (await screen.findByText('Kraken Sentinel')).closest('tr');
    expect(row).toHaveTextContent('gemini-4-hydrogen-high');
    expect(row).toHaveTextContent(new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  });
});
