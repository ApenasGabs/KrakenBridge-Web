import React, { useEffect, useRef, useState } from 'react';
import { createHighlighterCore, type HighlighterCore, type LanguageInput } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import type { LineRange } from '../ArtifactDrawer';

export interface ShikiCodeViewProps {
  code: string;
  extension?: string;
  filename?: string;
  lineRange?: LineRange | null;
  /** Renderizado enquanto o Shiki carrega a gramática (ou se falhar). */
  fallback?: React.ReactNode;
}

/**
 * Conjunto curado de gramáticas (fine-grained bundle): cada linguagem vira um chunk
 * carregado somente quando um arquivo daquele tipo é aberto.
 */
const LANGUAGE_LOADERS: Record<string, () => LanguageInput> = {
  typescript: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  jsonc: () => import('shiki/langs/jsonc.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  ini: () => import('shiki/langs/ini.mjs'),
  dotenv: () => import('shiki/langs/dotenv.mjs'),
  bash: () => import('shiki/langs/bash.mjs'),
  dockerfile: () => import('shiki/langs/dockerfile.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  scss: () => import('shiki/langs/scss.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
  log: () => import('shiki/langs/log.mjs')
};

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: 'typescript', mts: 'typescript', cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  jsx: 'jsx',
  json: 'json', jsonc: 'jsonc', json5: 'jsonc',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  yml: 'yaml', yaml: 'yaml', lock: 'yaml',
  toml: 'toml',
  ini: 'ini', conf: 'ini', cfg: 'ini',
  env: 'dotenv',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  css: 'css', scss: 'scss', sass: 'scss', less: 'scss',
  html: 'html', htm: 'html',
  xml: 'xml', svg: 'xml',
  py: 'python',
  sql: 'sql',
  go: 'go',
  rs: 'rust',
  diff: 'diff', patch: 'diff',
  log: 'log'
};

/** Resolve a linguagem do Shiki a partir da extensão/nome do arquivo ('text' = sem destaque). */
export function resolveShikiLanguage(extension?: string, filename?: string): string {
  const name = (filename || '').toLowerCase();
  if (name === 'dockerfile' || name.startsWith('dockerfile.') || name.endsWith('.dockerfile')) return 'dockerfile';
  if (name.startsWith('.env')) return 'dotenv';
  const ext = (extension || '').toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] || 'text';
}

let highlighterPromise: Promise<HighlighterCore> | null = null;

/** Highlighter singleton com engine JavaScript (sem WASM) e tema carregado sob demanda. */
async function getHighlighter(lang: string): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import('shiki/themes/github-dark.mjs')],
      langs: [],
      engine: createJavaScriptRegexEngine()
    });
  }
  const highlighter = await highlighterPromise;
  if (lang !== 'text' && !highlighter.getLoadedLanguages().includes(lang) && LANGUAGE_LOADERS[lang]) {
    await highlighter.loadLanguage(LANGUAGE_LOADERS[lang]());
  }
  return highlighter;
}

/**
 * Visualizador somente leitura com destaque de sintaxe do Shiki (gramáticas TextMate do VS Code).
 * As gramáticas e o tema são carregados sob demanda (code splitting).
 */
const ShikiCodeView: React.FC<ShikiCodeViewProps> = ({ code, extension, filename, lineRange, fallback }) => {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setFailed(false);

    const lang = resolveShikiLanguage(extension, filename);
    getHighlighter(lang)
      .then((highlighter) => highlighter.codeToHtml(code, {
      lang,
      theme: 'github-dark',
      transformers: [
        {
          line(node, line) {
            node.properties['data-line'] = line;
            if (lineRange && line >= lineRange.start && line <= lineRange.end) {
              this.addClassToHast(node, 'kraken-line-highlight');
            }
          }
        }
      ]
    }))
      .then((result) => {
        if (!cancelled) setHtml(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [code, extension, filename, lineRange]);

  // Rola até a primeira linha referenciada pela âncora (#L10-L20)
  useEffect(() => {
    if (!html || !lineRange || !containerRef.current) return;
    const target = containerRef.current.querySelector(`[data-line="${lineRange.start}"]`);
    if (target && 'scrollIntoView' in target) {
      const timer = setTimeout(() => {
        (target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [html, lineRange]);

  if (failed || html === null) {
    return <>{fallback ?? null}</>;
  }

  return (
    <div
      ref={containerRef}
      className="kraken-shiki rounded-xl border border-base-300 overflow-x-auto text-xs shadow-inner"
      data-testid="shiki-code-view"
      // O HTML é gerado pelo Shiki a partir de texto puro (tokens escapados), não do conteúdo bruto.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default ShikiCodeView;
