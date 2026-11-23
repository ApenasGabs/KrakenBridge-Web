import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChatInput } from '../ChatInput';
import type { ChatImageAttachment } from '../../../types';

describe('ChatInput — Preview de miniaturas, remoção individual e validação de tipo/tamanho (Issue #210)', () => {
  const sampleAttachment: ChatImageAttachment = {
    id: 'att-preview-1',
    name: 'mockup-ui.png',
    mimeType: 'image/png',
    size: 2048,
    path: '/workspace/KrakenBridge-Web/data/uploads/c1/mockup-ui.png',
    url: '/api/files/media?path=%2Fworkspace%2FKrakenBridge-Web%2Fdata%2Fuploads%2Fc1%2Fmockup-ui.png'
  };

  it('exibe preview das miniaturas antes do envio e permite remoção individual', () => {
    const onAttachmentsChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <ChatInput
        prompt=""
        onChange={vi.fn()}
        onSubmit={onSubmit}
        onStop={vi.fn()}
        isLoading={false}
        isOnline={true}
        attachments={[sampleAttachment]}
        onAttachmentsChange={onAttachmentsChange}
      />
    );

    expect(screen.getByTestId('chat-attachments-preview')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'mockup-ui.png' })).toBeInTheDocument();

    // Botão de envio fica habilitado mesmo sem texto quando há imagem anexada
    const sendBtn = screen.getByTestId('chat-send-btn');
    expect(sendBtn).not.toBeDisabled();
    fireEvent.click(sendBtn);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // Remoção individual da miniatura
    fireEvent.click(screen.getByTestId('chat-attachment-remove-btn'));
    expect(onAttachmentsChange).toHaveBeenCalledWith([]);
  });

  it('valida tipo de arquivo não suportado e tamanho acima de 10MB exibindo aviso', async () => {
    const onAttachmentsChange = vi.fn();

    render(
      <ChatInput
        prompt=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onStop={vi.fn()}
        isLoading={false}
        isOnline={true}
        attachments={[]}
        onAttachmentsChange={onAttachmentsChange}
      />
    );

    const fileInput = screen.getByTestId('chat-image-file-input') as HTMLInputElement;

    // 1. Tipo inválido (texto)
    const invalidTypeFile = new File(['hello'], 'notas.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [invalidTypeFile] } });

    await waitFor(() => {
      expect(screen.getByText(/formato não suportado/i)).toBeInTheDocument();
    });
    expect(onAttachmentsChange).not.toHaveBeenCalled();

    // 2. Tamanho acima de 10MB
    const oversizedFile = new File(['x'], 'gigante.png', { type: 'image/png' });
    Object.defineProperty(oversizedFile, 'size', { value: 11 * 1024 * 1024 });
    fireEvent.change(fileInput, { target: { files: [oversizedFile] } });

    await waitFor(() => {
      expect(screen.getByText(/excede o limite de 10MB/i)).toBeInTheDocument();
    });
    expect(onAttachmentsChange).not.toHaveBeenCalled();
  });
});
