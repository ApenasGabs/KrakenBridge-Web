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

  it('deve renderizar botão de ouvir resposta e copiar em mensagens finalizadas do assistente', () => {
    const message: ChatMessage = {
      id: 'msg-assist-1',
      role: 'assistant',
      text: 'Aqui está sua resposta finalizada pronta para leitura.',
      timestamp: '2026-10-15T20:00:00.000Z',
    };

    render(<MessageItem message={message} />);

    const ttsBtn = screen.getByTestId('tts-btn-msg-assist-1');
    expect(ttsBtn).toBeInTheDocument();
    expect(ttsBtn).toHaveTextContent('Ouvir resposta');

    const copyBtn = screen.getByTestId('copy-msg-btn-msg-assist-1');
    expect(copyBtn).toBeInTheDocument();
    expect(copyBtn).toHaveTextContent('Copiar');
  });

  it('não deve renderizar botão de ouvir resposta em mensagens do usuário nem durante streaming', () => {
    const userMsg: ChatMessage = {
      id: 'msg-user-1',
      role: 'user',
      text: 'Olá assistente!',
      timestamp: '2026-10-15T20:00:00.000Z',
    };

    const streamMsg: ChatMessage = {
      id: 'msg-stream-1',
      role: 'assistant',
      text: 'Gerando resposta...',
      isStreaming: true,
      timestamp: '2026-10-15T20:00:00.000Z',
    };

    const { unmount } = render(<MessageItem message={userMsg} />);
    expect(screen.queryByTestId('tts-btn-msg-user-1')).not.toBeInTheDocument();
    unmount();

    render(<MessageItem message={streamMsg} />);
    expect(screen.queryByTestId('tts-btn-msg-stream-1')).not.toBeInTheDocument();
  });

  it('deve exibir botão de Resposta Final, dropdown de seções e velocidade quando houver múltiplas seções', () => {
    const multiSectionMsg: ChatMessage = {
      id: 'msg-multi-1',
      role: 'assistant',
      text: 'Texto de introdução.\n\n### 🎯 O que foi feito\nCódigo implementado.\n\n### 🛑 Resposta Final\nInstruções finais para aprovação.',
      timestamp: '2026-10-15T20:00:00.000Z',
    };

    render(<MessageItem message={multiSectionMsg} />);

    // Deve exibir o botão de Resposta Final
    const finalBtn = screen.getByTestId('tts-final-btn-msg-multi-1');
    expect(finalBtn).toBeInTheDocument();
    expect(finalBtn).toHaveTextContent('Resposta Final');

    // Deve exibir o botão Ler Tudo
    const ttsBtn = screen.getByTestId('tts-btn-msg-multi-1');
    expect(ttsBtn).toHaveTextContent('Ler Tudo');

    // Deve exibir o dropdown de seções
    const sectionsDropdown = screen.getByTestId('tts-sections-dropdown-msg-multi-1');
    expect(sectionsDropdown).toBeInTheDocument();
    expect(sectionsDropdown).toHaveTextContent('Seções (3)');

    // Deve exibir o seletor de velocidade
    const speedBtn = screen.getByTestId('tts-speed-btn-msg-multi-1');
    expect(speedBtn).toBeInTheDocument();
    expect(speedBtn).toHaveTextContent('1x');
  });
});
