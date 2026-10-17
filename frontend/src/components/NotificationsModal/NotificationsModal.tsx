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
  ShieldCheck,
  QrCode,
  Copy,
  RefreshCw,
  Lock
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
  const [activeTab, setActiveTab] = useState<'push' | 'coucou'>('push');

  // Push / PWA States
  const [pushSupported, setPushSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [statusInfo, setStatusInfo] = useState<{ configured: boolean; activeSubscriptions: number } | null>(null);

  // Coucou Phone Link States
  const [coucouInfo, setCoucouInfo] = useState<{
    running: boolean;
    port: number;
    host: string;
    fingerprint: string;
    token: string;
    pairingUri: string;
    qrCodeDataUrl: string;
    clientCount: number;
    deviceName: string;
    pairedAt: number | null;
  } | null>(null);
  const [loadingCoucou, setLoadingCoucou] = useState(false);

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
    loadCoucouStatus();
  }, [isOpen]);

  const checkSubscriptionState = async () => {
    try {
      const sub = await getCurrentPushSubscription();
      setIsSubscribed(!!sub);
    } catch {
      setIsSubscribed(false);
    }
  };

  const loadServerStatus = async () => {
    try {
      const status = await api.getNotificationStatus();
      setStatusInfo(status);
    } catch {
      // Ignora falhas de status em ambientes offline
    }
  };

  const loadCoucouStatus = async () => {
    try {
      setLoadingCoucou(true);
      const res = await api.getCoucouStatus();
      if (res.success) {
        setCoucouInfo(res);
      }
    } catch (err) {
      console.warn('[Coucou] Falha ao carregar status:', err);
    } finally {
      setLoadingCoucou(false);
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
          loadServerStatus();
        } else {
          setMessage({ type: 'error', text: res.error || 'Erro ao desativar notificações push.' });
        }
      } else {
        const res = await subscribeToPush();
        if (res.success) {
          setIsSubscribed(true);
          setPermission('granted');
          setMessage({ type: 'success', text: 'Notificações móveis e na área de trabalho ativadas com sucesso!' });
          loadServerStatus();
        } else {
          setMessage({ type: 'error', text: res.error || 'Erro ao habilitar notificações push.' });
          setPermission(getNotificationPermission());
        }
      }
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
      if (res.success) {
        setMessage({ type: 'success', text: 'Notificação de teste enviada com sucesso!' });
      } else {
        setMessage({ type: 'error', text: 'Falha ao despachar notificação de teste.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Erro de comunicação ao enviar teste.' });
    } finally {
      setTesting(false);
    }
  };

  const handleInstallClick = async () => {
    const outcome = await promptPwaInstall();
    if (outcome === 'accepted') {
      setMessage({ type: 'success', text: 'O aplicativo Kraken está sendo instalado!' });
    }
  };

  const handleCopyCoucouLink = async () => {
    if (!coucouInfo?.pairingUri) return;
    try {
      await navigator.clipboard.writeText(coucouInfo.pairingUri);
      setMessage({ type: 'success', text: 'Link coucou://pair copiado para a área de transferência!' });
    } catch {
      setMessage({ type: 'info', text: coucouInfo.pairingUri });
    }
  };

  const handleResetCoucou = async () => {
    try {
      setLoadingCoucou(true);
      const res = await api.resetCoucouToken();
      if (res.success) {
        setCoucouInfo(prev => prev ? {
          ...prev,
          token: res.token,
          pairingUri: res.pairingUri,
          qrCodeDataUrl: res.qrCodeDataUrl,
          clientCount: 0,
          deviceName: '',
          pairedAt: null
        } : null);
        setMessage({ type: 'info', text: 'Novo token de pareamento gerado! Dispositivos anteriores foram desconectados.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Falha ao redefinir pareamento.' });
    } finally {
      setLoadingCoucou(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal modal-open z-50" data-testid="notifications-modal">
      <div className="modal-backdrop bg-black/60 backdrop-blur-xs" onClick={onClose} />
      
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
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-base-content leading-tight">
              Acompanhamento Móvel do Kraken
            </h3>
            <p className="text-xs text-base-content/60 mt-0.5">
              Notificações Web Push e protocolo Coucou Phone Link para Android
            </p>
          </div>
        </div>

        {/* Abas de Navegação */}
        <div className="flex border-b border-base-300 mb-4 gap-2">
          <button
            data-testid="tab-push-pwa"
            onClick={() => setActiveTab('push')}
            className={`pb-2 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'push'
                ? 'border-primary text-primary'
                : 'border-transparent text-base-content/60 hover:text-base-content'
            }`}
          >
            <BellRing className="w-3.5 h-3.5" />
            <span>Web Push & PWA</span>
          </button>
          <button
            data-testid="tab-coucou-link"
            onClick={() => setActiveTab('coucou')}
            className={`pb-2 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'coucou'
                ? 'border-primary text-primary'
                : 'border-transparent text-base-content/60 hover:text-base-content'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Coucou Phone Link</span>
            {coucouInfo && coucouInfo.clientCount > 0 && (
              <span className="badge badge-xs badge-success font-mono">1</span>
            )}
          </button>
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

        {/* Aba 1: Web Push & PWA */}
        {activeTab === 'push' && (
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
        )}

        {/* Aba 2: Coucou Phone Link (Android Companion) */}
        {activeTab === 'coucou' && (
          <div className="space-y-4 text-xs" data-testid="coucou-tab-content">
            {/* Card de Pareamento e QR Code */}
            <div className="p-4 rounded-xl bg-base-200/60 border border-base-300 text-center space-y-3">
              <div className="flex items-center justify-between text-left">
                <div>
                  <h4 className="font-semibold text-base-content text-sm flex items-center gap-1.5">
                    <span>Parear Smartphone (Coucou App)</span>
                    <span className="badge badge-xs badge-primary font-mono">TLS Pinned</span>
                  </h4>
                  <p className="text-[11px] text-base-content/60 mt-0.5">
                    Abra o app <strong>Coucou</strong> no Android e escaneie o código abaixo.
                  </p>
                </div>
                {coucouInfo && coucouInfo.clientCount > 0 ? (
                  <span className="badge badge-success gap-1 text-[11px] font-mono shrink-0">
                    <CheckCircle2 className="w-3 h-3" /> Conectado
                  </span>
                ) : (
                  <span className="badge badge-ghost text-[11px] font-mono shrink-0">
                    Aguardando...
                  </span>
                )}
              </div>

              {/* Renderização do QR Code */}
              <div className="py-2 flex justify-center">
                {coucouInfo?.qrCodeDataUrl ? (
                  <div className="p-3 bg-white rounded-2xl shadow-md border border-base-300 inline-block">
                    <img 
                      data-testid="coucou-qr-image"
                      src={coucouInfo.qrCodeDataUrl} 
                      alt="Coucou Pairing QR Code" 
                      className="w-44 h-44 sm:w-48 sm:h-48 block"
                    />
                  </div>
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center bg-base-300/40 rounded-2xl border border-dashed border-base-300">
                    <span className="loading loading-spinner text-primary"></span>
                  </div>
                )}
              </div>

              {/* Status do Dispositivo Pareado */}
              {coucouInfo?.deviceName && (
                <div className="p-2 bg-success/10 border border-success/20 rounded-lg text-success text-[11px] flex items-center justify-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Dispositivo ativo: <strong>{coucouInfo.deviceName}</strong></span>
                </div>
              )}

              {/* Ações de Pareamento */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  data-testid="coucou-copy-link-btn"
                  onClick={handleCopyCoucouLink}
                  className="btn btn-xs btn-outline btn-primary gap-1 font-mono text-[10px]"
                  title="Copiar coucou://pair URI"
                >
                  <Copy className="w-3 h-3" />
                  Copiar Link
                </button>
                <button
                  data-testid="coucou-reset-token-btn"
                  onClick={handleResetCoucou}
                  disabled={loadingCoucou}
                  className="btn btn-xs btn-ghost text-error gap-1 font-mono text-[10px]"
                  title="Gera novo token e revoga conexões anteriores"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingCoucou ? 'animate-spin' : ''}`} />
                  Regerar Pareamento
                </button>
              </div>
            </div>

            {/* Detalhes Técnicos e Segurança */}
            <div className="p-3 rounded-xl bg-base-200/40 border border-base-300/70 text-[11px] text-base-content/70 space-y-2">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-base-content/60">Servidor TLS:</span>
                <span className="font-semibold text-base-content">{coucouInfo?.host || '127.0.0.1'}:{coucouInfo?.port || 47821}</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-base-content/60 text-[10px]">
                  <Lock className="w-3 h-3 text-primary" />
                  <span>SHA-256 Fingerprint (Certificate Pinning):</span>
                </div>
                <div className="font-mono text-[10px] break-all bg-base-300/60 p-1.5 rounded-md text-base-content/80 select-all">
                  {coucouInfo?.fingerprint || 'Gerando...'}
                </div>
              </div>
              <p className="text-[10px] text-base-content/50 pt-1">
                O aplicativo Coucou Android monitora passos do agente via rede local e permite permitir/negar comandos diretamente da notificação ou com biometria.
              </p>
            </div>
          </div>
        )}

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
