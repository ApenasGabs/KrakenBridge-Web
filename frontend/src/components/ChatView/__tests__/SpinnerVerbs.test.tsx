import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SpinnerVerbs } from '../SpinnerVerbs';
import { SpinnerVerbsModal } from '../SpinnerVerbsModal';
import { MessageItem } from '../MessageItem';
import {
  CLAUDE_CANONICAL_VERBS,
  SPINNER_VERB_PACKS,
  DEFAULT_SPINNER_CONFIG,
  getSpinnerVerbsConfig,
  saveSpinnerVerbsConfig,
  getActiveVerbsList,
  type SpinnerVerbsConfig
} from '../../../utils/spinnerVerbsData';
import type { ChatMessage } from '../../../types';

describe('Spinner Verbs Data & Utils', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('deve conter 185 verbos canônicos do Claude Code', () => {
    expect(CLAUDE_CANONICAL_VERBS.length).toBe(185);
    expect(CLAUDE_CANONICAL_VERBS).toContain('Pondering');
    expect(CLAUDE_CANONICAL_VERBS).toContain('Cogitating');
    expect(CLAUDE_CANONICAL_VERBS).toContain('Deliberating');
    expect(CLAUDE_CANONICAL_VERBS).toContain('Reticulating');
  });

  it('deve disponibilizar todos os pacotes temáticos requeridos', () => {
    const packIds = SPINNER_VERB_PACKS.map(p => p.id);
    expect(packIds).toContain('claude_default');
    expect(packIds).toContain('dev_life');
    expect(packIds).toContain('git_commits');
    expect(packIds).toContain('sci_fi');
    expect(packIds).toContain('kaomoji');
    expect(packIds).toContain('kraken_ptbr');
  });

  it('deve retornar lista combinada no modo append', () => {
    const config: SpinnerVerbsConfig = {
      enabled: true,
      mode: 'append',
      selectedPacks: ['kaomoji'],
      customVerbs: ['CustomVerb1', 'CustomVerb2'],
      intervalMs: 2600
    };

    const list = getActiveVerbsList(config);
    // Deve conter os canônicos + os de kaomoji + os customizados
    expect(list).toContain('Pondering');
    expect(list).toContain('(╯°□°)╯︵ ┻━┻');
    expect(list).toContain('CustomVerb1');
    expect(list).toContain('CustomVerb2');
    expect(list.length).toBeGreaterThan(CLAUDE_CANONICAL_VERBS.length);
  });

  it('deve retornar apenas pacotes selecionados no modo replace', () => {
    const config: SpinnerVerbsConfig = {
      enabled: true,
      mode: 'replace',
      selectedPacks: ['kraken_ptbr'],
      customVerbs: ['MeuVerboCustomizado'],
      intervalMs: 2600
    };

    const list = getActiveVerbsList(config);
    expect(list).toContain('Desbravando código');
    expect(list).toContain('MeuVerboCustomizado');
    // Não deve conter verbos originais que só pertencem ao pacote padrão não selecionado
    expect(list).not.toContain('Reticulating splines');
  });

  it('deve persistir e recuperar configurações no localStorage', () => {
    const testConfig: SpinnerVerbsConfig = {
      enabled: false,
      mode: 'replace',
      selectedPacks: ['git_commits'],
      customVerbs: ['Test1'],
      intervalMs: 1500
    };

    saveSpinnerVerbsConfig(testConfig);
    const retrieved = getSpinnerVerbsConfig();
    expect(retrieved.enabled).toBe(false);
    expect(retrieved.mode).toBe('replace');
    expect(retrieved.selectedPacks).toEqual(['git_commits']);
    expect(retrieved.customVerbs).toEqual(['Test1']);
  });
});

describe('SpinnerVerbs Component', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deve renderizar verbo ativo e cronômetro quando habilitado', () => {
    const startTime = Date.now() - 3000;
    render(<SpinnerVerbs startTime={startTime} />);

    expect(screen.getByTestId('spinner-verbs-container')).toBeInTheDocument();
    expect(screen.getByTestId('spinner-verb-text')).toBeInTheDocument();
    const timer = screen.getByTestId('spinner-verb-timer');
    expect(timer).toBeInTheDocument();
    expect(timer.textContent).toMatch(/\(\d+\.\d+s\)/);
  });

  it('deve avançar o cronômetro com o tempo', () => {
    render(<SpinnerVerbs />);
    const timer = screen.getByTestId('spinner-verb-timer');

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(timer.textContent).toBe('(1.2s)');
  });

  it('deve renderizar fallback minimalista quando desabilitado', () => {
    localStorage.setItem(
      'kraken_spinner_verbs_config',
      JSON.stringify({ ...DEFAULT_SPINNER_CONFIG, enabled: false })
    );

    render(<SpinnerVerbs />);
    expect(screen.getByTestId('spinner-verbs-disabled')).toBeInTheDocument();
    expect(screen.getByText('Iniciando motor e conectando ferramentas...')).toBeInTheDocument();
  });

  it('deve reagir a eventos customizados kraken:spinner-verbs-updated', () => {
    render(<SpinnerVerbs />);
    expect(screen.getByTestId('spinner-verbs-container')).toBeInTheDocument();

    act(() => {
      const newConfig: SpinnerVerbsConfig = {
        ...DEFAULT_SPINNER_CONFIG,
        enabled: false
      };
      window.dispatchEvent(
        new CustomEvent('kraken:spinner-verbs-updated', { detail: newConfig })
      );
    });

    expect(screen.getByTestId('spinner-verbs-disabled')).toBeInTheDocument();
  });
});

describe('SpinnerVerbsModal Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('não deve renderizar quando isOpen for false', () => {
    const { container } = render(<SpinnerVerbsModal isOpen={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('deve renderizar opções, pré-visualização e permitir salvar', () => {
    const onClose = vi.fn();
    render(<SpinnerVerbsModal isOpen={true} onClose={onClose} />);

    expect(screen.getByTestId('spinner-verbs-modal')).toBeInTheDocument();
    expect(screen.getByText('Spinner Verbs (Claudionary)')).toBeInTheDocument();
    expect(screen.getByTestId('spinner-verbs-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('custom-verbs-textarea')).toBeInTheDocument();

    // Modifica o campo de verbos customizados
    const textarea = screen.getByTestId('custom-verbs-textarea');
    fireEvent.change(textarea, { target: { value: 'Invocando Kraken\nConjurando IA' } });

    // Salva
    const saveBtn = screen.getByTestId('save-spinner-verbs-btn');
    fireEvent.click(saveBtn);

    const saved = getSpinnerVerbsConfig();
    expect(saved.customVerbs).toEqual(['Invocando Kraken', 'Conjurando IA']);
  });

  it('deve permitir restaurar padrões (Reset)', () => {
    saveSpinnerVerbsConfig({
      enabled: false,
      mode: 'replace',
      selectedPacks: ['kaomoji'],
      customVerbs: ['Custom'],
      intervalMs: 1000
    });

    render(<SpinnerVerbsModal isOpen={true} onClose={vi.fn()} />);
    const resetBtn = screen.getByTestId('reset-spinner-verbs-btn');
    fireEvent.click(resetBtn);

    const resetConfig = getSpinnerVerbsConfig();
    expect(resetConfig.enabled).toBe(true);
    expect(resetConfig.mode).toBe('append');
  });
});

describe('MessageItem com SpinnerVerbs', () => {
  it('deve renderizar SpinnerVerbs durante o streaming inicial sem texto nem ferramentas', () => {
    const streamingMessage: ChatMessage = {
      id: 'msg-stream-init',
      role: 'assistant',
      text: '',
      isStreaming: true,
      timestamp: '2026-10-15T20:00:00.000Z'
    };

    render(<MessageItem message={streamingMessage} />);
    expect(screen.getByTestId('spinner-verbs-container')).toBeInTheDocument();
  });
});
