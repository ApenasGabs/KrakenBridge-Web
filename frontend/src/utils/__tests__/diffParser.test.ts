import { describe, it, expect } from 'vitest';
import { parseFileOperation, parseUnifiedDiffText } from '../diffParser';

describe('diffParser', () => {
  it('deve analisar replace_file_content com bloco unificado [diff_block_start]', () => {
    const tool = {
      name: 'replace_file_content',
      parameters: {
        TargetFile: '/app/services/identityService.js',
        Instruction: 'Adiciona diretiva de visibilidade'
      },
      output: `The following changes were made to /app/services/identityService.js:
[diff_block_start]
@@ -69,6 +69,7 @@
  const a = 1;
- const b = 2;
+ const b = 3;
+ const c = 4;
  const d = 5;
[diff_block_end]`
    };

    const parsed = parseFileOperation(tool);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe('edit');
    expect(parsed?.fileName).toBe('identityService.js');
    expect(parsed?.relativeDir).toBe('/app/services');
    expect(parsed?.added).toBe(2);
    expect(parsed?.removed).toBe(1);
    expect(parsed?.lines.some(l => l.kind === 'gap')).toBe(true);
    expect(parsed?.lines.some(l => l.kind === 'add' && l.text.includes('const b = 3;'))).toBe(true);
    expect(parsed?.lines.some(l => l.kind === 'del' && l.text.includes('const b = 2;'))).toBe(true);
  });

  it('deve analisar parseUnifiedDiffText diretamente', () => {
    const rawDiff = `@@ -1,3 +1,3 @@
 const x = 1;
-const y = 2;
+const y = 20;
 const z = 3;`;
    const result = parseUnifiedDiffText(rawDiff);
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
    expect(result.lines.length).toBe(5); // 1 gap + 1 ctx + 1 del + 1 add + 1 ctx
  });

  it('deve analisar replace_file_content via TargetContent e ReplacementContent quando não houver diff_block', () => {
    const tool = {
      name: 'replace_file_content',
      parameters: {
        TargetFile: '/workspace/app.js',
        TargetContent: 'console.log("old");',
        ReplacementContent: 'console.log("new 1");\nconsole.log("new 2");',
        StartLine: 10,
        EndLine: 10
      },
      output: 'Success'
    };

    const parsed = parseFileOperation(tool);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe('edit');
    expect(parsed?.added).toBe(2);
    expect(parsed?.removed).toBe(1);
    expect(parsed?.lines[0].oldLineNumber).toBe(10);
    expect(parsed?.lines[1].newLineNumber).toBe(10);
    expect(parsed?.lines[2].newLineNumber).toBe(11);
  });

  it('deve analisar write_to_file como criação de arquivo', () => {
    const tool = {
      name: 'write_to_file',
      parameters: {
        TargetFile: '/workspace/src/index.ts',
        Description: 'Criar ponto de entrada',
        CodeContent: 'import express from "express";\nconst app = express();'
      },
      output: 'Created file'
    };

    const parsed = parseFileOperation(tool);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe('create');
    expect(parsed?.fileName).toBe('index.ts');
    expect(parsed?.added).toBe(2);
    expect(parsed?.removed).toBe(0);
    expect(parsed?.lines.every(l => l.kind === 'add')).toBe(true);
  });

  it('deve analisar view_file extraindo números de linha e código', () => {
    const tool = {
      name: 'view_file',
      parameters: {
        AbsolutePath: '/workspace/package.json',
        StartLine: 1,
        EndLine: 3
      },
      output: `File Path: file:///workspace/package.json
Showing lines 1 to 3
1: {
2:   "name": "app",
3:   "version": "1.0.0"
`
    };

    const parsed = parseFileOperation(tool);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe('view');
    expect(parsed?.fileName).toBe('package.json');
    expect(parsed?.lines.length).toBe(3);
    expect(parsed?.lines[0].newLineNumber).toBe(1);
    expect(parsed?.lines[0].text).toBe('{');
    expect(parsed?.lines[2].text).toBe('  "version": "1.0.0"');
  });

  it('deve retornar null para comandos de terminal comuns', () => {
    const tool = {
      name: 'run_command',
      command: 'docker ps',
      output: 'CONTAINER ID IMAGE'
    };

    const parsed = parseFileOperation(tool);
    expect(parsed).toBeNull();
  });
});
