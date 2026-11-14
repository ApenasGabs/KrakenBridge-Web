import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickActionChips, DEFAULT_QUICK_ACTIONS } from '../QuickActionChips';

describe('QuickActionChips Component (Issue #174)', () => {
  it('deve renderizar todos os botões de ação rápida padrão', () => {
    const handleSelect = vi.fn();
    render(<QuickActionChips onSelectAction={handleSelect} />);

    expect(screen.getByTestId('quick-action-chips')).toBeInTheDocument();
    expect(screen.getByTestId('quick-action-proceed')).toHaveTextContent('Sim, prosseguir');
    expect(screen.getByTestId('quick-action-full-workflow')).toHaveTextContent('Criar tarefa & fluxo completo');
    expect(screen.getByTestId('quick-action-paperclip')).toHaveTextContent('Mandar para o Paperclip');
    expect(screen.getByTestId('quick-action-create-issue')).toHaveTextContent('Apenas criar issue');
    expect(screen.getByTestId('quick-action-cancel')).toHaveTextContent('Agora não');
  });

  it('deve permitir que o clique no chip preencha/envie a mensagem automaticamente ao clicar em Sim, prosseguir', () => {
    const handleSelect = vi.fn();
    render(<QuickActionChips onSelectAction={handleSelect} />);

    fireEvent.click(screen.getByTestId('quick-action-proceed'));
    expect(handleSelect).toHaveBeenCalledWith('Sim, pode prosseguir com as alterações.');
  });

  it('deve acionar onSelectAction com prompt de fluxo completo ao clicar em Criar tarefa & fluxo completo', () => {
    const handleSelect = vi.fn();
    render(<QuickActionChips onSelectAction={handleSelect} />);

    fireEvent.click(screen.getByTestId('quick-action-full-workflow'));
    expect(handleSelect).toHaveBeenCalledWith('Crie a issue, branch, desenvolva e siga o fluxo completo com PR e Code Review.');
  });

  it('deve acionar onSelectAction com prompt do Paperclip ao clicar em Mandar para o Paperclip', () => {
    const handleSelect = vi.fn();
    render(<QuickActionChips onSelectAction={handleSelect} />);

    fireEvent.click(screen.getByTestId('quick-action-paperclip'));
    expect(handleSelect).toHaveBeenCalledWith('Crie a tarefa e despache para o Paperclip no servidor Dell (192.168.31.5:3101).');
  });

  it('deve desabilitar todos os botões quando disabled for true', () => {
    const handleSelect = vi.fn();
    render(<QuickActionChips onSelectAction={handleSelect} disabled={true} />);

    expect(screen.getByTestId('quick-action-proceed')).toBeDisabled();
    expect(screen.getByTestId('quick-action-full-workflow')).toBeDisabled();
    expect(screen.getByTestId('quick-action-paperclip')).toBeDisabled();
    expect(screen.getByTestId('quick-action-cancel')).toBeDisabled();

    fireEvent.click(screen.getByTestId('quick-action-proceed'));
    expect(handleSelect).not.toHaveBeenCalled();
  });
});
