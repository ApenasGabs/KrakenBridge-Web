import React, { useCallback, useRef } from 'react';
import Editor, { loader, type OnMount } from '@monaco-editor/react';

// Carrega o bundle pré-minificado local do Monaco (servido em /monaco/vs pelo Express/Vite),
// funcionando 100% offline no Homelab com IntelliSense completo sem sobrecarregar o build do Rollup.
const monacoBasePath =
  typeof window !== 'undefined'
    ? `${window.location.origin}/monaco/vs`
    : '/monaco/vs';

loader.config({
  paths: {
    vs: monacoBasePath
  }
});

export interface MonacoEditorProps {
  value: string;
  filename: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  initialLine?: number;
}

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'mdx',
  yml: 'yaml',
  yaml: 'yaml',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  py: 'python',
  sql: 'sql',
  go: 'go',
  rs: 'rust',
  ini: 'ini',
  conf: 'ini',
  env: 'ini',
  dockerfile: 'dockerfile'
};

/** Resolve o id de linguagem do Monaco a partir do nome do arquivo. */
export function resolveMonacoLanguage(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'dockerfile';
  const ext = lower.split('.').pop() || '';
  return EXTENSION_LANGUAGE_MAP[ext] || 'plaintext';
}

/**
 * Experiência completa do VS Code (Monaco): IntelliSense de TS/JS/JSON/CSS/HTML, minimap,
 * multi-cursor e busca. Carregado sob demanda apenas quando a aba "VS Code" é aberta.
 */
const MonacoEditor: React.FC<MonacoEditorProps> = ({ value, filename, onChange, onSave, initialLine }) => {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const handleMount: OnMount = useCallback((editor, monacoInstance) => {
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      onSaveRef.current?.();
    });
    if (initialLine) {
      editor.revealLineInCenter(initialLine);
      editor.setPosition({ lineNumber: initialLine, column: 1 });
    }
    editor.focus();
  }, [initialLine]);

  return (
    <div className="rounded-xl border border-base-300 overflow-hidden h-[70vh]" data-testid="monaco-editor">
      <Editor
        value={value}
        path={filename}
        language={resolveMonacoLanguage(filename)}
        theme="vs-dark"
        onChange={(v) => onChange(v ?? '')}
        onMount={handleMount}
        loading={<span className="loading loading-spinner loading-md text-primary" />}
        options={{
          fontSize: 12,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: 'on',
          tabSize: 2
        }}
      />
    </div>
  );
};

export default MonacoEditor;
