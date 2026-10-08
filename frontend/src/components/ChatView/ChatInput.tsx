import React, { useRef, useEffect } from 'react';
import { Send, Square, Sparkles } from 'lucide-react';

interface ChatInputProps {
  prompt: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  prompt,
  onChange,
  onSubmit,
  onStop,
  isLoading,
  disabled
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [prompt]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && prompt.trim() && !disabled) {
        onSubmit();
      }
    }
  };

  return (
    <div className="p-4 bg-base-100 border-t border-base-300">
      <div className="max-w-4xl mx-auto">
        <div className="relative flex items-end gap-2 bg-base-200/60 rounded-xl p-2 border border-base-300 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all">
          <textarea
            ref={textareaRef}
            rows={1}
            value={prompt}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Digite sua mensagem ou comando para o Antigravity... (Shift+Enter para pular linha)"
            className="flex-1 bg-transparent border-0 outline-none resize-none px-2 py-1.5 text-sm leading-relaxed text-base-content placeholder:text-base-content/40 max-h-44 overflow-y-auto"
          />

          <div className="flex items-center gap-1 shrink-0 pb-0.5">
            {isLoading ? (
              <button
                type="button"
                onClick={onStop}
                className="btn btn-error btn-sm gap-1 shadow-sm"
                title="Interromper geração"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span className="text-xs">Parar</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={!prompt.trim() || disabled}
                className="btn btn-primary btn-sm btn-circle shadow-sm disabled:opacity-30"
                title="Enviar mensagem (Enter)"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-base-content/50 mt-2 px-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-primary/70" />
            <span>Suporta comandos de barra do Antigravity (/plan, /goal, etc.)</span>
          </div>
          <span>Shift + Enter para quebra de linha</span>
        </div>
      </div>
    </div>
  );
};
