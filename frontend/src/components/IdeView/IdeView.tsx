import React, { useState } from 'react';
import { ExternalLink, RotateCw, Code2, AlertCircle } from 'lucide-react';

interface IdeViewProps {
  codeServerPort?: number;
  workspaceDir?: string;
}

export const IdeView: React.FC<IdeViewProps> = ({
  codeServerPort = 8089,
  workspaceDir = '/workspace'
}) => {
  const [iframeKey, setIframeKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const ideUrl = `http://${hostname}:${codeServerPort}/?folder=${encodeURIComponent(workspaceDir)}`;

  const handleReload = () => {
    setIsLoading(true);
    setIframeKey(prev => prev + 1);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-base-100">
      {/* Barra de Controles da IDE */}
      <div className="px-4 py-2 border-b border-base-300 bg-base-200/50 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-primary" />
          <span className="font-semibold text-base-content">VS Code (code-server)</span>
          <span className="badge badge-sm badge-neutral font-mono text-[10px]">
            Porta: {codeServerPort}
          </span>
          <span className="text-base-content/50 font-mono hidden sm:inline text-[11px]">
            {workspaceDir}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReload}
            className="btn btn-ghost btn-xs gap-1 text-base-content/70 hover:text-base-content"
            title="Recarregar IDE"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Recarregar</span>
          </button>

          <a
            href={ideUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost btn-xs gap-1 text-primary hover:text-primary-focus"
            title="Abrir em nova aba"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Abrir Externa</span>
          </a>
        </div>
      </div>

      {/* Frame da IDE com Loading */}
      <div className="flex-1 relative w-full h-full">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-base-100 z-10 gap-3">
            <span className="loading loading-spinner loading-md text-primary" />
            <p className="text-xs text-base-content/60">Conectando ao code-server...</p>
          </div>
        )}

        <iframe
          key={iframeKey}
          src={ideUrl}
          onLoad={() => setIsLoading(false)}
          className="w-full h-full border-0"
          title="VS Code IDE"
          allow="clipboard-read; clipboard-write"
        />

        {/* Dica para caso o iframe seja bloqueado */}
        <div className="absolute bottom-2 right-4 pointer-events-none z-10">
          <div className="badge badge-sm badge-ghost opacity-40 hover:opacity-100 pointer-events-auto transition-opacity text-[10px] gap-1">
            <AlertCircle className="w-3 h-3" />
            <span>Se o iframe não carregar, use o botão "Abrir Externa".</span>
          </div>
        </div>
      </div>
    </div>
  );
};
