import React, { useEffect, useMemo, useState } from 'react';
import CodeMirror, { EditorView, keymap, type Extension } from '@uiw/react-codemirror';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

export interface CodeMirrorEditorProps {
  value: string;
  filename: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  initialLine?: number;
}

/**
 * Carrega sob demanda apenas o parser Lezer correspondente à extensão do arquivo,
 * evitando empacotar os +250 modos legados do @codemirror/language-data.
 */
async function loadCodeMirrorLanguage(filename: string): Promise<Extension | null> {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'ts':
    case 'mts':
    case 'cts': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({ typescript: true });
    }
    case 'tsx': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({ typescript: true, jsx: true });
    }
    case 'js':
    case 'mjs':
    case 'cjs': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript();
    }
    case 'jsx': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({ jsx: true });
    }
    case 'json':
    case 'jsonc': {
      const { json } = await import('@codemirror/lang-json');
      return json();
    }
    case 'md':
    case 'markdown':
    case 'mdx': {
      const { markdown } = await import('@codemirror/lang-markdown');
      return markdown();
    }
    case 'yml':
    case 'yaml': {
      const { yaml } = await import('@codemirror/lang-yaml');
      return yaml();
    }
    case 'css':
    case 'scss':
    case 'less': {
      const { css } = await import('@codemirror/lang-css');
      return css();
    }
    case 'html':
    case 'htm': {
      const { html } = await import('@codemirror/lang-html');
      return html();
    }
    case 'xml':
    case 'svg': {
      const { xml } = await import('@codemirror/lang-xml');
      return xml();
    }
    case 'py': {
      const { python } = await import('@codemirror/lang-python');
      return python();
    }
    case 'sql': {
      const { sql } = await import('@codemirror/lang-sql');
      return sql();
    }
    case 'go': {
      const { go } = await import('@codemirror/lang-go');
      return go();
    }
    case 'rs': {
      const { rust } = await import('@codemirror/lang-rust');
      return rust();
    }
    default:
      return null;
  }
}

/**
 * Editor leve (CodeMirror 6) para edições rápidas direto no chat.
 * O suporte à linguagem é resolvido pelo nome do arquivo e carregado sob demanda.
 */
const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({ value, filename, onChange, onSave, initialLine }) => {
  const [languageExt, setLanguageExt] = useState<Extension | null>(null);
  const [view, setView] = useState<EditorView | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCodeMirrorLanguage(filename)
      .then((support) => {
        if (!cancelled) setLanguageExt(support);
      })
      .catch(() => {
        if (!cancelled) setLanguageExt(null);
      });
    return () => {
      cancelled = true;
    };
  }, [filename]);

  // Posiciona o cursor na linha da âncora (#L10)
  useEffect(() => {
    if (!view || !initialLine) return;
    const lineCount = view.state.doc.lines;
    const line = view.state.doc.line(Math.min(Math.max(initialLine, 1), lineCount));
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'center' })
    });
  }, [view, initialLine]);

  const extensions = useMemo(() => {
    const exts: Extension[] = [
      EditorView.lineWrapping,
      keymap.of([
        {
          key: 'Mod-s',
          preventDefault: true,
          run: () => {
            onSave?.();
            return true;
          }
        }
      ])
    ];
    if (languageExt) exts.push(languageExt);
    return exts;
  }, [languageExt, onSave]);

  return (
    <div className="rounded-xl border border-base-300 overflow-hidden text-xs h-full" data-testid="codemirror-editor">
      <CodeMirror
        value={value}
        height="100%"
        minHeight="60vh"
        theme={vscodeDark}
        extensions={extensions}
        onChange={onChange}
        onCreateEditor={(v) => setView(v)}
        basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, autocompletion: true }}
      />
    </div>
  );
};

export default CodeMirrorEditor;
