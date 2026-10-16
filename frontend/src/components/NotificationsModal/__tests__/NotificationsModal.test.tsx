import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationsModal } from '../NotificationsModal';
import * as pwaManager from '../../../utils/pwaManager';
import { api } from '../../../services/api';

vi.mock('../../../services/api', () => ({
  api: {
    getNotificationStatus: vi.fn().mockResolvedValue({ configured: true, activeSubscriptions: 2 }),
    sendTestPushNotification: vi.fn().mockResolvedValue({ success: true, sent: 2, failed: 0 })
  }
}));

describe('NotificationsModal Component (Issue #53)', () => {
  const onCloseMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não deve renderizar quando isOpen for false', () => {
    const { container } = render(<NotificationsModal isOpen={false} onClose={onCloseMock} />);
    expect(container.firstChild).toBeNull();
  });

  it('deve renderizar modal com título, opções de PWA e Web Push', async () => {
    render(<NotificationsModal isOpen={true} onClose={onCloseMock} />);

    expect(screen.getByTestId('notifications-modal')).toBeInTheDocument();
    expect(screen.getByText('PWA & Notificações Móveis')).toBeInTheDocument();
    expect(screen.getByText('Aplicativo Kraken (PWA)')).toBeInTheDocument();
    expect(screen.getByText('Alertas Push em Tempo Real')).toBeInTheDocument();
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
    const subSpy = vi.spyOn(pwaManager, 'subscribeToPush').mockResolvedValue({ success: true });

    render(<NotificationsModal isOpen={true} onClose={onCloseMock} />);

    const toggle = screen.getByTestId('push-toggle-input');
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(subSpy).toHaveBeenCalled();
    });
  });

  it('deve disparar teste de notificação quando inscrito', async () => {
    vi.spyOn(pwaManager, 'isPushSupported').mockReturnValue(true);
    vi.spyOn(pwaManager, 'getNotificationPermission').mockReturnValue('granted');
    vi.spyOn(pwaManager, 'getCurrentPushSubscription').mockResolvedValue({
      endpoint: 'https://push.example.com/sub'
    } as any);

    render(<NotificationsModal isOpen={true} onClose={onCloseMock} />);

    await waitFor(() => {
      expect(screen.getByTestId('send-test-push-btn')).toBeInTheDocument();
    });

    const testBtn = screen.getByTestId('send-test-push-btn');
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(api.sendTestPushNotification).toHaveBeenCalled();
    });
  });
});
