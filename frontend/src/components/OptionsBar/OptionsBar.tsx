import { useState } from 'react';
import type { AccountInfo, ChatOptions, ModelOption } from '../../types';
import { Cpu, Zap, Shield, ShieldAlert, Sparkles, Activity, MessageSquare, User } from 'lucide-react';
import { SpinnerVerbsModal } from '../ChatView/SpinnerVerbsModal';

interface OptionsBarProps {
  options: ChatOptions;
  availableModels: (string | ModelOption)[];
  accounts?: AccountInfo[];
  onChange: (options: ChatOptions) => void;
  isOpen: boolean;
}

export const OptionsBar: React.FC<OptionsBarProps> = ({
  options,
  availableModels,
  accounts = [],
  onChange,
  isOpen
}) => {
  const [isSpinnerModalOpen, setIsSpinnerModalOpen] = useState(false);

  if (!isOpen) return null;

  const defaultModels: ModelOption[] = [
    { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)' },
    { id: 'gemini-3.8-flash-medium', name: 'Gemini 3.8 Flash (Medium)' },
    { id: 'gemini-3.7-flash-high', name: 'Gemini 3.7 Flash (High)' },
    { id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (High)' },
    { id: 'claude-opus-5-5-high', name: 'Claude Opus 5.5 (High)' },
    { id: 'claude-sonnet-5-5-high', name: 'Claude Sonnet 5.5 (High)' },
    { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)' }
  ];

  const modelsList: ModelOption[] = availableModels.length > 0
    ? availableModels.map(m => typeof m === 'string' ? { id: m, name: m } : m)
    : defaultModels;

  const update = (partial: Partial<ChatOptions>) => {
    onChange({ ...options, ...partial });
  };

  return (
    <div className="bg-base-200/80 border-b border-base-300 px-4 py-2.5 transition-all text-xs" data-testid="options-bar">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Seleção de Modelo */}
        <div className="flex items-center gap-2">
          <label className="font-semibold flex items-center gap-1.5 text-base-content/70">
            <Cpu className="w-3.5 h-3.5 text-primary" />
            Modelo:
          </label>
          <select
            data-testid="options-model-select"
            value={options.model}
            onChange={(e) => update({ model: e.target.value })}
            className="select select-bordered select-xs bg-base-100 font-mono"
          >
            {modelsList.map(m => (
              <option key={m.id} value={m.id}>{m.name || m.id}</option>
            ))}
          </select>
        </div>

        {/* Esforço de Raciocínio (Effort) */}
        <div className="flex items-center gap-2">
          <label className="font-semibold flex items-center gap-1.5 text-base-content/70">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            Raciocínio:
          </label>
          <select
            data-testid="options-effort-select"
            value={options.effort}
            onChange={(e) => update({ effort: e.target.value })}
            className="select select-bordered select-xs bg-base-100"
          >
            <option value="default">Padrão (Auto)</option>
            <option value="low">Baixo (low)</option>
            <option value="medium">Médio (medium)</option>
            <option value="high">Alto (high)</option>
            <option value="xhigh">Muito Alto (xhigh)</option>
          </select>
        </div>

        {/* Modo de Execução */}
        <div className="flex items-center gap-2">
          <label className="font-semibold flex items-center gap-1.5 text-base-content/70">
            <Zap className="w-3.5 h-3.5 text-warning" />
            Modo:
          </label>
          <select
            data-testid="options-mode-select"
            value={options.mode}
            onChange={(e) => update({ mode: e.target.value })}
            className="select select-bordered select-xs bg-base-100"
          >
            <option value="default">Padrão</option>
            <option value="accept-edits">Auto-Aceitar Edições (accept-edits)</option>
            <option value="plan">Modo Planejamento (plan)</option>
          </select>
        </div>

        {/* Postura de Interação: Agente vs Chat */}
        <div className="flex items-center gap-2">
          <label className="font-semibold flex items-center gap-1.5 text-base-content/70">
            <MessageSquare className="w-3.5 h-3.5 text-secondary" />
            Interação:
          </label>
          <select
            data-testid="options-interaction-select"
            value={options.chatMode || 'agent'}
            onChange={(e) => update({ chatMode: e.target.value as 'agent' | 'chat' })}
            className="select select-bordered select-xs bg-base-100 font-medium"
          >
            <option value="agent">⚡ Modo Agente (Código & Terminal)</option>
            <option value="chat">💬 Modo Chat (Apenas Leitura & MCPs)</option>
          </select>
        </div>

        {/* Conta de Execução (Isolamento Multi-Conta) */}
        {accounts.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="font-semibold flex items-center gap-1.5 text-base-content/70">
              <User className="w-3.5 h-3.5 text-primary" />
              Executar com:
            </label>
            <select
              data-testid="options-account-select"
              value={options.accountEmail || ''}
              onChange={(e) => update({ accountEmail: e.target.value || undefined })}
              className="select select-bordered select-xs bg-base-100 font-mono text-[11px]"
              title="Permite que este chat execute usando as credenciais e cotas de uma conta Google específica"
            >
              <option value="">Conta Padrão (Ativa)</option>
              {accounts.map(acc => (
                <option key={acc.email} value={acc.email}>
                  {acc.name ? `${acc.name} (${acc.email})` : acc.email}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Flags de Segurança, Permissões e Cotas */}
        <div className="flex items-center gap-4">
          <label className="cursor-pointer flex items-center gap-1.5 text-base-content/80 select-none">
            <input
              data-testid="options-skip-permissions"
              type="checkbox"
              checked={options.skipPermissions}
              onChange={(e) => update({ skipPermissions: e.target.checked })}
              className="checkbox checkbox-xs checkbox-warning"
            />
            <ShieldAlert className="w-3.5 h-3.5 text-warning" />
            <span>Pular Permissões (--skip-permissions)</span>
          </label>

          <label className="cursor-pointer flex items-center gap-1.5 text-base-content/80 select-none">
            <input
              data-testid="options-sandbox"
              type="checkbox"
              checked={options.sandbox}
              onChange={(e) => update({ sandbox: e.target.checked })}
              className="checkbox checkbox-xs checkbox-primary"
            />
            <Shield className="w-3.5 h-3.5 text-primary" />
            <span>Sandbox</span>
          </label>

          <label className="cursor-pointer flex items-center gap-1.5 text-base-content/80 select-none">
            <input
              data-testid="options-quota-bubble"
              type="checkbox"
              checked={!!options.showQuotaBubble}
              onChange={(e) => update({ showQuotaBubble: e.target.checked })}
              className="checkbox checkbox-xs checkbox-secondary"
            />
            <Activity className="w-3.5 h-3.5 text-secondary" />
            <span>Balão de Cotas</span>
          </label>

          {/* Botão de personalização dos Spinner Verbs (Claude Code) */}
          <button
            type="button"
            data-testid="options-spinner-verbs-btn"
            onClick={() => setIsSpinnerModalOpen(true)}
            className="btn btn-xs btn-ghost gap-1.5 text-primary hover:bg-primary/10 border border-primary/20 rounded-md font-medium"
            title="Personalizar palavras e verbos do Spinner (estilo Claude Code)"
          >
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Spinner Verbs</span>
          </button>
        </div>
      </div>

      <SpinnerVerbsModal 
        isOpen={isSpinnerModalOpen} 
        onClose={() => setIsSpinnerModalOpen(false)} 
      />
    </div>
  );
};
