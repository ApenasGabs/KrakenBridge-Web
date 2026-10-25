import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight, themes } from 'prism-react-renderer';
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
  RefreshCw,
  Pencil,
  Save,
  Braces
} from 'lucide-react';
import { api } from '../../services/api';

const MermaidBlock = lazy(() => 
  import('./MermaidBlock').then((mod) => ({ default: mod.MermaidBlock }))
);
// Visualizadores/editores pesados carregados sob demanda (code splitting)
const ShikiCodeView = lazy(() => import('./viewers/ShikiCodeView'));
const CodeMirrorEditor = lazy(() => import('./viewers/CodeMirrorEditor'));
const MonacoEditor = lazy(() => import('./viewers/MonacoEditor'));

export type ArtifactViewMode = 'preview' | 'raw' | 'edit' | 'monaco';

export interface ArtifactDrawerProps {
  filePath: string | null;
  codeServerPort?: number;
  onClose: () => void;
}

export interface LineRange {
  start: number;
  end: number;
}

export function parseLineRange(pathWithAnchor?: string | null): { cleanPath: string; lineRange: LineRange | null } {
  if (!pathWithAnchor) return { cleanPath: '', lineRange: null };
  const [cleanPath, anchor] = pathWithAnchor.split('#');
  if (!anchor) return { cleanPath, lineRange: null };

  const match = anchor.match(/L?(\d+)(?:-L?(\d+))?/i);
  if (!match) return { cleanPath, lineRange: null };

  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : start;
  return {
    cleanPath,
    lineRange: {
      start: Math.min(start, end),
      end: Math.max(start, end)
    }
  };
}

export function getPrismLanguage(extension?: string): string {
  if (!extension) return 'clike';
  const ext = extension.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'typescript':
    case 'mts':
    case 'cts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'js':
    case 'javascript':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'jsx':
      return 'jsx';
    case 'json':
      return 'json';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return 'css';
    case 'html':
    case 'markup':
    case 'svg':
    case 'xml':
      return 'markup';
    case 'sh':
    case 'shell':
    case 'console':
    case 'shellscript':
    case 'bash':
    case 'zsh':
      return 'bash';
    case 'py':
    case 'python':
      return 'python';
    case 'sql':
      return 'sql';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'dockerfile':
    case 'docker':
      return 'docker';
    case 'go':
      return 'go';
    case 'rs':
    case 'rust':
      return 'rust';
    case 'diff':
    case 'patch':
      return 'diff';
    case 'graphql':
    case 'gql':
      return 'graphql';
    default:
      return 'clike';
  }
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

// Componente estável para blocos de código do ArtifactDrawer, prevenindo remounts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ArtifactCodeBlock: React.FC<any> = ({ className, children, ...props }) => {
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
    <div className="rounded-lg overflow-hidden border border-base-300 my-2">
      <Highlight
        theme={themes.vsDark}
        code={codeString}
        language={getPrismLanguage(language)}
      >
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre style={style} className="p-3 m-0 overflow-x-auto text-xs font-mono leading-5">
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
};

const artifactMarkdownComponents = {
  code: ArtifactCodeBlock
};

export const ArtifactDrawer: React.FC<ArtifactDrawerProps> = ({
  filePath,
  codeServerPort,
  onClose
}) => {
  const [data, setData] = useState<FileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ArtifactViewMode>('preview');
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const targetLineRef = useRef<HTMLDivElement | null>(null);

  const { cleanPath, lineRange } = useMemo(() => parseLineRange(filePath), [filePath]);

  useEffect(() => {
    if (!cleanPath) {
      setData(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    api.getFileRaw(cleanPath)
      .then((res) => {
        if (!isMounted) return;
        setData(res);
        setDraft(res.content);
        setSaveError(null);
        setSavedAt(null);
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
  }, [cleanPath]);

  // Rolar suavemente até a primeira linha destacada quando houver âncora
  useEffect(() => {
    if (data && lineRange && targetLineRef.current) {
      const timer = setTimeout(() => {
        targetLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [data, lineRange, viewMode]);

  const isDirty = !!data && draft !== data.content;
  const isEditing = viewMode === 'edit' || viewMode === 'monaco';

  // Fecha o drawer pedindo confirmação se houver edições não salvas
  const handleClose = useCallback(() => {
    if (isDirty && !window.confirm('Há alterações não salvas. Descartar e fechar?')) return;
    onClose();
  }, [isDirty, onClose]);

  const handleSave = useCallback(async () => {
    if (!data || saving || draft === data.content) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await api.saveFileRaw(data.path, draft);
      setData({ ...data, content: draft, size: res.size });
      setSavedAt(res.savedAt);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Falha ao salvar arquivo');
    } finally {
      setSaving(false);
    }
  }, [data, draft, saving]);

  // Fechar com a tecla ESC (nos modos de edição o Esc pertence ao editor)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEditing) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, isEditing]);

  if (!filePath) return null;

  const handleCopy = () => {
    if (!data) return;
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!data) return;
    const blob = new Blob([draft], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.filename || cleanPath.split(/[/\\]/).pop() || 'artifact.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const ideLineSuffix = lineRange ? `:${lineRange.start}` : '';
  const ideUrl = `http://${hostname}:${codeServerPort || 8089}/?file=${encodeURIComponent(data?.path || cleanPath)}${ideLineSuffix}`;

  // Visualização leve (prism-react-renderer): exibida instantaneamente enquanto o Shiki carrega
  const prismView = (
    <div className="bg-[#0d1117] rounded-xl border border-base-300 overflow-x-auto font-mono text-xs shadow-inner">
      <Highlight
        theme={themes.vsDark}
        code={draft}
        language={getPrismLanguage(data?.extension)}
      >
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre style={style} className="p-3 m-0 overflow-x-auto text-xs font-mono leading-5">
            <div className="table w-full border-collapse">
              {tokens.map((line, i) => {
                const lineNumber = i + 1;
                const isTarget = lineRange && lineNumber >= lineRange.start && lineNumber <= lineRange.end;
                const isFirstTarget = lineRange && lineNumber === lineRange.start;
                return (
                  <div
                    key={i}
                    ref={isFirstTarget ? targetLineRef : undefined}
                    {...getLineProps({ line })}
                    className={`table-row transition-colors ${
                      isTarget ? 'bg-primary/20 border-l-2 border-primary font-semibold' : 'hover:bg-white/5'
                    }`}
                    data-testid={isTarget ? 'highlighted-code-line' : undefined}
                  >
                    <span className={`table-cell select-none text-right pr-4 text-[10px] w-12 shrink-0 ${isTarget ? 'text-primary font-bold' : 'text-neutral-500'}`}>
                      {lineNumber}
                    </span>
                    <span className="table-cell whitespace-pre">
                      {line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token })} />
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          </pre>
        )}
      </Highlight>
    </div>
  );

  return (
    <>
      {/* Backdrop transparente / escurecido */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 transition-opacity"
        onClick={handleClose}
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
                <h3 className="font-semibold text-sm truncate text-base-content" title={data?.filename || cleanPath}>
                  {data?.filename || cleanPath.split(/[/\\]/).pop() || 'Arquivo'}
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
                {lineRange && (
                  <span 
                    className="badge badge-sm badge-secondary font-mono text-[10px] shrink-0 font-bold"
                    title={`Linhas referenciadas: ${lineRange.start} até ${lineRange.end}`}
                    data-testid="artifact-line-badge"
                  >
                    L{lineRange.start}{lineRange.start !== lineRange.end ? `-L${lineRange.end}` : ''}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-base-content/50 font-mono truncate" title={data?.path || cleanPath}>
                {data?.path || cleanPath}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleClose}
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
            {data && (
              <div className="join border border-base-300 rounded-lg p-0.5 bg-base-200/40" role="tablist">
                {data.isMarkdown && (
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={`btn btn-xs join-item gap-1 font-medium ${viewMode === 'preview' ? 'btn-primary' : 'btn-ghost text-base-content/70'}`}
                  title="Markdown renderizado"
                  data-testid="artifact-tab-preview"
                >
                  <Eye className="w-3 h-3" />
                  <span>Formatado</span>
                </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewMode('raw')}
                  className={`btn btn-xs join-item gap-1 font-medium ${viewMode === 'raw' ? 'btn-primary' : 'btn-ghost text-base-content/70'}`}
                  title="Código com destaque de sintaxe (Shiki)"
                  data-testid="artifact-tab-raw"
                >
                  <CodeIcon className="w-3 h-3" />
                  <span>Código</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('edit')}
                  className={`btn btn-xs join-item gap-1 font-medium ${viewMode === 'edit' ? 'btn-primary' : 'btn-ghost text-base-content/70'}`}
                  title="Edição rápida (CodeMirror)"
                  data-testid="artifact-tab-edit"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Editar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('monaco')}
                  className={`btn btn-xs join-item gap-1 font-medium ${viewMode === 'monaco' ? 'btn-primary' : 'btn-ghost text-base-content/70'}`}
                  title="Editor completo (Monaco)"
                  data-testid="artifact-tab-monaco"
                >
                  <Braces className="w-3 h-3" />
                  <span>VS Code</span>
                </button>
              </div>
            )}
            {isDirty && (
              <span className="badge badge-warning badge-sm ml-1" data-testid="artifact-dirty-badge">não salvo</span>
            )}
            {!isDirty && savedAt && (
              <span className="badge badge-success badge-sm ml-1 gap-1" data-testid="artifact-saved-badge">
                <Check className="w-3 h-3" /> salvo
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            {(isEditing || isDirty) && (
              <button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || saving}
                className="btn btn-primary btn-xs gap-1"
                title="Salvar (Ctrl+S)"
                data-testid="artifact-drawer-save-btn"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{saving ? 'Salvando...' : 'Salvar'}</span>
              </button>
            )}
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
          {saveError && (
            <div className="alert alert-error text-xs mb-3 py-2" data-testid="artifact-save-error">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Não foi possível salvar: {saveError}</span>
            </div>
          )}
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
                  api.getFileRaw(cleanPath)
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
                    components={artifactMarkdownComponents}
                  >
                    {draft}
                  </ReactMarkdown>
                </div>
              ) : viewMode === 'edit' ? (
                <Suspense fallback={<div className="flex items-center justify-center py-24 gap-2 text-sm text-base-content/60"><Loader2 className="w-5 h-5 animate-spin text-primary" /> Carregando editor...</div>}>
                  <CodeMirrorEditor
                    value={draft}
                    filename={data.filename}
                    onChange={setDraft}
                    onSave={handleSave}
                    initialLine={lineRange?.start}
                  />
                </Suspense>
              ) : viewMode === 'monaco' ? (
                <Suspense fallback={<div className="flex items-center justify-center py-24 gap-2 text-sm text-base-content/60"><Loader2 className="w-5 h-5 animate-spin text-primary" /> Carregando editor...</div>}>
                  <MonacoEditor
                    value={draft}
                    filename={data.filename}
                    onChange={setDraft}
                    onSave={handleSave}
                    initialLine={lineRange?.start}
                  />
                </Suspense>
              ) : (
                <Suspense fallback={prismView}>
                  <ShikiCodeView
                    code={draft}
                    extension={data.extension}
                    filename={data.filename}
                    lineRange={lineRange}
                    fallback={prismView}
                  />
                </Suspense>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
};
