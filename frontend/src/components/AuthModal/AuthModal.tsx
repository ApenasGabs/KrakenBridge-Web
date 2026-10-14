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
  RefreshCw,
  GitPullRequest
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
  const [activeTab, setActiveTab] = useState<'accounts' | 'google' | 'github' | 'apikey' | 'ide'>('accounts');
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

  // Estados do GitHub
  const [ghUserCode, setGhUserCode] = useState('');
  const [ghVerifyUri, setGhVerifyUri] = useState('https://github.com/login/device');
  const [ghPolling, setGhPolling] = useState(false);
  const [ghPatInput, setGhPatInput] = useState('');
  const [ghCopiedCode, setGhCopiedCode] = useState(false);

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

  // Polling automático enquanto ghPolling estiver ativo
  useEffect(() => {
    if (!ghPolling) return;
    const interval = setInterval(async () => {
      try {
        const poll = await api.pollGithubDevice();
        if (poll.status === 'success') {
          setGhPolling(false);
          setMessage({
            text: `GitHub CLI conectado com sucesso para @${poll.username || 'seu usuário'}!`,
            type: 'success'
          });
          onRefreshStatus();
        } else if (poll.status === 'expired' || poll.status === 'denied' || poll.status === 'error') {
          setGhPolling(false);
          setMessage({ text: poll.error || 'Autenticação expirada ou recusada.', type: 'error' });
        }
      } catch {
        // Ignora erros temporários no polling
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [ghPolling, onRefreshStatus]);

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

  const fallbackCopy = (text: string) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch {
      return false;
    }
  };

  const copyUrl = () => {
    if (!authUrl) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(authUrl).catch(() => {
        fallbackCopy(authUrl);
      });
    } else {
      fallbackCopy(authUrl);
    }
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleSubmitGoogleCode = async () => {
    let cleanCode = authCode.trim();
    // Remove aspas acidentais no início ou final
    cleanCode = cleanCode.replace(/^['"]|['"]$/g, '').trim();

    // Se o usuário colou a URL inteira retornada pelo Google
    if (cleanCode.includes('code=')) {
      const match = cleanCode.match(/[?&]code=([^&]+)/);
      if (match) {
        cleanCode = decodeURIComponent(match[1]);
      }
    }

    if (!cleanCode) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await api.submitAntigravityCode(cleanCode);
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

  // Iniciar Device Code Flow do GitHub
  const handleStartGithubDevice = async () => {
    setLoading(true);
    setMessage(null);
    setGhUserCode('');
    try {
      const res = await api.startGithubDeviceFlow();
      if (res.success && res.userCode) {
        setGhUserCode(res.userCode);
        setGhVerifyUri(res.verificationUri || 'https://github.com/login/device');
        setGhPolling(true);
        setMessage({
          text: `Código gerado! Acesse ${res.verificationUri || 'github.com/login/device'} e digite o código abaixo.`,
          type: 'info'
        });
      } else {
        setMessage({ text: res.error || 'Falha ao iniciar login com GitHub.', type: 'error' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao conectar ao GitHub.';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };


  // Salvar Token PAT do GitHub
  const handleSaveGithubToken = async () => {
    if (!ghPatInput.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await api.saveGithubToken(ghPatInput.trim());
      if (res.success) {
        setMessage({
          text: `GitHub autenticado como @${res.username || 'usuário'} com sucesso!`,
          type: 'success'
        });
        setGhPatInput('');
        onRefreshStatus();
      } else {
        setMessage({ text: res.error || 'Erro ao validar token do GitHub.', type: 'error' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar token do GitHub.';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Desconectar GitHub
  const handleLogoutGithub = async () => {
    if (!window.confirm('Deseja realmente desconectar a conta do GitHub CLI?')) return;
    setLoading(true);
    setMessage(null);
    try {
      await api.logoutGithub();
      setMessage({ text: 'GitHub CLI desconectado.', type: 'info' });
      onRefreshStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao desconectar GitHub.';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const copyGithubCode = () => {
    if (!ghUserCode) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(ghUserCode).catch(() => fallbackCopy(ghUserCode));
    } else {
      fallbackCopy(ghUserCode);
    }
    setGhCopiedCode(true);
    setTimeout(() => setGhCopiedCode(false), 2000);
  };

  if (!isOpen) return null;

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
        <div className="tabs tabs-boxed bg-base-200/80 p-0.5 mb-4 text-xs flex overflow-x-auto whitespace-nowrap">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`tab tab-sm flex-1 min-w-[100px] gap-1.5 ${activeTab === 'accounts' ? 'tab-active font-medium' : ''}`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Contas Salvas</span>
            {accounts.length > 0 && (
              <span className="badge badge-xs badge-primary font-mono">{accounts.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('google')}
            className={`tab tab-sm flex-1 min-w-[100px] gap-1.5 ${activeTab === 'google' ? 'tab-active font-medium' : ''}`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Google</span>
          </button>
          <button
            onClick={() => setActiveTab('github')}
            className={`tab tab-sm flex-1 min-w-[100px] gap-1.5 ${activeTab === 'github' ? 'tab-active font-medium' : ''}`}
          >
            <GitPullRequest className="w-3.5 h-3.5" />
            <span>GitHub</span>
            {status?.github?.authenticated && (
              <span className="badge badge-xs badge-success">OK</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('apikey')}
            className={`tab tab-sm flex-1 min-w-[80px] ${activeTab === 'apikey' ? 'tab-active font-medium' : ''}`}
          >
            API Key
          </button>
          <button
            onClick={() => setActiveTab('ide')}
            className={`tab tab-sm flex-1 min-w-[80px] ${activeTab === 'ide' ? 'tab-active font-medium' : ''}`}
          >
            Dicas IDE
          </button>
        </div>

        {/* Aba 1: Lista de Contas (Multi-Account Switch com 1 clique) */}
        {activeTab === 'accounts' && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between text-base-content/70">
              <span>Alternar contas Google com 1 toque:</span>
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
                  className="btn btn-primary btn-sm gap-1"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Conectar Conta Google
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {accounts.map((acc) => {
                  const isCurrent = acc.isActive || (status?.email && acc.email.toLowerCase() === status.email.toLowerCase());
                  const isSwitching = switchingEmail === acc.email;
                  const isDeleting = deletingEmail === acc.email;

                  return (
                    <div
                      key={acc.email}
                      onClick={() => !isCurrent && !isSwitching && !isDeleting && handleSwitchAccount(acc.email)}
                      className={`p-3 sm:p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                        isCurrent 
                          ? 'bg-primary/10 border-primary/40 shadow-sm cursor-default' 
                          : 'bg-base-200/40 border-base-300 hover:bg-base-200/80 hover:border-primary/50 cursor-pointer active:scale-[0.99]'
                      }`}
                      title={!isCurrent ? `Toque para alternar para ${acc.email}` : undefined}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {acc.picture ? (
                          <img 
                            src={acc.picture} 
                            alt={acc.name || acc.email} 
                            className="w-9 h-9 rounded-full border border-base-300 shrink-0 object-cover" 
                          />
                        ) : (
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                            isCurrent ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content/70'
                          }`}>
                            {(acc.name || acc.email)[0].toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-base-content truncate flex items-center gap-1.5">
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

                      <div className="flex items-center gap-2 shrink-0">
                        {isCurrent ? (
                          <div className="flex items-center gap-1 text-success font-medium text-xs px-2.5 py-1.5 bg-success/10 rounded-lg">
                            <UserCheck className="w-4 h-4" />
                            <span className="hidden sm:inline">Em Uso</span>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSwitchAccount(acc.email);
                            }}
                            disabled={isSwitching || isDeleting}
                            className="btn btn-outline btn-primary btn-sm px-3 gap-1 font-medium min-h-[36px]"
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
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveAccount(acc.email);
                          }}
                          disabled={isSwitching || isDeleting}
                          className="btn btn-ghost btn-sm text-error/70 hover:text-error hover:bg-error/10 btn-square min-h-[36px] min-w-[36px]"
                          title="Remover conta"
                        >
                          {isDeleting ? <span className="loading loading-spinner loading-xs" /> : <Trash2 className="w-4 h-4" />}
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

        {/* Aba GitHub: Device Flow & PAT */}
        {activeTab === 'github' && (
          <div className="space-y-4 text-xs">
            {/* Status atual do GitHub */}
            <div className="p-3 rounded-xl bg-base-200/50 border border-base-300 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <GitPullRequest className="w-5 h-5 text-base-content" />
                <div>
                  <div className="font-semibold text-base-content flex items-center gap-1.5">
                    <span>GitHub CLI ({status?.github?.authenticated ? `@${status.github.username}` : 'Não conectado'})</span>
                    {status?.github?.authenticated ? (
                      <span className="badge badge-xs badge-success">Conectado</span>
                    ) : (
                      <span className="badge badge-xs badge-ghost">Pendente</span>
                    )}
                  </div>
                  <p className="text-base-content/60 text-[11px] mt-0.5">
                    Permite ao Kraken e ao Antigravity criar commits, PRs e gerenciar repositórios via CLI.
                  </p>
                </div>
              </div>
              {status?.github?.authenticated && (
                <button
                  onClick={handleLogoutGithub}
                  disabled={loading}
                  className="btn btn-ghost btn-xs text-error hover:bg-error/10"
                >
                  Desconectar
                </button>
              )}
            </div>

            {/* Opção 1: Device Code (Fluxo 1 clique sem senha nem token manual) */}
            <div className="p-4 rounded-xl bg-base-200/30 border border-base-300 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-base-content flex items-center gap-1.5">
                    <span>Opção 1: Conectar via Código (Recomendado)</span>
                    <span className="badge badge-xs badge-primary">Fácil</span>
                  </h4>
                  <p className="text-base-content/60 text-[11px] mt-0.5">
                    Gere um código de 8 dígitos, confirme no navegador e pronto!
                  </p>
                </div>
                {!ghUserCode && (
                  <button
                    onClick={handleStartGithubDevice}
                    disabled={loading}
                    className="btn btn-primary btn-xs gap-1.5"
                  >
                    <GitPullRequest className="w-3.5 h-3.5" />
                    {loading ? <span className="loading loading-spinner loading-xs" /> : 'Iniciar Conexão'}
                  </button>
                )}
              </div>

              {ghUserCode && (
                <div className="mt-3 p-3 bg-base-100 rounded-lg border border-primary/30 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-base-content/70">Código de Autorização:</span>
                    {ghPolling && (
                      <span className="flex items-center gap-1.5 text-[11px] text-info">
                        <span className="loading loading-spinner loading-xs" />
                        Aguardando autorização no GitHub...
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between bg-base-200/80 px-4 py-2.5 rounded-lg border border-base-300">
                    <span className="font-mono text-base font-extrabold tracking-widest text-primary">
                      {ghUserCode}
                    </span>
                    <button
                      onClick={copyGithubCode}
                      className="btn btn-ghost btn-xs gap-1 text-base-content/70"
                    >
                      {ghCopiedCode ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{ghCopiedCode ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <a
                      href={ghVerifyUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm gap-1.5 w-full justify-center"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Abrir {ghVerifyUri.replace('https://', '')} e Colar Código
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Opção 2: Personal Access Token (PAT) */}
            <div className="p-4 rounded-xl bg-base-200/30 border border-base-300 space-y-2.5">
              <h4 className="font-semibold text-base-content">
                Opção 2: Personal Access Token (PAT)
              </h4>
              <p className="text-base-content/60 text-[11px]">
                Se preferir usar um token próprio, cole um token com permissões <code className="bg-base-200 px-1 py-0.5 rounded font-mono">repo</code> e <code className="bg-base-200 px-1 py-0.5 rounded font-mono">workflow</code>:
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder="ghp_... ou gho_..."
                  value={ghPatInput}
                  onChange={(e) => setGhPatInput(e.target.value)}
                  className="input input-sm input-bordered flex-1 bg-base-100 font-mono text-xs"
                />
                <button
                  onClick={handleSaveGithubToken}
                  disabled={loading || !ghPatInput.trim()}
                  className="btn btn-secondary btn-sm"
                >
                  {loading ? <span className="loading loading-spinner loading-xs" /> : 'Salvar Token'}
                </button>
              </div>
            </div>
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
