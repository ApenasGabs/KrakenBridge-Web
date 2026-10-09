import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, ModelOption } from '../../types';
import { MessageItem } from './MessageItem';
import { ChatInput } from './ChatInput';
import { Bot, Sparkles, Terminal, Code2, ArrowDown } from 'lucide-react';

interface ChatViewProps {
  messages: ChatMessage[];
  prompt: string;
  onPromptChange: (val: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  isLoading: boolean;
  onSelectSuggestion?: (prompt: string) => void;
  currentModel?: string;
  availableModels?: (string | ModelOption)[];
  onModelChange?: (model: string) => void;
  onOpenMcpModal?: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  prompt,
  onPromptChange,
  onSubmit,
  onStop,
  isLoading,
  onSelectSuggestion,
  currentModel,
  availableModels,
  onModelChange,
  onOpenMcpModal
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior
      });
    }
  };

  useEffect(() => {
    scrollToBottom(isLoading ? 'auto' : 'smooth');
  }, [messages, isLoading]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isFar = scrollHeight - scrollTop - clientHeight > 150;
    setShowScrollBottom(isFar);
  };

  const suggestions = [
    {
      title: 'Auditar Código',
      desc: 'Analise os arquivos do projeto em busca de bugs e otimizações',
      prompt: 'Analise a estrutura atual do projeto e aponte sugestões de melhorias ou otimizações.',
      icon: Terminal
    },
    {
      title: 'Planejar Feature',
      desc: 'Crie um plano estruturado para a próxima funcionalidade',
      prompt: 'Elabore um plano passo a passo para a implementação da próxima feature do projeto.',
      icon: Sparkles
    },
    {
      title: 'Gerar Componente',
      desc: 'Construa um novo componente com TypeScript e DaisyUI',
      prompt: 'Gere um componente React reutilizável utilizando TypeScript e classes do DaisyUI.',
      icon: Code2
    }
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-base-200/30 relative">
      {/* Área de Mensagens com Scroll */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        <div className="max-w-4xl mx-auto">
          {messages.length === 0 ? (
            <div className="py-12 sm:py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center mb-4 shadow-sm">
                <Bot className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-base-content mb-2 tracking-tight">
                KrakenBridge Multi-Agent Studio
              </h2>
              <p className="text-sm text-base-content/60 max-w-md mx-auto mb-8">
                Assistente de engenharia de software autônomo conectado ao Antigravity CLI e ao VS Code.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left max-w-2xl mx-auto">
                {suggestions.map((s, idx) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => onSelectSuggestion ? onSelectSuggestion(s.prompt) : onPromptChange(s.prompt)}
                      className="p-3.5 rounded-xl bg-base-100 border border-base-300 hover:border-primary/50 hover:shadow-md transition-all text-left group"
                    >
                      <div className="flex items-center gap-2 mb-1.5 font-medium text-xs text-base-content group-hover:text-primary transition-colors">
                        <Icon className="w-4 h-4 text-primary" />
                        <span>{s.title}</span>
                      </div>
                      <p className="text-[11px] text-base-content/60 line-clamp-2">
                        {s.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageItem key={msg.id} message={msg} />
            ))
          )}
        </div>
      </div>

      {/* Botão flutuante para rolar para o final */}
      {showScrollBottom && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-24 right-6 btn btn-circle btn-sm btn-primary shadow-lg z-10"
          title="Rolar para a última mensagem"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Input de Envio de Mensagem com Seletor de Modelo e Microfone */}
      <ChatInput
        prompt={prompt}
        onChange={onPromptChange}
        onSubmit={onSubmit}
        onStop={onStop}
        isLoading={isLoading}
        currentModel={currentModel}
        availableModels={availableModels}
        onModelChange={onModelChange}
        onOpenMcpModal={onOpenMcpModal}
      />
    </div>
  );
};
