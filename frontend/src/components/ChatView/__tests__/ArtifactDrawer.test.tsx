import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ArtifactDrawer } from '../ArtifactDrawer';
import { api } from '../../../services/api';

vi.mock('../../../services/api', () => ({
  api: {
    getFileRaw: vi.fn(),
    saveFileRaw: vi.fn()
  }
}));

// Mock do MermaidBlock para simplificar render de markdown
vi.mock('../MermaidBlock', () => ({
  MermaidBlock: ({ code }: { code: string }) => <div data-testid="mock-mermaid">{code}</div>
}));

describe('ArtifactDrawer Component (Issue #50)', () => {
  const sampleFilePath = '/root/.gemini/antigravity-cli/brain/sample_report.md';
  const sampleData = {
    path: sampleFilePath,
    filename: 'sample_report.md',
    extension: 'md',
    size: 2048,
    isMarkdown: true,
    content: '# Análise de Arquitetura\n\nEste é um **artefato de teste** gerado pelo agente.'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não deve renderizar nada se filePath for nulo', () => {
    const { container } = render(
      <ArtifactDrawer filePath={null} onClose={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('deve exibir estado de carregamento enquanto busca o arquivo', () => {
    vi.mocked(api.getFileRaw).mockReturnValue(new Promise(() => {})); // Never resolves
    render(
      <ArtifactDrawer filePath={sampleFilePath} onClose={vi.fn()} />
    );
    expect(screen.getByText(/Carregando conteúdo do arquivo/i)).toBeInTheDocument();
  });

  it('deve renderizar o cabeçalho, tamanho e conteúdo Markdown formatado após carregar', async () => {
    vi.mocked(api.getFileRaw).mockResolvedValue(sampleData);
    render(
      <ArtifactDrawer filePath={sampleFilePath} codeServerPort={8089} onClose={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('sample_report.md')).toBeInTheDocument();
    });

    expect(screen.getByText('2 KB')).toBeInTheDocument();
    expect(screen.getByText('md')).toBeInTheDocument();
    expect(screen.getByText('Análise de Arquitetura')).toBeInTheDocument();
    expect(screen.getByText('artefato de teste')).toBeInTheDocument();
  });

  it('deve alternar entre visualização formatada (preview) e código fonte (raw)', async () => {
    vi.mocked(api.getFileRaw).mockResolvedValue(sampleData);
    render(
      <ArtifactDrawer filePath={sampleFilePath} onClose={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('artifact-tab-preview')).toBeInTheDocument();
    });

    const rawTab = screen.getByTestId('artifact-tab-raw');
    fireEvent.click(rawTab);

    // Na aba de código cru, o texto markdown original com # deve ser renderizado
    expect(screen.getByText((_content, element) => {
      return element?.tagName.toLowerCase() === 'pre' && (element?.textContent?.includes('Análise de Arquitetura') ?? false);
    })).toBeInTheDocument();

    const previewTab = screen.getByTestId('artifact-tab-preview');
    fireEvent.click(previewTab);
    expect(screen.getByText('Análise de Arquitetura')).toBeInTheDocument();
  });

  it('deve copiar o conteúdo para a área de transferência ao clicar no botão Copiar', async () => {
    vi.mocked(api.getFileRaw).mockResolvedValue(sampleData);
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextSpy
      }
    });

    render(
      <ArtifactDrawer filePath={sampleFilePath} onClose={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('artifact-drawer-copy-btn')).toBeInTheDocument();
    });

    const copyBtn = screen.getByTestId('artifact-drawer-copy-btn');
    fireEvent.click(copyBtn);

    expect(writeTextSpy).toHaveBeenCalledWith(sampleData.content);
    await waitFor(() => {
      expect(screen.getByText(/Copiado!/i)).toBeInTheDocument();
    });
  });

  it('deve chamar onClose ao clicar no botão fechar ou no backdrop', async () => {
    vi.mocked(api.getFileRaw).mockResolvedValue(sampleData);
    const onClose = vi.fn();

    render(
      <ArtifactDrawer filePath={sampleFilePath} onClose={onClose} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('artifact-drawer-close')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('artifact-drawer-close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('artifact-drawer-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('deve fechar a gaveta ao pressionar a tecla Escape', async () => {
    vi.mocked(api.getFileRaw).mockResolvedValue(sampleData);
    const onClose = vi.fn();

    render(
      <ArtifactDrawer filePath={sampleFilePath} onClose={onClose} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('artifact-drawer')).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('deve exibir mensagem de erro amigável quando falhar ao carregar o arquivo', async () => {
    vi.mocked(api.getFileRaw).mockRejectedValue(new Error('Acesso negado: fora dos diretórios autorizados'));

    render(
      <ArtifactDrawer filePath="/etc/shadow" onClose={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível carregar o arquivo/i)).toBeInTheDocument();
      expect(screen.getByText(/Acesso negado: fora dos diretórios autorizados/i)).toBeInTheDocument();
    });
  });

  it('deve parsear âncora de linha (#L2-L4), chamar getFileRaw sem a âncora e destacar as linhas', async () => {
    const codeData = {
      path: '/root/project/src/index.ts',
      filename: 'index.ts',
      extension: 'ts',
      size: 512,
      isMarkdown: false,
      content: 'line 1\nline 2: target\nline 3: target\nline 4: target\nline 5'
    };
    vi.mocked(api.getFileRaw).mockResolvedValue(codeData);

    render(
      <ArtifactDrawer filePath="/root/project/src/index.ts#L2-L4" codeServerPort={8089} onClose={vi.fn()} />
    );

    // Deve chamar getFileRaw sem o fragmento de âncora
    expect(api.getFileRaw).toHaveBeenCalledWith('/root/project/src/index.ts');

    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument();
    });

    // Deve exibir o badge de linhas L2-L4
    const lineBadge = screen.getByTestId('artifact-line-badge');
    expect(lineBadge).toBeInTheDocument();
    expect(lineBadge).toHaveTextContent('L2-L4');

    // Deve destacar exatamente 3 linhas (linhas 2, 3 e 4)
    const highlightedLines = screen.getAllByTestId('highlighted-code-line');
    expect(highlightedLines).toHaveLength(3);

    // Link para a IDE deve conter sufixo :2
    const ideBtn = screen.getByTestId('artifact-drawer-ide-btn');
    expect(ideBtn).toHaveAttribute('href', expect.stringContaining(':2'));
  });
  it('deve exibir as abas Código (Shiki), Editar (CodeMirror) e VS Code (Monaco)', async () => {
    vi.mocked(api.getFileRaw).mockResolvedValue(sampleData);
    render(
      <ArtifactDrawer filePath={sampleFilePath} onClose={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('artifact-tab-raw')).toBeInTheDocument();
    });

    expect(screen.getByTestId('artifact-tab-edit')).toBeInTheDocument();
    expect(screen.getByTestId('artifact-tab-monaco')).toBeInTheDocument();
  });
});
