import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChatMessage, ModelOption, ProjectWorkspace, QueuedMessage, EvolutionStatus } from '../../types';
import { MessageItem } from './MessageItem';
import { ChatInput } from './ChatInput';
import { MessageQueueBanner } from './MessageQueueBanner';
import { SpinnerVerbsModal } from './SpinnerVerbsModal';
import { ArtifactDrawer } from './ArtifactDrawer';
import { PodDrainBanner } from '../PodDrain';
import { Bot, Sparkles, Terminal, Code2, ArrowDown, FolderGit2, ChevronDown, Check } from 'lucide-react';

interface ChatViewProps {
  messages: ChatMessage[];
  prompt: string;
  onPromptChange: (val: string) => void;
  onSubmit: () => void;
  onForceSubmit?: () => void;
  onStop: () => void;
  isLoading: boolean;
  isDraining?: boolean;
  evolutionStatus?: EvolutionStatus | null;
  onSelectSuggestion?: (prompt: string) => void;
  currentModel?: string;
  availableModels?: (string | ModelOption)[];
  onModelChange?: (model: string) => void;
  onOpenMcpModal?: () => void;
  // Fila de mensagens
  messageQueue?: QueuedMessage[];
  onRemoveQueueItem?: (id: string) => void;
  onEditQueueItem?: (msg: QueuedMessage) => void;
  onClearQueue?: () => void;
  onForceSendQueueItem?: (msg: QueuedMessage) => void;
  onRunNextQueueItem?: () => void;
  // Subprojeto / Workspace
  projects?: ProjectWorkspace[];
  subproject?: string;
  onSubprojectChange?: (subproject: string) => void;
  // Tags contextuais dinâmicas
  tags?: string[];
  // Modo de Operação
  chatMode?: 'agent' | 'chat';
  onChatModeChange?: (mode: 'agent' | 'chat') => void;
  codeServerPort?: number;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  prompt,
  onPromptChange,
  onSubmit,
  onForceSubmit,
  onStop,
  isLoading,
  isDraining = false,
  evolutionStatus = null,
  onSelectSuggestion,
  currentModel,
  availableModels,
  onModelChange,
  onOpenMcpModal,
  messageQueue = [],
  onRemoveQueueItem,
  onEditQueueItem,
  onClearQueue,
  onForceSendQueueItem,
  onRunNextQueueItem,
  projects = [],
  subproject = '',
  onSubprojectChange,
  tags = [],
  chatMode = 'agent',
  onChatModeChange,
  codeServerPort
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isSpinnerModalOpen, setIsSpinnerModalOpen] = useState(false);
  const [selectedArtifactPath, setSelectedArtifactPath] = useState<string | null>(null);

  // Estados e referências para controle resiliente de auto-scroll
  const isAtBottomRef = useRef(true);
  const isProgrammaticScrollRef = useRef(false);
  const programmaticScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const prevMessagesLengthRef = useRef(messages.length);
  const prevFirstMessageIdRef = useRef<string | undefined>(messages[0]?.id);

  const handleOpenFilePreview = useCallback((filePath: string) => {
    setSelectedArtifactPath(filePath);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (scrollRef.current) {
      isProgrammaticScrollRef.current = true;
      if (programmaticScrollTimeoutRef.current) {
        clearTimeout(programmaticScrollTimeoutRef.current);
      }

      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior
      });

      const timeout = behavior === 'smooth' ? 450 : 80;
      programmaticScrollTimeoutRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, timeout);
    }
  }, []);

  // Monitora alterações nas mensagens e estado de carregamento
  useEffect(() => {
    const prevLen = prevMessagesLengthRef.current;
    const currentLen = messages.length;
    const prevFirstId = prevFirstMessageIdRef.current;
    const currentFirstId = messages[0]?.id;

    prevMessagesLengthRef.current = currentLen;
    prevFirstMessageIdRef.current = currentFirstId;

    // Se mudou de conversa ou limpou, rola para o final e reativa auto-scroll
    if (currentFirstId !== prevFirstId) {
      isAtBottomRef.current = true;
      scrollToBottom('auto');
      return;
    }

    // Se uma nova mensagem foi adicionada e partiu do usuário, sempre rola para o final
    if (currentLen > prevLen) {
      const lastMsg = messages[currentLen - 1];
      if (lastMsg?.role === 'user') {
        isAtBottomRef.current = true;
        scrollToBottom('smooth');
        return;
      }
    }

    // Durante geração/streaming ou atualizações, só rola se o usuário estiver acompanhando o final
    if (isAtBottomRef.current) {
      scrollToBottom(isLoading ? 'auto' : 'smooth');
    }
  }, [messages, isLoading, scrollToBottom]);

  // Limpeza de timers no desmonte
  useEffect(() => {
    return () => {
      if (programmaticScrollTimeoutRef.current) {
        clearTimeout(programmaticScrollTimeoutRef.current);
      }
    };
  }, []);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isFar = distanceFromBottom > 150;
    setShowScrollBottom(isFar);

    // Se for uma rolagem programática disparada pelo scrollToBottom, não marca como scrolled up
    if (isProgrammaticScrollRef.current) {
      return;
    }

    // Se o usuário rolou para cima (distância perceptível do final)
    if (distanceFromBottom > 80) {
      isAtBottomRef.current = false;
    } else if (distanceFromBottom <= 30) {
      // Se o usuário rolou de volta até o rodapé
      isAtBottomRef.current = true;
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0) {
      // Usuário girou a roda do mouse/trackpad para cima explicitamente
      if (programmaticScrollTimeoutRef.current) {
        clearTimeout(programmaticScrollTimeoutRef.current);
      }
      isProgrammaticScrollRef.current = false;
      isAtBottomRef.current = false;
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = e.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartYRef.current !== null && e.touches[0]) {
      const deltaY = e.touches[0].clientY - touchStartYRef.current;
      // Arrastar o dedo para baixo na tela faz o conteúdo rolar para cima (em direção ao topo)
      if (deltaY > 15) {
        if (programmaticScrollTimeoutRef.current) {
          clearTimeout(programmaticScrollTimeoutRef.current);
        }
        isProgrammaticScrollRef.current = false;
        isAtBottomRef.current = false;
      }
    }
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
    <div className="flex-1 flex flex-col h-full min-w-0 min-h-0 overflow-hidden bg-base-200/30 relative">
      {/* Barra Superior de Contexto do Projeto */}
      <div className="px-3 py-1.5 border-b border-base-300/60 bg-base-100/60 backdrop-blur-sm flex items-center justify-between gap-2 min-w-0 z-10">
        <div className="flex items-center gap-2 relative min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs text-base-content/60">
            <FolderGit2 className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">Projeto Ativo:</span>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-base-200 hover:bg-base-300/70 border border-base-300 text-xs font-medium text-base-content transition-all"
              title="Clique para vincular esta conversa a outro projeto"
            >
              <span className="max-w-[160px] sm:max-w-xs truncate">
                {subproject ? subproject : 'Geral (/workspace)'}
              </span>
              <ChevronDown className={`w-3 h-3 text-base-content/50 transition-transform ${isProjectDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isProjectDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsProjectDropdownOpen(false)} 
                />
                <div className="absolute top-full mt-1 left-0 z-50 w-56 max-h-64 overflow-y-auto rounded-xl bg-base-100 border border-base-300 shadow-xl p-1 text-xs">
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-base-content/50 border-b border-base-200 mb-1">
                    Vincular a Projeto
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSubprojectChange?.('');
                      setIsProjectDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                      !subproject ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-base-200 text-base-content'
                    }`}
                  >
                    <span className="truncate">Geral (/workspace)</span>
                    {!subproject && <Check className="w-3.5 h-3.5 text-primary" />}
                  </button>
                  {projects.map((proj) => {
                    const isSelected = subproject === proj.name;
                    return (
                      <button
                        key={proj.name}
                        type="button"
                        onClick={() => {
                          onSubprojectChange?.(proj.name);
                          setIsProjectDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                          isSelected ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-base-200 text-base-content'
                        }`}
                      >
                        <span className="truncate">{proj.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {tags && tags.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto min-w-0 max-w-[200px] sm:max-w-xs scrollbar-none py-0.5 ml-1">
              {tags.map(tag => (
                <span key={tag} className="badge badge-primary/15 text-primary border-primary/25 badge-xs text-[9.5px] font-mono shrink-0">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Lado Direito: Fila de Mensagens & Botão Spinner Verbs */}
        <div className="flex items-center gap-2 shrink-0">
          {messageQueue.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] font-medium text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
              <span>{messageQueue.length} na fila</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsSpinnerModalOpen(true)}
            className="btn btn-ghost btn-xs text-base-content/60 hover:text-primary gap-1 font-mono text-[11px]"
            title="Personalizar palavras e verbos do Spinner (estilo Claude Code)"
            data-testid="chat-spinner-verbs-btn"
          >
            <Sparkles className="w-3.5 h-3.5 text-primary/70" />
            <span className="hidden sm:inline">Verbos</span>
          </button>
        </div>
      </div>

      {/* Área de Mensagens com Scroll */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-2.5 sm:px-4 py-3 sm:py-6"
        data-testid="chat-messages-container"
      >
        <div className="max-w-4xl mx-auto min-w-0">
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
              <MessageItem 
                key={msg.id} 
                message={msg} 
                codeServerPort={codeServerPort} 
                onOpenFilePreview={handleOpenFilePreview}
              />
            ))
          )}
        </div>
      </div>

      {/* Botão flutuante para rolar para o final */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={() => {
            isAtBottomRef.current = true;
            setShowScrollBottom(false);
            scrollToBottom('smooth');
          }}
          className="absolute bottom-24 right-6 btn btn-circle btn-sm btn-primary shadow-lg z-10 transition-transform active:scale-95"
          title="Rolar para a última mensagem"
          data-testid="scroll-to-bottom-btn"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Banner da Fila de Mensagens Pendentes */}
      {messageQueue.length > 0 && onRemoveQueueItem && onEditQueueItem && onClearQueue && (
        <MessageQueueBanner
          queue={messageQueue}
          onRemove={onRemoveQueueItem}
          onEdit={onEditQueueItem}
          onClear={onClearQueue}
          onForceSend={onForceSendQueueItem}
          onRunNext={onRunNextQueueItem}
          isGenerating={isLoading}
        />
      )}

      {/* Banner de Pod Drain (aviso visual de drenagem de tarefas ativas) */}
      {(isDraining || evolutionStatus?.isDraining || evolutionStatus?.status === 'draining') && (
        <div className="px-4 pb-2">
          <PodDrainBanner status={evolutionStatus} />
        </div>
      )}

      {/* Input de Envio de Mensagem com Seletor de Modelo, MCPs, Refinar e Microfone */}
      <ChatInput
        prompt={prompt}
        onChange={onPromptChange}
        onSubmit={onSubmit}
        onForceSubmit={onForceSubmit}
        onStop={onStop}
        isLoading={isLoading}
        isDraining={isDraining}
        evolutionStatus={evolutionStatus}
        currentModel={currentModel}
        availableModels={availableModels}
        onModelChange={onModelChange}
        onOpenMcpModal={onOpenMcpModal}
        queuedCount={messageQueue.length}
        chatMode={chatMode}
        onChatModeChange={onChatModeChange}
        project={subproject}
        recentMessages={messages.slice(-4).map((m) => `${m.role}: ${(m.text || '').slice(0, 350)}`)}
      />

      <SpinnerVerbsModal
        isOpen={isSpinnerModalOpen}
        onClose={() => setIsSpinnerModalOpen(false)}
      />

      <ArtifactDrawer
        filePath={selectedArtifactPath}
        codeServerPort={codeServerPort}
        onClose={() => setSelectedArtifactPath(null)}
      />
    </div>
  );
};
