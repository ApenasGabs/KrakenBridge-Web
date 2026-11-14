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
  AccountInfo,
  EvolutionStatus,
  LocalSubagent,
  ModelOption
} from './types';
import { api } from './services/api';
import { Sidebar } from './components/Sidebar/Sidebar';
import { Header } from './components/Navbar/Header';
import { OptionsBar } from './components/OptionsBar/OptionsBar';
import { ChatView } from './components/ChatView/ChatView';
import { IdeView } from './components/IdeView/IdeView';
import { StatusView } from './components/StatusView/StatusView';
import { WhatsNextView } from './components/WhatsNextView/WhatsNextView';
import { MemoryView } from './components/MemoryView/MemoryView';
import { OfficeView } from './components/OfficeView/OfficeView';
import { AuthModal } from './components/AuthModal/AuthModal';
import { QuotaBubble } from './components/QuotaBubble/QuotaBubble';
import { McpModal } from './components/McpModal/McpModal';
import { PinModal } from './components/PinModal/PinModal';
import { NotificationsModal } from './components/NotificationsModal';
import { SystemUpdateModal } from './components/SystemUpdateModal';
import { PodDrainBanner, PodDrainReloadBubble } from './components/PodDrain';
import { OfflineBanner } from './components/OfflineBanner';
import { AndroidStatusBar } from './components/AndroidStatusBar';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  saveConversationsListOffline,
  getConversationsListOffline,
  saveConversationSessionOffline,
  getConversationSessionOffline,
  deleteConversationOffline
} from './utils/offlineStorage';

// Helper para recuperar a rota e conversa inicial a partir da URL do navegador
const getInitialRoute = (): { tab: 'status' | 'whatsnext' | 'chat' | 'ide' | 'memory' | 'office'; convId: string | null } => {
  if (typeof window === 'undefined') return { tab: 'status', convId: null };

  const pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const queryConvId = searchParams.get('c');

  // /c/:id ou /chat/c/:id
  const convMatch = pathname.match(/(?:\/chat)?\/c\/([a-zA-Z0-9_-]+)/);
  if (convMatch) {
    return { tab: 'chat', convId: convMatch[1] };
  }

  if (queryConvId) {
    return { tab: 'chat', convId: queryConvId };
  }

  const queryTab = searchParams.get('tab');
  if (queryTab === 'status' || queryTab === 'whatsnext' || queryTab === 'chat' || queryTab === 'ide' || queryTab === 'memory' || queryTab === 'office') {
    return { tab: queryTab, convId: null };
  }

  if (pathname.includes('/whatsnext')) return { tab: 'whatsnext', convId: null };
  if (pathname.includes('/office')) return { tab: 'office', convId: null };
  if (pathname.includes('/ide')) return { tab: 'ide', convId: null };
  if (pathname.includes('/memory')) return { tab: 'memory', convId: null };
  if (pathname.includes('/chat')) return { tab: 'chat', convId: null };
  if (pathname.includes('/status')) return { tab: 'status', convId: null };

  // Ao abrir o app instalado via PWA sem tab explícita, abre diretamente o Chat
  if (searchParams.get('source')?.startsWith('pwa')) {
    return { tab: 'chat', convId: null };
  }

  return { tab: 'status', convId: null };
};

export const App: React.FC = () => {
  const initialRoute = useMemo(() => getInitialRoute(), []);
  const { isOnline, wasOffline, dismissReconnectedNotice } = useOnlineStatus();
  const isOnlineRef = useRef(isOnline);
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  // Estado das Conversas (inicializado pela rota da URL se presente)
  const [conversations, setConversations] = useState<ConversationSession[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(initialRoute.convId);
  const activeConvIdRef = useRef<string | null>(initialRoute.convId);
  useEffect(() => {
    activeConvIdRef.current = activeConvId;
  }, [activeConvId]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [evolutionStatus, setEvolutionStatus] = useState<EvolutionStatus | null>(null);

  // Segurança por PIN
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  // Layout & Abas (Sincronizado com a URL do navegador)
  const [activeTab, setActiveTab] = useState<'status' | 'whatsnext' | 'chat' | 'ide' | 'memory' | 'office'>(initialRoute.tab);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => 
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMcpModalOpen, setIsMcpModalOpen] = useState(false);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [versionInfo, setVersionInfo] = useState<{ currentVersion: string; latestVersion: string; hasUpdate: boolean } | null>(null);
  const [mcpCount, setMcpCount] = useState(0);

  // Configurações do Sistema
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [projects, setProjects] = useState<ProjectWorkspace[]>([]);
  const [availableModels, setAvailableModels] = useState<(string | ModelOption)[]>([]);
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
      showQuotaBubble: saved !== null ? saved === 'true' : true,
      autoRouteByModelQuota: localStorage.getItem('kraken_auto_route_model') !== 'false'
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
    if (newOptions.autoRouteByModelQuota !== undefined) {
      localStorage.setItem('kraken_auto_route_model', String(newOptions.autoRouteByModelQuota));
    }
  }, []);

  // Extrai a tool ativa e subagentes locais em execução a partir da sessão ativa de chat e conversas em background
  const { localActiveTool, localSubagents } = useMemo(() => {
    let activeTool: string | null = null;
    const subagents: LocalSubagent[] = [];

    if (isLoading && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.toolCalls && lastMsg.toolCalls.length > 0) {
        for (const tc of lastMsg.toolCalls) {
          if (tc.state === 'RUNNING' || tc.state === 'ACTIVE' || !tc.state) {
            activeTool = tc.summary || tc.name || tc.command || activeTool;

            if (tc.name === 'invoke_subagent') {
              const typeName = (tc.args?.TypeName as string) || 'generic';
              const role = (tc.args?.Role as string) || 'Subagent';
              const saId = `subagent-${typeName}`;
              if (!subagents.some((s) => s.id === saId)) {
                subagents.push({
                  id: saId,
                  name: role,
                  type: typeName,
                  status: 'working',
                  action: `Executando: ${role}`,
                  currentTask: (tc.args?.Prompt as string)?.slice(0, 80),
                });
              }
            } else if (tc.name === 'swarm') {
              if (!subagents.some((s) => s.id === 'subagent-swarm')) {
                subagents.push({
                  id: 'subagent-swarm',
                  name: 'Swarm Worker',
                  type: 'swarm-worker',
                  status: 'working',
                  action: 'Executando em swarm',
                });
              }
            }
          }
        }
      }
    }

    // Também inspeciona conversas rodando em background (c.isRunning === true)
    const runningBackground = (conversations || []).filter((c) => c.isRunning && c.id !== activeConvId);
    for (const c of runningBackground) {
      if (c.messages && c.messages.length > 0) {
        const lastMsg = c.messages[c.messages.length - 1];
        if (lastMsg.toolCalls && lastMsg.toolCalls.length > 0) {
          for (const tc of lastMsg.toolCalls) {
            if (tc.state === 'RUNNING' || tc.state === 'ACTIVE' || !tc.state) {
              if (tc.name === 'invoke_subagent') {
                const typeName = (tc.args?.TypeName as string) || 'generic';
                const role = (tc.args?.Role as string) || 'Subagent';
                const saId = `subagent-${typeName}`;
                if (!subagents.some((s) => s.id === saId)) {
                  subagents.push({
                    id: saId,
                    name: role,
                    type: typeName,
                    status: 'working',
                    action: `Executando: ${role} (${c.title})`,
                    currentTask: (tc.args?.Prompt as string)?.slice(0, 80),
                  });
                }
              } else if (tc.name === 'swarm') {
                if (!subagents.some((s) => s.id === 'subagent-swarm')) {
                  subagents.push({
                    id: 'subagent-swarm',
                    name: 'Swarm Worker',
                    type: 'swarm-worker',
                    status: 'working',
                    action: `Executando em swarm (${c.title})`,
                  });
                }
              }
            }
          }
        }
      }
    }

    return { localActiveTool: activeTool, localSubagents: subagents };
  }, [isLoading, messages, conversations, activeConvId]);

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
      saveConversationsListOffline(list).catch(() => {});
    } catch (e) {
      console.warn('Erro ao carregar conversas, consultando cache offline (IndexedDB):', e);
      const cached = await getConversationsListOffline();
      if (cached.length > 0) {
        setConversations(prev => (prev.length > 0 && isOnlineRef.current ? prev : cached));
      }
    }
  }, []);

  useEffect(() => {
    const handleRequirePin = () => {
      setIsPinModalOpen(true);
    };
    window.addEventListener('kraken:require-pin', handleRequirePin);
    return () => window.removeEventListener('kraken:require-pin', handleRequirePin);
  }, []);

  const checkPinAndInit = useCallback(async () => {
    try {
      const pinStatus = await api.getPinStatus().catch(() => ({ required: false, authenticated: false }));
      if (pinStatus.required && !pinStatus.authenticated) {
        api.clearPinToken();
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
      
      const combinedModels: ModelOption[] = [];
      if (modelsData && modelsData.antigravity && Array.isArray(modelsData.antigravity)) {
        combinedModels.push(...modelsData.antigravity.map((m: ModelOption) => ({
          id: m.id,
          name: m.name || m.id,
          agent: 'antigravity'
        })));
      }
      if (modelsData && modelsData.claude && Array.isArray(modelsData.claude)) {
        combinedModels.push(...modelsData.claude.map((m: ModelOption) => ({
          id: m.id,
          name: m.name || m.id,
          agent: 'claude'
        })));
      } else if (Array.isArray(modelsData?.models)) {
        combinedModels.push(...modelsData.models.map((m: string | ModelOption) => 
          typeof m === 'string' ? { id: m, name: m, agent: 'antigravity' } : { ...m, agent: m.agent || 'antigravity' }
        ));
      }

      if (combinedModels.length > 0) {
        setAvailableModels(combinedModels);
        setOptions(prev => {
          const matched = combinedModels.find(m => m.id === prev.model && (!prev.agent || m.agent === prev.agent))
            || combinedModels.find(m => m.id === prev.model)
            || combinedModels[0];
          return {
            ...prev,
            model: matched.id,
            agent: matched.agent || prev.agent || 'antigravity'
          };
        });
      }

      // Inicia imediatamente o carregamento da conversa especificada na rota
      const loadInitialConversation = async () => {
        if (initialRoute.convId) {
          await selectConversationRef.current(initialRoute.convId, false);
        }
      };

      await Promise.all([
        loadInitialConversation(),
        refreshAuthStatus(), 
        loadConversations(),
        api.getMcpServers().then(servers => setMcpCount(servers.length)).catch(() => {}),
        api.getSystemVersion().then(v => { if (v?.success) setVersionInfo(v); }).catch(() => {})
      ]);
    } catch (err) {
      console.error('Erro na inicialização do app:', err);
    }
  }, [refreshAuthStatus, loadConversations, initialRoute.convId]);

  useEffect(() => {
    checkPinAndInit();
  }, [checkPinAndInit]);

  // Sincronização da URL do navegador (preserva a barra final canônica /chat/ para suportar gateways e recargas sem 404)
  const updateUrl = useCallback((tab: 'status' | 'whatsnext' | 'chat' | 'ide' | 'memory' | 'office', convId: string | null) => {
    if (typeof window === 'undefined') return;
    const isSubpath = window.location.pathname.startsWith('/chat');
    const basePrefix = isSubpath ? '/chat' : '';

    let newPath = basePrefix || '/';
    if (tab === 'chat') {
      newPath = convId ? `${basePrefix}/c/${convId}` : (basePrefix ? `${basePrefix}/` : '/chat');
    } else if (tab === 'status') {
      newPath = basePrefix ? `${basePrefix}/status` : '/';
    } else {
      newPath = `${basePrefix}/${tab}`;
    }

    if (window.location.pathname !== newPath) {
      if (window.location.pathname === '/chat' && newPath === '/chat/') {
        window.history.replaceState({ tab, convId }, '', newPath);
      } else {
        window.history.pushState({ tab, convId }, '', newPath);
      }
    }
  }, []);

  const handleTabChange = useCallback((newTab: 'status' | 'whatsnext' | 'chat' | 'ide' | 'memory' | 'office') => {
    setActiveTab(newTab);
    updateUrl(newTab, newTab === 'chat' ? activeConvIdRef.current : null);
  }, [updateUrl]);

  // Polling de Status da Auto-Evolução / Pod Drain
  useEffect(() => {
    let isMounted = true;
    const fetchEvoStatus = async () => {
      try {
        const data = await api.getEvolutionStatus();
        if (isMounted) {
          setEvolutionStatus(data);
        }
      } catch {
        // Ignora falhas transitórias durante o reload do servidor
      }
    };

    fetchEvoStatus();
    const isBusy = evolutionStatus?.isDraining || evolutionStatus?.status === 'draining' || evolutionStatus?.status === 'reloading';
    const interval = setInterval(fetchEvoStatus, isBusy ? 1500 : 4000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [evolutionStatus?.isDraining, evolutionStatus?.status]);

  // Tentativa de reconexão / re-acoplamento resiliente
  const attemptReconnect = useCallback(async (convId: string, targetMsgId?: string) => {
    if (!convId) return;
    try {
      const status = await api.getChatStatus(convId);
      if (!status.isRunning) {
        const sess = await api.getConversation(convId).catch(() => null);
        if (sess?.messages) {
          setMessages(sess.messages);
        }
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      await api.streamReconnect(
        convId,
        {
          onSyncSnapshot: (snapshot) => {
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant') {
                return prev.map((m, idx) => idx === prev.length - 1 ? {
                  ...m,
                  isStreaming: true,
                  text: snapshot.text || m.text,
                  thinking: snapshot.thinking || m.thinking,
                  toolCalls: snapshot.toolCalls && snapshot.toolCalls.length > 0 ? snapshot.toolCalls : m.toolCalls
                } : m);
              } else {
                return [...prev, {
                  id: targetMsgId || `assistant-${Date.now()}`,
                  role: 'assistant',
                  text: snapshot.text || '',
                  thinking: snapshot.thinking || '',
                  toolCalls: snapshot.toolCalls || [],
                  timestamp: new Date().toISOString(),
                  isStreaming: true
                }];
              }
            });
          },
          onTextDelta: (delta) => {
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant') {
                return prev.map((m, idx) => idx === prev.length - 1 ? { ...m, text: m.text + delta } : m);
              }
              return prev;
            });
          },
          onThinkingDelta: (delta) => {
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant') {
                return prev.map((m, idx) => idx === prev.length - 1 ? { ...m, thinking: (m.thinking || '') + delta } : m);
              }
              return prev;
            });
          },
          onToolUpdate: (toolUpdate) => {
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant') {
                const tools = [...(last.toolCalls || [])];
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
                return prev.map((m, idx) => idx === prev.length - 1 ? { ...m, toolCalls: tools } : m);
              }
              return prev;
            });
          },
          onDone: () => {
            setIsLoading(false);
            setMessages(prev => prev.map((m, idx) => idx === prev.length - 1 ? { ...m, isStreaming: false } : m));
            loadConversations();
          },
          onError: (err) => {
            setIsLoading(false);
            console.warn('[KrakenBridge] Erro ao reconectar stream:', err);
          },
          onConnectionDrop: () => {
            console.warn('[KrakenBridge] Queda temporária de rede detectada.');
            setTimeout(() => {
              if (activeConvIdRef.current === convId) {
                attemptReconnect(convId, targetMsgId);
              }
            }, 2000);
          }
        },
        abortControllerRef.current.signal
      );
    } catch (err) {
      console.warn('[KrakenBridge] Exceção ao tentar reconectar stream:', err);
      setIsLoading(false);
    }
  }, [loadConversations]);

  // Restauração da sessão após reinício (Pod Restabelecido)
  const handleReconnected = useCallback(async () => {
    try {
      await Promise.all([
        loadConversations(),
        refreshAuthStatus()
      ]);
      const currentConvId = activeConvIdRef.current;
      if (currentConvId) {
        const session = await api.getConversation(currentConvId).catch(() => null);
        if (session && session.messages) {
          setMessages(session.messages.map((m, idx, arr) => {
            if (session.isRunning && idx === arr.length - 1 && m.role === 'assistant') {
              return { ...m, isStreaming: true };
            }
            return m;
          }));
          setIsLoading(!!session.isRunning);
          if (session.isRunning) {
            attemptReconnect(currentConvId);
          }
        }
      }
      const updatedEvo = await api.getEvolutionStatus().catch(() => null);
      if (updatedEvo) {
        setEvolutionStatus(updatedEvo);
      }
    } catch (e) {
      console.warn('Erro ao restaurar sessão pós-reconexão:', e);
    }
  }, [loadConversations, refreshAuthStatus, attemptReconnect]);

  // Carregar mensagens da conversa ativa (com suporte a sincronização de rota e reconexão)
  const selectConversation = useCallback(async (id: string, shouldPush = true) => {
    setActiveTab('chat');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setActiveConvId(id);
    activeConvIdRef.current = id;
    if (shouldPush) {
      updateUrl('chat', id);
    }
    setIsLoading(true);
    try {
      const session = isOnlineRef.current ? await api.getConversation(id) : null;
      if (session && session.messages) {
        saveConversationSessionOffline(session).catch(() => {});
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

        if (session.isRunning) {
          attemptReconnect(id);
        }
      } else {
        const cachedSession = await getConversationSessionOffline(id);
        if (cachedSession && cachedSession.messages) {
          setMessages(cachedSession.messages.map(m => ({ ...m, isStreaming: false })));
          setIsLoading(false);
          setOptions(prev => ({
            ...prev,
            model: cachedSession.model || prev.model,
            subproject: cachedSession.subproject || '',
            chatMode: cachedSession.chatMode || prev.chatMode || 'agent',
            accountEmail: cachedSession.accountEmail || undefined
          }));
        } else {
          setMessages([]);
          setIsLoading(false);
        }
      }
    } catch (err) {
      console.warn('Erro ao buscar conversa na API, tentando cache offline (IndexedDB):', err);
      const cachedSession = await getConversationSessionOffline(id);
      if (cachedSession && cachedSession.messages) {
        setMessages(cachedSession.messages.map(m => ({ ...m, isStreaming: false })));
        setIsLoading(false);
        setOptions(prev => ({
          ...prev,
          model: cachedSession.model || prev.model,
          subproject: cachedSession.subproject || '',
          chatMode: cachedSession.chatMode || prev.chatMode || 'agent',
          accountEmail: cachedSession.accountEmail || undefined
        }));
      } else {
        setMessages([]);
        setIsLoading(false);
      }
    }
  }, [updateUrl, attemptReconnect]);

  const selectConversationRef = useRef(selectConversation);
  useEffect(() => {
    selectConversationRef.current = selectConversation;
  }, [selectConversation]);

  // Escuta botões Voltar / Avançar do navegador para navegação natural
  useEffect(() => {
    const handlePopState = () => {
      const current = getInitialRoute();
      setActiveTab(current.tab);
      setActiveConvId(current.convId);
      activeConvIdRef.current = current.convId;
      if (current.convId) {
        selectConversationRef.current(current.convId, false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveTab('chat');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setActiveConvId(null);
    activeConvIdRef.current = null;
    updateUrl('chat', null);
    setMessages([]);
    setPrompt('');
    setIsLoading(false);
  }, [updateUrl]);

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
      deleteConversationOffline(id).catch(() => {});
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

  // Conversa ativa selecionada
  const activeConversation = useMemo(() => {
    return conversations.find(c => c.id === activeConvId);
  }, [conversations, activeConvId]);

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
              updateUrl('chat', data.conversation_id);
            }
            if (data.subproject) {
              setOptions(prev => ({ ...prev, subproject: data.subproject || prev.subproject }));
            }
            if (data.tags) {
              setConversations(prev => prev.map(c => c.id === data.conversation_id ? { ...c, tags: data.tags } : c));
            }
            loadConversations();
          },
          onConnectionDrop: () => {
            console.warn('[KrakenBridge] Queda de conexão SSE durante geração. Tentando re-acoplar...');
            setTimeout(() => {
              if (activeConvIdRef.current) {
                attemptReconnect(activeConvIdRef.current, streamingId);
              }
            }, 1500);
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
      console.warn('[KrakenBridge] Queda de rede no streaming SSE. Mantendo sessão ativa e acionando reconexão resiliente:', err);
      // Mantém isLoading ativo para o polling de segundo plano e tenta reconectar imediatamente
      if (activeConvIdRef.current) {
        attemptReconnect(activeConvIdRef.current, streamingId);
      }
    }
  }, [loadConversations, dispatchNextQueueItem, updateUrl, attemptReconnect]);

  useEffect(() => {
    executeTurnRef.current = executeTurn;
  }, [executeTurn]);

  // Persiste automaticamente no IndexedDB o snapshot atualizado da conversa ativa após cada turno
  useEffect(() => {
    if (!activeConvId || messages.length === 0 || isLoading) return;
    const nowIso = new Date().toISOString();
    const meta = conversations.find(c => c.id === activeConvId);
    const firstUserMsg = messages.find(m => m.role === 'user')?.text;
    saveConversationSessionOffline({
      id: activeConvId,
      title: meta?.title || (firstUserMsg ? firstUserMsg.slice(0, 60) : 'Conversa Recente'),
      createdAt: meta?.createdAt || messages[0]?.timestamp || nowIso,
      updatedAt: meta?.updatedAt || messages[messages.length - 1]?.timestamp || nowIso,
      messageCount: messages.length,
      agent: meta?.agent || options.agent,
      model: meta?.model || options.model,
      subproject: meta?.subproject ?? options.subproject,
      tags: meta?.tags,
      chatMode: meta?.chatMode || options.chatMode,
      accountEmail: meta?.accountEmail || options.accountEmail,
      messages
    }).catch(() => {});
  }, [activeConvId, messages, isLoading, conversations, options.agent, options.model, options.subproject, options.chatMode, options.accountEmail]);

  // Sincronização automática ao retornar para a aba (visibilitychange) ou restabelecer conexão (online)
  useEffect(() => {
    const handleSyncOnVisibleOrOnline = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (!isOnlineRef.current) return;

      loadConversations();

      const currentConvId = activeConvIdRef.current;
      if (!currentConvId) return;

      try {
        const status = await api.getChatStatus(currentConvId).catch(() => null);
        if (!status) return;

        if (status.isRunning) {
          // Se o agente ainda estiver rodando no backend e não estivermos com stream ativa conectada, reconecta
          if (!abortControllerRef.current) {
            console.log(`[KrakenBridge] Retomando reconexão da conversa ${currentConvId} após foco na aba.`);
            attemptReconnect(currentConvId);
          }
        } else {
          // Se já finalizou em segundo plano, atualiza as mensagens com o resultado definitivo
          const session = await api.getConversation(currentConvId).catch(() => null);
          if (session?.messages) {
            setMessages(session.messages);
            setIsLoading(false);
          }
        }
      } catch (err) {
        console.warn('[KrakenBridge] Erro ao sincronizar estado após foco/online:', err);
      }
    };

    document.addEventListener('visibilitychange', handleSyncOnVisibleOrOnline);
    window.addEventListener('online', handleSyncOnVisibleOrOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleSyncOnVisibleOrOnline);
      window.removeEventListener('online', handleSyncOnVisibleOrOnline);
    };
  }, [attemptReconnect, loadConversations]);

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
    if (!isOnlineRef.current) return;
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
    if (!isOnlineRef.current) return;
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

  // Handlers para o Dashboard What's Next & Central de Revisão
  const handleResolveIssue = useCallback(async (data: { conversationId: string; subproject: string; suggestedPrompt: string }) => {
    await loadConversations();
    await selectConversation(data.conversationId);
    if (data.suggestedPrompt) {
      executeTurn(data.suggestedPrompt, { subproject: data.subproject });
    }
  }, [loadConversations, selectConversation, executeTurn]);

  const handleReviewPr = useCallback(async (data: { conversationId: string; subproject?: string; suggestedPrompt: string }) => {
    await loadConversations();
    await selectConversation(data.conversationId);
    if (data.suggestedPrompt) {
      executeTurn(data.suggestedPrompt, { subproject: data.subproject });
    }
  }, [loadConversations, selectConversation, executeTurn]);

  const handleOpenConversation = useCallback(async (conversationId: string) => {
    await selectConversation(conversationId);
  }, [selectConversation]);

  const handleStartSetupChat = useCallback(async (data: { conversationId: string; suggestedPrompt: string }) => {
    await loadConversations();
    await selectConversation(data.conversationId);
    if (data.suggestedPrompt) {
      executeTurn(data.suggestedPrompt);
    }
  }, [loadConversations, selectConversation, executeTurn]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-base-100 text-base-content font-sans">
      <AndroidStatusBar />
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
      <div className="flex-1 flex flex-col h-full min-w-0 min-h-0 overflow-hidden">
        {/* Barra Superior */}
        <Header
          activeTab={activeTab}
          onTabChange={handleTabChange}
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
          onOpenNotifications={() => setIsNotificationsModalOpen(true)}
          onOpenUpdate={() => setIsUpdateModalOpen(true)}
          hasUpdate={versionInfo?.hasUpdate}
          systemVersion={versionInfo ? `v${versionInfo.currentVersion}` : undefined}
        />

        {/* Barra de Opções do Antigravity CLI */}
        <OptionsBar
          options={options}
          availableModels={availableModels}
          accounts={accounts}
          onChange={handleUpdateOptions}
          isOpen={isOptionsOpen}
        />

        {/* Banner de Conectividade PWA (Offline / Reconectado) */}
        <OfflineBanner
          isOnline={isOnline}
          wasOffline={wasOffline}
          cachedConversationsCount={conversations.length}
          onDismissReconnected={dismissReconnectedNotice}
        />

        {/* Banner de Pod Drain visível em abas que não sejam o chat */}
        {activeTab !== 'chat' && (evolutionStatus?.isDraining || evolutionStatus?.status === 'draining') && (
          <div className="px-4 pt-3">
            <PodDrainBanner status={evolutionStatus} />
          </div>
        )}

        {/* Visão de Status vs Office vs What's Next vs Chat vs IDE */}
        {activeTab === 'status' ? (
          <StatusView
            conversations={conversations}
            projects={projects}
            workspaceDir={workspaceDir}
            onSelectConversation={selectConversation}
            onNewChatInProject={handleNewChatInProject}
            onNewChat={handleNewChat}
            onStartSetupChat={handleStartSetupChat}
          />
        ) : activeTab === 'office' ? (
          <OfficeView
            localActiveTool={localActiveTool}
            localSubagents={localSubagents}
            conversations={conversations}
            isLoading={isLoading}
            activeConversationTitle={activeConversation?.title || null}
            onFocusChat={() => handleTabChange('chat')}
          />
        ) : activeTab === 'whatsnext' ? (
          <WhatsNextView
            onResolveIssue={handleResolveIssue}
            onReviewPr={handleReviewPr}
            onOpenConversation={handleOpenConversation}
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
            isOnline={isOnline}
            isDraining={evolutionStatus?.isDraining || evolutionStatus?.status === 'draining'}
            evolutionStatus={evolutionStatus}
            onSelectSuggestion={(sug) => setPrompt(sug)}
            onQuickAction={(actionPrompt) => {
              if (!isOnlineRef.current) return;
              if (isLoading) return;
              setPrompt('');
              executeTurn(actionPrompt);
            }}
            currentModel={options.model}
            currentAgent={options.agent}
            availableModels={availableModels}
            onModelChange={(model, agent) => handleUpdateOptions({ ...options, model, agent: agent || options.agent })}
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
            tags={activeConversation?.tags || []}
            conversationId={activeConvId || activeConversation?.id}
            chatMode={options.chatMode || 'agent'}
            onChatModeChange={(chatMode) => handleUpdateOptions({ ...options, chatMode })}
            codeServerPort={codeServerPort}
          />
        ) : activeTab === 'memory' ? (
          <MemoryView />
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

      {/* Modal de Notificações Móveis e PWA */}
      <NotificationsModal
        isOpen={isNotificationsModalOpen}
        onClose={() => setIsNotificationsModalOpen(false)}
      />

      {/* Modal de Gestão de Versões e Atualizações (Issue #64) */}
      <SystemUpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => {
          setIsUpdateModalOpen(false);
          api.getSystemVersion().then(v => { if (v?.success) setVersionInfo(v); }).catch(() => {});
        }}
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
        onSuccess={() => {
          setIsPinModalOpen(false);
          checkPinAndInit();
          loadConversations();
        }}
      />

      {/* Balão com Contagem Regressiva e Auto-Reconnect do Pod Drain / Self-Reload */}
      <PodDrainReloadBubble
        status={evolutionStatus}
        onReconnected={handleReconnected}
      />
    </div>
  );
};

export default App;
