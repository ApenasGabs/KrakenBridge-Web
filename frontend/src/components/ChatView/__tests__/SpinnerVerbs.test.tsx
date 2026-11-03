import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SpinnerVerbs, CLAUDE_BRAILLE_FRAMES } from '../SpinnerVerbs';
import { SpinnerVerbsModal } from '../SpinnerVerbsModal';
import { MessageItem } from '../MessageItem';
import {
  CLAUDE_CANONICAL_VERBS,
  SPINNER_VERB_PACKS,
  DEFAULT_SPINNER_CONFIG,
  TOOL_CATEGORY_VERBS,
  getCategoryForTool,
  getTargetForTool,
  getSpinnerVerbsConfig,
  saveSpinnerVerbsConfig,
  getActiveVerbsList,
  type SpinnerVerbsConfig
} from '../../../utils/spinnerVerbsData';
import type { ChatMessage, ToolCall } from '../../../types';

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

  it('deve categorizar ferramentas e extrair alvos corretamente', () => {
    expect(getCategoryForTool({ name: 'read_file' })).toBe('read');
    expect(getCategoryForTool({ name: 'edit_file' })).toBe('write');
    expect(getCategoryForTool({ name: 'write_file' })).toBe('write');
    expect(getCategoryForTool({ name: 'run_command' })).toBe('command');
    expect(getCategoryForTool({ name: 'search_web' })).toBe('search');
    expect(getCategoryForTool({ name: 'call_mcp_tool' })).toBe('mcp');
    expect(getCategoryForTool(undefined)).toBe('thinking');

    // Extração de alvos
    expect(getTargetForTool({ name: 'read_file', args: { Path: '/workspace/src/App.tsx' } })).toBe('src/App.tsx');
    expect(getTargetForTool({ name: 'run_command', args: { CommandLine: 'docker ps -a' } })).toBe('docker ps -a');
    expect(getTargetForTool({ name: 'search_web', args: { query: 'vitest tutorial' } })).toBe('"vitest tutorial"');
    expect(getTargetForTool({ name: 'call_mcp_tool', args: { ToolName: 'memory_query' } })).toBe('memory_query');
  });

  it('deve conter pools de verbos contextuais para cada categoria', () => {
    expect(TOOL_CATEGORY_VERBS.read).toContain('Reading');
    expect(TOOL_CATEGORY_VERBS.read).toContain('Perusing');
    expect(TOOL_CATEGORY_VERBS.write).toContain('Editing');
    expect(TOOL_CATEGORY_VERBS.write).toContain('Refactoring');
    expect(TOOL_CATEGORY_VERBS.command).toContain('Running');
    expect(TOOL_CATEGORY_VERBS.search).toContain('Searching');
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

  it('deve renderizar o Braille spinner no estilo Claude Code e avançar frames a cada 80ms', () => {
    render(<SpinnerVerbs />);
    const brailleIcon = screen.getByTestId('spinner-braille-icon');
    expect(brailleIcon).toBeInTheDocument();
    expect(brailleIcon.textContent).toBe(CLAUDE_BRAILLE_FRAMES[0]);

    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(brailleIcon.textContent).toBe(CLAUDE_BRAILLE_FRAMES[1]);

    act(() => {
      vi.advanceTimersByTime(80 * 2);
    });
    expect(brailleIcon.textContent).toBe(CLAUDE_BRAILLE_FRAMES[3]);
  });

  it('deve renderizar verbo contextual de leitura e exibir o nome do arquivo', () => {
    const tool: ToolCall = {
      name: 'read_file',
      state: 'RUNNING',
      args: { Path: '/workspace/frontend/src/ChatInput.tsx' }
    };

    render(<SpinnerVerbs toolCalls={[tool]} />);
    const textElem = screen.getByTestId('spinner-verb-text');
    expect(textElem.textContent).toContain('src/ChatInput.tsx');
    const containsReadVerb = TOOL_CATEGORY_VERBS.read.some(v => textElem.textContent?.includes(v));
    expect(containsReadVerb).toBe(true);
  });

  it('deve alternar imediatamente para verbo de escrita ao trocar para ferramenta edit_file', () => {
    const readTool: ToolCall = {
      name: 'read_file',
      state: 'DONE',
      args: { Path: '/workspace/src/foo.ts' }
    };

    const { rerender } = render(<SpinnerVerbs toolCalls={[readTool]} />);
    
    // O agente troca de ferramenta para edição
    const editTool: ToolCall = {
      name: 'edit_file',
      state: 'RUNNING',
      args: { Path: '/workspace/src/bar.ts' }
    };

    rerender(<SpinnerVerbs toolCalls={[readTool, editTool]} />);

    // Avança o timeout de transição imediata (140ms)
    act(() => {
      vi.advanceTimersByTime(150);
    });

    const textElem = screen.getByTestId('spinner-verb-text');
    expect(textElem.textContent).toContain('src/bar.ts');
    const containsWriteVerb = TOOL_CATEGORY_VERBS.write.some(v => textElem.textContent?.includes(v));
    expect(containsWriteVerb).toBe(true);
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

  it('deve continuar renderizando SpinnerVerbs quando houver ferramentas em execução se o texto ainda não tiver chegado', () => {
    const streamingWithTools: ChatMessage = {
      id: 'msg-stream-tools',
      role: 'assistant',
      text: '',
      isStreaming: true,
      toolCalls: [
        {
          name: 'run_command',
          state: 'RUNNING',
          args: { CommandLine: 'docker ps' }
        }
      ],
      timestamp: '2026-10-15T20:00:00.000Z'
    };

    render(<MessageItem message={streamingWithTools} />);
    expect(screen.getByTestId('spinner-verbs-container')).toBeInTheDocument();
  });

  it('deve continuar renderizando SpinnerVerbs quando houver raciocínio (thinking) ativo se o texto ainda não tiver chegado', () => {
    const streamingWithThinking: ChatMessage = {
      id: 'msg-stream-thinking',
      role: 'assistant',
      text: '',
      isStreaming: true,
      thinking: 'Planejando e executando tarefas...',
      timestamp: '2026-10-15T20:00:00.000Z'
    };

    render(<MessageItem message={streamingWithThinking} />);
    expect(screen.getByTestId('spinner-verbs-container')).toBeInTheDocument();
  });

  it('deve alternar para o texto da mensagem quando o texto começar a chegar e ocultar o SpinnerVerbs', () => {
    const streamingWithText: ChatMessage = {
      id: 'msg-stream-text',
      role: 'assistant',
      text: 'Resposta preliminar sendo transmitida.',
      isStreaming: true,
      timestamp: '2026-10-15T20:00:00.000Z'
    };

    render(<MessageItem message={streamingWithText} />);
    expect(screen.queryByTestId('spinner-verbs-container')).not.toBeInTheDocument();
    expect(screen.getByText('Resposta preliminar sendo transmitida.')).toBeInTheDocument();
  });
});

