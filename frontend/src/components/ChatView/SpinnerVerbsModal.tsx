import React, { useState } from 'react';
import { Sparkles, X, Check, RotateCcw } from 'lucide-react';
import {
  SPINNER_VERB_PACKS,
  DEFAULT_SPINNER_CONFIG,
  getSpinnerVerbsConfig,
  saveSpinnerVerbsConfig,
  type SpinnerVerbsConfig
} from '../../utils/spinnerVerbsData';
import { SpinnerVerbs } from './SpinnerVerbs';

interface SpinnerVerbsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SpinnerVerbsModal: React.FC<SpinnerVerbsModalProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<SpinnerVerbsConfig>(() => getSpinnerVerbsConfig());
  const [customText, setCustomText] = useState(() => (config.customVerbs || []).join('\n'));
  const [savedFeedback, setSavedFeedback] = useState(false);

  if (!isOpen) return null;

  const handleToggleEnabled = (enabled: boolean) => {
    setConfig(prev => ({ ...prev, enabled }));
  };

  const handleTogglePack = (packId: string) => {
    setConfig(prev => {
      const exists = prev.selectedPacks.includes(packId);
      let updated: string[];
      if (exists) {
        updated = prev.selectedPacks.filter(id => id !== packId);
        // Garante que ao menos um pacote fique selecionado
        if (updated.length === 0) updated = ['claude_default'];
      } else {
        updated = [...prev.selectedPacks, packId];
      }
      return { ...prev, selectedPacks: updated };
    });
  };

  const handleSave = () => {
    const customList = customText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    const newConfig: SpinnerVerbsConfig = {
      ...config,
      customVerbs: customList
    };

    saveSpinnerVerbsConfig(newConfig);
    setConfig(newConfig);
    setSavedFeedback(true);
    setTimeout(() => {
      setSavedFeedback(false);
      onClose();
    }, 600);
  };

  const handleReset = () => {
    setConfig(DEFAULT_SPINNER_CONFIG);
    setCustomText('');
    saveSpinnerVerbsConfig(DEFAULT_SPINNER_CONFIG);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      data-testid="spinner-verbs-modal"
    >
      <div 
        className="relative w-full max-w-lg bg-base-100 border border-base-300 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-base-300 bg-base-200/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-base-content flex items-center gap-2">
                Spinner Verbs (Claudionary)
              </h3>
              <p className="text-[11px] text-base-content/60">
                Personalize os verbos e frases animadas exibidas durante o raciocínio do modelo
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-base-content"
            aria-label="Fechar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo com scroll */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-base-content flex-1">
          {/* Toggle Principal */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-base-200/60 border border-base-300">
            <div>
              <span className="font-semibold block text-sm">Ativar Spinner Verbs</span>
              <span className="text-[11px] text-base-content/60">
                Alterna palavras aleatórias com tempo decorrido no balão de streaming
              </span>
            </div>
            <input 
              type="checkbox"
              className="toggle toggle-primary toggle-sm"
              checked={config.enabled}
              onChange={e => handleToggleEnabled(e.target.checked)}
              data-testid="spinner-verbs-toggle"
            />
          </div>

          {/* Pré-visualização ao vivo */}
          <div className="p-3.5 rounded-xl bg-base-200/40 border border-base-300 space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">
              Pré-visualização ao vivo:
            </span>
            <div className="p-3 rounded-lg bg-base-100 border border-base-300/80 shadow-inner">
              <SpinnerVerbs />
            </div>
          </div>

          {/* Modo: Append ou Replace */}
          <div className="space-y-2">
            <label className="font-bold text-xs text-base-content/80 block">
              Modo de Combinação:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfig(prev => ({ ...prev, mode: 'replace' }))}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  config.mode === 'replace'
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-base-300 bg-base-200/40 hover:bg-base-200 text-base-content/80'
                }`}
              >
                <div className="font-semibold text-xs">Substituir (Replace)</div>
                <div className="text-[10px] opacity-70">Usa apenas os pacotes selecionados abaixo</div>
              </button>

              <button
                type="button"
                onClick={() => setConfig(prev => ({ ...prev, mode: 'append' }))}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  config.mode === 'append'
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-base-300 bg-base-200/40 hover:bg-base-200 text-base-content/80'
                }`}
              >
                <div className="font-semibold text-xs">Acrescentar (Append)</div>
                <div className="text-[10px] opacity-70">Mantém o Claude Original + pacotes extras</div>
              </button>
            </div>
          </div>

          {/* Pacotes Temáticos */}
          <div className="space-y-2">
            <label className="font-bold text-xs text-base-content/80 block">
              Pacotes Temáticos (Presets):
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SPINNER_VERB_PACKS.map(pack => {
                const isSelected = config.selectedPacks.includes(pack.id);
                return (
                  <label
                    key={pack.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer select-none transition-all ${
                      isSelected
                        ? 'border-primary/60 bg-primary/5 text-base-content'
                        : 'border-base-300 hover:bg-base-200/40 text-base-content/70'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="checkbox checkbox-primary checkbox-xs mt-0.5"
                      checked={isSelected}
                      onChange={() => handleTogglePack(pack.id)}
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-xs truncate">{pack.name}</div>
                      <div className="text-[10px] text-base-content/50 line-clamp-2">
                        {pack.description}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Custom Verbs do Usuário */}
          <div className="space-y-1.5">
            <label className="font-bold text-xs text-base-content/80 flex items-center justify-between">
              <span>Palavras e Frases Customizadas:</span>
              <span className="text-[10px] font-normal text-base-content/50">Uma por linha</span>
            </label>
            <textarea
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              placeholder="Ex:&#10;Criando café...&#10;Inspecionando os ponteiros...&#10;Tricotando bits..."
              rows={3}
              className="textarea textarea-bordered textarea-sm w-full font-mono text-xs leading-relaxed"
              data-testid="custom-verbs-textarea"
            />
          </div>
        </div>

        {/* Footer com Ações */}
        <div className="px-5 py-3 border-t border-base-300 bg-base-200/40 flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content gap-1.5"
            title="Restaurar padrão original do Claude Code"
            data-testid="reset-spinner-verbs-btn"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Restaurar Padrão</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-sm text-xs"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="btn btn-primary btn-sm text-xs gap-1.5 shadow-sm"
              data-testid="save-spinner-verbs-btn"
            >
              {savedFeedback ? <Check className="w-3.5 h-3.5" /> : null}
              <span>{savedFeedback ? 'Salvo!' : 'Salvar Preferências'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
