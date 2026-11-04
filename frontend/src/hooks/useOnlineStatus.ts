import { useState, useEffect, useCallback } from 'react';

export interface OnlineStatusState {
  isOnline: boolean;
  wasOffline: boolean;
  lastChangedAt: string | null;
  dismissReconnectedNotice: () => void;
}

function readNavigatorOnline(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
    return true;
  }
  return navigator.onLine;
}

/**
 * Hook reativo para monitorar conectividade de rede (online/offline)
 * no KrakenBridge PWA.
 */
export function useOnlineStatus(): OnlineStatusState {
  const [isOnline, setIsOnline] = useState<boolean>(() => readNavigatorOnline());
  const [wasOffline, setWasOffline] = useState<boolean>(false);
  const [lastChangedAt, setLastChangedAt] = useState<string | null>(null);

  const dismissReconnectedNotice = useCallback(() => {
    setWasOffline(false);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const handleOffline = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      setIsOnline(false);
      setWasOffline(true);
      setLastChangedAt(new Date().toISOString());
    };

    const handleOnline = () => {
      setIsOnline(true);
      setLastChangedAt(new Date().toISOString());
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      reconnectTimer = setTimeout(() => {
        setWasOffline(false);
      }, 4000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, []);

  return {
    isOnline,
    wasOffline,
    lastChangedAt,
    dismissReconnectedNotice
  };
}
