import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChatView } from '../ChatView';
import type { ChatMessage } from '../../../types';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({
      svg: '<svg data-testid="chat-mermaid-svg"></svg>',
      bindFunctions: undefined,
      diagramType: 'flowchart-v2',
    }),
  },
}));

describe('ChatView Component - Manual Scroll & Resilient Auto-Scroll (Issue #127)', () => {
  const defaultProps = {
    messages: [] as ChatMessage[],
    prompt: '',
    onPromptChange: vi.fn(),
    onSubmit: vi.fn(),
    onStop: vi.fn(),
    isLoading: false,
  };

  const sampleMessages: ChatMessage[] = [
    {
      id: 'msg-1',
      role: 'user',
      text: 'Olá Kraken, execute o build do projeto',
      timestamp: '2026-11-03T20:00:00.000Z',
    },
    {
      id: 'msg-2',
      role: 'assistant',
      text: 'Entendido! Iniciando o processo de build...',
      timestamp: '2026-11-03T20:00:05.000Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve realizar scrollTo para o final ao renderizar mensagens inicialmente', () => {
    const scrollToMock = vi.fn();
    // Injeta mock de scrollTo no protótipo de HTMLDivElement
    const originalScrollTo = HTMLDivElement.prototype.scrollTo;
    HTMLDivElement.prototype.scrollTo = scrollToMock;

    try {
      render(<ChatView {...defaultProps} messages={sampleMessages} />);
      const container = screen.getByTestId('chat-messages-container');
      expect(container).toBeInTheDocument();
      expect(scrollToMock).toHaveBeenCalled();
    } finally {
      HTMLDivElement.prototype.scrollTo = originalScrollTo;
    }
  });

  it('deve pausar o auto-scroll quando o usuário rolar para cima (onWheel com deltaY < 0)', () => {
    const scrollToMock = vi.fn();
    const originalScrollTo = HTMLDivElement.prototype.scrollTo;
    HTMLDivElement.prototype.scrollTo = scrollToMock;

    try {
      const { rerender } = render(<ChatView {...defaultProps} messages={sampleMessages} isLoading={true} />);
      scrollToMock.mockClear();

      const container = screen.getByTestId('chat-messages-container');

      // Simula usuário rolando para cima com a roda do mouse / trackpad
      fireEvent.wheel(container, { deltaY: -100 });

      // Simula novo chunk de mensagem chegando durante streaming
      const updatedMessages: ChatMessage[] = [
        ...sampleMessages,
        {
          id: 'msg-3',
          role: 'assistant',
          text: 'Compilando pacotes 50%...',
          timestamp: '2026-11-03T20:00:10.000Z',
        },
      ];

      rerender(<ChatView {...defaultProps} messages={updatedMessages} isLoading={true} />);

      // Não deve forçar scroll para o final porque o usuário rolou para cima
      expect(scrollToMock).not.toHaveBeenCalled();
    } finally {
      HTMLDivElement.prototype.scrollTo = originalScrollTo;
    }
  });

  it('deve pausar o auto-scroll quando o usuário rolar para cima via touch (arrastar para baixo)', () => {
    const scrollToMock = vi.fn();
    const originalScrollTo = HTMLDivElement.prototype.scrollTo;
    HTMLDivElement.prototype.scrollTo = scrollToMock;

    try {
      const { rerender } = render(<ChatView {...defaultProps} messages={sampleMessages} isLoading={true} />);
      scrollToMock.mockClear();

      const container = screen.getByTestId('chat-messages-container');

      // Simula gesto touch para cima
      fireEvent.touchStart(container, { touches: [{ clientY: 100 }] });
      fireEvent.touchMove(container, { touches: [{ clientY: 150 }] }); // deltaY = +50 (arraste para baixo rola página para cima)

      // Simula streaming de nova mensagem
      const updatedMessages: ChatMessage[] = [
        ...sampleMessages,
        {
          id: 'msg-3',
          role: 'assistant',
          text: 'Compilando pacotes 75%...',
          timestamp: '2026-11-03T20:00:15.000Z',
        },
      ];

      rerender(<ChatView {...defaultProps} messages={updatedMessages} isLoading={true} />);

      expect(scrollToMock).not.toHaveBeenCalled();
    } finally {
      HTMLDivElement.prototype.scrollTo = originalScrollTo;
    }
  });

  it('deve exibir o botão de rolar para o final e retomar o auto-scroll ao ser clicado', () => {
    const scrollToMock = vi.fn();
    const originalScrollTo = HTMLDivElement.prototype.scrollTo;
    HTMLDivElement.prototype.scrollTo = scrollToMock;

    try {
      const { rerender } = render(<ChatView {...defaultProps} messages={sampleMessages} isLoading={true} />);
      const container = screen.getByTestId('chat-messages-container');

      // Mock de propriedades de scroll do container para simular que está distante do rodapé (> 150px)
      Object.defineProperty(container, 'scrollHeight', { value: 1000, configurable: true });
      Object.defineProperty(container, 'scrollTop', { value: 600, configurable: true });
      Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true });
      // distanceFromBottom = 1000 - 600 - 200 = 200px (> 150px)

      fireEvent.scroll(container);

      // O botão flutuante deve aparecer
      const scrollBottomBtn = screen.getByTestId('scroll-to-bottom-btn');
      expect(scrollBottomBtn).toBeInTheDocument();

      scrollToMock.mockClear();

      // Ao clicar no botão, deve rolar suavemente para o final e reativar auto-scroll
      fireEvent.click(scrollBottomBtn);
      expect(scrollToMock).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'smooth' })
      );

      // Agora com auto-scroll reativado, novo streaming deve rolar automaticamente
      scrollToMock.mockClear();
      const nextMessages: ChatMessage[] = [
        ...sampleMessages,
        {
          id: 'msg-4',
          role: 'assistant',
          text: 'Processo finalizado com sucesso!',
          timestamp: '2026-11-03T20:00:20.000Z',
        },
      ];

      rerender(<ChatView {...defaultProps} messages={nextMessages} isLoading={true} />);
      expect(scrollToMock).toHaveBeenCalled();
    } finally {
      HTMLDivElement.prototype.scrollTo = originalScrollTo;
    }
  });

  it('deve sempre rolar para o final quando o usuário envia uma nova mensagem', () => {
    const scrollToMock = vi.fn();
    const originalScrollTo = HTMLDivElement.prototype.scrollTo;
    HTMLDivElement.prototype.scrollTo = scrollToMock;

    try {
      const { rerender } = render(<ChatView {...defaultProps} messages={sampleMessages} isLoading={false} />);
      const container = screen.getByTestId('chat-messages-container');

      // Usuário tinha rolado para cima
      fireEvent.wheel(container, { deltaY: -50 });
      scrollToMock.mockClear();

      // Usuário enviou uma nova mensagem (role: 'user')
      const withUserMessage: ChatMessage[] = [
        ...sampleMessages,
        {
          id: 'msg-new-user',
          role: 'user',
          text: 'Nova pergunta do usuário',
          timestamp: '2026-11-03T20:00:30.000Z',
        },
      ];

      rerender(<ChatView {...defaultProps} messages={withUserMessage} isLoading={true} />);

      // Deve forçar rolagem para o final para mostrar a pergunta enviada
      expect(scrollToMock).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'smooth' })
      );
    } finally {
      HTMLDivElement.prototype.scrollTo = originalScrollTo;
    }
  });
});
