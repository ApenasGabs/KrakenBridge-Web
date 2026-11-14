import React from 'react';
import { 
  Check, 
  Workflow, 
  Paperclip, 
  X, 
  Sparkles, 
  ListPlus 
} from 'lucide-react';

export interface QuickActionItem {
  id: string;
  label: string;
  prompt: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: 'primary' | 'success' | 'info' | 'neutral' | 'error';
  tooltip?: string;
}

export const DEFAULT_QUICK_ACTIONS: QuickActionItem[] = [
  {
    id: 'proceed',
    label: 'Sim, prosseguir',
    prompt: 'Sim, pode prosseguir com as alterações.',
    icon: Check,
    variant: 'primary',
    tooltip: 'Confirma e autoriza a continuidade imediata'
  },
  {
    id: 'full-workflow',
    label: 'Criar tarefa & fluxo completo',
    prompt: 'Crie a issue, branch, desenvolva e siga o fluxo completo com PR e Code Review.',
    icon: Workflow,
    variant: 'success',
    tooltip: 'Formaliza issue, branch, desenvolvimento e PR com Code Review'
  },
  {
    id: 'paperclip',
    label: 'Mandar para o Paperclip',
    prompt: 'Crie a tarefa e despache para o Paperclip no servidor Dell (192.168.31.5:3101).',
    icon: Paperclip,
    variant: 'info',
    tooltip: 'Despacha a tarefa para a equipe autônoma no Paperclip AI'
  },
  {
    id: 'create-issue',
    label: 'Apenas criar issue',
    prompt: 'Crie apenas a issue no GitHub para formalizar a demanda.',
    icon: ListPlus,
    variant: 'neutral',
    tooltip: 'Cria a issue no GitHub sem abrir branch ainda'
  },
  {
    id: 'cancel',
    label: 'Agora não',
    prompt: 'Agora não, vamos seguir por outro caminho.',
    icon: X,
    variant: 'error',
    tooltip: 'Cancela ou adia a proposição'
  }
];

interface QuickActionChipsProps {
  onSelectAction: (prompt: string) => void;
  actions?: QuickActionItem[];
  disabled?: boolean;
  className?: string;
}

export const QuickActionChips: React.FC<QuickActionChipsProps> = ({
  onSelectAction,
  actions = DEFAULT_QUICK_ACTIONS,
  disabled = false,
  className = ''
}) => {
  if (!actions || actions.length === 0) return null;

  const getButtonClass = (variant?: QuickActionItem['variant']) => {
    switch (variant) {
      case 'primary':
        return 'btn-primary text-primary-content hover:brightness-110 shadow-sm';
      case 'success':
        return 'btn-success btn-outline hover:bg-success hover:text-success-content';
      case 'info':
        return 'btn-info btn-outline hover:bg-info hover:text-info-content';
      case 'error':
        return 'btn-ghost text-error/80 hover:bg-error/10 hover:text-error border border-error/20';
      default:
        return 'btn-ghost border border-base-300 hover:border-base-content/30 bg-base-100/60';
    }
  };

  return (
    <div 
      className={`w-full max-w-4xl mx-auto px-4 py-1.5 transition-all animate-fadeIn ${className}`}
      data-testid="quick-action-chips"
    >
      <div 
        className="flex items-center gap-2 overflow-x-auto scrollbar-none no-scrollbar py-1 scroll-smooth"
        data-allow-x-scroll
      >
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-base-content/50 shrink-0 select-none mr-0.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="hidden sm:inline">Ações rápidas:</span>
        </div>

        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectAction(action.prompt)}
              title={action.tooltip || action.prompt}
              data-testid={`quick-action-${action.id}`}
              className={`btn btn-xs sm:btn-sm rounded-full gap-1.5 font-medium shrink-0 transition-all duration-150 active:scale-95 whitespace-nowrap ${getButtonClass(action.variant)}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
