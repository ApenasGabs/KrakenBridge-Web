import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { 
  ChatMessage, 
  ChatOptions, 
  ConversationSession, 
  ProjectWorkspace, 
  SessionUsage, 
  AuthStatus,
  ModelsConfig,
  QueuedMessage,
  AccountInfo
} from './types';
import { api } from './services/api';
import { Sidebar } from './components/Sidebar/Sidebar';
import { Header } from './components/Navbar/Header';
import { OptionsBar } from './components/OptionsBar/OptionsBar';
import { ChatView } from './components/ChatView/ChatView';
import { IdeView } from './components/IdeView/IdeView';
import { StatusView } from './components/StatusView/StatusView';
import { AuthModal } from './components/AuthModal/AuthModal';
import { QuotaBubble } from './components/QuotaBubble/QuotaBubble';
import { McpModal } from './components/McpModal/McpModal';
import { PinModal } from './components/PinModal/PinModal';

export const App: React.FC = () => {
  // Estado das Conversas
  const [conversations, setConversations] = useState<ConversationSession[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const activeConvIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeConvIdRef.current = activeConvId;
  }, [activeConvId]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Segurança por PIN
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  // Layout & Abas (Inicia no Status por padrão)
  const [activeTab, setActiveTab] = useState<'status' | 'chat' | 'ide'>('status');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => 
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMcpModalOpen, setIsMcpModalOpen] = useState(false);
  const [mcpCount, setMcpCount] = useState(0);

  // Configurações do Sistema
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
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
      chatMode: 'agent',
      sandbox: false,
      skipPermissions: true,
      disableSlashCommands: false,
      subproject: '',
      showQuotaBubble: saved !== null ? saved === 'true' : true
    };
  });
  const optionsRef = useRef<ChatOptions>(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

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
      const [status, accountsData] = await Promise.all([
        api.getAuthStatus(),
        api.getAccounts().catch(() => ({ activeEmail: null, accounts: [] }))
      ]);
      setAuthStatus(status);
      setAccounts(accountsData.accounts || []);
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

  const checkPinAndInit = useCallback(async () => {
    try {
      const pinStatus = await api.getPinStatus().catch(() => ({ required: false }));
      if (pinStatus.required && !api.getStoredPinToken()) {
        setIsPinModalOpen(true);
        return;
      }
      setIsPinModalOpen(false);

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

      await Promise.all([
        refreshAuthStatus(), 
        loadConversations(),
        api.getMcpServers().then(servers => setMcpCount(servers.length)).catch(() => {})
      ]);
    } catch (err) {
      console.error('Erro na inicialização do app:', err);
    }
  }, [refreshAuthStatus, loadConversations]);

  useEffect(() => {
    checkPinAndInit();
  }, [checkPinAndInit]);

  // Carregar mensagens da conversa ativa
  const selectConversation = useCallback(async (id: string) => {
    setActiveTab('chat');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setActiveConvId(id);
    try {
      const session = await api.getConversation(id);
      if (session && session.messages) {
        setMessages(session.messages.map((m, idx, arr) => {
          if (session.isRunning && idx === arr.length - 1 && m.role === 'assistant') {
            return { ...m, isStreaming: true };
          }
          return m;
        }));
        setIsLoading(!!session.isRunning);
        setOptions(prev => ({
          ...prev,
          model: session.model || prev.model,
          subproject: session.subproject || '',
          chatMode: session.chatMode || prev.chatMode || 'agent',
          accountEmail: session.accountEmail || undefined
        }));
      } else {
        setMessages([]);
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Erro ao buscar conversa:', err);
      setMessages([]);
      setIsLoading(false);
    }
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveTab('chat');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setActiveConvId(null);
    setMessages([]);
    setPrompt('');
    setIsLoading(false);
  }, []);

  const handleNewChatInProject = useCallback((subproject: string) => {
    handleNewChat();
    setOptions(prev => ({ ...prev, subproject: subproject === 'Geral' ? '' : subproject }));
  }, [handleNewChat]);

  const handleSubprojectChange = useCallback(async (newSubproject: string) => {
    setOptions(prev => ({ ...prev, subproject: newSubproject }));
    if (activeConvId) {
      try {
        await api.updateConversation(activeConvId, { subproject: newSubproject });
        setConversations(prev => prev.map(c => c.id === activeConvId ? { ...c, subproject: newSubproject } : c));
      } catch (e) {
        console.warn('Erro ao atualizar subprojeto da conversa:', e);
      }
    }
  }, [activeConvId]);

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

  // Fila de Mensagens Pendentes (com sincronização síncrona de Ref e persistência no localStorage)
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>(() => {
    try {
      const saved = localStorage.getItem('kraken_message_queue');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const messageQueueRef = useRef<QueuedMessage[]>(messageQueue);

  const updateMessageQueue = useCallback((updater: QueuedMessage[] | ((prev: QueuedMessage[]) => QueuedMessage[])) => {
    setMessageQueue(prev => {
      const updated = typeof updater === 'function' ? updater(prev) : updater;
      messageQueueRef.current = updated;
      try {
        localStorage.setItem('kraken_message_queue', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const handleRemoveQueueItem = useCallback((id: string) => {
    updateMessageQueue(prev => prev.filter(m => m.id !== id));
  }, [updateMessageQueue]);

  const handleEditQueueItem = useCallback((msg: QueuedMessage) => {
    updateMessageQueue(prev => prev.filter(m => m.id !== msg.id));
    setPrompt(msg.text);
  }, [updateMessageQueue]);

  const handleClearQueue = useCallback(() => {
    updateMessageQueue([]);
  }, [updateMessageQueue]);

  // Fila filtrada para a conversa ativa atual
  const currentConversationQueue = useMemo(() => {
    return messageQueue.filter(m => !m.conversationId || m.conversationId === activeConvId);
  }, [messageQueue, activeConvId]);

  // Ref mutável para executeTurn a fim de evitar stale closures nos callbacks SSE
  const executeTurnRef = useRef<(userText: string, turnOptions?: { force?: boolean; model?: string; subproject?: string }) => Promise<void>>(async () => {});

  // Despacho seguro do próximo item da fila
  const dispatchNextQueueItem = useCallback(() => {
    const queue = messageQueueRef.current;
    if (!queue || queue.length === 0) return;

    const currentConvId = activeConvIdRef.current;
    const nextIdx = queue.findIndex(item => !item.conversationId || item.conversationId === currentConvId);
    if (nextIdx === -1) return;

    const nextMsg = queue[nextIdx];
    const remaining = queue.filter((_, idx) => idx !== nextIdx);
    updateMessageQueue(remaining);

    // Timeout de 450ms com force: true garante que encerramentos assíncronos anteriores não travem o próximo envio
    setTimeout(() => {
      executeTurnRef.current(nextMsg.text, {
        force: true,
        model: nextMsg.model,
        subproject: nextMsg.subproject
      });
    }, 450);
  }, [updateMessageQueue]);

  // Executar Turno do Assistente com SSE Streaming
  const executeTurn = useCallback(async (
    userText: string,
    turnOptions?: { force?: boolean; model?: string; subproject?: string }
  ) => {
    setIsLoading(true);

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: userText,
      timestamp: new Date().toISOString()
    };

    const streamingId = `assistant-${Date.now()}`;
    const targetModel = turnOptions?.model || optionsRef.current.model;
    const assistantMessage: ChatMessage = {
      id: streamingId,
      role: 'assistant',
      text: '',
      timestamp: new Date().toISOString(),
      agent: optionsRef.current.agent,
      model: targetModel,
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
          conversationId: activeConvIdRef.current || undefined,
          options: {
            ...optionsRef.current,
            model: targetModel,
            subproject: turnOptions?.subproject ?? optionsRef.current.subproject
          },
          force: turnOptions?.force ?? false
        },
        {
          onSessionStart: (data) => {
            if (!activeConvIdRef.current) {
              activeConvIdRef.current = data.conversation_id;
              setActiveConvId(data.conversation_id);
            }
            if (data.subproject) {
              setOptions(prev => ({ ...prev, subproject: data.subproject || prev.subproject }));
            }
            loadConversations();
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
            abortControllerRef.current = null;
            setMessages(prev => prev.map(msg => {
              if (msg.id === streamingId) {
                return { ...msg, isStreaming: false };
              }
              return msg;
            }));
            setIsLoading(false);
            loadConversations();

            // Auto-dispatch da próxima mensagem enfileirada com segurança
            dispatchNextQueueItem();
          },
          onError: (err) => {
            abortControllerRef.current = null;
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
      abortControllerRef.current = null;
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      console.error('Falha no streaming SSE:', err);
      setIsLoading(false);
      setMessages(prev => prev.map(msg => {
        if (msg.id === streamingId) {
          return { ...msg, isStreaming: false };
        }
        return msg;
      }));
    }
  }, [loadConversations, dispatchNextQueueItem]);

  useEffect(() => {
    executeTurnRef.current = executeTurn;
  }, [executeTurn]);

  // Polling para sincronizar mensagens se a conversa ativa estiver rodando em segundo plano
  useEffect(() => {
    if (!activeConvId || !isLoading || abortControllerRef.current) return;

    const interval = setInterval(async () => {
      try {
        const session = await api.getConversation(activeConvId);
        if (session) {
          if (session.messages) {
            setMessages(session.messages.map((m, idx, arr) => {
              if (session.isRunning && idx === arr.length - 1 && m.role === 'assistant') {
                return { ...m, isStreaming: true };
              }
              return m;
            }));
          }
          if (!session.isRunning) {
            setIsLoading(false);
            loadConversations();
            // Auto-dispatch se houver item pendente na fila
            dispatchNextQueueItem();
          }
        }
      } catch (e) {
        console.warn('Erro no polling da conversa:', e);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeConvId, isLoading, loadConversations, dispatchNextQueueItem]);

  // Polling da lista de conversas caso alguma esteja rodando em segundo plano
  useEffect(() => {
    const hasRunning = conversations.some(c => c.isRunning);
    if (!hasRunning) return;

    const interval = setInterval(() => {
      loadConversations();
    }, 3000);

    return () => clearInterval(interval);
  }, [conversations, loadConversations]);

  // Enviar Mensagem (ou Enfileirar se o agente estiver ativo)
  const handleSubmitMessage = useCallback(() => {
    const userText = prompt.trim();
    if (!userText) return;

    if (isLoading) {
      // Adiciona à fila de mensagens associando à conversa atual
      const queuedItem: QueuedMessage = {
        id: `queue-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        conversationId: activeConvIdRef.current,
        text: userText,
        timestamp: new Date().toISOString(),
        model: optionsRef.current.model,
        subproject: optionsRef.current.subproject,
        status: 'pending'
      };
      updateMessageQueue(prev => [...prev, queuedItem]);
      setPrompt('');
      return;
    }

    setPrompt('');
    executeTurn(userText);
  }, [prompt, isLoading, executeTurn, updateMessageQueue]);

  // Forçar Envio Imediato de Mensagem do Campo de Texto (Interrompe qualquer tarefa ativa e roda imediatamente)
  const handleForceSubmitMessage = useCallback(async () => {
    const userText = prompt.trim();
    if (!userText) return;

    if (isLoading || abortControllerRef.current) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setMessages(prev => prev.map(msg => {
        if (msg.isStreaming) {
          return { ...msg, isStreaming: false, text: (msg.text ? msg.text + '\n\n' : '') + '*(Interrompido por novo envio forçado)*' };
        }
        return msg;
      }));
      try {
        api.stopChat(activeConvIdRef.current || undefined).catch(() => {});
      } catch {}
    }

    setPrompt('');
    executeTurn(userText, { force: true });
  }, [prompt, isLoading, executeTurn]);

  // Forçar Envio de um Item Específico da Fila
  const handleForceSendQueueItem = useCallback(async (item: QueuedMessage) => {
    updateMessageQueue(prev => prev.filter(m => m.id !== item.id));

    if (isLoading || abortControllerRef.current) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setMessages(prev => prev.map(msg => {
        if (msg.isStreaming) {
          return { ...msg, isStreaming: false, text: (msg.text ? msg.text + '\n\n' : '') + '*(Interrompido por envio forçado da fila)*' };
        }
        return msg;
      }));
      try {
        api.stopChat(activeConvIdRef.current || undefined).catch(() => {});
      } catch {}
    }

    executeTurn(item.text, {
      force: true,
      model: item.model,
      subproject: item.subproject
    });
  }, [isLoading, updateMessageQueue, executeTurn]);

  // Executar o próximo item da fila manualmente (caso esteja pausada)
  const handleRunNextQueueItem = useCallback(() => {
    dispatchNextQueueItem();
  }, [dispatchNextQueueItem]);

  const handleStop = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    try {
      await api.stopChat(activeConvIdRef.current || undefined);
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
    loadConversations();
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
        authStatus={authStatus}
        onOpenAuth={() => setIsAuthModalOpen(true)}
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
          onOpenMcp={() => setIsMcpModalOpen(true)}
          mcpCount={mcpCount}
        />

        {/* Barra de Opções do Antigravity CLI */}
        <OptionsBar
          options={options}
          availableModels={availableModels}
          accounts={accounts}
          onChange={handleUpdateOptions}
          isOpen={isOptionsOpen}
        />

        {/* Visão de Status (Malha & Métricas) vs Visão de Chat vs Visão de IDE */}
        {activeTab === 'status' ? (
          <StatusView
            conversations={conversations}
            projects={projects}
            workspaceDir={workspaceDir}
            onSelectConversation={selectConversation}
            onNewChatInProject={handleNewChatInProject}
            onNewChat={handleNewChat}
          />
        ) : activeTab === 'chat' ? (
          <ChatView
            messages={messages}
            prompt={prompt}
            onPromptChange={setPrompt}
            onSubmit={handleSubmitMessage}
            onForceSubmit={handleForceSubmitMessage}
            onStop={handleStop}
            isLoading={isLoading}
            onSelectSuggestion={(sug) => setPrompt(sug)}
            currentModel={options.model}
            availableModels={availableModels}
            onModelChange={(model) => handleUpdateOptions({ ...options, model })}
            onOpenMcpModal={() => setIsMcpModalOpen(true)}
            messageQueue={currentConversationQueue}
            onRemoveQueueItem={handleRemoveQueueItem}
            onEditQueueItem={handleEditQueueItem}
            onClearQueue={handleClearQueue}
            onForceSendQueueItem={handleForceSendQueueItem}
            onRunNextQueueItem={handleRunNextQueueItem}
            projects={projects}
            subproject={options.subproject}
            onSubprojectChange={handleSubprojectChange}
            chatMode={options.chatMode || 'agent'}
            onChatModeChange={(chatMode) => handleUpdateOptions({ ...options, chatMode })}
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

      {/* Modal de Gerenciamento de MCPs */}
      <McpModal
        isOpen={isMcpModalOpen}
        onClose={() => setIsMcpModalOpen(false)}
      />

      {/* Modal de Autenticação e Configurações */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        status={authStatus}
        onRefreshStatus={refreshAuthStatus}
      />

      {/* Modal de Bloqueio por PIN */}
      <PinModal
        isOpen={isPinModalOpen}
        onSuccess={() => checkPinAndInit()}
      />
    </div>
  );
};

export default App;
