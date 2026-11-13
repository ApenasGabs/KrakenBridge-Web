import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BatchDispatchModal } from '../BatchDispatchModal';
import type { BatchItemDecision } from '../../../types';

describe('BatchDispatchModal Component', () => {
  const mockItems: BatchItemDecision[] = [
    {
      itemKey: 'ApenasGabs/repo#10',
      itemType: 'pr',
      repo: 'ApenasGabs/repo',
      number: 10,
      title: 'feat: primeira funcionalidade',
      action: 'approve'
    },
    {
      itemKey: 'ApenasGabs/repo#11',
      itemType: 'pr',
      repo: 'ApenasGabs/repo',
      number: 11,
      title: 'fix: ajuste no layout',
      action: 'request_changes',
      notes: 'ajuste item pipipopopo no header'
    }
  ];

  it('não deve renderizar quando isOpen for false', () => {
    const { container } = render(
      <BatchDispatchModal
        isOpen={false}
        onClose={vi.fn()}
        items={mockItems}
        isDispatching={false}
        onConfirmDispatch={vi.fn()}
        result={null}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('deve renderizar a prévia dos itens agrupados por ação (Aprovação e Ajustes com Notas)', () => {
    render(
      <BatchDispatchModal
        isOpen={true}
        onClose={vi.fn()}
        items={mockItems}
        isDispatching={false}
        onConfirmDispatch={vi.fn()}
        result={null}
      />
    );

    expect(screen.getByText('Revisão e Despacho em Lote')).toBeInTheDocument();
    expect(screen.getByText('Aprovação Direta (1)')).toBeInTheDocument();
    expect(screen.getByText('Ajustes com Anotações (1)')).toBeInTheDocument();
    expect(screen.getByText('ajuste item pipipopopo no header')).toBeInTheDocument();
  });

  it('deve chamar onConfirmDispatch ao clicar no botão de confirmação', () => {
    const confirmMock = vi.fn();
    render(
      <BatchDispatchModal
        isOpen={true}
        onClose={vi.fn()}
        items={mockItems}
        isDispatching={false}
        onConfirmDispatch={confirmMock}
        result={null}
      />
    );

    const btn = screen.getByText('Confirmar e Despachar Lote (2)');
    fireEvent.click(btn);
    expect(confirmMock).toHaveBeenCalledTimes(1);
  });

  it('deve exibir mensagem de sucesso quando result for informado', () => {
    const mockResult = {
      success: true,
      total: 2,
      successful: 2,
      failed: 0,
      results: [
        { itemKey: 'ApenasGabs/repo#10', action: 'approve', success: true, message: 'PR aprovada com sucesso' },
        { itemKey: 'ApenasGabs/repo#11', action: 'request_changes', success: true, message: 'Revisão despachada' }
      ]
    };

    render(
      <BatchDispatchModal
        isOpen={true}
        onClose={vi.fn()}
        items={mockItems}
        isDispatching={false}
        onConfirmDispatch={vi.fn()}
        result={mockResult}
      />
    );

    expect(screen.getByText('Resultado do Despacho em Lote')).toBeInTheDocument();
    expect(screen.getByText('Todas as ações foram processadas com sucesso!')).toBeInTheDocument();
    expect(screen.getByText('Concluir')).toBeInTheDocument();
  });
});
