import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SystemUpdateModal } from '../SystemUpdateModal';
import { api } from '../../../services/api';

vi.mock('../../../services/api', () => ({
  api: {
    getSystemVersion: vi.fn().mockResolvedValue({
      success: true,
      currentVersion: '1.10.0',
      latestVersion: '1.11.0',
      hasUpdate: true,
      policy: 'auto',
      pinnedVersion: null,
      releases: [
        {
          tag: 'v1.11.0',
          name: 'Release v1.11.0',
          changelog: 'Novas funcionalidades de Crawl4AI e extração estruturada.',
          publishedAt: '2026-10-16T21:00:00Z',
          isCurrent: false,
          isLatest: true
        },
        {
          tag: 'v1.10.0',
          name: 'Release v1.10.0',
          changelog: 'Servidor Coucou Phone Link TLS implementado.',
          publishedAt: '2026-10-16T20:00:00Z',
          isCurrent: true,
          isLatest: false
        }
      ],
      lastCheckedAt: '2026-10-16T21:10:00Z'
    }),
    setSystemVersionPolicy: vi.fn().mockResolvedValue({
      success: true,
      policy: { policy: 'pinned', pinnedVersion: 'v1.10.0' }
    }),
    updateSystemVersion: vi.fn().mockResolvedValue({
      success: true,
      message: 'Atualização para v1.11.0 iniciada com Pod Drain.',
      targetVersion: '1.11.0'
    })
  }
}));

describe('SystemUpdateModal Component (Issue #64)', () => {
  const onCloseMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não deve renderizar quando isOpen for false', () => {
    const { container } = render(<SystemUpdateModal isOpen={false} onClose={onCloseMock} />);
    expect(container.firstChild).toBeNull();
  });

  it('deve renderizar modal com versão atual e indicador de atualização disponível', async () => {
    render(<SystemUpdateModal isOpen={true} onClose={onCloseMock} />);

    expect(screen.getByTestId('system-update-modal')).toBeInTheDocument();
    expect(screen.getByText('Gestão de Versões & Atualizações')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('v1.10.0')).toBeInTheDocument();
      expect(screen.getByText(/Nova Versão Disponível: v1.11.0/)).toBeInTheDocument();
      expect(screen.getByTestId('quick-update-btn')).toBeInTheDocument();
    });
  });

  it('deve permitir alternar para política de versão fixada (pinned)', async () => {
    render(<SystemUpdateModal isOpen={true} onClose={onCloseMock} />);

    await waitFor(() => {
      expect(screen.getByTestId('policy-pinned-card')).toBeInTheDocument();
    });

    const pinnedCard = screen.getByTestId('policy-pinned-card');
    fireEvent.click(pinnedCard);

    await waitFor(() => {
      expect(api.setSystemVersionPolicy).toHaveBeenCalledWith('pinned', expect.any(String));
    });
  });

  it('deve permitir selecionar outra versão e visualizar notas de release', async () => {
    render(<SystemUpdateModal isOpen={true} onClose={onCloseMock} />);

    await waitFor(() => {
      expect(screen.getByTestId('version-select-dropdown')).toBeInTheDocument();
    });

    const dropdown = screen.getByTestId('version-select-dropdown');
    fireEvent.change(dropdown, { target: { value: 'v1.10.0' } });

    await waitFor(() => {
      expect(screen.getByText(/Servidor Coucou Phone Link/)).toBeInTheDocument();
    });
  });

  it('deve chamar updateSystemVersion ao clicar no botão de aplicar atualização', async () => {
    render(<SystemUpdateModal isOpen={true} onClose={onCloseMock} />);

    await waitFor(() => {
      expect(screen.getByTestId('apply-version-btn')).toBeInTheDocument();
    });

    const applyBtn = screen.getByTestId('apply-version-btn');
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(api.updateSystemVersion).toHaveBeenCalledWith('v1.11.0');
    });
  });

  it('deve chamar onClose ao clicar no botão cancelar ou fechar', async () => {
    render(<SystemUpdateModal isOpen={true} onClose={onCloseMock} />);

    const closeBtn = screen.getByTestId('system-update-modal-close');
    fireEvent.click(closeBtn);
    expect(onCloseMock).toHaveBeenCalledTimes(1);

    const cancelBtn = screen.getByTestId('system-update-modal-cancel');
    fireEvent.click(cancelBtn);
    expect(onCloseMock).toHaveBeenCalledTimes(2);
  });
});
