import { useState, useEffect, useCallback, useRef } from 'react';
import type { 
  ChatMessage, 
  ChatOptions, 
  ConversationSession, 
  ProjectWorkspace, 
  SessionUsage, 
  AuthStatus,
  ModelsConfig 
} from './types';
import { api } from './services/api';
import { Sidebar } from './components/Sidebar/Sidebar';
import { Header } from './components/Navbar/Header';
import { OptionsBar } from './components/OptionsBar/OptionsBar';
import { ChatView } from './components/ChatView/ChatView';
import { IdeView } from './components/IdeView/IdeView';
import { AuthModal } from './components/AuthModal/AuthModal';
import { QuotaBubble } from './components/QuotaBubble/QuotaBubble';

export const App: React.FC = () => {
  // Estado das Conversas
  const [conversations, setConversations] = useState<ConversationSession[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Layout & Abas
  const [activeTab, setActiveTab] = useState<'chat' | 'ide'>('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => 
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Configurações do Sistema
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [projects, setProjects] = useState<ProjectWorkspace[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [codeServerPort, setCodeServerPort] = useState(8089);
  const [workspaceDir, setWorkspaceDir] = useState('/workspace');

  // Parâmetros do Agente CLI
  const [options, setOptions] = useState<ChatOptions>(() => {
    const saved = localStorage.getItem('kraken_show_quota');
    return {
      agent: 'antigravity',
      model: 'gemini-3.8-flash-high',
      effort: 'default',
      mode: 'default',
      sandbox: false,
      skipPermissions: true,
      disableSlashCommands: false,
      subproject: '',
      showQuotaBubble: saved !== null ? saved === 'true' : true
    };
  });

  const handleUpdateOptions = useCallback((newOptions: ChatOptions) => {
    setOptions(newOptions);
    if (newOptions.showQuotaBubble !== undefined) {
      localStorage.setItem('kraken_show_quota', String(newOptions.showQuotaBubble));
    }
  }, []);

  // Estatísticas de Cota e Consumo de Tokens
  const [sessionUsage, setSessionUsage] = useState<SessionUsage>({
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    sessionThinkingTokens: 0,
    sessionTotalTokens: 0,
    lastTurnTokens: 0
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // Carregar status e conversas iniciais
  const refreshAuthStatus = useCallback(async () => {
    try {
      const status = await api.getAuthStatus();
      setAuthStatus(status);
    } catch (e) {
      console.warn('Erro ao carregar status de autenticação:', e);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const list = await api.getConversations();
      setConversations(list);
    } catch (e) {
      console.warn('Erro ao carregar conversas:', e);
    }
  }, []);

  useEffect(() => {
    const initApp = async () => {
      try {
        const [configData, projectsData, modelsData] = await Promise.all([
          api.getConfig().catch(() => ({ workspaceDir: '/workspace', codeServerPort: 8089 })),
          api.getProjects().catch((): { projects: ProjectWorkspace[] } => ({ projects: [] })),
          api.getModels().catch((): ModelsConfig => ({}))
        ]);

        if (configData.codeServerPort) setCodeServerPort(configData.codeServerPort);
        if (configData.workspaceDir) setWorkspaceDir(configData.workspaceDir);
        if (projectsData.projects) setProjects(projectsData.projects);
        
        const agyList: string[] = [];
        if (modelsData && modelsData.antigravity && Array.isArray(modelsData.antigravity)) {
          agyList.push(...modelsData.antigravity.map((m: { id: string }) => m.id));
        } else if (Array.isArray(modelsData.models)) {
          agyList.push(...modelsData.models);
        }

        if (agyList.length > 0) {
          setAvailableModels(agyList);
          setOptions(prev => ({
            ...prev,
            model: agyList.includes(prev.model) ? prev.model : agyList[0]
          }));
        }

        await Promise.all([refreshAuthStatus(), loadConversations()]);
      } catch (err) {
        console.error('Erro na inicialização do app:', err);
      }
    };

    initApp();
  }, [refreshAuthStatus, loadConversations]);

  // Carregar mensagens da conversa ativa
  const selectConversation = useCallback(async (id: string) => {
    setActiveConvId(id);
    setIsLoading(false);
    try {
      const session = await api.getConversation(id);
      if (session && session.messages) {
        setMessages(session.messages);
        if (session.model) {
          setOptions(prev => ({ ...prev, model: session.model || prev.model }));
        }
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error('Erro ao buscar conversa:', err);
      setMessages([]);
    }
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveConvId(null);
    setMessages([]);
    setPrompt('');
    setIsLoading(false);
  }, []);

  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      await api.deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConvId === id) {
        handleNewChat();
      }
    } catch (err) {
      console.error('Erro ao excluir conversa:', err);
    }
  }, [activeConvId, handleNewChat]);

  // Enviar Mensagem com SSE Streaming
  const handleSubmitMessage = async () => {
    if (!prompt.trim() || isLoading) return;

    const userText = prompt.trim();
    setPrompt('');
    setIsLoading(true);

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: userText,
      timestamp: new Date().toISOString()
    };

    const streamingId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: streamingId,
      role: 'assistant',
      text: '',
      timestamp: new Date().toISOString(),
      agent: options.agent,
      model: options.model,
      toolCalls: [],
      thinking: '',
      isStreaming: true
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);

    abortControllerRef.current = new AbortController();

    try {
      await api.streamChat(
        {
          prompt: userText,
          conversationId: activeConvId || undefined,
          options
        },
        {
          onSessionStart: (data) => {
            if (!activeConvId) {
              setActiveConvId(data.conversation_id);
              loadConversations();
            }
          },
          onTextDelta: (delta) => {
            setMessages(prev => prev.map(msg => {
              if (msg.id === streamingId) {
                return { ...msg, text: msg.text + delta };
              }
              return msg;
            }));
          },
          onThinkingDelta: (delta) => {
            setMessages(prev => prev.map(msg => {
              if (msg.id === streamingId) {
                return { ...msg, thinking: (msg.thinking || '') + delta };
              }
              return msg;
            }));
          },
          onToolUpdate: (toolUpdate) => {
            setMessages(prev => prev.map(msg => {
              if (msg.id === streamingId) {
                const tools = [...(msg.toolCalls || [])];
                const existingIdx = tools.findIndex(t => 
                  (toolUpdate.step_index !== undefined && t.step_index === toolUpdate.step_index) ||
                  (t.name === toolUpdate.name && (t.state === 'ACTIVE' || t.state === 'RUNNING'))
                );

                if (existingIdx >= 0) {
                  tools[existingIdx] = {
                    ...tools[existingIdx],
                    ...toolUpdate,
                    command: toolUpdate.command || tools[existingIdx].command,
                    output: toolUpdate.output || tools[existingIdx].output,
                    action: toolUpdate.action || tools[existingIdx].action,
                    summary: toolUpdate.summary || tools[existingIdx].summary
                  };
                } else {
                  tools.push(toolUpdate);
                }
                return { ...msg, toolCalls: tools };
              }
              return msg;
            }));
          },
          onUsage: (usage) => {
            const turnTotal = usage.total_tokens || (usage.input_tokens || 0) + (usage.output_tokens || 0);
            setSessionUsage(prev => ({
              sessionInputTokens: prev.sessionInputTokens + (usage.input_tokens || 0),
              sessionOutputTokens: prev.sessionOutputTokens + (usage.output_tokens || 0),
              sessionThinkingTokens: prev.sessionThinkingTokens + (usage.thinking_tokens || 0),
              sessionTotalTokens: prev.sessionTotalTokens + turnTotal,
              lastTurnTokens: turnTotal
            }));
            setMessages(prev => prev.map(msg => {
              if (msg.id === streamingId) {
                return { ...msg, tokens: usage };
              }
              return msg;
            }));
          },
          onDone: () => {
            setMessages(prev => prev.map(msg => {
              if (msg.id === streamingId) {
                return { ...msg, isStreaming: false };
              }
              return msg;
            }));
            setIsLoading(false);
            loadConversations();
          },
          onError: (err) => {
            setMessages(prev => prev.map(msg => {
              if (msg.id === streamingId) {
                return {
                  ...msg,
                  isStreaming: false,
                  text: msg.text ? `${msg.text}\n\n⚠️ **Erro:** ${err}` : `⚠️ **Erro durante a execução:** ${err}`
                };
              }
              return msg;
            }));
            setIsLoading(false);
          }
        },
        abortControllerRef.current.signal
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Falha no streaming SSE:', err);
      }
      setIsLoading(false);
      setMessages(prev => prev.map(msg => {
        if (msg.id === streamingId) {
          return { ...msg, isStreaming: false };
        }
        return msg;
      }));
    }
  };

  const handleStop = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    try {
      await api.stopChat();
    } catch (e) {
      console.warn('Erro ao interromper chat:', e);
    }
    setIsLoading(false);
    setMessages(prev => prev.map(msg => {
      if (msg.isStreaming) {
        return { ...msg, isStreaming: false, text: msg.text + '\n\n*(Interrompido pelo usuário)*' };
      }
      return msg;
    }));
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-base-100 text-base-content font-sans">
      {/* Sidebar de Histórico e Workspaces */}
      <Sidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={selectConversation}
        onNewChat={handleNewChat}
        onDelete={handleDeleteConversation}
        projects={projects}
        selectedProject={options.subproject}
        onSelectProject={(subproject) => setOptions(prev => ({ ...prev, subproject }))}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Conteúdo Principal */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Barra Superior */}
        <Header
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
          isOptionsOpen={isOptionsOpen}
          onToggleOptions={() => setIsOptionsOpen(prev => !prev)}
          authStatus={authStatus}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          sessionUsage={sessionUsage}
          currentModel={options.model}
          onToggleQuota={() => handleUpdateOptions({ ...options, showQuotaBubble: !options.showQuotaBubble })}
        />

        {/* Barra de Opções do Antigravity CLI */}
        <OptionsBar
          options={options}
          availableModels={availableModels}
          onChange={handleUpdateOptions}
          isOpen={isOptionsOpen}
        />

        {/* Visão de Chat vs Visão de IDE */}
        {activeTab === 'chat' ? (
          <ChatView
            messages={messages}
            prompt={prompt}
            onPromptChange={setPrompt}
            onSubmit={handleSubmitMessage}
            onStop={handleStop}
            isLoading={isLoading}
            onSelectSuggestion={(sug) => setPrompt(sug)}
          />
        ) : (
          <IdeView
            codeServerPort={codeServerPort}
            workspaceDir={workspaceDir}
          />
        )}
      </div>

      {/* Balão Flutuante de Cotas Antigravity (Horária e Semanal) */}
      <QuotaBubble
        isVisible={!!options.showQuotaBubble}
        onClose={() => handleUpdateOptions({ ...options, showQuotaBubble: false })}
        lastTurnTokens={sessionUsage.lastTurnTokens}
      />

      {/* Modal de Autenticação e Configurações */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        status={authStatus}
        onRefreshStatus={refreshAuthStatus}
      />
    </div>
  );
};

export default App;
