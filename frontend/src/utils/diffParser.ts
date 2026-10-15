export type DiffLineKind = 'context' | 'add' | 'del' | 'gap' | 'meta';

export interface ParsedDiffLine {
  kind: DiffLineKind;
  text: string;
  oldLineNumber?: number | null;
  newLineNumber?: number | null;
}

export interface FileOperationData {
  kind: 'edit' | 'create' | 'view' | 'diff';
  filePath: string;
  fileName: string;
  relativeDir: string;
  description?: string;
  added: number;
  removed: number;
  totalLines: number;
  lines: ParsedDiffLine[];
  startLine?: number;
  endLine?: number;
  rawContent?: string;
}

function extractBaseName(pathStr: string): { fileName: string; relativeDir: string } {
  if (!pathStr) return { fileName: 'arquivo', relativeDir: '' };
  const normalized = pathStr.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const fileName = parts.pop() || normalized;
  const relativeDir = parts.join('/');
  return { fileName, relativeDir };
}

/**
 * Analisa chamadas de ferramenta e saídas para determinar se é uma operação de arquivo
 * e extrai modelo semântico de diff e preview.
 */
export function parseFileOperation(tool: {
  name: string;
  command?: string;
  args?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  output?: string;
}): FileOperationData | null {
  const params = tool.parameters || tool.args || {};
  const output = tool.output || '';
  const name = tool.name;

  // 1. replace_file_content (Edição de Arquivo)
  if (name === 'replace_file_content') {
    const filePath = (params.TargetFile as string) || '';
    const { fileName, relativeDir } = extractBaseName(filePath);
    const description = (params.Instruction as string) || (params.Description as string) || '';
    const startLine = Number(params.StartLine) || 1;
    const endLine = Number(params.EndLine) || startLine;

    // Tenta extrair bloco unificado [diff_block_start] ... [diff_block_end]
    const diffBlockMatch = output.match(/\[diff_block_start\]([\s\S]*?)\[diff_block_end\]/);
    if (diffBlockMatch) {
      const parsed = parseUnifiedDiffText(diffBlockMatch[1]);
      return {
        kind: 'edit',
        filePath,
        fileName,
        relativeDir,
        description,
        added: parsed.added,
        removed: parsed.removed,
        totalLines: parsed.lines.length,
        lines: parsed.lines,
        startLine,
        endLine,
        rawContent: output
      };
    }

    // Fallback se o diff_block não estiver na saída: compara TargetContent vs ReplacementContent
    const targetContent = typeof params.TargetContent === 'string' ? params.TargetContent : '';
    const replacementContent = typeof params.ReplacementContent === 'string' ? params.ReplacementContent : '';

    const lines: ParsedDiffLine[] = [];
    let added = 0;
    let removed = 0;

    const delLines = targetContent ? targetContent.split(/\r?\n/) : [];
    const addLines = replacementContent ? replacementContent.split(/\r?\n/) : [];

    let currentOld = startLine;
    for (const d of delLines) {
      lines.push({ kind: 'del', text: d, oldLineNumber: currentOld, newLineNumber: null });
      currentOld++;
      removed++;
    }

    let currentNew = startLine;
    for (const a of addLines) {
      lines.push({ kind: 'add', text: a, oldLineNumber: null, newLineNumber: currentNew });
      currentNew++;
      added++;
    }

    return {
      kind: 'edit',
      filePath,
      fileName,
      relativeDir,
      description,
      added,
      removed,
      totalLines: lines.length,
      lines,
      startLine,
      endLine,
      rawContent: output || replacementContent
    };
  }

  // 2. write_to_file (Criação ou Sobrescrita de Arquivo)
  if (name === 'write_to_file') {
    const filePath = (params.TargetFile as string) || '';
    const { fileName, relativeDir } = extractBaseName(filePath);
    const description = (params.Description as string) || '';
    const codeContent = typeof params.CodeContent === 'string' ? params.CodeContent : '';
    const contentLines = codeContent ? codeContent.split(/\r?\n/) : [];

    const lines: ParsedDiffLine[] = contentLines.map((line, idx) => ({
      kind: 'add',
      text: line,
      oldLineNumber: null,
      newLineNumber: idx + 1
    }));

    return {
      kind: 'create',
      filePath,
      fileName,
      relativeDir,
      description,
      added: lines.length,
      removed: 0,
      totalLines: lines.length,
      lines,
      startLine: 1,
      endLine: lines.length,
      rawContent: codeContent
    };
  }

  // 3. view_file (Inspeção de Arquivo)
  if (name === 'view_file') {
    const filePath = (params.AbsolutePath as string) || '';
    const { fileName, relativeDir } = extractBaseName(filePath);
    const startLine = Number(params.StartLine) || 1;
    const endLine = Number(params.EndLine) || undefined;
    const description = tool.command ? `Visualizando ${fileName}` : '';

    const lines = parseViewFileOutput(output, startLine);

    return {
      kind: 'view',
      filePath,
      fileName,
      relativeDir,
      description,
      added: 0,
      removed: 0,
      totalLines: lines.length,
      lines,
      startLine,
      endLine,
      rawContent: output
    };
  }

  // 4. Se a saída de qualquer ferramenta contiver um diff git unificado bem formado
  if (output && (output.includes('[diff_block_start]') || (output.includes('@@ -') && output.includes('+++ ')))) {
    const diffText = output.includes('[diff_block_start]')
      ? (output.match(/\[diff_block_start\]([\s\S]*?)\[diff_block_end\]/)?.[1] || output)
      : output;

    const parsed = parseUnifiedDiffText(diffText);
    if (parsed.lines.length > 0 && (parsed.added > 0 || parsed.removed > 0)) {
      const matchFile = output.match(/(?:to|file):\s*([^\s\r\n]+\.[a-zA-Z0-9]+)/i);
      const filePath = matchFile ? matchFile[1] : (tool.command || 'diff');
      const { fileName, relativeDir } = extractBaseName(filePath);

      return {
        kind: 'diff',
        filePath,
        fileName,
        relativeDir,
        description: tool.command,
        added: parsed.added,
        removed: parsed.removed,
        totalLines: parsed.lines.length,
        lines: parsed.lines,
        rawContent: output
      };
    }
  }

  return null;
}

/**
 * Converte blocos unified diff (@@ -a,b +c,d @@) em linhas modeladas
 */
export function parseUnifiedDiffText(diffText: string): {
  lines: ParsedDiffLine[];
  added: number;
  removed: number;
} {
  const rawLines = diffText.split(/\r?\n/);
  const lines: ParsedDiffLine[] = [];
  let added = 0;
  let removed = 0;

  let oldLineNo = 1;
  let newLineNo = 1;

  for (const raw of rawLines) {
    if (raw.startsWith('@@')) {
      const match = raw.match(/@@\s*-(\d+)(?:,\d+)?\s*\+(\d+)(?:,\d+)?\s*@@/);
      if (match) {
        oldLineNo = parseInt(match[1], 10);
        newLineNo = parseInt(match[2], 10);
      }
      lines.push({
        kind: 'gap',
        text: raw.trim(),
        oldLineNumber: null,
        newLineNumber: null
      });
      continue;
    }

    if (raw.startsWith('---') || raw.startsWith('+++')) {
      lines.push({
        kind: 'meta',
        text: raw,
        oldLineNumber: null,
        newLineNumber: null
      });
      continue;
    }

    if (raw.startsWith('+')) {
      added++;
      lines.push({
        kind: 'add',
        text: raw.slice(1),
        oldLineNumber: null,
        newLineNumber: newLineNo++
      });
    } else if (raw.startsWith('-')) {
      removed++;
      lines.push({
        kind: 'del',
        text: raw.slice(1),
        oldLineNumber: oldLineNo++,
        newLineNumber: null
      });
    } else {
      const text = raw.startsWith(' ') ? raw.slice(1) : raw;
      lines.push({
        kind: 'context',
        text,
        oldLineNumber: oldLineNo++,
        newLineNumber: newLineNo++
      });
    }
  }

  return { lines, added, removed };
}

/**
 * Analisa a saída do view_file que geralmente formata como "N: código..."
 */
function parseViewFileOutput(output: string, fallbackStartLine: number): ParsedDiffLine[] {
  const rawLines = output.split(/\r?\n/);
  const lines: ParsedDiffLine[] = [];

  // Pula cabeçalhos comuns como "Created At", "File Path:", "Showing lines..."
  let contentStarted = false;
  let lineCounter = fallbackStartLine;

  for (const raw of rawLines) {
    if (!contentStarted) {
      if (/^\s*\d+:\s/.test(raw)) {
        contentStarted = true;
      } else if (raw.includes('Showing lines') || raw.includes('The following code')) {
        continue;
      } else if (raw.includes('Created At') || raw.includes('File Path:')) {
        continue;
      }
    }

    const matchLineNo = raw.match(/^\s*(\d+):\s?(.*)$/);
    if (matchLineNo) {
      const num = parseInt(matchLineNo[1], 10);
      lines.push({
        kind: 'context',
        text: matchLineNo[2],
        oldLineNumber: num,
        newLineNumber: num
      });
      lineCounter = num + 1;
    } else if (contentStarted && raw.length > 0) {
      lines.push({
        kind: 'context',
        text: raw,
        oldLineNumber: lineCounter,
        newLineNumber: lineCounter
      });
      lineCounter++;
    }
  }

  // Fallback de robustez: se a saída não continha prefixos 'N: linha' (ex: texto puro de arquivo sem números de linha)
  if (lines.length === 0 && output.trim().length > 0) {
    let lineNum = fallbackStartLine;
    for (const raw of rawLines) {
      if (
        raw.includes('Showing lines') ||
        raw.includes('The following code') ||
        raw.includes('Created At') ||
        raw.includes('Completed At') ||
        raw.includes('File Path:') ||
        raw.includes('Total Lines:') ||
        raw.includes('Total Bytes:')
      ) {
        continue;
      }
      lines.push({
        kind: 'context',
        text: raw,
        oldLineNumber: lineNum,
        newLineNumber: lineNum
      });
      lineNum++;
    }
  }

  // Remove linhas vazias finais se houverem
  while (lines.length > 0 && lines[lines.length - 1].text.trim() === '' && lines[lines.length - 1].oldLineNumber === undefined) {
    lines.pop();
  }

  return lines;
}
