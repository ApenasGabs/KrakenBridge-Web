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

  it('Barra flutuante surge suavemente na tela exibindo as contagens corretas', () => {
    const { container } = render(
      <BatchActionBar
        totalSelected={5}
        counts={{ approve: 3, requestChanges: 2, merge: 0, close: 0 }}
        onMarkAllAsOk={vi.fn()}
        onClearSelection={vi.fn()}
        onTriggerDispatch={vi.fn()}
      />
    );

    // Valida animação e classes de transição suave
    const bar = container.firstChild as HTMLElement;
    expect(bar.className).toContain('animate-in');
    expect(bar.className).toContain('slide-in-from-bottom-5');

    // Valida contagens corretas
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3 OK')).toBeInTheDocument();
    expect(screen.getByText('2 Ajustar')).toBeInTheDocument();
  });

  it('Suporte completo a múltiplos itens mistos (N OKs e N Ajustes com notas)', () => {
    render(
      <BatchActionBar
        totalSelected={8}
        counts={{ approve: 5, requestChanges: 3, merge: 0, close: 0 }}
        hasUnfilledNotes={false}
        onMarkAllAsOk={vi.fn()}
        onClearSelection={vi.fn()}
        onTriggerDispatch={vi.fn()}
      />
    );

    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('5 OK')).toBeInTheDocument();
    expect(screen.getByText('3 Ajustar')).toBeInTheDocument();
    expect(screen.getByText('Despachar Lote (8)')).toBeInTheDocument();
  });

  it('Cobertura de testes unitários para os novos componentes e fluxos de estado', () => {
    const markAllOkMock = vi.fn();
    const clearMock = vi.fn();
    const dispatchMock = vi.fn();

    const { rerender } = render(
      <BatchActionBar
        totalSelected={1}
        counts={{ approve: 1, requestChanges: 0, merge: 0, close: 0 }}
        onMarkAllAsOk={markAllOkMock}
        onClearSelection={clearMock}
        onTriggerDispatch={dispatchMock}
      />
    );

    expect(screen.getByText('1 OK')).toBeInTheDocument();

    // Atualização de estado re-renderizado
    rerender(
      <BatchActionBar
        totalSelected={2}
        counts={{ approve: 1, requestChanges: 1, merge: 0, close: 0 }}
        hasUnfilledNotes={true}
        onMarkAllAsOk={markAllOkMock}
        onClearSelection={clearMock}
        onTriggerDispatch={dispatchMock}
      />
    );

    expect(screen.getByText('1 Ajustar')).toBeInTheDocument();
    expect(screen.getByText('Anotação vazia')).toBeInTheDocument();
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
