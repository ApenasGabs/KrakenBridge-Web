import { useState, useEffect } from 'react';
import type { AccountInfo, AuthStatus } from '../../types';
import { api } from '../../services/api';
import { 
  KeyRound, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  Copy, 
  Check, 
  Terminal, 
  X, 
  Code,
  Users,
  UserCheck,
  PlusCircle,
  Trash2,
  RefreshCw
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: AuthStatus | null;
  onRefreshStatus: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  status,
  onRefreshStatus
}) => {
  const [activeTab, setActiveTab] = useState<'accounts' | 'google' | 'apikey' | 'ide'>('accounts');
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [switchingEmail, setSwitchingEmail] = useState<string | null>(null);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);

  const [authUrl, setAuthUrl] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const loadAccountsList = async () => {
    setLoadingAccounts(true);
    try {
      const data = await api.getAccounts();
      setAccounts(data.accounts || []);
    } catch {
      // Ignora erro silencioso
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAccountsList();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSwitchAccount = async (email: string) => {
    setSwitchingEmail(email);
    setMessage(null);
    try {
      const res = await api.switchAccount(email);
      if (res.success) {
        setMessage({ text: `Conta alternada com sucesso para ${email}!`, type: 'success' });
        await loadAccountsList();
        onRefreshStatus();
      } else {
        setMessage({ text: res.message || 'Falha ao alternar conta.', type: 'error' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao alternar conta.';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setSwitchingEmail(null);
    }
  };

  const handleRemoveAccount = async (email: string) => {
    if (!window.confirm(`Tem certeza que deseja desconectar e remover a conta ${email}?`)) return;
    setDeletingEmail(email);
    setMessage(null);
    try {
      const res = await api.removeAccount(email);
      if (res.success) {
        setMessage({ text: `Conta ${email} removida do dispositivo.`, type: 'info' });
        await loadAccountsList();
        onRefreshStatus();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao remover conta.';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setDeletingEmail(null);
    }
  };

  const handleStartGoogleAuth = async (force = false) => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await api.startAntigravityAuth(force);
      if (res.alreadyAuthenticated && !force) {
        setMessage({ 
          text: res.message || `Conta já conectada (${res.email || status?.email || 'Google Antigravity'})!`, 
          type: 'success' 
        });
        onRefreshStatus();
      } else if (res.authUrl) {
        setAuthUrl(res.authUrl);
        setActiveTab('google');
        setMessage({ text: 'Link de autenticação gerado! Abra o link abaixo, copie o código do Google e cole aqui.', type: 'info' });
      } else {
        setMessage({ text: res.message || 'Comando de autenticação iniciado.', type: 'info' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao iniciar autenticação Google.';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitGoogleCode = async () => {
    if (!authCode.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await api.submitAntigravityCode(authCode.trim());
      if (res.success) {
        setMessage({ text: 'Nova conta conectada e ativada com sucesso via Google OAuth!', type: 'success' });
        setAuthUrl('');
        setAuthCode('');
        await loadAccountsList();
        onRefreshStatus();
        setActiveTab('accounts');
      } else {
        setMessage({ text: res.message || 'Código não aceito.', type: 'error' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar código de autorização.';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await api.saveApiKeys({ geminiApiKey: apiKeyInput.trim() });
      if (res.success) {
        setMessage({ text: 'API Key salva com sucesso!', type: 'success' });
        setApiKeyInput('');
        onRefreshStatus();
      } else {
        setMessage({ text: 'Erro ao salvar API Key.', type: 'error' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na requisição.';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const copyUrl = () => {
    if (authUrl) {
      navigator.clipboard.writeText(authUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  return (
    <div className="modal modal-open z-50">
      <div className="modal-box w-11/12 max-w-xl p-4 sm:p-6 bg-base-100 border border-base-300 shadow-2xl rounded-2xl">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-3 border-b border-base-200">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-base text-base-content">
              Gerenciador de Contas & Autenticação
            </h3>
          </div>
          <button onClick={onClose} className="btn btn-sm btn-ghost btn-circle">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Atual */}
        <div className="my-3 p-3 rounded-xl bg-base-200/60 border border-base-300 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            {status?.authenticated || status?.isKeyValid ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-warning shrink-0" />
            )}
            <div>
              <div className="font-semibold text-base-content flex items-center gap-1.5">
                <span>{status?.authenticated ? 'Conta Ativa:' : status?.isKeyValid ? 'Gemini API Key Ativa' : 'Não Autenticado'}</span>
                {status?.authenticated && (
                  <span className="badge badge-xs badge-success font-normal">Online</span>
                )}
              </div>
              {status?.email && (
                <p className="text-base-content/70 font-mono text-[11px] mt-0.5">{status.email}</p>
              )}
            </div>
          </div>
          <button 
            onClick={() => { onRefreshStatus(); loadAccountsList(); }} 
            className="btn btn-ghost btn-xs text-base-content/70 hover:text-base-content gap-1"
            title="Atualizar status"
          >
            <RefreshCw className="w-3 h-3" />
            <span className="hidden sm:inline">Verificar</span>
          </button>
        </div>

        {/* Feedback de mensagem */}
        {message && (
          <div className={`alert text-xs py-2 mb-3 ${
            message.type === 'success' ? 'alert-success text-success-content' :
            message.type === 'error' ? 'alert-error text-error-content' : 'alert-info text-info-content'
          }`}>
            <span>{message.text}</span>
          </div>
        )}

        {/* Abas do Modal */}
        <div className="tabs tabs-boxed bg-base-200/80 p-0.5 mb-4 text-xs">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`tab tab-sm flex-1 gap-1.5 ${activeTab === 'accounts' ? 'tab-active font-medium' : ''}`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Contas Salvas</span>
            {accounts.length > 0 && (
              <span className="badge badge-xs badge-primary font-mono">{accounts.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('google')}
            className={`tab tab-sm flex-1 gap-1.5 ${activeTab === 'google' ? 'tab-active font-medium' : ''}`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Conectar Nova</span>
          </button>
          <button
            onClick={() => setActiveTab('apikey')}
            className={`tab tab-sm flex-1 ${activeTab === 'apikey' ? 'tab-active font-medium' : ''}`}
          >
            API Key
          </button>
          <button
            onClick={() => setActiveTab('ide')}
            className={`tab tab-sm flex-1 ${activeTab === 'ide' ? 'tab-active font-medium' : ''}`}
          >
            Dicas IDE
          </button>
        </div>

        {/* Aba 1: Lista de Contas (Multi-Account Switch com 1 clique) */}
        {activeTab === 'accounts' && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between text-base-content/70">
              <span>Alternar entre contas Google com 1 clique:</span>
              <button
                onClick={() => handleStartGoogleAuth(true)}
                disabled={loading}
                className="btn btn-primary btn-xs gap-1"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Adicionar Conta
              </button>
            </div>

            {loadingAccounts ? (
              <div className="flex justify-center py-6">
                <span className="loading loading-spinner loading-md text-primary" />
              </div>
            ) : accounts.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-base-200/40 border border-dashed border-base-300">
                <Users className="w-8 h-8 text-base-content/30 mx-auto mb-2" />
                <p className="font-semibold text-base-content/70">Nenhuma conta salva ainda</p>
                <p className="text-base-content/50 text-[11px] mt-1 mb-3">Conecte sua primeira conta Google para alternar com 1 clique.</p>
                <button
                  onClick={() => handleStartGoogleAuth(true)}
                  disabled={loading}
                  className="btn btn-primary btn-xs gap-1"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Conectar Conta Google
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {accounts.map((acc) => {
                  const isCurrent = acc.isActive || (status?.email && acc.email.toLowerCase() === status.email.toLowerCase());
                  const isSwitching = switchingEmail === acc.email;
                  const isDeleting = deletingEmail === acc.email;

                  return (
                    <div
                      key={acc.email}
                      className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                        isCurrent 
                          ? 'bg-primary/10 border-primary/40 shadow-sm' 
                          : 'bg-base-200/40 border-base-300 hover:bg-base-200/70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {acc.picture ? (
                          <img 
                            src={acc.picture} 
                            alt={acc.name || acc.email} 
                            className="w-8 h-8 rounded-full border border-base-300 shrink-0 object-cover" 
                          />
                        ) : (
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                            isCurrent ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content/70'
                          }`}>
                            {(acc.name || acc.email)[0].toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-base-content truncate flex items-center gap-1.5">
                            <span>{acc.name || acc.email.split('@')[0]}</span>
                            {isCurrent && (
                              <span className="badge badge-xs badge-primary font-mono text-[10px]">Ativa</span>
                            )}
                          </div>
                          <div className="text-[11px] text-base-content/60 font-mono truncate">
                            {acc.email}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isCurrent ? (
                          <div className="flex items-center gap-1 text-success font-medium text-[11px] px-2 py-1 bg-success/10 rounded-md">
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Em Uso</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSwitchAccount(acc.email)}
                            disabled={isSwitching || isDeleting}
                            className="btn btn-outline btn-primary btn-xs gap-1"
                            title="Tornar esta conta a ativa no Antigravity CLI"
                          >
                            {isSwitching ? (
                              <span className="loading loading-spinner loading-xs" />
                            ) : (
                              'Alternar'
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => handleRemoveAccount(acc.email)}
                          disabled={isSwitching || isDeleting}
                          className="btn btn-ghost btn-xs text-error/70 hover:text-error hover:bg-error/10 btn-square"
                          title="Remover conta"
                        >
                          {isDeleting ? <span className="loading loading-spinner loading-xs" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Aba 2: Conectar Nova Conta Google OAuth */}
        {activeTab === 'google' && (
          <div className="space-y-4 text-xs">
            <p className="text-base-content/70">
              Conecte uma conta Google para utilizar a cota oficial Cloud Code com o binário nativo <code className="bg-base-200 px-1 py-0.5 rounded font-mono">agy</code>.
            </p>

            {!authUrl ? (
              <button
                onClick={() => handleStartGoogleAuth(true)}
                disabled={loading}
                className="btn btn-primary btn-sm w-full gap-2"
              >
                {loading ? <span className="loading loading-spinner loading-xs" /> : <Terminal className="w-4 h-4" />}
                Iniciar Login via Google OAuth
              </button>
            ) : (
              <div className="space-y-3 bg-base-200/50 p-3 rounded-xl border border-base-300">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-primary">1. Acesse o link de autorização:</span>
                  <button onClick={copyUrl} className="btn btn-ghost btn-xs gap-1">
                    {copiedUrl ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedUrl ? 'Copiado' : 'Copiar URL'}</span>
                  </button>
                </div>
                <div className="p-2 bg-base-100 rounded border border-base-300 font-mono text-[10px] break-all max-h-16 overflow-y-auto">
                  {authUrl}
                </div>
                <a
                  href={authUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-outline btn-xs w-full gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Abrir link no navegador
                </a>

                <div className="pt-2">
                  <label className="font-semibold text-base-content block mb-1">
                    2. Cole o código ou redirecionamento obtido:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Cole aqui o código 4/0A..."
                      value={authCode}
                      onChange={(e) => setAuthCode(e.target.value)}
                      className="input input-sm input-bordered flex-1 bg-base-100 font-mono text-xs"
                    />
                    <button
                      onClick={handleSubmitGoogleCode}
                      disabled={loading || !authCode.trim()}
                      className="btn btn-primary btn-sm"
                    >
                      {loading ? <span className="loading loading-spinner loading-xs" /> : 'Confirmar'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Aba 3: API Key */}
        {activeTab === 'apikey' && (
          <div className="space-y-3 text-xs">
            <p className="text-base-content/70">
              Configure sua chave direta do Google AI Studio (<code className="bg-base-200 px-1 py-0.5 rounded font-mono">GEMINI_API_KEY</code>).
            </p>
            <div className="form-control">
              <label className="label">
                <span className="label-text text-xs">Chave de API Gemini</span>
              </label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="input input-sm input-bordered w-full font-mono text-xs"
              />
            </div>
            <button
              onClick={handleSaveApiKey}
              disabled={loading || !apiKeyInput.trim()}
              className="btn btn-primary btn-sm w-full"
            >
              {loading ? <span className="loading loading-spinner loading-xs" /> : 'Salvar Chave no Servidor'}
            </button>
          </div>
        )}

        {/* Aba 4: Dicas IDE */}
        {activeTab === 'ide' && (
          <div className="space-y-3 text-xs text-base-content/80 leading-relaxed">
            <div className="flex items-center gap-1.5 font-semibold text-base-content">
              <Code className="w-4 h-4 text-primary" />
              <span>Erro de "Local Extension Host" no VS Code</span>
            </div>
            <p>
              Caso a extensão Antigravity mostre aviso que prefere rodar no <code className="bg-base-200 px-1 rounded font-mono">Local Extension Host</code>, force a execução no container adicionando em <code className="bg-base-200 px-1 rounded font-mono">settings.json</code>:
            </p>
            <pre className="p-2.5 bg-base-200 rounded font-mono text-[11px] overflow-x-auto text-primary">
{`"remote.extensionKind": {
  "google.antigravity": ["workspace"]
}`}
            </pre>
            <p className="text-[11px] text-base-content/60">
              Isso garante que a extensão acesse o binário <code className="font-mono">/usr/local/bin/agy</code> diretamente no container Linux.
            </p>
          </div>
        )}

        <div className="modal-action mt-5">
          <button onClick={onClose} className="btn btn-sm btn-ghost">
            Fechar
          </button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/40" onClick={onClose} />
    </div>
  );
};
