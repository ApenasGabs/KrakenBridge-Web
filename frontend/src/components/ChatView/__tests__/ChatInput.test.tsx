import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatInput } from '../ChatInput';
import type { EvolutionStatus } from '../../../types';

describe('ChatInput Component - Pod Drain & Blocking', () => {
  const defaultProps = {
    prompt: '',
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onStop: vi.fn(),
    isLoading: false
  };

  it('deve permitir digitação e envio quando o sistema estiver ocioso', () => {
    const onSubmit = vi.fn();
    render(<ChatInput {...defaultProps} prompt="Olá Kraken" onSubmit={onSubmit} />);

    const textarea = screen.getByTestId('chat-textarea');
    expect(textarea).not.toBeDisabled();

    const sendBtn = screen.getByTestId('chat-send-btn');
    expect(sendBtn).not.toBeDisabled();

    fireEvent.click(sendBtn);
    expect(onSubmit).toHaveBeenCalled();
  });

  it('deve desabilitar o textarea e botão de envio quando isDraining === true', () => {
    const onSubmit = vi.fn();
    const drainingStatus: EvolutionStatus = {
      active: true,
      status: 'draining',
      isDraining: true,
      activeTasksCount: 3
    };

    render(
      <ChatInput
        {...defaultProps}
        prompt="Mensagem durante drain"
        isDraining={true}
        evolutionStatus={drainingStatus}
        onSubmit={onSubmit}
      />
    );

    const textarea = screen.getByTestId('chat-textarea');
    expect(textarea).toBeDisabled();
    expect(textarea).toHaveAttribute(
      'placeholder',
      expect.stringContaining('Pod Drain ativo: finalizando 3 tarefa(s)')
    );

    const sendBtn = screen.getByTestId('chat-send-btn');
    expect(sendBtn).toBeDisabled();

    // Tenta disparar Enter no textarea
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: false });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('deve exibir placeholder de reinício quando status === reloading', () => {
    const reloadingStatus: EvolutionStatus = {
      active: true,
      status: 'reloading',
      isDraining: false,
      activeTasksCount: 0
    };

    render(
      <ChatInput
        {...defaultProps}
        prompt=""
        evolutionStatus={reloadingStatus}
      />
    );

    const textarea = screen.getByTestId('chat-textarea');
    expect(textarea).toBeDisabled();
    expect(textarea).toHaveAttribute(
      'placeholder',
      expect.stringContaining('Reiniciando serviço para aplicar atualizações')
    );

    const sendBtn = screen.getByTestId('chat-send-btn');
    expect(sendBtn).toBeDisabled();
  });

  it('deve manter o botão de Parar acessível se houver tarefa executando durante o Pod Drain', () => {
    const onStop = vi.fn();
    const drainingStatus: EvolutionStatus = {
      active: true,
      status: 'draining',
      isDraining: true,
      activeTasksCount: 1
    };

    render(
      <ChatInput
        {...defaultProps}
        isLoading={true}
        isDraining={true}
        evolutionStatus={drainingStatus}
        onStop={onStop}
      />
    );

    const stopBtn = screen.getByTitle(/Interromper geração ativa/i);
    expect(stopBtn).toBeInTheDocument();

    fireEvent.click(stopBtn);
    expect(onStop).toHaveBeenCalled();
  });
});
