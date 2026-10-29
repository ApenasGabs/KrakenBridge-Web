import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { ChatInput } from '../ChatInput';
import type { EvolutionStatus, RefinePromptResponse } from '../../../types';

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

describe('ChatInput Component - Prompt Refiner Sob Demanda (Issue #103)', () => {
  const sampleResponse: RefinePromptResponse = {
    refined: '🎯 Objetivo: Evitar duplicidade no botão salvar do estoque.\n\n🛠️ Skills sugeridas: ux-testing, debug-issue',
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    latencyMs: 1160,
    skills: ['ux-testing', 'debug-issue'],
    maskedSecretsCount: 1
  };

  function StatefulHarness({
    initialPrompt = '',
    onRefinePrompt,
    onSubmit = vi.fn()
  }: {
    initialPrompt?: string;
    onRefinePrompt: (payload: { draft: string }, signal?: AbortSignal) => Promise<RefinePromptResponse>;
    onSubmit?: () => void;
  }) {
    const [text, setText] = useState(initialPrompt);
    return (
      <ChatInput
        prompt={text}
        onChange={setText}
        onSubmit={onSubmit}
        onStop={vi.fn()}
        isLoading={false}
        project="meu-estoque"
        onRefinePrompt={onRefinePrompt}
      />
    );
  }

  it('nunca deve chamar o refinador automaticamente enquanto o usuário digita e deve exigir >= 10 chars', () => {
    const onRefinePrompt = vi.fn();
    render(<StatefulHarness initialPrompt="" onRefinePrompt={onRefinePrompt} />);

    const textarea = screen.getByTestId('chat-textarea');
    const refineBtn = screen.getByTestId('chat-refine-btn');
    expect(refineBtn).toBeDisabled();

    fireEvent.change(textarea, { target: { value: 'curto' } });
    expect(refineBtn).toBeDisabled();
    expect(onRefinePrompt).not.toHaveBeenCalled();

    fireEvent.change(textarea, {
      target: { value: 'quero que o botao de salvar do estoque nao duplique item quando clico 2x' }
    });
    expect(refineBtn).not.toBeDisabled();
    // Continua ZERO chamadas até o usuário clicar explicitamente
    expect(onRefinePrompt).not.toHaveBeenCalled();
  });

  it('deve refinar ao clicar no botão ✨, exibir provider/latência/skills e permitir Substituir + Desfazer sem enviar', async () => {
    const onRefinePrompt = vi.fn().mockResolvedValue(sampleResponse);
    const onSubmit = vi.fn();
    const initialDraft = 'quero que o botao salvar nao duplique item quando clico 2x';

    render(
      <StatefulHarness
        initialPrompt={initialDraft}
        onRefinePrompt={onRefinePrompt}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByTestId('chat-refine-btn'));
    expect(onRefinePrompt).toHaveBeenCalledTimes(1);

    const card = await screen.findByTestId('refine-suggestion-card');
    expect(card).toBeInTheDocument();
    expect(screen.getByTestId('refine-provider-badge')).toHaveTextContent('Groq • 1.2s');
    expect(screen.getByTestId('refine-skills-list')).toHaveTextContent('ux-testing');
    expect(screen.getByTestId('refine-secret-badge')).toBeInTheDocument();
    expect(screen.getByTestId('refine-suggestion-text')).toHaveTextContent('Evitar duplicidade no botão salvar');
    expect(onSubmit).not.toHaveBeenCalled();

    // Clica em Substituir -> atualiza textarea, NÃO envia, exibe botão Desfazer
    fireEvent.click(screen.getByTestId('refine-replace-btn'));
    expect((screen.getByTestId('chat-textarea') as HTMLTextAreaElement).value).toBe(sampleResponse.refined);
    expect(onSubmit).not.toHaveBeenCalled();

    const undoBtn = screen.getByTestId('refine-undo-btn');
    fireEvent.click(undoBtn);
    expect((screen.getByTestId('chat-textarea') as HTMLTextAreaElement).value).toBe(initialDraft);
  });

  it('deve bloquear requisições paralelas em duplo clique rápido e permitir Cancelar em voo', async () => {
    let capturedSignal: AbortSignal | undefined;
    const onRefinePrompt = vi.fn().mockImplementation((_payload, signal?: AbortSignal) => {
      capturedSignal = signal;
      return new Promise<RefinePromptResponse>(() => {
        // Mantém pendente até cancelar
      });
    });

    render(
      <StatefulHarness
        initialPrompt="rascunho suficientemente longo para testar duplo clique"
        onRefinePrompt={onRefinePrompt}
      />
    );

    const refineBtn = screen.getByTestId('chat-refine-btn');
    fireEvent.click(refineBtn);
    fireEvent.click(refineBtn);

    expect(onRefinePrompt).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('refine-loading-banner')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('refine-cancel-btn'));
    expect(capturedSignal?.aborted).toBe(true);
    await waitFor(() => {
      expect(screen.queryByTestId('refine-loading-banner')).not.toBeInTheDocument();
    });
  });

  it('deve suportar atalho Ctrl+Shift+R, Gerar de novo apenas por clique e Descartar com Esc', async () => {
    const onRefinePrompt = vi
      .fn()
      .mockResolvedValueOnce(sampleResponse)
      .mockResolvedValueOnce({
        ...sampleResponse,
        provider: 'aistudio',
        latencyMs: 950,
        refined: '🎯 Objetivo: Segunda versão refinada sob demanda.'
      });

    render(
      <StatefulHarness
        initialPrompt="ajustar responsividade do modal de configuracoes em 375px"
        onRefinePrompt={onRefinePrompt}
      />
    );

    const textarea = screen.getByTestId('chat-textarea');
    fireEvent.keyDown(textarea, { key: 'R', ctrlKey: true, shiftKey: true });

    await screen.findByTestId('refine-suggestion-card');
    expect(onRefinePrompt).toHaveBeenCalledTimes(1);

    // Gerar de novo dispara 2ª chamada somente no clique
    fireEvent.click(screen.getByTestId('refine-regenerate-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('refine-provider-badge')).toHaveTextContent('AI Studio • 950ms');
    });
    expect(onRefinePrompt).toHaveBeenCalledTimes(2);

    // Esc fecha o card sem alterar o rascunho original
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('refine-suggestion-card')).not.toBeInTheDocument();
    });
    expect((textarea as HTMLTextAreaElement).value).toBe(
      'ajustar responsividade do modal de configuracoes em 375px'
    );
  });
});
