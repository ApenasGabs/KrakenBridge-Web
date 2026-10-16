import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  BellRing, 
  BellOff, 
  Smartphone, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Send, 
  ShieldCheck
} from 'lucide-react';
import { api } from '../../services/api';
import { 
  isPushSupported, 
  getNotificationPermission, 
  getCurrentPushSubscription, 
  subscribeToPush, 
  unsubscribeFromPush,
  onInstallPromptChange,
  promptPwaInstall
} from '../../utils/pwaManager';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({ isOpen, onClose }) => {
  const [pushSupported, setPushSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [statusInfo, setStatusInfo] = useState<{ configured: boolean; activeSubscriptions: number } | null>(null);

  useEffect(() => {
    setPushSupported(isPushSupported());
    setPermission(getNotificationPermission());

    const unsub = onInstallPromptChange((available) => {
      setCanInstall(available);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    checkSubscriptionState();
    loadServerStatus();
  }, [isOpen]);

  const checkSubscriptionState = async () => {
    try {
      const sub = await getCurrentPushSubscription();
      setIsSubscribed(!!sub);
      setPermission(getNotificationPermission());
    } catch {
      setIsSubscribed(false);
    }
  };

  const loadServerStatus = async () => {
    try {
      const data = await api.getNotificationStatus();
      setStatusInfo(data);
    } catch {
      // Falha silenciosa
    }
  };

  const handleTogglePush = async () => {
    setLoading(true);
    setMessage(null);
    try {
      if (isSubscribed) {
        const res = await unsubscribeFromPush();
        if (res.success) {
          setIsSubscribed(false);
          setMessage({ type: 'info', text: 'Notificações push desativadas neste dispositivo.' });
        } else {
          setMessage({ type: 'error', text: res.error || 'Erro ao desativar notificações.' });
        }
      } else {
        const res = await subscribeToPush();
        if (res.success) {
          setIsSubscribed(true);
          setPermission(getNotificationPermission());
          setMessage({ type: 'success', text: 'Notificações push ativadas com sucesso!' });
        } else {
          setMessage({ type: 'error', text: res.error || 'Não foi possível ativar as notificações.' });
        }
      }
      await loadServerStatus();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Erro inesperado ao alterar notificações.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSendTestPush = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const res = await api.sendTestPushNotification();
      if (res.sent > 0) {
        setMessage({ 
          type: 'success', 
          text: `Notificação enviada com sucesso para ${res.sent} dispositivo(s)!` 
        });
      } else {
        setMessage({ 
          type: 'info', 
          text: 'Nenhum dispositivo elegível registrado ou notificação enviada.' 
        });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Falha ao disparar teste.' });
    } finally {
      setTesting(false);
    }
  };

  const handleInstallClick = async () => {
    const outcome = await promptPwaInstall();
    if (outcome === 'accepted') {
      setMessage({ type: 'success', text: 'Aplicativo instalado na tela inicial com sucesso!' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal modal-open z-50 backdrop-blur-sm" data-testid="notifications-modal">
      <div className="modal-box max-w-lg bg-base-100 border border-base-300 shadow-2xl p-5 sm:p-6 rounded-2xl relative">
        {/* Botão Fechar */}
        <button 
          data-testid="notifications-modal-close"
          onClick={onClose}
          className="btn btn-sm btn-ghost btn-circle absolute right-4 top-4 text-base-content/60 hover:text-base-content"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Cabeçalho */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0">
            <BellRing className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-base-content leading-tight">
              PWA & Notificações Móveis
            </h3>
            <p className="text-xs text-base-content/60 mt-0.5">
              Acompanhamento de agentes no smartphone com Web Push nativo
            </p>
          </div>
        </div>

        {/* Feedback de Mensagem */}
        {message && (
          <div className={`alert text-xs py-2 px-3 mb-4 rounded-xl flex items-center gap-2 ${
            message.type === 'success' ? 'alert-success text-success-content' :
            message.type === 'error' ? 'alert-error text-error-content' : 'alert-info text-info-content'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        <div className="space-y-4 text-xs">
          {/* Card: Instalação PWA */}
          <div className="p-3.5 rounded-xl bg-base-200/60 border border-base-300 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-lg bg-base-300/80 text-primary shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-base-content flex items-center gap-1.5">
                  <span>Aplicativo Kraken (PWA)</span>
                  <span className="badge badge-xs badge-success font-mono">Mobile & Desktop</span>
                </div>
                <p className="text-[11px] text-base-content/60 truncate mt-0.5">
                  Instale na tela de início para visualização standalone em tela cheia.
                </p>
              </div>
            </div>

            {canInstall ? (
              <button
                data-testid="pwa-install-btn"
                onClick={handleInstallClick}
                className="btn btn-xs btn-primary gap-1 shrink-0 font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                Instalar
              </button>
            ) : (
              <span className="text-[10px] text-base-content/50 italic shrink-0">
                Nativo / Safari
              </span>
            )}
          </div>

          {/* Card: Web Push Toggle */}
          <div className="p-3.5 rounded-xl bg-base-200/60 border border-base-300 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`p-2 rounded-lg shrink-0 ${isSubscribed ? 'bg-success/15 text-success' : 'bg-base-300/80 text-base-content/60'}`}>
                  {isSubscribed ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                </div>
                <div>
                  <div className="font-semibold text-base-content flex items-center gap-1.5">
                    <span>Alertas Push em Tempo Real</span>
                    {isSubscribed ? (
                      <span className="badge badge-xs badge-success font-mono">Ativo</span>
                    ) : (
                      <span className="badge badge-xs badge-ghost font-mono">Desativado</span>
                    )}
                  </div>
                  <p className="text-[11px] text-base-content/60 mt-0.5">
                    Notificações de mutações em arquivos, início e término de tarefas.
                  </p>
                </div>
              </div>

              <input 
                data-testid="push-toggle-input"
                type="checkbox" 
                className="toggle toggle-primary toggle-sm shrink-0" 
                checked={isSubscribed}
                onChange={handleTogglePush}
                disabled={loading || !pushSupported || permission === 'denied'}
              />
            </div>

            {permission === 'denied' && (
              <div className="text-[11px] text-warning bg-warning/10 p-2 rounded-lg border border-warning/20 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>As notificações foram bloqueadas no navegador. Para reativar, clique no ícone de cadeado na barra de endereços e altere a permissão.</span>
              </div>
            )}

            {/* Botão de Teste */}
            {isSubscribed && (
              <div className="pt-2 border-t border-base-300/60 flex items-center justify-between">
                <span className="text-[11px] text-base-content/60">
                  {statusInfo?.activeSubscriptions || 1} dispositivo(s) conectado(s)
                </span>
                <button
                  data-testid="send-test-push-btn"
                  onClick={handleSendTestPush}
                  disabled={testing}
                  className="btn btn-xs btn-outline btn-primary gap-1 font-mono text-[10px]"
                >
                  <Send className="w-3 h-3" />
                  {testing ? 'Enviando...' : 'Enviar Teste'}
                </button>
              </div>
            )}
          </div>

          {/* Dicas e Protocolos Móveis */}
          <div className="p-3 rounded-xl bg-base-200/40 border border-base-300/70 text-[11px] text-base-content/70 space-y-1.5">
            <div className="font-medium text-base-content flex items-center gap-1.5 text-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              <span>Garantias de Privacidade & Eficiência</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-base-content/60">
              <li>Chaves VAPID criptografadas localmente sem intermediários de nuvem.</li>
              <li>Apenas metadados essenciais (arquivo alterado e tempo de execução) são notificados.</li>
              <li>No iOS Safari: Toque em <strong>Compartilhar</strong> e selecione <strong>Adicionar à Tela de Início</strong> para habilitar Push.</li>
            </ul>
          </div>
        </div>

        {/* Rodapé */}
        <div className="modal-action mt-4 pt-3 border-t border-base-300/60 flex justify-end">
          <button 
            data-testid="notifications-modal-confirm"
            onClick={onClose} 
            className="btn btn-sm btn-ghost"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
