import React, { useState, useEffect, lazy, Suspense } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  X, 
  Copy, 
  Check, 
  Download, 
  ExternalLink, 
  FileText, 
  FileCode, 
  Eye, 
  Code as CodeIcon,
  AlertCircle,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { api } from '../../services/api';

const MermaidBlock = lazy(() => 
  import('./MermaidBlock').then((mod) => ({ default: mod.MermaidBlock }))
);

export interface ArtifactDrawerProps {
  filePath: string | null;
  codeServerPort?: number;
  onClose: () => void;
}

interface FileData {
  path: string;
  filename: string;
  extension: string;
  size: number;
  isMarkdown: boolean;
  content: string;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const ArtifactDrawer: React.FC<ArtifactDrawerProps> = ({
  filePath,
  codeServerPort,
  onClose
}) => {
  const [data, setData] = useState<FileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!filePath) {
      setData(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    api.getFileRaw(filePath)
      .then((res) => {
        if (!isMounted) return;
        setData(res);
        setViewMode(res.isMarkdown ? 'preview' : 'raw');
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar arquivo');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [filePath]);

  // Fechar com a tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!filePath) return null;

  const handleCopy = () => {
    if (!data?.content) return;
    navigator.clipboard.writeText(data.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!data) return;
    const blob = new Blob([data.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.filename || 'artifact.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const ideUrl = `http://${hostname}:${codeServerPort || 8089}/?file=${encodeURIComponent(data?.path || filePath)}`;

  return (
    <>
      {/* Backdrop transparente / escurecido */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 transition-opacity"
        onClick={onClose}
        data-testid="artifact-drawer-backdrop"
      />

      {/* Gaveta Lateral (Slide-over Drawer) */}
      <aside 
        className="fixed inset-y-0 right-0 w-full sm:w-[560px] md:w-[680px] lg:w-[840px] max-w-full bg-base-100 border-l border-base-300 shadow-2xl z-50 flex flex-col transition-transform transform duration-300 ease-in-out"
        role="dialog"
        aria-label="Visualizador de Artefatos e Arquivos"
        data-testid="artifact-drawer"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-base-300 bg-base-200/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              {data?.isMarkdown ? (
                <FileText className="w-4 h-4" />
              ) : (
                <FileCode className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm truncate text-base-content" title={data?.filename || filePath}>
                  {data?.filename || filePath.split(/[/\\]/).pop() || 'Arquivo'}
                </h3>
                {data && (
                  <span className="badge badge-sm badge-ghost font-mono text-[10px] shrink-0">
                    {formatFileSize(data.size)}
                  </span>
                )}
                {data?.extension && (
                  <span className="badge badge-sm badge-primary badge-outline uppercase font-mono text-[9px] shrink-0">
                    {data.extension}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-base-content/50 font-mono truncate" title={data?.path || filePath}>
                {data?.path || filePath}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-sm btn-circle text-base-content/70 hover:text-base-content"
              title="Fechar (Esc)"
              aria-label="Fechar"
              data-testid="artifact-drawer-close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Barra de Ações e Abas */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-base-300 bg-base-100 text-xs gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            {data?.isMarkdown && (
              <div className="join border border-base-300 rounded-lg p-0.5 bg-base-200/40">
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={`btn btn-xs join-item gap-1 font-medium ${viewMode === 'preview' ? 'btn-primary' : 'btn-ghost text-base-content/70'}`}
                  data-testid="artifact-tab-preview"
                >
                  <Eye className="w-3 h-3" />
                  <span>Formatado</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('raw')}
                  className={`btn btn-xs join-item gap-1 font-medium ${viewMode === 'raw' ? 'btn-primary' : 'btn-ghost text-base-content/70'}`}
                  data-testid="artifact-tab-raw"
                >
                  <CodeIcon className="w-3 h-3" />
                  <span>Código</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!data || loading}
              className="btn btn-ghost btn-xs gap-1 text-base-content/80 hover:text-primary"
              title="Copiar conteúdo"
              data-testid="artifact-drawer-copy-btn"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? 'Copiado!' : 'Copiar'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={!data || loading}
              className="btn btn-ghost btn-xs gap-1 text-base-content/80 hover:text-primary"
              title="Baixar arquivo"
              data-testid="artifact-drawer-download-btn"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Baixar</span>
            </button>

            <a
              href={ideUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost btn-xs gap-1 text-base-content/80 hover:text-primary"
              title="Abrir no Code-Server (VS Code)"
              data-testid="artifact-drawer-ide-btn"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">IDE</span>
            </a>
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-base-100">
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 text-base-content/60 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">Carregando conteúdo do arquivo...</p>
            </div>
          )}

          {!loading && error && (
            <div className="alert alert-error text-sm max-w-lg mx-auto shadow-md">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div className="flex-1">
                <h4 className="font-bold">Não foi possível carregar o arquivo</h4>
                <p className="text-xs opacity-90 mt-1">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  api.getFileRaw(filePath)
                    .then(setData)
                    .catch((err) => setError(err.message))
                    .finally(() => setLoading(false));
                }}
                className="btn btn-xs btn-outline"
                title="Tentar novamente"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {viewMode === 'preview' && data.isMarkdown ? (
                <div className="prose prose-sm dark:prose-invert max-w-none text-base-content leading-relaxed">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const language = match ? match[1] : '';
                        const codeString = String(children).replace(/\n$/, '');

                        if (language.toLowerCase() === 'mermaid') {
                          return (
                            <Suspense
                              fallback={
                                <div className="my-3 p-4 rounded-xl border border-base-300 bg-base-200/40 flex items-center justify-center gap-2 text-xs text-base-content/60 font-mono">
                                  <span className="loading loading-spinner loading-xs text-secondary"></span>
                                  <span>Carregando diagrama Mermaid...</span>
                                </div>
                              }
                            >
                              <MermaidBlock code={codeString} />
                            </Suspense>
                          );
                        }

                        const isInline = !className && !codeString.includes('\n');
                        if (isInline) {
                          return (
                            <code className="bg-base-300/70 text-primary px-1.5 py-0.5 rounded text-[12px] font-mono mx-0.5" {...props}>
                              {children}
                            </code>
                          );
                        }

                        return (
                          <pre className="bg-base-300/50 p-3 rounded-lg overflow-x-auto my-2 text-xs font-mono">
                            <code className={className} {...props}>
                              {children}
                            </code>
                          </pre>
                        );
                      }
                    }}
                  >
                    {data.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="bg-base-200/60 rounded-xl p-3 border border-base-300 overflow-x-auto font-mono text-xs">
                  <pre className="text-base-content/90 leading-5 select-text whitespace-pre-wrap break-all">
                    <code>{data.content}</code>
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
};
