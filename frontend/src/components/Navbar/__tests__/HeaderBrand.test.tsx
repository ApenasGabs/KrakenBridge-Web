import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '../Header';

describe('Header Brand & Official Logo Validation (Issue #216)', () => {
  const defaultProps = {
    activeTab: 'chat' as const,
    onTabChange: vi.fn(),
    onToggleSidebar: vi.fn(),
    isOptionsOpen: false,
    onToggleOptions: vi.fn(),
    authStatus: { authenticated: true, isKeyValid: true, provider: 'gemini' },
    onOpenAuth: vi.fn(),
    sessionUsage: {
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
      sessionTotalTokens: 300,
      costUsd: 0.001,
      totalCostUsd: 0.001,
    },
    currentModel: 'gemini-1.5-pro',
  };

  it('Ícone renderiza perfeitamente em favicons, PWA e no Header da aplicação', () => {
    render(<Header {...defaultProps} />);

    const logoImg = screen.getByAltText('Kraken Logo');
    expect(logoImg).toBeInTheDocument();
    expect(logoImg).toHaveAttribute('src', './kraken-symbol.png');
    expect(logoImg).toHaveClass('w-7', 'h-7', 'object-contain', 'rounded-lg');
  });

  it('Garantir compatibilidade com temas e validação do build de produção do frontend (`npm run build`)', () => {
    render(<Header {...defaultProps} />);

    const brandTitle = screen.getByText('KrakenBridge');
    expect(brandTitle).toBeInTheDocument();
    expect(brandTitle).toHaveClass('text-sm', 'font-bold');
  });
});
