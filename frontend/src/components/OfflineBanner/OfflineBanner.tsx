import React from 'react';
import { WifiOff, Wifi, X } from 'lucide-react';

interface OfflineBannerProps {
  isOnline: boolean;
  wasOffline?: boolean;
  cachedConversationsCount?: number;
  onDismissReconnected?: () => void;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  isOnline,
  wasOffline = false,
  cachedConversationsCount = 0,
  onDismissReconnected
}) => {
  if (isOnline && !wasOffline) {
    return null;
  }

  if (!isOnline) {
    return (
      <div
        data-testid="offline-status-banner"
        role="status"
        aria-live="polite"
        className="w-full bg-amber-500/15 border-b border-amber-500/30 px-3 sm:px-4 py-2 text-xs text-amber-200 flex items-center justify-between gap-2 shrink-0"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="p-1 rounded-md bg-amber-500/20 text-amber-400 shrink-0">
            <WifiOff className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <span className="font-semibold text-amber-300">Modo Offline ativo</span>
            <span className="hidden sm:inline text-amber-200/80">
              {' '}— Histórico recente disponível localmente para leitura
              {cachedConversationsCount > 0 ? ` (${cachedConversationsCount} conversa${cachedConversationsCount > 1 ? 's' : ''})` : ''}.
            </span>
            <span className="sm:hidden text-amber-200/80">
              {' '}• Leitura local habilitada
            </span>
          </div>
        </div>
        <span className="badge badge-xs bg-amber-500/20 text-amber-300 border-amber-500/30 font-mono shrink-0">
          OFFLINE
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="online-restored-banner"
      role="status"
      aria-live="polite"
      className="w-full bg-emerald-500/15 border-b border-emerald-500/30 px-3 sm:px-4 py-1.5 text-xs text-emerald-200 flex items-center justify-between gap-2 shrink-0"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="font-medium truncate">
          Conexão restabelecida — sincronizando sessões com o servidor KrakenBridge.
        </span>
      </div>
      {onDismissReconnected && (
        <button
          type="button"
          onClick={onDismissReconnected}
          aria-label="Fechar aviso de reconexão"
          className="btn btn-ghost btn-xs btn-circle text-emerald-300/70 hover:text-emerald-200 shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
