import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { ModelOption, SlashCommand } from '../../types';
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
  BookOpen
} from 'lucide-react';

interface ChatInputProps {
  prompt: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
  currentModel?: string;
  availableModels?: (string | ModelOption)[];
  onModelChange?: (model: string) => void;
  onOpenMcpModal?: () => void;
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
  onStop,
  isLoading,
  disabled,
  currentModel = 'gemini-3.8-flash-high',
  availableModels = [],
  onModelChange,
  onOpenMcpModal
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const initialTextRef = useRef<string>('');

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

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && prompt.trim() && !disabled) {
        if (isListening) stopListening();
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

        {/* POPUP INTELLISENSE DE COMANDOS /SLASH */}
        {isSlashOpen && filteredCommands.length > 0 && (
          <div className="slash-intellisense-container absolute bottom-full mb-3 left-0 z-50 w-full sm:w-96 rounded-2xl bg-base-100/98 backdrop-blur-xl border border-base-300 shadow-2xl p-2 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
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
            ref={textareaRef}
            rows={2}
            value={prompt}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={isListening ? "Ouvindo sua voz em português... Fale seu comando..." : "Digite sua mensagem ou comando (/plan, /goal, /mcp... Shift+Enter para quebra de linha)"}
            className="w-full bg-transparent border-0 outline-none resize-none px-4 pt-3 pb-1 text-sm leading-relaxed text-base-content placeholder:text-base-content/40 max-h-48 overflow-y-auto"
          />

          {/* Barra de Ferramentas Inferior do Prompt (Modelo, MCPs, Microfone, Envio) */}
          <div className="flex items-center justify-between px-3 pb-2.5 pt-1 border-t border-base-300/40">
            
            {/* Lado Esquerdo: Botão +, Dropdown do Modelo e Botão MCPs */}
            <div className="flex items-center gap-1.5 model-dropdown-container relative">
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle text-base-content/50 hover:text-base-content transition-colors"
                title="Opções adicionais / contexto"
              >
                <Plus className="w-4 h-4" />
              </button>

              {/* Botão Seletor de Modelo (estilo idêntico ao Antigravity IDE) */}
              <button
                type="button"
                onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-sky-400 hover:text-sky-300 hover:bg-base-300/50 text-xs font-medium transition-all group select-none"
                title="Clique para trocar o modelo diretamente aqui"
              >
                <span>{formatModelName(currentModel)}</span>
                <ChevronUp className={`w-3.5 h-3.5 transition-transform duration-200 ${isModelMenuOpen ? 'rotate-180 text-sky-300' : 'text-sky-400/80 group-hover:text-sky-300'}`} />
              </button>

              {/* Botão MCPs de Acesso Rápido */}
              <button
                type="button"
                onClick={onOpenMcpModal}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-base-content/60 hover:text-primary hover:bg-base-300/50 transition-all ml-1"
                title="Visualizar servidores MCP integrados"
              >
                <Boxes className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">MCPs</span>
              </button>

              {/* Menu Popover Suspenso dos Modelos (abre para cima) */}
              {isModelMenuOpen && (
                <div className="absolute bottom-full mb-2 left-0 z-50 w-64 max-h-72 overflow-y-auto rounded-xl bg-base-100/98 backdrop-blur-md border border-base-300 shadow-2xl p-1.5 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <div className="px-2.5 py-1.5 text-[10px] font-semibold tracking-wider text-base-content/50 uppercase border-b border-base-200 mb-1">
                    Selecione o Modelo
                  </div>
                  <div className="space-y-0.5">
                    {modelsList.map((m) => {
                      const isSelected = m.id === currentModel;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            onModelChange?.(m.id);
                            setIsModelMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                            isSelected 
                              ? 'bg-sky-500/10 text-sky-400 font-semibold' 
                              : 'text-base-content/80 hover:bg-base-200 hover:text-base-content'
                          }`}
                        >
                          <span className="truncate">{m.name || formatModelName(m.id)}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Lado Direito: Microfone e Botão de Envio */}
            <div className="flex items-center gap-2">
              
              {/* Botão de Microfone */}
              <button
                type="button"
                onClick={toggleMic}
                className={`p-1.5 rounded-full transition-all flex items-center justify-center ${
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

              {/* Botão de Envio Circular Azul / Parar */}
              {isLoading ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="btn btn-error btn-xs btn-circle shadow-sm"
                  title="Interromper geração"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (isListening) stopListening();
                    onSubmit();
                  }}
                  disabled={!prompt.trim() || disabled}
                  className="w-7 h-7 rounded-full bg-sky-500 hover:bg-sky-400 active:scale-95 text-white flex items-center justify-center shadow-md transition-all disabled:opacity-30 disabled:pointer-events-none"
                  title="Enviar mensagem (Enter)"
                >
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}

            </div>
          </div>
        </div>

        {/* Rodapé explicativo discreto */}
        <div className="flex items-center justify-between text-[11px] text-base-content/40 mt-2 px-1 select-none">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-primary/70" />
            <span>Digite <code className="bg-base-200 text-primary px-1 rounded font-mono">/</code> para comandos ou use o microfone</span>
          </div>
          <span>Shift + Enter para nova linha</span>
        </div>

      </div>
    </div>
  );
};
