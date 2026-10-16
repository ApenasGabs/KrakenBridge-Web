import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cleanMarkdownForSpeech,
  extractSectionsFromMarkdown,
  splitTextIntoChunks,
  isSpeechSynthesisSupported,
  playSpeech,
  stopSpeech,
  subscribeSpeechState,
  getActiveSpeechId,
  getActiveSectionId,
  getSpeechRate,
  setSpeechRate,
} from '../speechUtils';

describe('speechUtils', () => {
  describe('cleanMarkdownForSpeech', () => {
    it('deve retornar string vazia para texto nulo ou vazio', () => {
      expect(cleanMarkdownForSpeech('')).toBe('');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(cleanMarkdownForSpeech(null as any)).toBe('');
    });

    it('deve substituir blocos de código normais por aviso falado', () => {
      const input = 'Veja o código abaixo:\n\n```typescript\nconst x = 10;\nconsole.log(x);\n```\nFicou claro?';
      const output = cleanMarkdownForSpeech(input);
      expect(output).toContain('Bloco de código omitido.');
      expect(output).not.toContain('const x = 10');
      expect(output).toContain('Veja o código abaixo.');
      expect(output).toContain('Ficou claro?');
    });

    it('deve substituir blocos de diagramas Mermaid por aviso falado', () => {
      const input = 'Aqui está a arquitetura:\n\n```mermaid\ngraph TD\nA --> B\n```\nO fluxo é simples.';
      const output = cleanMarkdownForSpeech(input);
      expect(output).toContain('Diagrama visual omitido.');
      expect(output).not.toContain('graph TD');
      expect(output).toContain('O fluxo é simples.');
    });

    it('deve converter links Markdown para apenas o texto do link', () => {
      const input = 'Consulte a documentação em [Guia Oficial](https://example.com/docs) e abra [MessageItem.tsx](file:///app/MessageItem.tsx#L10).';
      const output = cleanMarkdownForSpeech(input);
      expect(output).toContain('Guia Oficial');
      expect(output).toContain('MessageItem.tsx');
      expect(output).not.toContain('https://example.com/docs');
      expect(output).not.toContain('file:///app/MessageItem.tsx#L10');
    });

    it('deve remover marcadores de formatação como negrito, itálico e cabeçalhos', () => {
      const input = '### Título Principal\n\nEste é um texto com **negrito**, *itálico* e `código inline`.';
      const output = cleanMarkdownForSpeech(input);
      expect(output).toContain('Título Principal');
      expect(output).toContain('negrito');
      expect(output).toContain('itálico');
      expect(output).toContain('código inline');
      expect(output).not.toContain('###');
      expect(output).not.toContain('**');
      expect(output).not.toContain('`');
    });

    it('deve higienizar tabelas Markdown', () => {
      const input = '| Nome | Tipo |\n| --- | --- |\n| Portão | Docker |';
      const output = cleanMarkdownForSpeech(input);
      expect(output).not.toContain('---');
      expect(output).toContain('Nome');
      expect(output).toContain('Docker');
    });

    it('deve higienizar listas e blockquotes', () => {
      const input = '> Esta é uma citação.\n\n- Item um\n- Item dois\n1. Item numérico';
      const output = cleanMarkdownForSpeech(input);
      expect(output).toContain('Esta é uma citação');
      expect(output).toContain('Item um');
      expect(output).toContain('Item dois');
      expect(output).toContain('Item numérico');
      expect(output).not.toContain('>');
      expect(output).not.toContain('- ');
    });
  });

  describe('extractSectionsFromMarkdown', () => {
    it('deve retornar array vazio para texto vazio', () => {
      expect(extractSectionsFromMarkdown('')).toEqual([]);
      expect(extractSectionsFromMarkdown('   \n  ')).toEqual([]);
    });

    it('deve criar uma única seção quando não houver cabeçalhos', () => {
      const text = 'Esta é uma resposta direta sem cabeçalhos ou divisões.';
      const sections = extractSectionsFromMarkdown(text);
      expect(sections.length).toBe(1);
      expect(sections[0].title).toBe('Introdução');
      expect(sections[0].isFinal).toBe(true);
    });

    it('deve extrair múltiplas seções e identificar a resposta final', () => {
      const md = `Apresentação inicial.

### 🎯 O que foi feito
Criamos as funções principais.

### 🛑 Conclusão e Resposta Final
Este é o veredito final com os passos para testar.`;

      const sections = extractSectionsFromMarkdown(md);
      expect(sections.length).toBe(3);
      expect(sections[0].title).toBe('Introdução');
      expect(sections[1].title).toContain('O que foi feito');
      expect(sections[2].title).toContain('Conclusão e Resposta Final');
      expect(sections[2].isFinal).toBe(true);
    });
  });

  describe('getSpeechRate e setSpeechRate', () => {
    it('deve alterar a velocidade e respeitar os limites', () => {
      setSpeechRate(1.5);
      expect(getSpeechRate()).toBe(1.5);

      setSpeechRate(4.0); // Acima do teto de 3.0
      expect(getSpeechRate()).toBe(3.0);

      setSpeechRate(0.2); // Abaixo do piso de 0.5
      expect(getSpeechRate()).toBe(0.5);

      setSpeechRate(1.0); // Reset
      expect(getSpeechRate()).toBe(1.0);
    });
  });

  describe('splitTextIntoChunks', () => {
    it('deve retornar array vazio para texto vazio', () => {
      expect(splitTextIntoChunks('')).toEqual([]);
      expect(splitTextIntoChunks('   ')).toEqual([]);
    });

    it('deve manter texto curto em um único fragmento', () => {
      const text = 'Esta é uma frase curta.';
      expect(splitTextIntoChunks(text, 160)).toEqual([text]);
    });

    it('deve dividir textos longos em múltiplos blocos respeitando pontuação', () => {
      const text =
        'Esta é a primeira frase longa do texto. Esta é a segunda frase que também possui conteúdo relevante. E esta é a terceira frase finalizando a explicação com clareza.';
      const chunks = splitTextIntoChunks(text, 70);
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk) => {
        expect(chunk.length).toBeLessThanOrEqual(70);
      });
      expect(chunks.join(' ')).toContain('Esta é a primeira frase');
      expect(chunks.join(' ')).toContain('terceira frase');
    });
  });

  describe('isSpeechSynthesisSupported', () => {
    it('deve retornar false quando speechSynthesis não estiver presente no ambiente (ex: jsdom puro)', () => {
      expect(isSpeechSynthesisSupported()).toBe(false);
    });

    it('deve retornar true quando speechSynthesis e SpeechSynthesisUtterance estiverem presentes', () => {
      vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel: vi.fn() });
      vi.stubGlobal('SpeechSynthesisUtterance', class {});
      expect(isSpeechSynthesisSupported()).toBe(true);
      vi.unstubAllGlobals();
    });
  });

  describe('playSpeech, stopSpeech e subscribeSpeechState', () => {
    let mockSpeak: ReturnType<typeof vi.fn>;
    let mockCancel: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockSpeak = vi.fn();
      mockCancel = vi.fn();

      vi.stubGlobal('speechSynthesis', {
        speak: mockSpeak,
        cancel: mockCancel,
        getVoices: vi.fn(() => [
          { lang: 'pt-BR', name: 'Google Português' },
          { lang: 'en-US', name: 'Google English' },
        ]),
      });

      // Mock da classe SpeechSynthesisUtterance
      class MockUtterance {
        text: string;
        lang = '';
        rate = 1;
        pitch = 1;
        voice: unknown = null;
        onend: (() => void) | null = null;
        onerror: ((e: { error: string }) => void) | null = null;

        constructor(text: string) {
          this.text = text;
        }
      }

      vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
    });

    afterEach(() => {
      stopSpeech();
      vi.unstubAllGlobals();
    });

    it('deve alternar estado e chamar speak ao executar playSpeech', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeSpeechState(listener);

      playSpeech('msg-123', 'Olá, tudo bem com você?');

      expect(getActiveSpeechId()).toBe('msg-123');
      expect(getActiveSectionId()).toBe('all');
      expect(listener).toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalled();

      // Clicar na mesma mensagem deve parar
      playSpeech('msg-123', 'Olá, tudo bem com você?');
      expect(getActiveSpeechId()).toBeNull();
      expect(getActiveSectionId()).toBeNull();
      expect(mockCancel).toHaveBeenCalled();

      unsubscribe();
    });

    it('deve tocar e parar seção específica com sectionId', () => {
      playSpeech('msg-789', 'Texto da conclusão', 'sec-final');
      expect(getActiveSpeechId()).toBe('msg-789');
      expect(getActiveSectionId()).toBe('sec-final');

      // Clicar novamente na mesma seção desliga
      playSpeech('msg-789', 'Texto da conclusão', 'sec-final');
      expect(getActiveSpeechId()).toBeNull();
      expect(getActiveSectionId()).toBeNull();
    });

    it('deve parar a reprodução e resetar activeId ao invocar stopSpeech', () => {
      playSpeech('msg-456', 'Outro teste de leitura falada.');
      expect(getActiveSpeechId()).toBe('msg-456');

      stopSpeech();
      expect(getActiveSpeechId()).toBeNull();
      expect(getActiveSectionId()).toBeNull();
      expect(mockCancel).toHaveBeenCalled();
    });
  });
});
