import React, { useState } from 'react';
import { ExternalLink, RotateCw, Code2, AlertCircle, Monitor } from 'lucide-react';
import { useViewport } from '../../hooks/useViewport';

interface IdeViewProps {
  codeServerPort?: number;
  workspaceDir?: string;
}

export const IdeView: React.FC<IdeViewProps> = ({
  codeServerPort = 8089,
  workspaceDir = '/workspace'
}) => {
  const { isMobile } = useViewport();
  const [iframeKey, setIframeKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const ideUrl = `http://${hostname}:${codeServerPort}/?folder=${encodeURIComponent(workspaceDir)}`;

  const handleReload = () => {
    setIsLoading(true);
    setIframeKey(prev => prev + 1);
  };

  if (isMobile) {
    return (
      <div
        data-testid="ide-mobile-fallback"
        className="flex-1 flex flex-col items-center justify-center p-6 bg-base-100 text-center"
      >
        <div className="max-w-sm w-full p-6 rounded-2xl bg-base-200/60 border border-base-300 shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
            <Code2 className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-bold text-base-content">
              VS Code (code-server)
            </h2>
            <p className="text-xs text-base-content/70 leading-relaxed">
              O editor incorporado é otimizado para telas de Tablet e Desktop (&gt;= 768px). No mobile, abra o VS Code diretamente em uma nova aba.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono text-base-content/60">
            <span className="badge badge-sm badge-neutral whitespace-nowrap shrink-0">Porta: {codeServerPort}</span>
            <span className="truncate max-w-[180px]">{workspaceDir}</span>
          </div>
          <a
            href={ideUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="ide-open-external-btn"
            className="btn btn-primary w-full min-h-[44px] gap-2 text-xs font-semibold shadow-sm"
          >
            <ExternalLink className="w-4 h-4 shrink-0" />
            <span>Abrir VS Code em nova aba</span>
          </a>
          <p className="text-[11px] text-base-content/50 flex items-center justify-center gap-1">
            <Monitor className="w-3.5 h-3.5 shrink-0" />
            <span>Acesse via desktop para usar o iframe integrado</span>
          </p>
        </div>
      </div>
    );
  }

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
