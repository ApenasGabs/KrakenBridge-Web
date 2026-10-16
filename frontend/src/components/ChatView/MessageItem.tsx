import { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage, ToolCall } from '../../types';
import { 
  Bot, 
  User, 
  Terminal, 
  BrainCircuit, 
  Copy, 
  Check, 
  CheckCircle, 
  AlertTriangle, 
  Loader2,
  ChevronRight,
  ChevronDown,
  FileCode,
  ExternalLink,
  Volume2,
  Square,
  ListOrdered,
  Gauge,
  Sparkles
} from 'lucide-react';
import { parseFileOperation } from '../../utils/diffParser';
import { FileOperationCard } from './FileOperationCard';
import { SpinnerVerbs } from './SpinnerVerbs';
import { 
  playSpeech, 
  subscribeSpeechState, 
  extractSectionsFromMarkdown, 
  getSpeechRate, 
  setSpeechRate,
  type SpeechState
} from '../../utils/speechUtils';

// Carregamento dinâmico do MermaidBlock para não onerar o bundle inicial do chat
const MermaidBlock = lazy(() => 
  import('./MermaidBlock').then((mod) => ({ default: mod.MermaidBlock }))
);

interface MessageItemProps {
  message: ChatMessage;
  codeServerPort?: number;
  onOpenFilePreview?: (filePath: string) => void;
}

const CodeBlock: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  const [copied, setCopied] = useState(false);
  const codeContent = String(children).replace(/\n$/, '');

  const copyCode = () => {
    navigator.clipboard.writeText(codeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';

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
        <MermaidBlock code={codeContent} />
      </Suspense>
    );
  }

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-base-300 bg-base-300/50">
      <div className="flex items-center justify-between px-3 py-1.5 bg-base-300/80 text-xs font-mono text-base-content/70">
        <span>{language || 'texto'}</span>
        <button
          onClick={copyCode}
          className="btn btn-ghost btn-xs flex items-center gap-1 hover:bg-base-200"
          title="Copiar código"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-success" />
              <span className="text-success">Copiado!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3 overflow-x-auto text-xs font-mono bg-base-100/90 text-base-content leading-relaxed">
        <code>{codeContent}</code>
      </div>
    </div>
  );
};

const ToolItem: React.FC<{ tool: ToolCall; codeServerPort?: number; onOpenFilePreview?: (filePath: string) => void }> = ({ tool, codeServerPort, onOpenFilePreview }) => {
  const [showOutput, setShowOutput] = useState(false);
  const [copied, setCopied] = useState(false);

  const fileOp = parseFileOperation(tool);
  if (fileOp) {
    return <FileOperationCard data={fileOp} codeServerPort={codeServerPort} toolState={tool.state} onOpenFilePreview={onOpenFilePreview} />;
  }

  const isRunning = tool.state === 'ACTIVE' || tool.state === 'RUNNING';
  const isDone = tool.state === 'DONE';
  const isError = tool.state === 'ERROR';

  const copyOutput = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tool.output) {
      navigator.clipboard.writeText(tool.output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const commandOrDetail = tool.command 
    || (tool.args?.CommandLine as string) 
    || (tool.args?.AbsolutePath as string) 
    || (tool.args?.TargetFile as string);

  return (
    <div className="rounded-lg bg-base-300/30 border border-base-300/60 overflow-hidden font-mono text-[11px] transition-all">
      <div 
        onClick={() => tool.output && setShowOutput(!showOutput)}
        className={`flex items-center justify-between p-2 select-none ${tool.output ? 'cursor-pointer hover:bg-base-300/50' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0 pr-2">
          {tool.output ? (
            <span className="text-base-content/40">
              {showOutput ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </span>
          ) : (
            <Terminal className="w-3.5 h-3.5 text-primary/70 shrink-0" />
          )}
          <span className="font-semibold text-primary shrink-0">{tool.name}</span>
          {(tool.summary || tool.action) && (
            <span className="text-base-content/70 truncate text-[10px]">
              • {tool.summary || tool.action}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-base-content/60">
          {isRunning && (
            <span className="flex items-center gap-1 text-warning text-[10px]">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>executando</span>
            </span>
          )}
          {isDone && <CheckCircle className="w-3.5 h-3.5 text-success" />}
          {isError && <AlertTriangle className="w-3.5 h-3.5 text-error" />}
          {tool.duration !== undefined && (
            <span className="text-[10px] text-base-content/50">
              {tool.duration.toFixed(1)}s
            </span>
          )}
        </div>
      </div>

      {/* Linha do comando executado */}
      {commandOrDetail && (
        <div className="bg-base-100/80 px-2.5 py-1.5 border-t border-base-300/40 text-[11px] text-base-content/90 overflow-x-auto flex items-center justify-between gap-2">
          <div className="truncate font-mono">
            <span className="text-primary font-bold mr-1">$</span>
            <span>{commandOrDetail}</span>
          </div>
          {tool.output && (
            <button 
              onClick={(e) => { e.stopPropagation(); setShowOutput(!showOutput); }}
              className="text-[10px] text-primary hover:underline shrink-0 font-sans"
            >
              {showOutput ? 'Ocultar saída' : 'Ver saída'}
            </button>
          )}
        </div>
      )}

      {/* Saída / Output expandida */}
      {showOutput && tool.output && (
        <div className="relative bg-[#0d1117] text-neutral-200 p-2.5 border-t border-base-300/50 text-[10px] max-h-56 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
          <div className="sticky top-0 right-0 flex justify-end pb-1">
            <button
              onClick={copyOutput}
              className="px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[9px] flex items-center gap-1 transition-colors"
            >
              {copied ? <Check className="w-2.5 h-2.5 text-success" /> : <Copy className="w-2.5 h-2.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <code>{tool.output}</code>
        </div>
      )}
    </div>
  );
};

export const MessageItem: React.FC<MessageItemProps> = ({ message, codeServerPort, onOpenFilePreview }) => {
  const isUser = message.role === 'user';
  const [speechState, setSpeechState] = useState<SpeechState>({
    activeMessageId: null,
    activeSectionId: null,
    rate: getSpeechRate(),
  });
  const [copiedMessage, setCopiedMessage] = useState(false);

  useEffect(() => {
    return subscribeSpeechState((_activeId, state) => {
      setSpeechState(state);
    });
  }, []);

  const sections = useMemo(() => {
    return extractSectionsFromMarkdown(message.text || '');
  }, [message.text]);

  const hasMultipleSections = sections.length > 1;
  const finalSection = useMemo(() => {
    return sections.find((s) => s.isFinal) || (sections.length > 0 ? sections[sections.length - 1] : null);
  }, [sections]);

  const isPlayingThisMessage = speechState.activeMessageId === message.id;

  const handleToggleSpeech = (targetSectionId = 'all', targetText?: string) => {
    const textToSpeak = targetText || message.text;
    if (!textToSpeak) return;
    playSpeech(message.id, textToSpeak, targetSectionId, { rate: speechState.rate });
  };

  const handleRateChange = (newRate: number) => {
    setSpeechRate(newRate);
    if (isPlayingThisMessage) {
      const activeSec = sections.find((s) => s.id === speechState.activeSectionId);
      const textToResume = activeSec ? activeSec.text : message.text;
      playSpeech(message.id, textToResume, speechState.activeSectionId || 'all', { rate: newRate });
    }
  };

  const handleCopyMessage = () => {
    if (!message.text) return;
    navigator.clipboard.writeText(message.text);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  };

  const markdownComponents = useMemo(() => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    code({ className, children, ...props }: any) {
      const childString = String(children);
      const hasLanguage = /language-(\w+)/.test(className || '');
      const isMultiline = childString.includes('\n');
      const isInline = !hasLanguage && !isMultiline;

      if (isInline) {
        return (
          <code className="bg-base-300/70 text-primary px-1.5 py-0.5 rounded text-[12px] font-mono mx-0.5 align-baseline inline-block font-semibold" {...props}>
            {children}
          </code>
        );
      }
      return <CodeBlock className={className}>{children}</CodeBlock>;
    },
    // Intercepta links markdown file:/// para permitir abrir no visualizador in-app (ArtifactDrawer) ou na IDE
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    a({ href, children, ...props }: any) {
      if (href && (href.startsWith('file:///') || href.startsWith('file://'))) {
        const cleanPath = href.replace(/^file:\/\/\/?/, '/');
        return (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              if (onOpenFilePreview) {
                onOpenFilePreview(cleanPath);
              } else {
                const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
                const ideUrl = `http://${hostname}:${codeServerPort || 8089}/?file=${encodeURIComponent(cleanPath)}`;
                window.open(ideUrl, '_blank');
              }
            }}
            className="inline-flex items-center gap-1 text-primary font-mono text-[11px] hover:underline bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20 align-baseline mx-0.5 cursor-pointer text-left"
            title={`Visualizar artefato/arquivo: ${cleanPath}`}
            data-testid="message-file-link"
            {...props}
          >
            <FileCode className="w-3 h-3 shrink-0" />
            <span>{children}</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-60 shrink-0" />
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline" {...props}>
          {children}
        </a>
      );
    }
  }), [codeServerPort, onOpenFilePreview]);

  return (
    <div className={`chat ${isUser ? 'chat-end' : 'chat-start'} mb-4 animate-in fade-in duration-150`}>
      {/* Avatar do emissor */}
      <div className="chat-image avatar">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content'}`}>
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </div>
      </div>

      {/* Header do balão */}
      <div className="chat-header text-xs text-base-content/60 mb-1 flex items-center gap-2">
        <span className="font-semibold text-base-content/90">
          {isUser ? 'Você' : (message.agent ? `${message.agent.toUpperCase()} Agent` : 'Antigravity Agent')}
        </span>
        {message.model && (
          <span className="badge badge-ghost badge-xs font-mono">{message.model}</span>
        )}
        <time className="text-[10px]">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </time>
      </div>

      {/* Conteúdo da mensagem */}
      <div className={`chat-bubble max-w-[92vw] sm:max-w-2xl text-left ${isUser ? 'chat-bubble-primary' : 'bg-base-200 text-base-content border border-base-300/80 shadow-sm'}`}>
        
        {/* Acordeão de Raciocínio (Thinking) */}
        {message.thinking && (
          <div className="collapse collapse-arrow bg-base-200/50 border border-base-300 rounded-lg mb-3">
            <input type="checkbox" />
            <div className="collapse-title text-xs font-medium flex items-center gap-2 py-2 min-h-0 text-base-content/70">
              <BrainCircuit className="w-3.5 h-3.5 text-accent" />
              <span>Raciocínio Interno (Thinking)</span>
            </div>
            <div className="collapse-content text-xs font-mono text-base-content/80 whitespace-pre-wrap pt-0 pb-2">
              {message.thinking}
            </div>
          </div>
        )}

        {/* Acordeão de Chamada de Ferramentas (Tools) */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="collapse collapse-arrow bg-base-200/50 border border-base-300 rounded-lg mb-3">
            <input type="checkbox" defaultChecked={message.isStreaming} />
            <div className="collapse-title text-xs font-medium flex items-center gap-2 py-2 min-h-0 text-base-content/70">
              <Terminal className="w-3.5 h-3.5 text-info" />
              <span>Execuções de Ferramentas ({message.toolCalls.length})</span>
            </div>
            <div className="collapse-content text-xs space-y-2 pt-0 pb-3">
              {message.toolCalls.map((tool: ToolCall, idx: number) => (
                <ToolItem key={tool.step_index ?? idx} tool={tool} codeServerPort={codeServerPort} onOpenFilePreview={onOpenFilePreview} />
              ))}
            </div>
          </div>
        )}

        {/* Conteúdo Principal em Markdown */}
        <div className="text-sm prose prose-sm max-w-none text-base-content leading-relaxed">
          {message.isStreaming && !isUser && !message.text && (!message.toolCalls || message.toolCalls.length === 0) && !message.thinking ? (
            <SpinnerVerbs startTime={message.timestamp} />
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {message.text || (!message.isStreaming && !isUser ? (message.thinking ? '*(Resposta concluída no acordeão de raciocínio acima)*' : '*(Sem resposta de texto emitida)*') : '')}
            </ReactMarkdown>
          )}

          {message.isStreaming && (message.text || message.thinking || (message.toolCalls && message.toolCalls.length > 0)) && (
            <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse align-middle" />
          )}
        </div>

        {/* Barra de Ações da Mensagem do Assistente (Ouvir resposta / TTS, Seções, Velocidade e Copiar) */}
        {!isUser && !message.isStreaming && message.text && (
          <div className="mt-2.5 pt-2 border-t border-base-300/40 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Botão de Resposta Final / Conclusão (quando a mensagem possui múltiplas seções) */}
              {hasMultipleSections && finalSection && (
                <button
                  type="button"
                  onClick={() => handleToggleSpeech(finalSection.id, finalSection.text)}
                  className={`btn btn-xs rounded-md transition-all flex items-center gap-1.5 ${
                    isPlayingThisMessage && speechState.activeSectionId === finalSection.id
                      ? 'btn-secondary text-secondary-content shadow-sm'
                      : 'btn-ghost text-secondary hover:bg-secondary/15 font-medium'
                  }`}
                  title={
                    isPlayingThisMessage && speechState.activeSectionId === finalSection.id
                      ? 'Parar leitura da resposta final'
                      : `Ouvir apenas a resposta final (${finalSection.title})`
                  }
                  aria-label="Ouvir resposta final"
                  data-testid={`tts-final-btn-${message.id}`}
                >
                  {isPlayingThisMessage && speechState.activeSectionId === finalSection.id ? (
                    <>
                      <Square className="w-3 h-3 fill-current" />
                      <span className="text-[11px] font-medium">Parar final</span>
                      <span className="flex items-end gap-0.5 h-3 ml-0.5" aria-hidden="true">
                        <span className="w-0.5 h-1.5 bg-current animate-pulse rounded-full" />
                        <span className="w-0.5 h-3 bg-current animate-pulse rounded-full" style={{ animationDelay: '150ms' }} />
                        <span className="w-0.5 h-2 bg-current animate-pulse rounded-full" style={{ animationDelay: '300ms' }} />
                      </span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 text-secondary" />
                      <span className="text-[11px]">Resposta Final</span>
                    </>
                  )}
                </button>
              )}

              {/* Botão Principal: Ler Tudo / Ouvir resposta */}
              <button
                type="button"
                onClick={() => handleToggleSpeech('all', message.text)}
                className={`btn btn-xs rounded-md transition-all flex items-center gap-1.5 ${
                  isPlayingThisMessage && speechState.activeSectionId === 'all'
                    ? 'btn-secondary text-secondary-content shadow-sm'
                    : 'btn-ghost text-base-content/70 hover:text-base-content hover:bg-base-300/60'
                }`}
                title={
                  isPlayingThisMessage && speechState.activeSectionId === 'all'
                    ? 'Parar leitura completa'
                    : hasMultipleSections
                    ? 'Ouvir mensagem completa'
                    : 'Ouvir resposta (Modo Leitura por Voz)'
                }
                aria-label={
                  isPlayingThisMessage && speechState.activeSectionId === 'all'
                    ? 'Parar leitura'
                    : 'Ouvir resposta'
                }
                data-testid={`tts-btn-${message.id}`}
              >
                {isPlayingThisMessage && speechState.activeSectionId === 'all' ? (
                  <>
                    <Square className="w-3 h-3 fill-current" />
                    <span className="text-[11px] font-medium">Parar tudo</span>
                    <span className="flex items-end gap-0.5 h-3 ml-0.5" aria-hidden="true">
                      <span className="w-0.5 h-1.5 bg-current animate-pulse rounded-full" />
                      <span className="w-0.5 h-3 bg-current animate-pulse rounded-full" style={{ animationDelay: '150ms' }} />
                      <span className="w-0.5 h-2 bg-current animate-pulse rounded-full" style={{ animationDelay: '300ms' }} />
                    </span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-secondary" />
                    <span className="text-[11px]">{hasMultipleSections ? 'Ler Tudo' : 'Ouvir resposta'}</span>
                  </>
                )}
              </button>

              {/* Menu de Escolha de Seções */}
              {hasMultipleSections && (
                <div className="dropdown dropdown-top">
                  <button
                    tabIndex={0}
                    role="button"
                    className="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content hover:bg-base-300/60 flex items-center gap-1 rounded-md"
                    title="Escolher seção específica para ouvir"
                    aria-label="Menu de seções"
                    data-testid={`tts-sections-dropdown-${message.id}`}
                  >
                    <ListOrdered className="w-3 h-3" />
                    <span className="text-[11px]">Seções ({sections.length})</span>
                    <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                  </button>
                  <ul
                    tabIndex={0}
                    className="dropdown-content menu menu-xs z-30 p-1.5 shadow-lg bg-base-200 border border-base-300 rounded-box w-64 max-h-60 overflow-y-auto mb-1"
                  >
                    <li className="menu-title px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-base-content/50">
                      Escolha uma seção para ouvir:
                    </li>
                    {sections.map((sec, idx) => {
                      const isSecPlaying = isPlayingThisMessage && speechState.activeSectionId === sec.id;
                      return (
                        <li key={sec.id}>
                          <button
                            type="button"
                            onClick={() => handleToggleSpeech(sec.id, sec.text)}
                            className={`flex items-center justify-between text-[11px] py-1.5 px-2 rounded-md ${
                              isSecPlaying ? 'active font-semibold' : ''
                            }`}
                            data-testid={`tts-sec-btn-${sec.id}`}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              {isSecPlaying ? (
                                <Square className="w-3 h-3 text-secondary fill-current shrink-0" />
                              ) : (
                                <Volume2 className="w-3 h-3 text-secondary shrink-0" />
                              )}
                              <span className="truncate">
                                {idx + 1}. {sec.title}
                              </span>
                            </div>
                            {sec.isFinal && (
                              <span className="badge badge-secondary badge-xs shrink-0 text-[9px]">Final</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Seletor de Velocidade da Fala */}
              <div className="dropdown dropdown-top">
                <button
                  tabIndex={0}
                  role="button"
                  className="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content hover:bg-base-300/60 font-mono text-[11px] px-1.5 rounded-md flex items-center gap-0.5"
                  title="Alterar velocidade da fala"
                  aria-label="Velocidade da fala"
                  data-testid={`tts-speed-btn-${message.id}`}
                >
                  <Gauge className="w-3 h-3 opacity-70" />
                  <span>{speechState.rate}x</span>
                </button>
                <ul
                  tabIndex={0}
                  className="dropdown-content menu menu-xs z-30 p-1 shadow-lg bg-base-200 border border-base-300 rounded-box w-28 mb-1"
                >
                  <li className="menu-title px-2 py-0.5 text-[9px] uppercase font-bold text-base-content/50">
                    Velocidade
                  </li>
                  {[0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((r) => (
                    <li key={r}>
                      <button
                        type="button"
                        onClick={() => handleRateChange(r)}
                        className={`text-[11px] py-1 px-2 font-mono flex items-center justify-between ${
                          speechState.rate === r ? 'active font-bold text-primary' : ''
                        }`}
                        data-testid={`tts-speed-option-${r}`}
                      >
                        <span>{r}x</span>
                        {r === 1.0 && <span className="text-[9px] opacity-60">Padrão</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Botão Copiar */}
              <button
                type="button"
                onClick={handleCopyMessage}
                className="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content hover:bg-base-300/60 flex items-center gap-1 rounded-md"
                title="Copiar texto da resposta"
                aria-label="Copiar texto da resposta"
                data-testid={`copy-msg-btn-${message.id}`}
              >
                {copiedMessage ? (
                  <>
                    <Check className="w-3 h-3 text-success" />
                    <span className="text-[11px] text-success">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span className="text-[11px]">Copiar</span>
                  </>
                )}
              </button>
            </div>

            {/* Contagem total resumida de tokens no canto direito da barra de ações */}
            {message.tokens && (
              <div className="text-[10px] text-base-content/50 flex items-center gap-2 font-mono ml-auto">
                {message.tokens.total_tokens !== undefined && (
                  <span className="font-semibold text-primary">
                    {message.tokens.total_tokens.toLocaleString()} tok
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Rodapé detalhado de tokens quando a barra de ações não é exibida (ex: mensagens do usuário ou em streaming) */}
        {message.tokens && (!message.text || message.isStreaming || isUser) && (
          <div className="mt-2 pt-1 border-t border-base-300/40 text-[10px] text-base-content/50 flex items-center gap-3 font-mono">
            {message.tokens.input_tokens !== undefined && (
              <span>In: {message.tokens.input_tokens.toLocaleString()}</span>
            )}
            {message.tokens.output_tokens !== undefined && (
              <span>Out: {message.tokens.output_tokens.toLocaleString()}</span>
            )}
            {message.tokens.thinking_tokens !== undefined && (
              <span>Thinking: {message.tokens.thinking_tokens.toLocaleString()}</span>
            )}
            {message.tokens.total_tokens !== undefined && (
              <span className="font-semibold text-primary">
                Total: {message.tokens.total_tokens.toLocaleString()} tok
              </span>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
