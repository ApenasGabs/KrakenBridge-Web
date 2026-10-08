import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { ModelOption } from '../../types';
import { 
  Plus, 
  ChevronUp, 
  Mic, 
  MicOff, 
  ArrowRight, 
  Square, 
  Check, 
  Sparkles 
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

  // Fallback: capitaliza e substitui traços
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
  onModelChange
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const initialTextRef = useRef<string>('');

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

  // Auto-resize do textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [prompt]);

  // Fechar menu de modelos ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.model-dropdown-container')) {
        setIsModelMenuOpen(false);
      }
    };
    if (isModelMenuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isModelMenuOpen]);

  // Tecla Enter para enviar
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
    <div className="p-4 bg-base-100 border-t border-base-300">
      <div className="max-w-4xl mx-auto">
        
        {/* Banner de aviso do microfone, se houver erro */}
        {speechError && (
          <div className="mb-2 text-xs text-error bg-error/10 border border-error/30 rounded-lg px-3 py-1.5 flex items-center justify-between animate-in fade-in">
            <span>{speechError}</span>
            <button onClick={() => setSpeechError(null)} className="btn btn-ghost btn-xs">×</button>
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
            placeholder={isListening ? "Ouvindo sua voz em português... Fale seu comando..." : "Digite sua mensagem ou comando para o Antigravity... (Shift+Enter para quebra de linha)"}
            className="w-full bg-transparent border-0 outline-none resize-none px-4 pt-3 pb-1 text-sm leading-relaxed text-base-content placeholder:text-base-content/40 max-h-48 overflow-y-auto"
          />

          {/* Barra de Ferramentas Inferior do Prompt (Modelo, Microfone, Envio) */}
          <div className="flex items-center justify-between px-3 pb-2.5 pt-1 border-t border-base-300/40">
            
            {/* Lado Esquerdo: Botão + e Dropdown do Modelo */}
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
            <span>Suporta comandos /plan, /goal e transcrição de voz em português</span>
          </div>
          <span>Shift + Enter para nova linha</span>
        </div>

      </div>
    </div>
  );
};
