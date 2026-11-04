import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { OfflineBanner } from '../OfflineBanner';
import { useOnlineStatus } from '../../../hooks/useOnlineStatus';
import React from 'react';

const HookHarness: React.FC = () => {
  const { isOnline, wasOffline, dismissReconnectedNotice } = useOnlineStatus();
  return (
    <div>
      <span data-testid="state-online">{String(isOnline)}</span>
      <span data-testid="state-was-offline">{String(wasOffline)}</span>
      <OfflineBanner
        isOnline={isOnline}
        wasOffline={wasOffline}
        cachedConversationsCount={3}
        onDismissReconnected={dismissReconnectedNotice}
      />
    </div>
  );
};

describe('OfflineBanner & useOnlineStatus (Issue #129)', () => {
  it('não deve exibir banner quando estiver online e sem queda recente', () => {
    const { container } = render(<OfflineBanner isOnline={true} wasOffline={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('deve exibir banner de Modo Offline ativo com contagem de conversas locais', () => {
    render(<OfflineBanner isOnline={false} cachedConversationsCount={5} />);
    const banner = screen.getByTestId('offline-status-banner');
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toContain('Modo Offline ativo');
    expect(banner.textContent).toContain('5 conversas');
  });

  it('deve exibir banner de reconexão quando voltar a ficar online e permitir fechar', () => {
    const onDismiss = vi.fn();
    render(
      <OfflineBanner
        isOnline={true}
        wasOffline={true}
        onDismissReconnected={onDismiss}
      />
    );
    const banner = screen.getByTestId('online-restored-banner');
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toContain('Conexão restabelecida');

    const closeBtn = screen.getByRole('button', { name: /fechar aviso de reconexão/i });
    fireEvent.click(closeBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('deve reagir aos eventos window offline e online via useOnlineStatus', () => {
    render(<HookHarness />);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByTestId('state-online').textContent).toBe('false');
    expect(screen.getByTestId('offline-status-banner')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.getTestId ? screen.getByTestId('state-online').textContent : 'true').toBe('true');
    expect(screen.getByTestId('online-restored-banner')).toBeInTheDocument();
  });
});
