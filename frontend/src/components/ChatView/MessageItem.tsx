import { useState } from 'react';
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
  ChevronDown
} from 'lucide-react';

interface MessageItemProps {
  message: ChatMessage;
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

const ToolItem: React.FC<{ tool: ToolCall }> = ({ tool }) => {
  const [showOutput, setShowOutput] = useState(false);
  const [copied, setCopied] = useState(false);

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

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const isUser = message.role === 'user';

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
      <div className={`chat-bubble max-w-2xl text-left ${isUser ? 'chat-bubble-primary' : 'bg-base-200 text-base-content border border-base-300/80 shadow-sm'}`}>
        
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
                <ToolItem key={tool.step_index ?? idx} tool={tool} />
              ))}
            </div>
          </div>
        )}

        {/* Conteúdo Principal em Markdown */}
        <div className="text-sm prose prose-sm max-w-none text-base-content leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              code({ inline, className, children, ...props }: any) {
                if (inline) {
                  return (
                    <code className="bg-base-200 text-primary px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                      {children}
                    </code>
                  );
                }
                return <CodeBlock className={className}>{children}</CodeBlock>;
              }
            }}
          >
            {message.text}
          </ReactMarkdown>

          {message.isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse align-middle" />
          )}
        </div>

        {/* Rodapé da Mensagem (Tokens) */}
        {message.tokens && (
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
