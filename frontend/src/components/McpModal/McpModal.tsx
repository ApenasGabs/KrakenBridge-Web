import React, { useState, useEffect, useCallback } from 'react';
import type { McpServer } from '../../types';
import { api } from '../../services/api';
import { 
  Boxes, 
  X, 
  RotateCw, 
  Globe, 
  Terminal, 
  CheckCircle, 
  PowerOff, 
  Sparkles,
  ExternalLink,
  Key,
  AlertCircle,
  Check,
  ShieldCheck
} from 'lucide-react';

interface McpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const McpModal: React.FC<McpModalProps> = ({ isOpen, onClose }) => {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  // Estados de Autenticação OAuth / PIN / Token
  const [authServer, setAuthServer] = useState<McpServer | null>(null);
  const [authData, setAuthData] = useState<{ authUrl?: string; instructions?: string; type?: string } | null>(null);
  const [authInput, setAuthInput] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  const fetchServers = useCallback(async () => {
    try {
      setLoading(true);
      const list = await api.getMcpServers();
      setServers(list);
    } catch (err) {
      console.warn('Erro ao carregar servidores MCP:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchServers();
    }
  }, [isOpen, fetchServers]);

  const handleToggle = async (server: McpServer) => {
    const nextState = server.status !== 'enabled';
    try {
      setToggling(server.name);
      await api.toggleMcpServer(server.name, nextState);
      setServers(prev => prev.map(s => s.name === server.name ? { ...s, status: nextState ? 'enabled' : 'disabled' } : s));
    } catch (err) {
      console.error('Falha ao alternar MCP:', err);
    } finally {
      setToggling(null);
    }
  };

  const handleOpenAuth = async (server: McpServer) => {
    setAuthServer(server);
    setAuthInput('');
    setAuthError(null);
    setAuthSuccess(null);
    try {
      const data = await api.getMcpAuthUrl(server.name);
      setAuthData(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao buscar URL de autenticação';
      setAuthError(msg);
    }
  };

  const handleCloseAuth = () => {
    setAuthServer(null);
    setAuthData(null);
    setAuthInput('');
    setAuthError(null);
    setAuthSuccess(null);
  };

  const handleSubmitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authServer || !authInput.trim()) return;

    setAuthSubmitting(true);
    setAuthError(null);
    setAuthSuccess(null);

    try {
      const res = await api.exchangeMcpCode(authServer.name, authInput.trim());
      if (res.success) {
        setAuthSuccess(res.message || 'Servidor autenticado com sucesso!');
        await fetchServers();
        setTimeout(() => {
          handleCloseAuth();
        }, 1200);
      } else {
        setAuthError(res.error || 'Falha ao validar autenticação com o servidor.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro de comunicação ao salvar token';
      setAuthError(msg);
    } finally {
      setAuthSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal modal-open z-50" data-testid="mcp-modal">
      <div className="modal-box w-11/12 max-w-2xl bg-base-100 border border-base-300 shadow-2xl p-4 sm:p-6 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header do Modal */}
        <div className="flex items-center justify-between pb-3 border-b border-base-300">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                Servidores MCP (Model Context Protocol)
                <span className="badge badge-primary badge-sm font-mono">{servers.length}</span>
              </h3>
              <p className="text-xs text-base-content/60">
                Ferramentas externas integradas aos agentes (banco de dados, estoque, APIs)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={fetchServers}
              className={`btn btn-ghost btn-xs btn-circle ${loading ? 'animate-spin' : ''}`}
              title="Recarregar servidores MCP"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <button
              data-testid="mcp-modal-close"
              onClick={onClose}
              className="btn btn-ghost btn-xs btn-circle text-base-content/70 hover:text-error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal / Card Inline de Autenticação Manual via PIN / Token */}
        {authServer && (
          <div className="my-4 p-4 rounded-2xl bg-base-200/90 border border-primary/40 shadow-inner space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-base-300">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-warning/10 text-warning">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-base-content flex items-center gap-1.5">
                    Autenticar MCP: <span className="font-mono text-primary">{authServer.name}</span>
                  </h4>
                  <p className="text-[11px] text-base-content/60">
                    Vincule suas credenciais para evitar o erro Unauthorized no servidor remoto.
                  </p>
                </div>
              </div>
              <button onClick={handleCloseAuth} className="btn btn-ghost btn-xs btn-circle text-base-content/50 hover:text-base-content">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {authError && (
              <div className="alert alert-error text-xs py-2 px-3 flex items-center gap-2 rounded-xl">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {authSuccess && (
              <div className="alert alert-success text-xs py-2 px-3 flex items-center gap-2 rounded-xl">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{authSuccess}</span>
              </div>
            )}

            <div className="space-y-2 text-xs">
              <p className="text-base-content/80 text-[11px] leading-relaxed">
                {authData?.instructions || 'Gere o token de acesso no painel do provedor ou informe o código de autorização.'}
              </p>

              {authData?.authUrl && (
                <div className="pt-1">
                  <a
                    href={authData.authUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm btn-outline btn-primary gap-1.5 text-xs normal-case w-full sm:w-auto"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>1. Abrir Painel de Tokens / Login em Nova Aba</span>
                  </a>
                </div>
              )}

              <form onSubmit={handleSubmitAuth} className="space-y-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-base-content/70 mb-1">
                    2. Cole o PIN, Token (ex: sbp_...) ou a URL completa redirecionada:
                  </label>
                  <input
                    type="text"
                    value={authInput}
                    onChange={(e) => setAuthInput(e.target.value)}
                    placeholder="Cole aqui o token de acesso ou o código da barra de endereços..."
                    className="input input-sm input-bordered w-full font-mono text-xs bg-base-100"
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCloseAuth}
                    className="btn btn-xs btn-ghost"
                    disabled={authSubmitting}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn btn-xs btn-primary gap-1 font-semibold"
                    disabled={authSubmitting || !authInput.trim()}
                  >
                    {authSubmitting ? (
                      <RotateCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    <span>Salvar e Conectar</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Lista de Servidores MCP */}
        <div className="py-4 space-y-3 max-h-96 overflow-y-auto">
          {servers.length === 0 ? (
            <div className="text-center py-8 text-base-content/50 text-xs">
              {loading ? 'Carregando servidores MCP...' : 'Nenhum servidor MCP configurado no momento.'}
            </div>
          ) : (
            servers.map((server) => {
              const isEnabled = server.status === 'enabled';
              const isHttp = server.type === 'http' || !!(server.commandOrUrl && server.commandOrUrl.startsWith('http'));
              const isAuth = server.authStatus === 'authenticated';
              const needsAuth = server.authStatus === 'unauthenticated' || (!isAuth && (server.name.toLowerCase() === 'supabase' || isHttp));

              return (
                <div
                  key={server.name}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isEnabled 
                      ? 'bg-base-200/50 border-base-300 hover:border-primary/40' 
                      : 'bg-base-200/20 border-base-300/40 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${isHttp ? 'bg-info/10 text-info' : 'bg-secondary/10 text-secondary'}`}>
                        {isHttp ? <Globe className="w-4 h-4" /> : <Terminal className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="font-semibold text-xs flex items-center gap-1.5 text-base-content">
                          {server.name}
                          <span className="badge badge-xs badge-outline font-mono">
                            {server.type}
                          </span>
                          {isAuth && (
                            <span className="badge badge-xs badge-success gap-1 text-[10px]">
                              <Key className="w-2.5 h-2.5" /> Conectado
                            </span>
                          )}
                          {needsAuth && (
                            <span className="badge badge-xs badge-warning gap-1 text-[10px]">
                              Requer Token / Login
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Botão de Autenticação / Troca de Token */}
                      {(isHttp || needsAuth || isAuth) && (
                        <button
                          type="button"
                          onClick={() => handleOpenAuth(server)}
                          className={`btn btn-xs gap-1 text-[11px] font-medium ${
                            isAuth 
                              ? 'btn-ghost text-base-content/60 hover:text-base-content' 
                              : 'btn-warning btn-outline'
                          }`}
                          title="Configurar chave de acesso / token deste servidor MCP"
                        >
                          <Key className="w-3 h-3" />
                          <span>{isAuth ? 'Trocar Token' : 'Autenticar'}</span>
                        </button>
                      )}

                      <span className={`text-[11px] font-medium flex items-center gap-1 ${isEnabled ? 'text-success' : 'text-base-content/40'}`}>
                        {isEnabled ? <CheckCircle className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                        {isEnabled ? 'Ativo' : 'Desativado'}
                      </span>
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        disabled={toggling === server.name}
                        onChange={() => handleToggle(server)}
                        className="toggle toggle-primary toggle-sm"
                        title={isEnabled ? "Desabilitar servidor" : "Habilitar servidor"}
                      />
                    </div>
                  </div>

                  {/* Comando ou URL */}
                  {server.commandOrUrl && (
                    <div className="bg-base-100 p-2 rounded-lg font-mono text-[11px] text-base-content/80 overflow-x-auto flex items-center justify-between gap-2 border border-base-300/60">
                      <span className="truncate">{server.commandOrUrl}</span>
                      {server.commandOrUrl.startsWith('http') && (
                        <a
                          href={server.commandOrUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline shrink-0"
                          title="Abrir URL"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé Informativo */}
        <div className="pt-3 border-t border-base-300 flex items-center justify-between text-xs text-base-content/60">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Ferramentas expostas automaticamente via CLI e Language Server</span>
          </div>
          <button onClick={onClose} className="btn btn-sm btn-ghost">
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
