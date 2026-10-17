import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationsModal } from '../NotificationsModal';
import * as pwaManager from '../../../utils/pwaManager';
import { api } from '../../../services/api';

vi.mock('../../../services/api', () => ({
  api: {
    getNotificationStatus: vi.fn().mockResolvedValue({ configured: true, activeSubscriptions: 2 }),
    sendTestPushNotification: vi.fn().mockResolvedValue({ success: true, sent: 2, failed: 0 }),
    getCoucouStatus: vi.fn().mockResolvedValue({
      success: true,
      running: true,
      port: 47821,
      host: '192.168.1.100',
      fingerprint: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      token: 'sample-token-12345',
      pairingUri: 'coucou://pair?v=1&host=192.168.1.100&port=47821&fp=abcdef&token=sample&name=Kraken',
      qrCodeDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      clientCount: 1,
      deviceName: 'Pixel 8',
      pairedAt: Date.now()
    }),
    resetCoucouToken: vi.fn().mockResolvedValue({
      success: true,
      token: 'new-token-99999',
      pairingUri: 'coucou://pair?v=1&host=192.168.1.100&port=47821&fp=abcdef&token=new-token-99999&name=Kraken',
      qrCodeDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    })
  }
}));

describe('NotificationsModal Component (Issue #52 & #53)', () => {
  const onCloseMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não deve renderizar quando isOpen for false', () => {
    const { container } = render(<NotificationsModal isOpen={false} onClose={onCloseMock} />);
    expect(container.firstChild).toBeNull();
  });

  it('deve renderizar modal com título, abas de PWA e Coucou Phone Link', async () => {
    render(<NotificationsModal isOpen={true} onClose={onCloseMock} />);

    expect(screen.getByTestId('notifications-modal')).toBeInTheDocument();
    expect(screen.getByText('Acompanhamento Móvel do Kraken')).toBeInTheDocument();
    expect(screen.getByTestId('tab-push-pwa')).toBeInTheDocument();
    expect(screen.getByTestId('tab-coucou-link')).toBeInTheDocument();
    expect(screen.getByText('Aplicativo Kraken (PWA)')).toBeInTheDocument();
  });

  it('deve alternar para a aba do Coucou Phone Link e exibir QR Code e dados de pareamento', async () => {
    render(<NotificationsModal isOpen={true} onClose={onCloseMock} />);

    const coucouTab = screen.getByTestId('tab-coucou-link');
    fireEvent.click(coucouTab);

    expect(screen.getByTestId('coucou-tab-content')).toBeInTheDocument();
    expect(screen.getByText('Parear Smartphone (Coucou App)')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('coucou-qr-image')).toBeInTheDocument();
      expect(screen.getByText(/Pixel 8/)).toBeInTheDocument();
    });
  });

  it('deve chamar onClose ao clicar no botão fechar ou concluir', () => {
    render(<NotificationsModal isOpen={true} onClose={onCloseMock} />);

    const closeBtn = screen.getByTestId('notifications-modal-close');
    fireEvent.click(closeBtn);
    expect(onCloseMock).toHaveBeenCalledTimes(1);

    const confirmBtn = screen.getByTestId('notifications-modal-confirm');
    fireEvent.click(confirmBtn);
    expect(onCloseMock).toHaveBeenCalledTimes(2);
  });

  it('deve permitir alternar o toggle de notificações push', async () => {
    vi.spyOn(pwaManager, 'isPushSupported').mockReturnValue(true);
    vi.spyOn(pwaManager, 'getNotificationPermission').mockReturnValue('default');
    vi.spyOn(pwaManager, 'getCurrentPushSubscription').mockResolvedValue(null);
    vi.spyOn(pwaManager, 'subscribeToPush').mockResolvedValue({ success: true });

    render(<NotificationsModal isOpen={true} onClose={onCloseMock} />);

    const toggle = screen.getByTestId('push-toggle-input');
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(pwaManager.subscribeToPush).toHaveBeenCalled();
    });
  });

  it('deve permitir regerar token de pareamento do Coucou', async () => {
    render(<NotificationsModal isOpen={true} onClose={onCloseMock} />);

    fireEvent.click(screen.getByTestId('tab-coucou-link'));
    await waitFor(() => expect(screen.getByTestId('coucou-reset-token-btn')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('coucou-reset-token-btn'));

    await waitFor(() => {
      expect(api.resetCoucouToken).toHaveBeenCalled();
    });
  });
});
