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
  ExternalLink
} from 'lucide-react';

interface McpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const McpModal: React.FC<McpModalProps> = ({ isOpen, onClose }) => {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

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

  if (!isOpen) return null;

  return (
    <div className="modal modal-open z-50">
      <div className="modal-box max-w-2xl bg-base-100 border border-base-300 shadow-2xl p-6">
        
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
                Extensões de ferramentas e contexto integradas ao Antigravity
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
              onClick={onClose}
              className="btn btn-ghost btn-xs btn-circle text-base-content/70 hover:text-error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Lista de Servidores MCP */}
        <div className="py-4 space-y-3 max-h-96 overflow-y-auto">
          {servers.length === 0 ? (
            <div className="text-center py-8 text-base-content/50 text-xs">
              {loading ? 'Carregando servidores MCP...' : 'Nenhum servidor MCP configurado no momento.'}
            </div>
          ) : (
            servers.map((server) => {
              const isEnabled = server.status === 'enabled';
              const isHttp = server.type === 'http';

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
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
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
