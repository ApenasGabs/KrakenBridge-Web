import React, { useRef, useEffect, useState, useCallback } from 'react';
import type {
  ModelOption,
  SlashCommand,
  EvolutionStatus,
  RefinePromptPayload,
  RefinePromptResponse,
  RefineProvider,
  MultiAccountQuotaOverview
} from '../../types';
import { api } from '../../services/api';
import { 
  Plus, 
  ChevronUp, 
  Mic, 
  MicOff, 
  ArrowRight, 
  Square, 
  Check, 
  Sparkles,
  Boxes,
  Compass,
  Command as CommandIcon,
  HelpCircle,
  Clock,
  Globe,
  BrainCircuit,
  Users,
  BookOpen,
  ListPlus,
  Zap,
  MessageSquare,
  Lock,
  Loader2,
  RotateCcw,
  Undo2,
  Pencil,
  X,
  ShieldAlert
} from 'lucide-react';

const MIN_REFINE_CHARS = 10;

function formatRefineProvider(provider: RefineProvider): string {
  switch (provider) {
    case 'groq':
      return 'Groq';
    case 'aistudio':
      return 'AI Studio';
    case 'agy':
      return 'agy CLI';
    default:
      return provider;
  }
}

function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0ms';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

interface ChatInputProps {
  prompt: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onForceSubmit?: () => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
  isDraining?: boolean;
  evolutionStatus?: EvolutionStatus | null;
  currentModel?: string;
  availableModels?: (string | ModelOption)[];
  onModelChange?: (model: string) => void;
  onOpenMcpModal?: () => void;
  queuedCount?: number;
  chatMode?: 'agent' | 'chat';
  onChatModeChange?: (mode: 'agent' | 'chat') => void;
  project?: string;
  recentMessages?: string[];
  onRefinePrompt?: (payload: RefinePromptPayload, signal?: AbortSignal) => Promise<RefinePromptResponse>;
}

// Catálogo oficial de comandos de barra do Antigravity
const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: '/plan',
    title: 'Planejamento Estruturado',
    description: 'Planeja passo a passo a execução técnica antes de modificar código.',
    category: 'workflow'
  },
  {
    command: '/goal',
    title: 'Modo Meta Autônoma',
    description: 'Executa ciclos contínuos com máxima dedicação até alcançar o objetivo.',
    category: 'mode'
  },
  {
    command: '/browser',
    title: 'Automação & Navegação Web',
    description: 'Usa ferramentas de navegador Chrome para testar e interagir com páginas.',
    category: 'workflow'
  },
  {
    command: '/schedule',
    title: 'Agendamento / Timer',
    description: 'Agenda lembretes ou execuções cron recorrentes em segundo plano.',
    category: 'system'
  },
  {
    command: '/grill-me',
    title: 'Entrevista de Requisitos',
    description: 'O agente faz perguntas cirúrgicas para alinhar decisões de arquitetura.',
    category: 'workflow'
  },
  {
    command: '/teamwork-preview',
    title: 'Equipe de Subagentes',
    description: 'Delega subtarefas em paralelo para agentes e pesquisadores autônomos.',
    category: 'mode'
  },
  {
    command: '/learn',
    title: 'Aprender & Salvar Regras',
    description: 'Ensina o agente novas regras e instruções persistentes para a codebase.',
    category: 'system'
  },
  {
    command: '/boost',
    title: 'Raciocínio Profundo (Boost)',
    description: 'Ativa reflexão rigorosa com múltiplas perspectivas e validações.',
    category: 'mode'
  },
  {
    command: '/mcp',
    title: 'Servidores MCP',
    description: 'Abre o painel de ferramentas e servidores Model Context Protocol.',
    category: 'system'
  },
  {
    command: '/help',
    title: 'Ajuda & Comandos',
    description: 'Exibe a lista de comandos e atalhos disponíveis no Antigravity.',
    category: 'system'
  }
];

// Ícone contextual por comando
function getCommandIcon(cmd: string) {
  switch (cmd) {
    case '/plan': return <Compass className="w-3.5 h-3.5 text-primary" />;
    case '/goal': return <Sparkles className="w-3.5 h-3.5 text-warning" />;
    case '/browser': return <Globe className="w-3.5 h-3.5 text-info" />;
    case '/schedule': return <Clock className="w-3.5 h-3.5 text-secondary" />;
    case '/grill-me': return <HelpCircle className="w-3.5 h-3.5 text-accent" />;
    case '/teamwork-preview': return <Users className="w-3.5 h-3.5 text-success" />;
    case '/learn': return <BookOpen className="w-3.5 h-3.5 text-info" />;
    case '/boost': return <BrainCircuit className="w-3.5 h-3.5 text-primary" />;
    case '/mcp': return <Boxes className="w-3.5 h-3.5 text-emerald-400" />;
    default: return <CommandIcon className="w-3.5 h-3.5 text-base-content/60" />;
  }
}

// Formata IDs de modelo em títulos legíveis elegantes
function formatModelName(modelId?: string): string {
  if (!modelId) return 'Gemini 3.8 Flash High';
  
  const map: Record<string, string> = {
    'gemini-3.8-flash-high': 'Gemini 3.8 Flash High',
    'gemini-3.8-flash-medium': 'Gemini 3.8 Flash Medium',
    'gemini-3.8-flash-low': 'Gemini 3.8 Flash Low',
    'gemini-3.7-flash-high': 'Gemini 3.7 Flash High',
    'gemini-3.7-flash-medium': 'Gemini 3.7 Flash Medium',
    'gemini-3.7-flash-low': 'Gemini 3.7 Flash Low',
    'gemini-3.6-flash-high': 'Gemini 3.6 Flash High',
    'gemini-3.1-pro-high': 'Gemini 3.1 Pro High',
    'gemini-3.1-pro-low': 'Gemini 3.1 Pro Low',
    'claude-opus-5-5-high': 'Claude Opus 5.5 High',
    'claude-opus-5-5-medium': 'Claude Opus 5.5 Medium',
    'claude-sonnet-5-5-high': 'Claude Sonnet 5.5 High',
    'claude-sonnet-5-5-medium': 'Claude Sonnet 5.5 Medium',
    'gpt-oss-120b-medium': 'GPT-OSS 120B Medium'
  };

  if (map[modelId]) return map[modelId];

  return modelId
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Formato ultracompacto para telas mobile
function formatShortModelName(modelId?: string): string {
  if (!modelId) return '3.8 Flash';
  return modelId
    .replace('gemini-', '')
    .replace('claude-', '')
    .replace('gpt-', '')
    .replace('-high', '')
    .replace('-medium', '')
    .replace('-low', '');
}

// Interface para TypeScript reconhecer a Web Speech API
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    [key: number]: {
      [key: number]: {
        transcript: string;
      };
      isFinal: boolean;
    };
    length: number;
  };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  prompt,
  onChange,
  onSubmit,
  onForceSubmit,
  onStop,
  isLoading,
  disabled,
  isDraining = false,
  evolutionStatus = null,
  currentModel = 'gemini-3.8-flash-high',
  availableModels = [],
  onModelChange,
  onOpenMcpModal,
  queuedCount = 0,
  chatMode = 'agent',
  onChatModeChange,
  project,
  recentMessages,
  onRefinePrompt
}) => {
  const isPodDraining = isDraining || evolutionStatus?.isDraining || evolutionStatus?.status === 'draining';
  const isReloading = evolutionStatus?.status === 'reloading';
  const isSystemBusyWithEvolution = isPodDraining || isReloading;
  const effectiveDisabled = disabled || isSystemBusyWithEvolution;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const initialTextRef = useRef<string>('');

  // Estados do Roteamento Inteligente por Cota e Multi-Contas
  const [quotaOverview, setQuotaOverview] = useState<MultiAccountQuotaOverview | null>(null);
  const [autoRouteEnabled, setAutoRouteEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('kraken_auto_route_model');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [isRoutingModel, setIsRoutingModel] = useState(false);
  const [routingNotice, setRoutingNotice] = useState<{ message: string; type: 'success' | 'warning' | 'info' } | null>(null);

  const toggleAutoRoute = (enabled: boolean) => {
    setAutoRouteEnabled(enabled);
    try {
      localStorage.setItem('kraken_auto_route_model', String(enabled));
    } catch {}
  };

  const fetchQuotaOverview = useCallback(async (force = false) => {
    try {
      const data = await api.getMultiAccountQuotaOverview(force);
      setQuotaOverview(data);
    } catch (e) {
      console.warn('[ChatInput] Falha ao carregar visão multi-contas de cota:', e);
    }
  }, []);

  useEffect(() => {
    if (isModelMenuOpen) {
      fetchQuotaOverview();
    }
  }, [isModelMenuOpen, fetchQuotaOverview]);

  // Limpa toast de roteamento após 5 segundos
  useEffect(() => {
    if (routingNotice) {
      const t = setTimeout(() => setRoutingNotice(null), 5500);
      return () => clearTimeout(t);
    }
  }, [routingNotice]);

  const handleSelectModelWithRouting = async (modelId: string) => {
    if (!autoRouteEnabled) {
      onModelChange?.(modelId);
      setIsModelMenuOpen(false);
      return;
    }

    const quotaInfo = quotaOverview?.modelQuotaMap?.[modelId];
    if (quotaInfo?.isBlocked) {
      setRoutingNotice({
        message: `⚠️ Atenção: Cota esgotada em todas as contas (< 5%) para ${formatModelName(modelId)}.`,
        type: 'warning'
      });
      onModelChange?.(modelId);
      setIsModelMenuOpen(false);
      return;
    }

    try {
      setIsRoutingModel(true);
      const res = await api.routeByModel(modelId, 5);
      onModelChange?.(modelId);
      setIsModelMenuOpen(false);

      if (res.switched) {
        setRoutingNotice({
          message: `✨ Roteamento por Cota: alternado automaticamente para ${res.accountName} (${res.remainingQuota}% disponível).`,
          type: 'success'
        });
      } else if (res.isBlocked) {
        setRoutingNotice({
          message: `⚠️ Cota crítica ou esgotada para ${formatModelName(modelId)} em todas as contas (< 5%).`,
          type: 'warning'
        });
      }
      fetchQuotaOverview(true);
    } catch (err) {
      console.warn('[ChatInput] Falha no roteamento automático por modelo:', err);
      onModelChange?.(modelId);
      setIsModelMenuOpen(false);
    } finally {
      setIsRoutingModel(false);
    }
  };

  // Estados do Pré-Refinador de Prompt (100% sob demanda, nunca automático ao digitar)
  const [isRefining, setIsRefining] = useState(false);
  const [refineHint, setRefineHint] = useState('Refinando via Groq...');
  const [refineError, setRefineError] = useState<string | null>(null);
  const [refineSuggestion, setRefineSuggestion] = useState<RefinePromptResponse | null>(null);
  const [refineSourceDraft, setRefineSourceDraft] = useState<string>('');
  const [undoDraft, setUndoDraft] = useState<string | null>(null);
  const refineInFlightRef = useRef(false);
  const refineAbortRef = useRef<AbortController | null>(null);
  const fallbackHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refineCardRef = useRef<HTMLDivElement | null>(null);

  const isPureSlashCommand = prompt.trimStart().startsWith('/') && !prompt.trimStart().includes(' ');
  const canRefine = !effectiveDisabled && !isRefining && !isPureSlashCommand && prompt.trim().length >= MIN_REFINE_CHARS;

  const clearFallbackTimer = useCallback(() => {
    if (fallbackHintTimerRef.current) {
      clearTimeout(fallbackHintTimerRef.current);
      fallbackHintTimerRef.current = null;
    }
  }, []);

  const handleCancelRefine = useCallback(() => {
    clearFallbackTimer();
    if (refineAbortRef.current) {
      refineAbortRef.current.abort();
      refineAbortRef.current = null;
    }
    refineInFlightRef.current = false;
    setIsRefining(false);
  }, [clearFallbackTimer]);

  // Cancela eventual refinamento pendente ao desmontar
  useEffect(() => {
    return () => {
      clearFallbackTimer();
      refineAbortRef.current?.abort();
    };
  }, [clearFallbackTimer]);

  const triggerRefine = useCallback(async (draftOverride?: string) => {
    // Lock síncrono: impede requisições paralelas em duplo clique
    if (refineInFlightRef.current || effectiveDisabled) return;

    const targetDraft = (draftOverride ?? prompt).trim();
    if (targetDraft.length < MIN_REFINE_CHARS) return;

    refineInFlightRef.current = true;
    setRefineError(null);
    setRefineSuggestion(null);
    setRefineSourceDraft(draftOverride ?? prompt);
    setIsRefining(true);
    setRefineHint('Refinando via Groq...');

    const controller = new AbortController();
    refineAbortRef.current = controller;

    clearFallbackTimer();
    fallbackHintTimerRef.current = setTimeout(() => {
      setRefineHint('Tentando fallback (AI Studio / agy ~15s)...');
    }, 2500);

    try {
      const refineFn = onRefinePrompt ?? api.refinePrompt;
      const result = await refineFn(
        {
          draft: targetDraft,
          chatMode,
          project: project || undefined,
          recentMessages
        },
        controller.signal
      );

      if (controller.signal.aborted) return;
      setRefineSuggestion(result);
      requestAnimationFrame(() => {
        refineCardRef.current?.focus();
      });
    } catch (err) {
      if (controller.signal.aborted || (err as Error)?.name === 'AbortError') {
        return;
      }
      setRefineError((err as Error)?.message || 'Não foi possível refinar o prompt.');
    } finally {
      clearFallbackTimer();
      if (refineAbortRef.current === controller) {
        refineAbortRef.current = null;
      }
      refineInFlightRef.current = false;
      setIsRefining(false);
    }
  }, [
    effectiveDisabled,
    prompt,
    clearFallbackTimer,
    onRefinePrompt,
    chatMode,
    project,
    recentMessages
  ]);

  const handleReplaceWithRefined = useCallback(() => {
    if (!refineSuggestion) return;
    setUndoDraft(refineSourceDraft || prompt);
    onChange(refineSuggestion.refined);
    setRefineSuggestion(null);
    setRefineError(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [refineSuggestion, refineSourceDraft, prompt, onChange]);

  const handleEditRefined = useCallback(() => {
    if (!refineSuggestion) return;
    const nextText = refineSuggestion.refined;
    setUndoDraft(refineSourceDraft || prompt);
    onChange(nextText);
    setRefineSuggestion(null);
    setRefineError(null);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextText.length, nextText.length);
      }
    });
  }, [refineSuggestion, refineSourceDraft, prompt, onChange]);

  const handleDiscardRefined = useCallback(() => {
    setRefineSuggestion(null);
    setRefineError(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, []);

  const handleUndoRefine = useCallback(() => {
    if (undoDraft === null) return;
    onChange(undoDraft);
    setUndoDraft(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [undoDraft, onChange]);

  // Esc global fecha o card de sugestão ou cancela refinamento em voo
  useEffect(() => {
    if (!refineSuggestion && !isRefining) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isRefining) {
          handleCancelRefine();
        } else if (refineSuggestion) {
          handleDiscardRefined();
        }
      }
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [refineSuggestion, isRefining, handleCancelRefine, handleDiscardRefined]);

  // Estados do IntelliSense de Comandos (/slash)
  const [isSlashOpen, setIsSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Lista padronizada de modelos
  const defaultModels: ModelOption[] = [
    { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash High' },
    { id: 'gemini-3.8-flash-medium', name: 'Gemini 3.8 Flash Medium' },
    { id: 'gemini-3.7-flash-high', name: 'Gemini 3.7 Flash High' },
    { id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro High' },
    { id: 'claude-opus-5-5-high', name: 'Claude Opus 5.5 High' },
    { id: 'claude-sonnet-5-5-high', name: 'Claude Sonnet 5.5 High' },
    { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B Medium' }
  ];

  const modelsList: ModelOption[] = availableModels.length > 0
    ? availableModels.map(m => typeof m === 'string' ? { id: m, name: formatModelName(m) } : m)
    : defaultModels;

  // Filtragem dos comandos para o IntelliSense
  const filteredCommands = SLASH_COMMANDS.filter(cmd => 
    cmd.command.toLowerCase().includes(slashFilter.toLowerCase()) ||
    cmd.title.toLowerCase().includes(slashFilter.toLowerCase()) ||
    cmd.description.toLowerCase().includes(slashFilter.toLowerCase())
  );

  // Auto-resize do textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [prompt]);

  // Detecta se o prompt inicia com / para acionar o IntelliSense
  useEffect(() => {
    const trimmed = prompt.trimStart();
    if (trimmed.startsWith('/') && !trimmed.includes(' ')) {
      setIsSlashOpen(true);
      setSlashFilter(trimmed);
      setSelectedIndex(0);
    } else {
      setIsSlashOpen(false);
    }
  }, [prompt]);

  // Fechar menus ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.model-dropdown-container')) {
        setIsModelMenuOpen(false);
      }
      if (!target.closest('.slash-intellisense-container') && !target.closest('textarea')) {
        setIsSlashOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Selecionar um comando do IntelliSense
  const handleSelectCommand = useCallback((cmd: SlashCommand) => {
    if (cmd.command === '/mcp') {
      setIsSlashOpen(false);
      onOpenMcpModal?.();
      return;
    }
    onChange(`${cmd.command} `);
    setIsSlashOpen(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [onChange, onOpenMcpModal]);

  // Teclas no Textarea (Suporte a Navegação de IntelliSense + Enter)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isSlashOpen && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        const selected = filteredCommands[selectedIndex];
        if (selected) {
          handleSelectCommand(selected);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsSlashOpen(false);
        return;
      }
    }

    // Atalho sob demanda para refinar prompt: Ctrl+Shift+R (ou Cmd+Shift+R)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      if (canRefine) {
        triggerRefine();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (prompt.trim() && !effectiveDisabled) {
        if (isListening) stopListening();
        setUndoDraft(null);
        setRefineSuggestion(null);
        if (onForceSubmit) {
          onForceSubmit();
        } else {
          onSubmit();
        }
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (prompt.trim() && !effectiveDisabled) {
        if (isListening) stopListening();
        setUndoDraft(null);
        setRefineSuggestion(null);
        onSubmit();
      }
    }
  };

  // Gerenciamento do Microfone (Speech Recognition)
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignora se já parou
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const startListening = () => {
    setSpeechError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setSpeechError('Reconhecimento de voz não suportado neste navegador. Use o Chrome ou Edge.');
      setTimeout(() => setSpeechError(null), 4000);
      return;
    }

    try {
      const recognition: SpeechRecognitionInstance = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'pt-BR';

      initialTextRef.current = prompt ? (prompt.trim() + ' ') : '';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }

        const newPrompt = initialTextRef.current + transcript;
        onChange(newPrompt);
      };

      recognition.onerror = (event: { error: string }) => {
        console.warn('Erro no microfone:', event.error);
        if (event.error === 'not-allowed') {
          setSpeechError('Permissão para uso do microfone foi negada no navegador.');
        } else {
          setSpeechError(`Erro no microfone: ${event.error}`);
        }
        stopListening();
        setTimeout(() => setSpeechError(null), 4000);
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.error('Falha ao iniciar reconhecimento de voz:', err);
      setSpeechError('Não foi possível iniciar o microfone.');
      setIsListening(false);
      setTimeout(() => setSpeechError(null), 4000);
    }
  };

  const toggleMic = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <div className="p-4 bg-base-100 border-t border-base-300 relative">
      <div className="max-w-4xl mx-auto relative">
        
        {/* Banner de aviso do microfone, se houver erro */}
        {speechError && (
          <div className="mb-2 text-xs text-error bg-error/10 border border-error/30 rounded-lg px-3 py-1.5 flex items-center justify-between animate-in fade-in">
            <span>{speechError}</span>
            <button onClick={() => setSpeechError(null)} className="btn btn-ghost btn-xs">×</button>
          </div>
        )}

        {/* Banner de notificação do Roteamento Inteligente por Cota */}
        {routingNotice && (
          <div
            data-testid="quota-routing-notice"
            role="status"
            aria-live="polite"
            className={`mb-2.5 rounded-xl border px-3 py-2 text-xs flex items-center justify-between gap-2 animate-in fade-in ${
              routingNotice.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Zap className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium truncate">{routingNotice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setRoutingNotice(null)}
              className="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Banner de progresso durante o refinamento sob demanda */}
        {isRefining && (
          <div
            data-testid="refine-loading-banner"
            role="status"
            aria-live="polite"
            className="mb-2.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs flex items-center justify-between gap-2 animate-in fade-in"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
              <span className="font-medium text-base-content/90 truncate">{refineHint}</span>
            </div>
            <button
              data-testid="refine-cancel-btn"
              type="button"
              onClick={handleCancelRefine}
              aria-label="Cancelar refinamento"
              className="btn btn-ghost btn-xs text-base-content/70 hover:text-error gap-1 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancelar</span>
            </button>
          </div>
        )}

        {/* Banner de erro do refinador (sem retry automático) */}
        {refineError && !isRefining && (
          <div
            data-testid="refine-error-banner"
            role="alert"
            className="mb-2.5 text-xs text-error bg-error/10 border border-error/30 rounded-xl px-3 py-2 flex items-center justify-between gap-2 animate-in fade-in"
          >
            <span className="min-w-0 break-words">{refineError}</span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                data-testid="refine-retry-btn"
                type="button"
                onClick={() => triggerRefine(refineSourceDraft || prompt)}
                className="btn btn-ghost btn-xs text-error hover:bg-error/15 gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Tentar</span>
              </button>
              <button
                type="button"
                onClick={() => setRefineError(null)}
                aria-label="Fechar erro de refinamento"
                className="btn btn-ghost btn-xs"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Card de Sugestão do Prompt Refinado (nunca envia automaticamente) */}
        {refineSuggestion && !isRefining && (
          <div
            ref={refineCardRef}
            data-testid="refine-suggestion-card"
            role="region"
            aria-label="Sugestão de prompt refinado"
            tabIndex={-1}
            className="mb-2.5 rounded-2xl border border-primary/35 bg-base-200/95 backdrop-blur-md p-3 shadow-lg outline-none animate-in fade-in slide-in-from-bottom-1 duration-150"
          >
            <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 mb-2 border-b border-base-300/60">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-xs font-semibold text-base-content">Sugestão refinada</span>
                <span
                  data-testid="refine-provider-badge"
                  className="badge badge-xs sm:badge-sm bg-primary/15 text-primary border-primary/30 font-mono"
                >
                  {formatRefineProvider(refineSuggestion.provider)} • {formatLatency(refineSuggestion.latencyMs)}
                </span>
                {(refineSuggestion.maskedSecretsCount ?? 0) > 0 && (
                  <span
                    data-testid="refine-secret-badge"
                    className="badge badge-xs sm:badge-sm bg-warning/15 text-warning border-warning/30 gap-1"
                    title="Segredos aparentes foram mascarados antes do envio ao provedor"
                  >
                    <ShieldAlert className="w-2.5 h-2.5" />
                    Segredo mascarado
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleDiscardRefined}
                aria-label="Fechar sugestão (Esc)"
                title="Descartar sugestão (Esc)"
                className="btn btn-ghost btn-xs btn-circle text-base-content/50 hover:text-base-content"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {refineSuggestion.skills && refineSuggestion.skills.length > 0 && (
              <div
                data-testid="refine-skills-list"
                className="flex items-center gap-1 flex-wrap mb-2 text-[11px]"
              >
                <span className="text-base-content/60 font-medium">Skills:</span>
                {refineSuggestion.skills.map((skill) => (
                  <span
                    key={skill}
                    className="px-1.5 py-0.5 rounded-md bg-base-300/80 text-emerald-400 font-mono text-[10px]"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}

            <div
              data-testid="refine-suggestion-text"
              className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words text-xs sm:text-sm leading-relaxed text-base-content/95 bg-base-100/85 rounded-xl p-2.5 border border-base-300/60"
            >
              {refineSuggestion.refined}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  data-testid="refine-replace-btn"
                  type="button"
                  onClick={handleReplaceWithRefined}
                  className="btn btn-primary btn-xs sm:btn-sm gap-1 rounded-lg"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Substituir</span>
                </button>
                <button
                  data-testid="refine-edit-btn"
                  type="button"
                  onClick={handleEditRefined}
                  className="btn btn-ghost bg-base-300/60 hover:bg-base-300 btn-xs sm:btn-sm gap-1 rounded-lg"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Editar antes</span>
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  data-testid="refine-regenerate-btn"
                  type="button"
                  onClick={() => triggerRefine(refineSourceDraft || prompt)}
                  className="btn btn-ghost btn-xs sm:btn-sm gap-1 rounded-lg text-base-content/75 hover:text-primary"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Gerar de novo</span>
                </button>
                <button
                  data-testid="refine-discard-btn"
                  type="button"
                  onClick={handleDiscardRefined}
                  className="btn btn-ghost btn-xs sm:btn-sm rounded-lg text-base-content/60 hover:text-error"
                >
                  <span>Descartar</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pílula reversível para desfazer a substituição do prompt */}
        {undoDraft !== null && !refineSuggestion && !isRefining && (
          <div
            data-testid="refine-undo-banner"
            className="mb-2 px-3 py-1.5 rounded-xl bg-base-200/80 border border-base-300/80 text-xs flex items-center justify-between gap-2 animate-in fade-in"
          >
            <span className="text-base-content/70 truncate">Prompt substituído pela versão refinada.</span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                data-testid="refine-undo-btn"
                type="button"
                onClick={handleUndoRefine}
                className="btn btn-ghost btn-xs text-primary gap-1"
              >
                <Undo2 className="w-3 h-3" />
                <span>Desfazer</span>
              </button>
              <button
                type="button"
                onClick={() => setUndoDraft(null)}
                aria-label="Ocultar aviso de desfazer"
                className="btn btn-ghost btn-xs text-base-content/50"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* POPUP INTELLISENSE DE COMANDOS /SLASH */}
        {isSlashOpen && filteredCommands.length > 0 && (
          <div className="slash-intellisense-container absolute bottom-full mb-3 left-0 z-50 w-full sm:w-96 max-w-[calc(100vw-2rem)] rounded-2xl bg-base-100/98 backdrop-blur-xl border border-base-300 shadow-2xl p-2 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-base-content/50 uppercase flex items-center justify-between border-b border-base-200 mb-1.5">
              <span className="flex items-center gap-1.5">
                <CommandIcon className="w-3 h-3 text-primary" />
                Comandos Antigravity
              </span>
              <span className="text-[9px] text-base-content/40 font-mono">↑↓ para navegar • Enter / Tab</span>
            </div>

            <div className="space-y-1 max-h-64 overflow-y-auto">
              {filteredCommands.map((cmd, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={cmd.command}
                    type="button"
                    onClick={() => handleSelectCommand(cmd)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all ${
                      isSelected 
                        ? 'bg-primary/10 border border-primary/30 shadow-sm' 
                        : 'hover:bg-base-200/60 border border-transparent'
                    }`}
                  >
                    <div className="p-1 rounded-lg bg-base-200 shrink-0 mt-0.5">
                      {getCommandIcon(cmd.command)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono text-primary">{cmd.command}</span>
                        <span className="font-medium text-base-content/90 text-xs">{cmd.title}</span>
                      </div>
                      <p className="text-[11px] text-base-content/60 truncate mt-0.5">
                        {cmd.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Caixa de Entrada Integrada com Barra de Ações Inferior */}
        <div className={`relative flex flex-col bg-base-200/70 rounded-2xl border ${isListening ? 'border-red-500/80 ring-2 ring-red-500/20' : 'border-base-300 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/40'} shadow-sm transition-all overflow-visible`}>
          
          {/* Área de Digitação do Prompt */}
          <textarea
            data-testid="chat-textarea"
            ref={textareaRef}
            rows={2}
            value={prompt}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={effectiveDisabled}
            placeholder={
              isReloading
                ? "🔄 Reiniciando serviço para aplicar atualizações... Envio pausado temporariamente."
                : isPodDraining
                  ? `⏳ Pod Drain ativo: finalizando ${evolutionStatus?.activeTasksCount ?? 1} tarefa(s) antes do reinício. Envio pausado...`
                  : isListening 
                    ? "Ouvindo sua voz em português... Fale seu comando..." 
                    : isLoading 
                      ? "Agente em execução... Digite para enfileirar mensagem (Enter)" 
                      : chatMode === 'chat'
                        ? "💬 Modo Chat & MCPs ativos (somente conversa e ferramentas, sem alterar arquivos)..."
                        : "⚡ Modo Agente autônomo (digite mensagem ou comando: /plan, /goal, /mcp...)"
            }
            className="w-full bg-transparent border-0 outline-none resize-none px-4 pt-3 pb-1 text-sm leading-relaxed text-base-content placeholder:text-base-content/40 max-h-48 overflow-y-auto"
          />

          {/* Barra de Ferramentas Inferior do Prompt (Modelo, MCPs, Refinar, Microfone, Envio) */}
          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between px-2.5 sm:px-3 pb-2 sm:pb-2.5 pt-1 border-t border-base-300/40 gap-1">
            
            {/* Lado Esquerdo: Botão +, Dropdown do Modelo, Toggle Agente/Chat e Botão MCPs */}
            <div className="flex items-center gap-1 sm:gap-1.5 model-dropdown-container relative flex-1 min-w-0">
              <button
                type="button"
                className="btn btn-ghost btn-sm sm:btn-xs btn-circle min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 text-base-content/50 hover:text-base-content transition-colors shrink-0"
                title="Opções adicionais / contexto"
              >
                <Plus className="w-4 h-4" />
              </button>

              {/* Botão Seletor de Modelo */}
              <button
                type="button"
                onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
                className="flex items-center gap-1 min-h-[36px] sm:min-h-[32px] px-2 sm:px-2.5 py-1.5 sm:py-1 rounded-lg text-sky-400 hover:text-sky-300 hover:bg-base-300/50 text-xs font-medium transition-all group select-none shrink-0"
                title="Clique para trocar o modelo diretamente aqui"
              >
                <span>
                  <span className="hidden sm:inline">{formatModelName(currentModel)}</span>
                  <span className="sm:hidden">{formatShortModelName(currentModel)}</span>
                </span>
                <ChevronUp className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isModelMenuOpen ? 'rotate-180 text-sky-300' : 'text-sky-400/80 group-hover:text-sky-300'}`} />
              </button>

              {/* Seletor Rápido de Modo: Agente vs Chat */}
              <div className="flex items-center bg-base-300/60 p-0.5 rounded-lg border border-base-300/80 shrink-0 select-none">
                <button
                  type="button"
                  onClick={() => onChatModeChange?.('agent')}
                  className={`flex items-center justify-center gap-1 min-h-[36px] min-w-[36px] sm:min-h-[28px] sm:min-w-0 px-2 sm:px-2 py-1.5 sm:py-0.5 rounded-md text-[11px] font-medium transition-all ${
                    chatMode === 'agent'
                      ? 'bg-primary text-primary-content shadow-sm'
                      : 'text-base-content/60 hover:text-base-content'
                  }`}
                  title="Modo Agente: Autonomia total para criar/editar código e rodar testes"
                >
                  <Zap className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                  <span className="hidden md:inline">Agente</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChatModeChange?.('chat')}
                  className={`flex items-center justify-center gap-1 min-h-[36px] min-w-[36px] sm:min-h-[28px] sm:min-w-0 px-2 sm:px-2 py-1.5 sm:py-0.5 rounded-md text-[11px] font-medium transition-all ${
                    chatMode === 'chat'
                      ? 'bg-secondary text-secondary-content shadow-sm'
                      : 'text-base-content/60 hover:text-base-content'
                  }`}
                  title="Modo Chat: Conversas e ferramentas MCP sem editar arquivos locais"
                >
                  <MessageSquare className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                  <span className="hidden md:inline">Chat</span>
                </button>
              </div>

              {/* Botão MCPs de Acesso Rápido */}
              <button
                type="button"
                onClick={onOpenMcpModal}
                className="flex items-center justify-center gap-1.5 min-h-[36px] min-w-[36px] sm:min-h-[32px] sm:min-w-0 px-2 py-1.5 sm:py-1 rounded-lg text-xs font-medium text-base-content/60 hover:text-primary hover:bg-base-300/50 transition-all shrink-0"
                title="Visualizar servidores MCP integrados"
              >
                <Boxes className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">MCPs</span>
              </button>

              {/* Menu Popover Suspenso dos Modelos (abre para cima) */}
              {isModelMenuOpen && (
                <div 
                  data-testid="model-selection-popover"
                  className="absolute bottom-full mb-2 left-0 z-50 w-72 max-w-[calc(100vw-3rem)] max-h-80 overflow-y-auto rounded-xl bg-base-100/98 backdrop-blur-md border border-base-300 shadow-2xl p-1.5 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150"
                >
                  {/* Cabeçalho com Toggle de Roteamento por Cota */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-base-200/80 mb-1 bg-base-200/40 rounded-lg">
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-[11px] font-semibold text-base-content/90">
                        Auto-Rotear por Cota
                      </span>
                    </div>
                    <label className="cursor-pointer flex items-center">
                      <input 
                        type="checkbox"
                        checked={autoRouteEnabled}
                        onChange={(e) => toggleAutoRoute(e.target.checked)}
                        className="toggle toggle-primary toggle-xs"
                        title="Alterna automaticamente para a conta do pool com maior cota disponível para o modelo"
                      />
                    </label>
                  </div>

                  <div className="px-2 py-1 flex items-center justify-between text-[10px] font-semibold tracking-wider text-base-content/50 uppercase">
                    <span>Modelos Disponíveis</span>
                    {autoRouteEnabled && (
                      <span className="text-emerald-400 font-mono text-[9px] lowercase">
                        pool ativo ({quotaOverview?.accounts?.length || 0} contas)
                      </span>
                    )}
                  </div>

                  <div className="space-y-0.5">
                    {modelsList.map((m) => {
                      const isSelected = m.id === currentModel;
                      const quotaInfo = quotaOverview?.modelQuotaMap?.[m.id];
                      
                      const remaining = autoRouteEnabled
                        ? (quotaInfo?.bestPoolRemaining ?? quotaInfo?.currentAccountRemaining ?? null)
                        : (quotaInfo?.currentAccountRemaining ?? null);
                      
                      const isBlocked = !!quotaInfo?.isBlocked;
                      const targetAccountName = quotaInfo?.bestAccountName;

                      // Cores da tag de cota
                      let badgeColor = 'text-neutral-500 bg-neutral-800/60';
                      if (remaining !== null) {
                        if (remaining > 50) badgeColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
                        else if (remaining >= 20) badgeColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
                        else if (remaining > 5) badgeColor = 'text-rose-400 bg-rose-500/10 border-rose-500/20';
                        else badgeColor = 'text-neutral-400 bg-neutral-800/80 border-neutral-700 line-through';
                      }

                      return (
                        <button
                          key={m.id}
                          type="button"
                          disabled={isRoutingModel}
                          onClick={() => handleSelectModelWithRouting(m.id)}
                          title={
                            isBlocked
                              ? 'Cota esgotada em todas as contas cadastradas (< 5%)'
                              : autoRouteEnabled && targetAccountName
                                ? `Cota disponível: ${remaining ?? 0}% • Alterna para ${targetAccountName}`
                                : `Cota na conta ativa: ${remaining ?? 0}%`
                          }
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                            isSelected 
                              ? 'bg-sky-500/10 text-sky-400 font-semibold' 
                              : isBlocked
                                ? 'text-base-content/40 hover:bg-base-200/60'
                                : 'text-base-content/80 hover:bg-base-200 hover:text-base-content'
                          }`}
                        >
                          <span className={`truncate mr-1.5 ${isBlocked ? 'line-through text-base-content/40' : ''}`}>
                            {m.name || formatModelName(m.id)}
                          </span>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {remaining !== null && (
                              <span 
                                data-testid={`model-quota-badge-${m.id}`}
                                className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${badgeColor}`}
                              >
                                {isBlocked ? '< 5%' : `${remaining}%`}
                              </span>
                            )}
                            {isSelected && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Rodapé informativo do seletor */}
                  <div className="mt-1 pt-1.5 border-t border-base-200/60 px-2 py-0.5 text-[10px] text-base-content/50 flex items-center justify-between">
                    <span>
                      {autoRouteEnabled 
                        ? '⚡ Auto-roteando para conta com mais cota' 
                        : '🔒 Modo manual: usa conta ativa'}
                    </span>
                    {quotaOverview?.activeEmail && (
                      <span className="truncate max-w-[100px] text-base-content/70 font-mono">
                        {quotaOverview.activeEmail.split('@')[0]}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Lado Direito: Refinar Prompt, Microfone e Botão de Envio */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">

              {/* Botão Sob Demanda: ✨ Refinar Prompt */}
              <button
                data-testid="chat-refine-btn"
                type="button"
                onClick={() => triggerRefine()}
                disabled={!canRefine}
                aria-label="Refinar prompt"
                title={
                  effectiveDisabled
                    ? 'Refinamento pausado durante Pod Drain / atualização'
                    : isRefining
                      ? 'Refinando prompt...'
                      : prompt.trim().length < MIN_REFINE_CHARS
                        ? `Digite pelo menos ${MIN_REFINE_CHARS} caracteres para refinar (Ctrl+Shift+R)`
                        : 'Refinar prompt sob demanda (Ctrl+Shift+R)'
                }
                className={`flex items-center justify-center gap-1 min-h-[36px] min-w-[36px] sm:min-h-[32px] sm:min-w-0 px-2 sm:px-2.5 py-1.5 sm:py-1 rounded-lg text-xs font-medium transition-all shrink-0 ${
                  isRefining
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : canRefine
                      ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/25'
                      : 'text-base-content/30 cursor-not-allowed'
                }`}
              >
                {isRefining ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span className="hidden md:inline">Refinar</span>
              </button>
              
              {/* Botão de Microfone */}
              <button
                type="button"
                onClick={toggleMic}
                className={`w-9 h-9 sm:w-8 sm:h-8 rounded-full transition-all flex items-center justify-center shrink-0 ${
                  isListening 
                    ? 'bg-red-500 text-white animate-pulse shadow-md shadow-red-500/30' 
                    : 'text-base-content/50 hover:text-base-content hover:bg-base-300/50'
                }`}
                title={isListening ? "Ouvindo... Clique para pausar gravação" : "Falar prompt via microfone (Speech-to-Text)"}
              >
                {isListening ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>

              {/* Botão de Envio / Enfileirar / Forçar Envio / Parar */}
              {isSystemBusyWithEvolution ? (
                <div className="flex items-center gap-1.5">
                  {isLoading && (
                    <button
                      type="button"
                      onClick={onStop}
                      className="btn btn-error btn-sm sm:btn-xs btn-circle min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 shadow-sm"
                      title="Interromper geração ativa para acelerar o Pod Drain"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                  )}
                  <button
                    data-testid="chat-send-btn"
                    type="button"
                    disabled={true}
                    className="w-9 h-9 sm:w-8 sm:h-8 rounded-full bg-warning/20 border border-warning/40 text-warning flex items-center justify-center shadow-sm cursor-not-allowed transition-all opacity-80 shrink-0"
                    title={
                      isReloading
                        ? "Envio pausado temporariamente: Servidor em reinício (Auto-Reload)."
                        : `Envio pausado temporariamente: Pod Drain em andamento (${evolutionStatus?.activeTasksCount ?? 1} tarefa(s) ativa(s)).`
                    }
                  >
                    {isReloading ? (
                      <Loader2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 animate-spin" />
                    ) : (
                      <Lock className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                    )}
                  </button>
                </div>
              ) : isLoading ? (
                <div className="flex items-center gap-1.5">
                  {prompt.trim() && (
                    <>
                      {/* Botão de Enfileirar (aguarda o próximo prompt) */}
                      <button
                        type="button"
                        onClick={() => {
                          if (isListening) stopListening();
                          setUndoDraft(null);
                          setRefineSuggestion(null);
                          onSubmit();
                        }}
                        className="btn btn-info btn-xs gap-1 shadow-sm px-2.5 min-h-[36px] sm:min-h-0 h-9 sm:h-7"
                        title="Adicionar à fila para executar após a resposta atual (Enter)"
                      >
                        <ListPlus className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-medium hidden sm:inline">
                          Enfileirar{queuedCount > 0 ? ` (${queuedCount})` : ''}
                        </span>
                      </button>

                      {/* Botão de Forçar Envio (interrompe geração e envia agora) */}
                      <button
                        type="button"
                        onClick={() => {
                          if (isListening) stopListening();
                          setUndoDraft(null);
                          setRefineSuggestion(null);
                          if (onForceSubmit) {
                            onForceSubmit();
                          } else {
                            onSubmit();
                          }
                        }}
                        className="btn btn-warning btn-xs gap-1 shadow-sm px-2.5 min-h-[36px] sm:min-h-0 h-9 sm:h-7 bg-amber-500 hover:bg-amber-400 text-black font-semibold border-amber-600"
                        title="Forçar envio imediato — interrompe a tarefa atual e executa já (Ctrl+Enter)"
                      >
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span className="text-[11px] font-bold hidden sm:inline">
                          Forçar Envio
                        </span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={onStop}
                    className="btn btn-error btn-sm sm:btn-xs btn-circle min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 shadow-sm"
                    title="Interromper geração ativa"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </button>
                </div>
              ) : (
                <button
                  data-testid="chat-send-btn"
                  type="button"
                  onClick={() => {
                    if (isListening) stopListening();
                    setUndoDraft(null);
                    setRefineSuggestion(null);
                    onSubmit();
                  }}
                  disabled={!prompt.trim() || effectiveDisabled}
                  className="w-9 h-9 sm:w-8 sm:h-8 rounded-full bg-sky-500 hover:bg-sky-400 active:scale-95 text-white flex items-center justify-center shadow-md transition-all disabled:opacity-30 disabled:pointer-events-none shrink-0"
                  title="Enviar mensagem (Enter ou Ctrl+Enter)"
                >
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}

            </div>
          </div>
        </div>

        {/* Rodapé explicativo discreto */}
        <div className="flex items-center justify-between text-[11px] text-base-content/40 mt-2 px-1 select-none gap-2">
          <div className="flex items-center gap-1.5 truncate">
            <Sparkles className="w-3 h-3 text-primary/70 shrink-0" />
            <span className="truncate">Digite <code className="bg-base-200 text-primary px-1 rounded font-mono">/</code> para comandos<span className="hidden sm:inline">, ✨ para refinar (<code className="bg-base-200 px-1 rounded font-mono">Ctrl+Shift+R</code>) ou use o microfone</span></span>
          </div>
          <span className="hidden sm:inline shrink-0">Shift + Enter para nova linha</span>
        </div>

      </div>
    </div>
  );
};
