import { useState } from 'react';
import type { AuthStatus } from '../../types';
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
  Code
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
  const [activeTab, setActiveTab] = useState<'google' | 'apikey' | 'ide'>('google');
  const [authUrl, setAuthUrl] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (!isOpen) return null;

  const handleStartGoogleAuth = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await api.startAntigravityAuth();
      if (res.authUrl) {
        setAuthUrl(res.authUrl);
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
        setMessage({ text: 'Autenticado com sucesso via Google OAuth!', type: 'success' });
        setAuthUrl('');
        setAuthCode('');
        onRefreshStatus();
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
      <div className="modal-box max-w-xl p-6 bg-base-100 border border-base-300">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-3 border-b border-base-200">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-base text-base-content">
              Autenticação & Contas
            </h3>
          </div>
          <button onClick={onClose} className="btn btn-sm btn-ghost btn-circle">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Atual */}
        <div className="my-4 p-3 rounded-xl bg-base-200/60 border border-base-300 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {status?.authenticated || status?.isKeyValid ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-warning shrink-0" />
            )}
            <div>
              <span className="font-semibold text-base-content">
                {status?.authenticated ? 'Google Antigravity Autenticado' : status?.isKeyValid ? 'Gemini API Key Ativa' : 'Não Autenticado'}
              </span>
              {status?.email && (
                <p className="text-base-content/60 font-mono text-[11px]">{status.email}</p>
              )}
            </div>
          </div>
          <button 
            onClick={onRefreshStatus} 
            className="btn btn-ghost btn-xs text-base-content/70 hover:text-base-content"
          >
            Verificar
          </button>
        </div>

        {/* Feedback de mensagem */}
        {message && (
          <div className={`alert text-xs py-2 mb-4 ${
            message.type === 'success' ? 'alert-success text-success-content' :
            message.type === 'error' ? 'alert-error text-error-content' : 'alert-info text-info-content'
          }`}>
            <span>{message.text}</span>
          </div>
        )}

        {/* Abas do Modal */}
        <div className="tabs tabs-boxed bg-base-200/80 p-0.5 mb-4 text-xs">
          <button
            onClick={() => setActiveTab('google')}
            className={`tab tab-sm flex-1 ${activeTab === 'google' ? 'tab-active font-medium' : ''}`}
          >
            Google Antigravity (OAuth)
          </button>
          <button
            onClick={() => setActiveTab('apikey')}
            className={`tab tab-sm flex-1 ${activeTab === 'apikey' ? 'tab-active font-medium' : ''}`}
          >
            Gemini API Key
          </button>
          <button
            onClick={() => setActiveTab('ide')}
            className={`tab tab-sm flex-1 ${activeTab === 'ide' ? 'tab-active font-medium' : ''}`}
          >
            Dicas IDE (Extension Host)
          </button>
        </div>

        {/* Conteúdo da Aba Google OAuth */}
        {activeTab === 'google' && (
          <div className="space-y-4 text-xs">
            <p className="text-base-content/70">
              Autentique sua conta Google para utilizar o binário nativo <code className="bg-base-200 px-1 py-0.5 rounded font-mono">agy</code> com sua cota Cloud Code.
            </p>

            {!authUrl ? (
              <button
                onClick={handleStartGoogleAuth}
                disabled={loading}
                className="btn btn-primary btn-sm w-full gap-2"
              >
                {loading ? <span className="loading loading-spinner loading-xs" /> : <Terminal className="w-4 h-4" />}
                Iniciar Login via Google OAuth
              </button>
            ) : (
              <div className="space-y-3 bg-base-200/50 p-3 rounded-lg border border-base-300">
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

        {/* Conteúdo da Aba API Key */}
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

        {/* Conteúdo da Aba Dicas IDE */}
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

        <div className="modal-action mt-6">
          <button onClick={onClose} className="btn btn-sm btn-ghost">
            Fechar
          </button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/40" onClick={onClose} />
    </div>
  );
};
