import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { 
  MermaidBlock, 
  MermaidErrorBoundary, 
} from '../MermaidBlock';
import { 
  getDiagramTypeLabel, 
  isDarkTheme 
} from '../../../utils/mermaidUtils';
import mermaid from 'mermaid';

// Mock do módulo mermaid
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

describe('MermaidBlock utilities', () => {
  it('deve identificar corretamente os tipos de diagramas pelo prefixo', () => {
    expect(getDiagramTypeLabel('graph TD\n  A --> B')).toBe('Fluxograma');
    expect(getDiagramTypeLabel('flowchart LR\n  A --> B')).toBe('Fluxograma');
    expect(getDiagramTypeLabel('sequenceDiagram\n  Alice->>Bob: Hello')).toBe('Diagrama de Sequência');
    expect(getDiagramTypeLabel('classDiagram\n  class Animal')).toBe('Diagrama de Classes');
    expect(getDiagramTypeLabel('erDiagram\n  CUSTOMER ||--o{ ORDER : places')).toBe('Entidade-Relacionamento');
    expect(getDiagramTypeLabel('stateDiagram-v2\n  [*] --> Still')).toBe('Máquina de Estados');
    expect(getDiagramTypeLabel('pie title Pets\n  "Dogs" : 386')).toBe('Gráfico de Pizza');
    expect(getDiagramTypeLabel('gitGraph:\n  commit')).toBe('Grafo Git');
    expect(getDiagramTypeLabel('unknownDiagram\n  x')).toBe('Diagrama');
  });

  it('deve detectar temas escuros ou claros no elemento raiz', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(isDarkTheme()).toBe(true);

    document.documentElement.setAttribute('data-theme', 'dracula');
    expect(isDarkTheme()).toBe(true);

    document.documentElement.setAttribute('data-theme', 'synthwave');
    expect(isDarkTheme()).toBe(true);

    document.documentElement.setAttribute('data-theme', 'light');
    expect(isDarkTheme()).toBe(false);

    document.documentElement.removeAttribute('data-theme');
  });
});

describe('MermaidBlock Component', () => {
  const sampleCode = `
    graph TD
      A[Início] --> B[Processo]
      B --> C[Fim]
  `;
  const sampleSvg = '<svg data-testid="mock-svg"><g><text>Início</text></g></svg>';

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock do clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    // Mock do mermaid.render resolvendo SVG mockado com sucesso
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: sampleSvg,
      bindFunctions: undefined,
      diagramType: 'flowchart-v2',
    });
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('deve renderizar o diagrama com sucesso exibindo o SVG e o badge de tipo', async () => {
    render(<MermaidBlock code={sampleCode} />);

    // Deve exibir o badge identificando Fluxograma
    expect(screen.getByTestId('mermaid-badge-type')).toHaveTextContent('Fluxograma');

    // Aguarda a renderização do SVG
    await waitFor(() => {
      expect(screen.getByTestId('mermaid-diagram-container')).toBeInTheDocument();
    });

    expect(screen.getByTestId('mermaid-diagram-svg')).toContainHTML('<svg data-testid="mock-svg"');
    expect(mermaid.render).toHaveBeenCalled();
  });

  it('deve alternar entre as abas de Diagrama e Código', async () => {
    render(<MermaidBlock code={sampleCode} />);

    await waitFor(() => {
      expect(screen.getByTestId('mermaid-diagram-container')).toBeInTheDocument();
    });

    // Clica na aba Código
    const codeTab = screen.getByTestId('mermaid-tab-code');
    fireEvent.click(codeTab);

    // Deve exibir o código fonte e ocultar o container do diagrama
    expect(screen.getByTestId('mermaid-code-view')).toBeInTheDocument();
    expect(screen.queryByTestId('mermaid-diagram-container')).not.toBeInTheDocument();

    // Retorna para a aba Diagrama
    const diagramTab = screen.getByTestId('mermaid-tab-diagram');
    fireEvent.click(diagramTab);

    expect(screen.getByTestId('mermaid-diagram-container')).toBeInTheDocument();
  });

  it('deve controlar o nível de zoom (in, out e reset)', async () => {
    render(<MermaidBlock code={sampleCode} />);

    await waitFor(() => {
      expect(screen.getByTestId('mermaid-diagram-container')).toBeInTheDocument();
    });

    const zoomInBtn = screen.getByTestId('mermaid-zoom-in');
    const zoomOutBtn = screen.getByTestId('mermaid-zoom-out');
    const zoomResetBtn = screen.getByTestId('mermaid-zoom-reset');

    expect(zoomResetBtn).toHaveTextContent('100%');

    // Aumentar zoom
    fireEvent.click(zoomInBtn);
    expect(zoomResetBtn).toHaveTextContent('120%');

    // Diminuir zoom duas vezes
    fireEvent.click(zoomOutBtn);
    expect(zoomResetBtn).toHaveTextContent('100%');
    fireEvent.click(zoomOutBtn);
    expect(zoomResetBtn).toHaveTextContent('80%');

    // Resetar zoom
    fireEvent.click(zoomResetBtn);
    expect(zoomResetBtn).toHaveTextContent('100%');
  });

  it('deve abrir modal de tela cheia e fechar ao clicar no botão ou na tecla Esc', async () => {
    render(<MermaidBlock code={sampleCode} />);

    await waitFor(() => {
      expect(screen.getByTestId('mermaid-diagram-container')).toBeInTheDocument();
    });

    // Abrir tela cheia
    const fullscreenBtn = screen.getByTestId('mermaid-fullscreen-btn');
    fireEvent.click(fullscreenBtn);

    expect(screen.getByTestId('mermaid-fullscreen-modal')).toBeInTheDocument();

    // Fechar pelo botão
    const closeBtn = screen.getByTestId('mermaid-close-fullscreen-btn');
    fireEvent.click(closeBtn);

    expect(screen.queryByTestId('mermaid-fullscreen-modal')).not.toBeInTheDocument();

    // Abrir novamente e fechar com Escape
    fireEvent.click(fullscreenBtn);
    expect(screen.getByTestId('mermaid-fullscreen-modal')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('mermaid-fullscreen-modal')).not.toBeInTheDocument();
  });

  it('deve copiar o código fonte do Mermaid para a área de transferência', async () => {
    render(<MermaidBlock code={sampleCode} />);

    const copyCodeBtn = screen.getByTestId('mermaid-copy-code');
    fireEvent.click(copyCodeBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(sampleCode.trim());
    expect(copyCodeBtn).toHaveTextContent('Copiado!');
  });

  it('deve copiar o SVG para a área de transferência quando renderizado', async () => {
    render(<MermaidBlock code={sampleCode} />);

    await waitFor(() => {
      expect(screen.getByTestId('mermaid-copy-svg')).toBeInTheDocument();
    });

    const copySvgBtn = screen.getByTestId('mermaid-copy-svg');
    fireEvent.click(copySvgBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(sampleSvg);
    expect(copySvgBtn).toHaveTextContent('Copiado!');
  });

  it('deve exibir fallback gracioso de erro quando o código for inválido sem quebrar a aplicação', async () => {
    // Simula erro de sintaxe lançado pelo mermaid.render
    vi.mocked(mermaid.render).mockRejectedValueOnce(new Error('Parse error on line 2'));

    // Cria um elemento residual simulando o comportamento do Mermaid no DOM
    const dummyErrorElement = document.createElement('div');
    dummyErrorElement.id = 'dmermaid-test-dummy';
    document.body.appendChild(dummyErrorElement);

    render(<MermaidBlock code="graph INVALID SINTAX!!!" />);

    await waitFor(() => {
      expect(screen.getByTestId('mermaid-error-fallback')).toBeInTheDocument();
    });

    expect(screen.getByText('Sintaxe Mermaid Inválida ou Parcial')).toBeInTheDocument();
    // Elemento residual deve ter sido removido
    expect(document.getElementById('dmermaid-test-dummy')).toBeNull();
  });

  it('deve exibir fallback de erro quando o código for vazio', async () => {
    render(<MermaidBlock code="   " />);

    await waitFor(() => {
      expect(screen.getByTestId('mermaid-error-fallback')).toBeInTheDocument();
    });
  });
});

describe('MermaidErrorBoundary', () => {
  const ThrowingComponent = () => {
    throw new Error('Crash intencional de render');
  };

  it('deve capturar erros de renderização e exibir o fallback seguro com o código', () => {
    // Desativa console.warn temporariamente durante o teste de crash intencional
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <MermaidErrorBoundary fallbackCode="graph TD\n A-->B">
        <ThrowingComponent />
      </MermaidErrorBoundary>
    );

    expect(screen.getByTestId('mermaid-error-boundary')).toBeInTheDocument();
    expect(screen.getByText('Falha na renderização visual do Mermaid (Fallback seguro)')).toBeInTheDocument();
    expect(screen.getByText(/graph TD/)).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
