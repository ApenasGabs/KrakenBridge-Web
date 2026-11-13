import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BatchActionBar } from '../BatchActionBar';

describe('BatchActionBar Component', () => {
  it('não deve renderizar nada quando totalSelected for 0', () => {
    const { container } = render(
      <BatchActionBar
        totalSelected={0}
        counts={{ approve: 0, requestChanges: 0, merge: 0, close: 0 }}
        onMarkAllAsOk={vi.fn()}
        onClearSelection={vi.fn()}
        onTriggerDispatch={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('deve renderizar a barra flutuante com contadores corretos quando houver itens selecionados', () => {
    render(
      <BatchActionBar
        totalSelected={7}
        counts={{ approve: 5, requestChanges: 2, merge: 0, close: 0 }}
        onMarkAllAsOk={vi.fn()}
        onClearSelection={vi.fn()}
        onTriggerDispatch={vi.fn()}
      />
    );

    // Contadores visíveis
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('5 OK')).toBeInTheDocument();
    expect(screen.getByText('2 Ajustar')).toBeInTheDocument();
    expect(screen.getByText('Despachar Lote (7)')).toBeInTheDocument();
  });

  it('deve chamar onMarkAllAsOk ao clicar no botão "Todos como OK"', () => {
    const markAllOkMock = vi.fn();
    render(
      <BatchActionBar
        totalSelected={3}
        counts={{ approve: 1, requestChanges: 2, merge: 0, close: 0 }}
        onMarkAllAsOk={markAllOkMock}
        onClearSelection={vi.fn()}
        onTriggerDispatch={vi.fn()}
      />
    );

    const btn = screen.getByTitle('Definir ação de todos os itens selecionados como OK / Aprovar');
    fireEvent.click(btn);
    expect(markAllOkMock).toHaveBeenCalledTimes(1);
  });

  it('deve chamar onClearSelection ao clicar em "Limpar"', () => {
    const clearMock = vi.fn();
    render(
      <BatchActionBar
        totalSelected={3}
        counts={{ approve: 3, requestChanges: 0, merge: 0, close: 0 }}
        onMarkAllAsOk={vi.fn()}
        onClearSelection={clearMock}
        onTriggerDispatch={vi.fn()}
      />
    );

    const btn = screen.getByTitle('Desmarcar todos os itens');
    fireEvent.click(btn);
    expect(clearMock).toHaveBeenCalledTimes(1);
  });

  it('deve chamar onTriggerDispatch ao clicar em "Despachar Lote"', () => {
    const dispatchMock = vi.fn();
    render(
      <BatchActionBar
        totalSelected={4}
        counts={{ approve: 4, requestChanges: 0, merge: 0, close: 0 }}
        onMarkAllAsOk={vi.fn()}
        onClearSelection={vi.fn()}
        onTriggerDispatch={dispatchMock}
      />
    );

    const btn = screen.getByText('Despachar Lote (4)');
    fireEvent.click(btn);
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it('deve exibir indicador de anotação vazia quando hasUnfilledNotes for true', () => {
    render(
      <BatchActionBar
        totalSelected={2}
        counts={{ approve: 1, requestChanges: 1, merge: 0, close: 0 }}
        hasUnfilledNotes={true}
        onMarkAllAsOk={vi.fn()}
        onClearSelection={vi.fn()}
        onTriggerDispatch={vi.fn()}
      />
    );

    expect(screen.getByText('Anotação vazia')).toBeInTheDocument();
  });
});
