import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  cleanRawPath, 
  extractMemoryPagePath, 
  resolveCandidatePaths, 
  isPathAllowed,
  findContentInConversationHistory
} from '../dist-server/services/filesService.js';
import { historyService } from '../dist-server/services/historyService.js';

test('filesService: cleanRawPath deve remover âncoras e esquemas file://', () => {
  assert.equal(cleanRawPath('file:///workspace/src/index.ts#L10-L20'), '/workspace/src/index.ts');
  assert.equal(cleanRawPath('file:///workspace/projeto/arquivo.ts'), '/workspace/projeto/arquivo.ts');
  assert.equal(cleanRawPath('file://relative/path.md#header'), 'relative/path.md');
  assert.equal(cleanRawPath('src/utils.ts'), 'src/utils.ts');
  assert.equal(cleanRawPath(''), '');
});

test('filesService: extractMemoryPagePath deve identificar páginas de memória', () => {
  assert.equal(
    extractMemoryPagePath('file:///workspace/.agents/memory/homelab/anytype-formatting-audit.md'),
    'homelab/anytype-formatting-audit.md'
  );
  assert.equal(
    extractMemoryPagePath('.agents/memory/decisions/issue-127.md#L5'),
    'decisions/issue-127.md'
  );
  assert.equal(
    extractMemoryPagePath('ai-memory:projects/status-hub/audit.md'),
    'projects/status-hub/audit.md'
  );
  assert.equal(
    extractMemoryPagePath('/memory/notes/todo.md'),
    'notes/todo.md'
  );
  assert.equal(extractMemoryPagePath('/workspace/src/index.ts'), null);
});

test('filesService: resolveCandidatePaths deve incluir caminhos do subprojeto e workspace', () => {
  // Caminho relativo com subprojeto
  const relCandidates = resolveCandidatePaths('server/services/config.ts', 'JobsFinder');
  assert.ok(relCandidates.some(c => c.includes('JobsFinder/server/services/config.ts')));

  // Caminho com barra inicial forçada a partir de relativo com subprojeto
  const forcedAbsCandidates = resolveCandidatePaths('/server/services/config.ts', 'JobsFinder');
  assert.ok(forcedAbsCandidates.some(c => c.includes('JobsFinder/server/services/config.ts')));

  // Caminho genérico /workspace/ com subprojeto
  const genericWsCandidates = resolveCandidatePaths('/workspace/src/index.ts', 'meuestoque');
  assert.ok(genericWsCandidates.some(c => c.includes('meuestoque/src/index.ts')));
});

test('filesService: isPathAllowed deve validar e restringir diretórios de segurança', () => {
  assert.ok(isPathAllowed('/workspace/projeto/src/index.ts'));
  assert.ok(isPathAllowed('/DATA/AppData/meuapp/config.json'));
  assert.ok(!isPathAllowed('/etc/shadow'));
  assert.ok(!isPathAllowed('/proc/1/cmdline'));
});

test('filesService: findContentInConversationHistory deve recuperar memory_write_page e write_file', async () => {
  const fakeConvId = 'test-conv-' + Date.now();
  const mockSession = {
    id: fakeConvId,
    title: 'Conversa de Teste',
    messages: [
      {
        role: 'assistant',
        content: 'Aqui está a auditoria e o plano',
        toolCalls: [
          {
            name: 'call_mcp_tool',
            command: 'ai-memory:memory_write_page',
            parameters: {
              ToolName: 'memory_write_page',
              Arguments: {
                path: 'homelab/anytype-formatting-audit.md',
                body: '# Conteúdo da Auditoria de Formatação'
              }
            }
          },
          {
            name: 'write_file',
            parameters: {
              Path: '/root/.gemini/antigravity-cli/brain/fake/plan.md',
              Content: '# Meu Plano Gerado'
            }
          }
        ]
      }
    ]
  };

  // Salva no historyService temporariamente para o teste
  await historyService.save(mockSession);

  try {
    // 1. Recuperar memory_write_page
    const memFound = await findContentInConversationHistory(
      fakeConvId,
      'file:///workspace/.agents/memory/homelab/anytype-formatting-audit.md',
      'homelab/anytype-formatting-audit.md'
    );
    assert.ok(memFound);
    assert.equal(memFound.filename, 'anytype-formatting-audit.md');
    assert.equal(memFound.source, 'ai-memory-history');
    assert.equal(memFound.content, '# Conteúdo da Auditoria de Formatação');

    // 2. Recuperar write_file por nome ou caminho
    const fileFound = await findContentInConversationHistory(
      fakeConvId,
      'plan.md'
    );
    assert.ok(fileFound);
    assert.equal(fileFound.filename, 'plan.md');
    assert.equal(fileFound.source, 'history');
    assert.equal(fileFound.content, '# Meu Plano Gerado');
  } finally {
    await historyService.delete(fakeConvId).catch(() => {});
  }
});
