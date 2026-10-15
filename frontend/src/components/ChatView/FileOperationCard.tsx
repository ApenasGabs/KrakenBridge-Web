import React, { useState } from 'react';
import { 
  FilePen, 
  FilePlus2, 
  Eye, 
  GitCompare, 
  ChevronDown, 
  ChevronRight, 
  Copy, 
  Check, 
  ExternalLink
} from 'lucide-react';
import type { FileOperationData, ParsedDiffLine } from '../../utils/diffParser';

interface FileOperationCardProps {
  data: FileOperationData;
  codeServerPort?: number;
  toolState?: string;
}

export const FileOperationCard: React.FC<FileOperationCardProps> = ({ 
  data, 
  codeServerPort = 8089,
  toolState
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const isRunning = toolState === 'ACTIVE' || toolState === 'RUNNING';

  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const ideFileUrl = `http://${hostname}:${codeServerPort}/?file=${encodeURIComponent(data.filePath)}`;

  const copyContent = (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = data.rawContent || data.lines.map(l => l.text).join('\n');
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Ícone e estilo semântico baseado no tipo de operação
  const getKindConfig = () => {
    switch (data.kind) {
      case 'edit':
        return {
          icon: <FilePen className="w-4 h-4 text-warning shrink-0" />,
          label: 'Editado',
          badgeClass: 'badge-warning',
          borderClass: 'border-warning/30 hover:border-warning/50'
        };
      case 'create':
        return {
          icon: <FilePlus2 className="w-4 h-4 text-success shrink-0" />,
          label: 'Criado',
          badgeClass: 'badge-success',
          borderClass: 'border-success/30 hover:border-success/50'
        };
      case 'view':
        return {
          icon: <Eye className="w-4 h-4 text-info shrink-0" />,
          label: 'Inspecionado',
          badgeClass: 'badge-info',
          borderClass: 'border-info/30 hover:border-info/50'
        };
      case 'diff':
      default:
        return {
          icon: <GitCompare className="w-4 h-4 text-primary shrink-0" />,
          label: 'Diff',
          badgeClass: 'badge-primary',
          borderClass: 'border-primary/30 hover:border-primary/50'
        };
    }
  };

  const config = getKindConfig();

  // Calcula largura máxima de dígitos para alinhar o gutter perfeitamente
  const maxLineNo = data.lines.reduce((max, l) => {
    const no = l.newLineNumber || l.oldLineNumber || 0;
    return Math.max(max, no);
  }, 0);
  const gutterDigits = Math.max(2, String(maxLineNo).length);

  return (
    <div className={`my-2 rounded-xl border bg-base-200/60 overflow-hidden text-xs transition-all shadow-xs ${config.borderClass}`}>
      {/* Cabeçalho do Card */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-3 py-2 select-none cursor-pointer hover:bg-base-300/40 transition-colors gap-2"
      >
        <div className="flex items-center gap-2 min-w-0 pr-2">
          <button 
            type="button"
            className="p-0.5 rounded text-base-content/50 hover:text-base-content focus:outline-none"
            aria-label={isExpanded ? 'Recolher alterações' : 'Expandir alterações'}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          {config.icon}

          <span className={`badge badge-xs font-semibold uppercase tracking-wider ${config.badgeClass} text-[9px] flex items-center gap-1`}>
            {isRunning && <span className="loading loading-spinner w-2.5 h-2.5"></span>}
            {config.label}
          </span>

          {/* Nome e Diretório do Arquivo */}
          <div className="min-w-0 flex items-baseline gap-1.5 truncate" title={data.filePath}>
            <span className="font-bold text-base-content font-mono truncate">
              {data.fileName}
            </span>
            {data.relativeDir && (
              <span className="text-[10px] text-base-content/40 font-mono truncate hidden sm:inline">
                {data.relativeDir}/
              </span>
            )}
          </div>
        </div>

        {/* Estatísticas e Ações */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Contadores de Linha Adicionada / Removida */}
          <div className="flex items-center gap-1 font-mono text-[10px]">
            {data.added > 0 && (
              <span className="badge badge-xs badge-success text-success-content font-bold px-1.5">
                +{data.added}
              </span>
            )}
            {data.removed > 0 && (
              <span className="badge badge-xs badge-error text-error-content font-bold px-1.5">
                -{data.removed}
              </span>
            )}
            {data.kind === 'view' && data.totalLines > 0 && (
              <span className="badge badge-xs badge-neutral text-neutral-content px-1.5">
                {data.totalLines} linhas
              </span>
            )}
          </div>

          {/* Botão Copiar */}
          <button
            type="button"
            onClick={copyContent}
            className="btn btn-ghost btn-xs px-1.5 h-6 min-h-0 text-base-content/70 hover:text-base-content hover:bg-base-300 gap-1"
            title="Copiar código / diff"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-success" />
                <span className="text-[10px] text-success hidden sm:inline">Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span className="text-[10px] hidden sm:inline">Copiar</span>
              </>
            )}
          </button>

          {/* Botão Abrir na IDE */}
          {data.filePath && (
            <a
              href={ideFileUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="btn btn-ghost btn-xs px-1.5 h-6 min-h-0 text-primary hover:text-primary-focus hover:bg-base-300 gap-1"
              title="Abrir no editor VS Code"
            >
              <ExternalLink className="w-3 h-3" />
              <span className="text-[10px] hidden sm:inline">IDE</span>
            </a>
          )}
        </div>
      </div>

      {/* Descrição / Instrução opcional */}
      {data.description && (
        <div className="px-3 py-1 bg-base-300/30 border-t border-base-300/40 text-[11px] text-base-content/70 font-sans italic truncate">
          {data.description}
        </div>
      )}

      {/* Corpo com o Diff ou Código com Gutter */}
      {isExpanded && (
        <div className="border-t border-base-300/60 bg-[#0d1117] text-neutral-200 font-mono text-[11px] leading-relaxed max-h-80 overflow-auto">
          {isRunning ? (
            <div className="p-4 flex items-center justify-center gap-2 text-info font-sans text-xs">
              <span className="loading loading-spinner loading-xs"></span>
              <span>Lendo / executando operação no arquivo...</span>
            </div>
          ) : data.lines.length === 0 ? (
            <div className="p-3 text-neutral-500 italic text-center">
              Nenhuma linha para exibir.
            </div>
          ) : (
            data.lines.map((line, idx) => (
              <DiffLineRow 
                key={idx} 
                line={line} 
                gutterDigits={gutterDigits}
                isOnlyViewer={data.kind === 'view'}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

const DiffLineRow: React.FC<{
  line: ParsedDiffLine;
  gutterDigits: number;
  isOnlyViewer?: boolean;
}> = ({ line, gutterDigits, isOnlyViewer }) => {
  // Linha de gap (hunk separator)
  if (line.kind === 'gap') {
    return (
      <div className="select-none py-1 px-3 text-center text-[10px] font-bold text-neutral-400 bg-neutral-900/90 border-y border-neutral-800 tracking-wide">
        ⋯ {line.text} ⋯
      </div>
    );
  }

  // Linha de meta
  if (line.kind === 'meta') {
    return (
      <div className="select-none py-0.5 px-3 text-[10px] text-neutral-400 bg-neutral-900/50">
        {line.text}
      </div>
    );
  }

  const isAdd = line.kind === 'add';
  const isDel = line.kind === 'del';

  // Cores de fundo e texto inspiradas no GitHub & Orca
  let rowBg = 'hover:bg-neutral-850/50';
  let textColor = 'text-neutral-200';
  let signChar = ' ';
  let signColor = 'text-neutral-400';

  if (isAdd) {
    rowBg = 'bg-[#1f3a2b] text-[#7ee787] border-l-2 border-emerald-500';
    textColor = 'text-[#e6edf3]';
    signChar = '+';
    signColor = 'text-emerald-400 font-bold';
  } else if (isDel) {
    rowBg = 'bg-[#3d1d24] text-[#ffa198] border-l-2 border-rose-500';
    textColor = 'text-[#e6edf3]';
    signChar = '-';
    signColor = 'text-rose-400 font-bold';
  }

  const lineNo = isDel ? line.oldLineNumber : (line.newLineNumber ?? line.oldLineNumber);

  return (
    <div className={`flex items-start transition-colors ${rowBg}`}>
      {/* Coluna Gutter com Número da Linha */}
      <span 
        className="shrink-0 select-none px-2 text-right tabular-nums text-neutral-400 bg-black/20 border-r border-neutral-800/80 font-mono"
        style={{ width: `${gutterDigits + 3}ch` }}
        aria-hidden
      >
        {lineNo ?? ''}
      </span>

      {/* Marcador + / - / espaço */}
      <span 
        className={`shrink-0 select-none w-5 text-center font-mono ${signColor}`}
        aria-hidden
      >
        {isOnlyViewer ? '' : signChar}
      </span>

      {/* Conteúdo da Linha */}
      <span className={`min-w-0 whitespace-pre-wrap break-all pr-3 ${textColor}`}>
        {line.text}
      </span>
    </div>
  );
};
