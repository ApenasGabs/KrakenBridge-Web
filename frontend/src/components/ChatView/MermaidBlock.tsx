import React, { useState, useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import { 
  Workflow, 
  Code, 
  Copy, 
  Check, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Maximize2, 
  Minimize2, 
  AlertCircle,
  FileCode2
} from 'lucide-react';
import { getDiagramTypeLabel, isDarkTheme, initMermaid } from '../../utils/mermaidUtils';

export interface MermaidBlockProps {
  code: string;
}

// Error Boundary de proteção fail-safe
export interface MermaidErrorBoundaryProps {
  children: React.ReactNode;
  fallbackCode?: string;
}

export interface MermaidErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class MermaidErrorBoundary extends React.Component<MermaidErrorBoundaryProps, MermaidErrorBoundaryState> {
  constructor(props: MermaidErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): MermaidErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn('[MermaidErrorBoundary] Erro capturado no renderizador Mermaid:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div 
          className="my-3 p-3 rounded-xl border border-warning/40 bg-warning/10 text-xs font-sans text-warning-content"
          data-testid="mermaid-error-boundary"
        >
          <div className="flex items-center gap-2 mb-2 text-warning font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Falha na renderização visual do Mermaid (Fallback seguro)</span>
          </div>
          {this.props.fallbackCode && (
            <pre className="p-2.5 rounded bg-base-300/80 font-mono text-[11px] text-base-content overflow-x-auto whitespace-pre-wrap">
              {this.props.fallbackCode}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export const MermaidBlockInner: React.FC<MermaidBlockProps> = ({ code }) => {
  const [activeTab, setActiveTab] = useState<'diagram' | 'code'>('diagram');
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedSvg, setCopiedSvg] = useState(false);
  const [themeChangeCounter, setThemeChangeCounter] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const cleanCode = code ? code.trim() : '';
  const diagramType = getDiagramTypeLabel(cleanCode);

  // Observa mudanças de tema na raiz do documento para re-renderizar em tempo real
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => {
      setThemeChangeCounter((prev) => prev + 1);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const render = async () => {
      if (!cleanCode) {
        setIsLoading(false);
        setRenderError('Código Mermaid vazio');
        return;
      }

      setIsLoading(true);
      setRenderError(null);

      try {
        const isDark = isDarkTheme();
        initMermaid(isDark);

        const uniqueId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
        const { svg } = await mermaid.render(uniqueId, cleanCode);

        if (isMounted) {
          setSvgHtml(svg);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          const message = err instanceof Error ? err.message : String(err);
          setRenderError(message);
          setIsLoading(false);
          // Limpa elementos de erro órfãos criados pelo Mermaid no DOM
          if (typeof document !== 'undefined') {
            document.querySelectorAll('[id^="dmermaid"]').forEach((el) => el.remove());
          }
        }
      }
    };

    render();

    return () => {
      isMounted = false;
      if (typeof document !== 'undefined') {
        document.querySelectorAll('[id^="dmermaid"]').forEach((el) => el.remove());
      }
    };
  }, [cleanCode, themeChangeCounter]);

  // Tecla ESC para sair de tela cheia
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const copyCodeToClipboard = () => {
    navigator.clipboard.writeText(cleanCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copySvgToClipboard = () => {
    if (svgHtml) {
      navigator.clipboard.writeText(svgHtml);
      setCopiedSvg(true);
      setTimeout(() => setCopiedSvg(false), 2000);
    }
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(Number((prev + 0.2).toFixed(1)), 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(Number((prev - 0.2).toFixed(1)), 0.4));
  const handleResetZoom = () => setZoom(1);

  return (
    <>
      <div 
        className="my-3 rounded-xl border border-base-300 bg-base-200/40 overflow-hidden shadow-sm transition-all"
        data-testid="mermaid-card"
      >
        {/* Header do Diagrama */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-base-300/60 border-b border-base-300/80 text-xs font-mono">
          {/* Lado Esquerdo: Identificação */}
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-secondary/15 text-secondary">
              <Workflow className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-base-content/90">Diagrama Mermaid</span>
            <span 
              className="badge badge-sm badge-outline text-[10px] font-sans font-medium text-base-content/70"
              data-testid="mermaid-badge-type"
            >
              {diagramType}
            </span>
          </div>

          {/* Lado Direito: Ações e Alternância */}
          <div className="flex items-center gap-1">
            {/* Seletor de Abas Diagrama / Código */}
            <div className="join bg-base-100 p-0.5 rounded-lg border border-base-300 mr-1">
              <button
                type="button"
                onClick={() => setActiveTab('diagram')}
                className={`join-item btn btn-xs h-6 px-2.5 font-sans font-medium transition-colors ${
                  activeTab === 'diagram'
                    ? 'btn-secondary text-secondary-content shadow-xs'
                    : 'btn-ghost text-base-content/70 hover:text-base-content'
                }`}
                title="Visualizar gráfico vetorial"
                data-testid="mermaid-tab-diagram"
              >
                <Workflow className="w-3 h-3 mr-1" />
                Diagrama
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('code')}
                className={`join-item btn btn-xs h-6 px-2.5 font-sans font-medium transition-colors ${
                  activeTab === 'code'
                    ? 'btn-secondary text-secondary-content shadow-xs'
                    : 'btn-ghost text-base-content/70 hover:text-base-content'
                }`}
                title="Ver código fonte Mermaid"
                data-testid="mermaid-tab-code"
              >
                <Code className="w-3 h-3 mr-1" />
                Código
              </button>
            </div>

            {/* Controles de Zoom (Apenas na aba Diagrama e quando não houver erro) */}
            {activeTab === 'diagram' && !renderError && svgHtml && (
              <div className="hidden sm:flex items-center gap-0.5 bg-base-100 px-1 py-0.5 rounded-lg border border-base-300 text-base-content/70">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="btn btn-ghost btn-xs w-6 h-6 p-0 hover:bg-base-200"
                  title="Diminuir Zoom"
                  data-testid="mermaid-zoom-out"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  className="btn btn-ghost btn-xs px-1 h-6 font-mono text-[10px] hover:bg-base-200"
                  title="Redefinir Zoom (100%)"
                  data-testid="mermaid-zoom-reset"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="btn btn-ghost btn-xs w-6 h-6 p-0 hover:bg-base-200"
                  title="Aumentar Zoom"
                  data-testid="mermaid-zoom-in"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Botão de Tela Cheia */}
            {activeTab === 'diagram' && !renderError && svgHtml && (
              <button
                type="button"
                onClick={() => setIsFullscreen(true)}
                className="btn btn-ghost btn-xs w-7 h-7 p-0 text-base-content/70 hover:text-base-content hover:bg-base-200"
                title="Expandir em Tela Cheia"
                data-testid="mermaid-fullscreen-btn"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            )}

            {/* Botão Copiar SVG (se renderizado) */}
            {activeTab === 'diagram' && !renderError && svgHtml && (
              <button
                type="button"
                onClick={copySvgToClipboard}
                className="btn btn-ghost btn-xs h-7 px-2 text-[10px] font-sans font-medium text-base-content/70 hover:text-base-content hover:bg-base-200"
                title="Copiar código SVG"
                data-testid="mermaid-copy-svg"
              >
                {copiedSvg ? <Check className="w-3 h-3 text-success mr-1" /> : <FileCode2 className="w-3 h-3 mr-1" />}
                {copiedSvg ? 'Copiado!' : 'SVG'}
              </button>
            )}

            {/* Botão Copiar Código */}
            <button
              type="button"
              onClick={copyCodeToClipboard}
              className="btn btn-ghost btn-xs h-7 px-2 text-[10px] font-sans font-medium text-base-content/70 hover:text-base-content hover:bg-base-200"
              title="Copiar código Mermaid"
              data-testid="mermaid-copy-code"
            >
              {copiedCode ? <Check className="w-3 h-3 text-success mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              {copiedCode ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>

        {/* Corpo do Bloco */}
        <div className="relative">
          {/* Aba de Diagrama */}
          {activeTab === 'diagram' && (
            <div className="p-3">
              {isLoading && (
                <div 
                  className="flex items-center justify-center p-8 gap-2 text-xs text-base-content/60"
                  data-testid="mermaid-loading"
                >
                  <span className="loading loading-spinner loading-sm text-secondary"></span>
                  <span>Renderizando diagrama...</span>
                </div>
              )}

              {renderError && (
                <div 
                  className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning-content text-xs"
                  data-testid="mermaid-error-fallback"
                >
                  <div className="flex items-start gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-warning block">Sintaxe Mermaid Inválida ou Parcial</span>
                      <span className="text-[11px] text-base-content/70">
                        O diagrama não pôde ser renderizado graficamente. Exibindo código fonte abaixo:
                      </span>
                    </div>
                  </div>
                  <pre className="p-2.5 rounded bg-base-300/80 font-mono text-[11px] text-base-content overflow-x-auto whitespace-pre-wrap">
                    {cleanCode}
                  </pre>
                </div>
              )}

              {!isLoading && !renderError && svgHtml && (
                <div 
                  ref={containerRef}
                  className="w-full overflow-x-auto overflow-y-hidden py-3 px-2 flex justify-center bg-base-100/80 rounded-lg border border-base-300/40"
                  data-testid="mermaid-diagram-container"
                >
                  <div 
                    style={{ 
                      transform: `scale(${zoom})`, 
                      transformOrigin: 'top center',
                      transition: 'transform 0.15s ease-out' 
                    }}
                    className="max-w-full [&>svg]:mx-auto [&>svg]:h-auto [&>svg]:max-w-full"
                    dangerouslySetInnerHTML={{ __html: svgHtml }}
                    data-testid="mermaid-diagram-svg"
                  />
                </div>
              )}
            </div>
          )}

          {/* Aba de Código Fonte */}
          {activeTab === 'code' && (
            <div 
              className="p-3 bg-base-100/90 font-mono text-xs text-base-content overflow-x-auto leading-relaxed"
              data-testid="mermaid-code-view"
            >
              <pre className="m-0 whitespace-pre-wrap">
                <code>{cleanCode}</code>
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Modal / Tela Cheia de Visualização Expandida */}
      {isFullscreen && svgHtml && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col p-4 sm:p-6 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          data-testid="mermaid-fullscreen-modal"
        >
          {/* Header do Modal */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 text-white">
            <div className="flex items-center gap-2">
              <Workflow className="w-4 h-4 text-secondary" />
              <span className="font-semibold text-sm">Visualização Expandida: {diagramType}</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Controles de Zoom no Modal */}
              <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-lg">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="btn btn-ghost btn-xs text-white hover:bg-white/20 p-1"
                  title="Diminuir Zoom"
                  data-testid="mermaid-modal-zoom-out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-xs px-1 text-white/80">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="btn btn-ghost btn-xs text-white hover:bg-white/20 p-1"
                  title="Aumentar Zoom"
                  data-testid="mermaid-modal-zoom-in"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  className="btn btn-ghost btn-xs text-white hover:bg-white/20 p-1 ml-1"
                  title="Resetar Zoom"
                  data-testid="mermaid-modal-zoom-reset"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Botão Fechar Modal */}
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="btn btn-circle btn-ghost btn-sm text-white/80 hover:text-white hover:bg-white/20"
                title="Fechar (Esc)"
                data-testid="mermaid-close-fullscreen-btn"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Área Central Expandida */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            <div 
              style={{ 
                transform: `scale(${zoom})`, 
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out' 
              }}
              className="max-w-none [&>svg]:max-w-full [&>svg]:h-auto shadow-2xl p-4 rounded-xl bg-base-100/95 text-base-content"
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          </div>
        </div>
      )}
    </>
  );
};

export const MermaidBlock: React.FC<MermaidBlockProps> = ({ code }) => {
  return (
    <MermaidErrorBoundary fallbackCode={code}>
      <MermaidBlockInner code={code} />
    </MermaidErrorBoundary>
  );
};
