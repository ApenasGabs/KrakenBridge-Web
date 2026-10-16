import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MessageItem } from '../MessageItem';
import type { ChatMessage } from '../../../types';
import mermaid from 'mermaid';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

describe('MessageItem Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: '<svg data-testid="chat-mermaid-svg"><text>A para B</text></svg>',
      bindFunctions: undefined,
      diagramType: 'flowchart-v2',
    });
  });

  it('deve renderizar o bloco Mermaid quando a mensagem contiver ```mermaid', async () => {
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      text: 'Veja o fluxo de arquitetura:\n\n```mermaid\ngraph TD\n  A --> B\n```',
      timestamp: '2026-10-15T20:00:00.000Z',
    };

    render(<MessageItem message={message} />);

    // Deve carregar e exibir o card do Mermaid
    await waitFor(() => {
      expect(screen.getByTestId('mermaid-card')).toBeInTheDocument();
    });

    expect(screen.getByTestId('mermaid-badge-type')).toHaveTextContent('Fluxograma');
  });

  it('deve renderizar blocos de código normais (não-mermaid) como bloco de código padrão', () => {
    const message: ChatMessage = {
      id: 'msg-2',
      role: 'assistant',
      text: 'Exemplo em TypeScript:\n\n```typescript\nconst x: number = 42;\n```',
      timestamp: '2026-10-15T20:00:00.000Z',
    };

    render(<MessageItem message={message} />);

    // Não deve renderizar o card do Mermaid
    expect(screen.queryByTestId('mermaid-card')).not.toBeInTheDocument();
    expect(screen.getByText('const x: number = 42;')).toBeInTheDocument();
    expect(screen.getByText('typescript')).toBeInTheDocument();
  });
});
