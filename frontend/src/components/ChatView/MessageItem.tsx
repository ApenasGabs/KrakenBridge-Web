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
  Loader2 
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

  return (
    <div className="relative my-3 rounded-lg overflow-hidden border border-base-300 bg-base-300/40">
      <div className="flex items-center justify-between px-3 py-1.5 bg-base-300/80 text-[11px] font-mono text-base-content/60">
        <span>{className ? className.replace('language-', '') : 'code'}</span>
        <button
          onClick={copyCode}
          className="btn btn-ghost btn-xs gap-1 hover:bg-base-200"
          title="Copiar código"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-success" />
              <span className="text-success">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs font-mono leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
};

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end mb-4 px-2">
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 bg-primary text-primary-content shadow-sm">
          <div className="flex items-center gap-2 mb-1 opacity-70 text-[11px]">
            <User className="w-3 h-3" />
            <span>Você</span>
            <span>•</span>
            <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div className="text-sm whitespace-pre-wrap leading-relaxed">
            {message.text}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-6 px-2">
      <div className="max-w-[95%] sm:max-w-[85%] w-full rounded-2xl px-4 py-4 bg-base-100 border border-base-300 shadow-sm">
        {/* Cabeçalho da Mensagem do Assistente */}
        <div className="flex items-center justify-between mb-3 text-xs text-base-content/60 border-b border-base-200 pb-2">
          <div className="flex items-center gap-2 font-medium">
            <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <span className="text-base-content font-semibold">
              {message.agent === 'antigravity' ? 'Antigravity Agent' : (message.agent || 'AI Assistant')}
            </span>
            {message.model && (
              <span className="badge badge-sm badge-ghost text-[10px] font-mono">
                {message.model}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            {message.tokens && (
              <span className="badge badge-sm badge-neutral font-mono text-[10px]">
                {message.tokens.total_tokens || message.tokens.output_tokens || 0} tokens
              </span>
            )}
            <span>
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

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
                <div key={idx} className="p-2 rounded bg-base-300/40 border border-base-300/60 font-mono">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-semibold text-primary">{tool.name}</span>
                    <span className="flex items-center gap-1 text-base-content/60">
                      {tool.state === 'RUNNING' && <Loader2 className="w-3 h-3 animate-spin text-warning" />}
                      {tool.state === 'DONE' && <CheckCircle className="w-3 h-3 text-success" />}
                      {tool.state === 'ERROR' && <AlertTriangle className="w-3 h-3 text-error" />}
                      {tool.duration && <span>{tool.duration.toFixed(1)}s</span>}
                    </span>
                  </div>
                  {tool.command && (
                    <div className="bg-base-100 p-1.5 rounded text-[11px] overflow-x-auto text-base-content/90">
                      $ {tool.command}
                    </div>
                  )}
                </div>
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
      </div>
    </div>
  );
};
