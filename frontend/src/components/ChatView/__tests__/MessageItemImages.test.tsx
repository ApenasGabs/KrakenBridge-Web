import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MessageItem } from '../MessageItem';
import type { ChatMessage } from '../../../types';

describe('MessageItem — Imagens inline e anexos (Issue #210)', () => {
  it('reescreve imagem local do modelo em Markdown para /api/files/media e abre lightbox ao clicar', () => {
    const message: ChatMessage = {
      id: 'msg-assistant-1',
      role: 'assistant',
      text: 'Aqui está o resultado:\n\n![Preview Gerado](/workspace/demo/output.png)',
      timestamp: '2026-11-23T19:00:00.000Z',
      agent: 'antigravity',
      model: 'gemini-2.5-pro'
    };

    render(<MessageItem message={message} subproject="demo" />);

    const img = screen.getByRole('img', { name: 'Preview Gerado' });
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toBe('/api/files/media?path=%2Fworkspace%2Fdemo%2Foutput.png&subproject=demo');

    // Abre lightbox ao clicar no trigger da imagem
    fireEvent.click(screen.getByTestId('message-image-trigger'));
    expect(screen.getByTestId('image-lightbox-modal')).toBeInTheDocument();

    // Fecha lightbox ao clicar no botão de fechar
    fireEvent.click(screen.getByTestId('image-lightbox-close'));
    expect(screen.queryByTestId('image-lightbox-modal')).not.toBeInTheDocument();
  });

  it('renderiza imagens anexadas pelo usuário e abre lightbox ao clicar', () => {
    const message: ChatMessage = {
      id: 'msg-user-1',
      role: 'user',
      text: 'Veja esse erro',
      attachments: [
        {
          id: 'att-1',
          name: 'erro-tela.png',
          mimeType: 'image/png',
          size: 4096,
          path: '/workspace/KrakenBridge-Web/data/uploads/c1/erro-tela.png',
          url: '/api/files/media?path=%2Fworkspace%2FKrakenBridge-Web%2Fdata%2Fuploads%2Fc1%2Ferro-tela.png'
        }
      ],
      timestamp: '2026-11-23T19:01:00.000Z'
    };

    render(<MessageItem message={message} />);

    expect(screen.getByTestId('message-attachments-grid')).toBeInTheDocument();
    const thumbImg = screen.getByRole('img', { name: 'erro-tela.png' });
    expect(thumbImg).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('message-attachment-thumb'));
    expect(screen.getByTestId('image-lightbox-modal')).toBeInTheDocument();
  });

  it('permite data:image/png;base64 seguro no Markdown do modelo', () => {
    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const message: ChatMessage = {
      id: 'msg-assistant-2',
      role: 'assistant',
      text: `![Pixel](${dataUrl})`,
      timestamp: '2026-11-23T19:02:00.000Z'
    };

    render(<MessageItem message={message} />);

    const img = screen.getByRole('img', { name: 'Pixel' });
    expect(img.getAttribute('src')).toBe(dataUrl);
  });
});
