import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { WorkspaceManager } from '../../../../src/services/workspaceManager';

describe('WorkspaceManager - Isolamento de Workspaces Efêmeros (Issue #59)', () => {
  let testRoot: string;
  let ephemeralRoot: string;
  let baseProjectDir: string;
  let manager: WorkspaceManager;

  beforeEach(() => {
    testRoot = path.join(os.tmpdir(), `kraken-test-ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    ephemeralRoot = path.join(testRoot, 'ephemeral');
    baseProjectDir = path.join(testRoot, 'base-project');

    fs.mkdirSync(ephemeralRoot, { recursive: true });
    fs.mkdirSync(baseProjectDir, { recursive: true });

    // Cria um arquivo fictício no projeto base
    fs.writeFileSync(path.join(baseProjectDir, 'index.ts'), 'console.log("hello base");', 'utf8');

    manager = new WorkspaceManager(ephemeralRoot);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testRoot)) {
        fs.rmSync(testRoot, { recursive: true, force: true });
      }
    } catch {}
  });

  it('deve alocar o workspace base diretamente quando não houver concorrência', async () => {
    const alloc = await manager.acquireWorkspace('conv-1', baseProjectDir, { subproject: 'demo' });

    expect(alloc.conversationId).toBe('conv-1');
    expect(alloc.isEphemeral).toBe(false);
    expect(alloc.workDir).toBe(path.resolve(baseProjectDir));
    expect(manager.isDirInUse(baseProjectDir)).toBe(true);
  });

  it('deve detectar concorrência e instanciar workspace efêmero isolado para segundo agente', async () => {
    // Primeiro agente adquire o workspace do projeto base
    const alloc1 = await manager.acquireWorkspace('conv-1', baseProjectDir);
    expect(alloc1.isEphemeral).toBe(false);

    // Segundo agente tenta trabalhar no mesmo projeto simultaneamente
    const alloc2 = await manager.acquireWorkspace('conv-2', baseProjectDir);
    expect(alloc2.isEphemeral).toBe(true);
    expect(alloc2.workDir).not.toBe(path.resolve(baseProjectDir));
    expect(alloc2.workDir).toContain(alloc2.conversationId);
    expect(fs.existsSync(alloc2.workDir)).toBe(true);

    // O arquivo do projeto base deve ter sido replicado no workspace efêmero
    expect(fs.existsSync(path.join(alloc2.workDir, 'index.ts'))).toBe(true);

    // Modificações no workspace efêmero não devem poluir o projeto base
    fs.writeFileSync(path.join(alloc2.workDir, 'index.ts'), 'console.log("altered by agent 2");', 'utf8');
    const baseContent = fs.readFileSync(path.join(baseProjectDir, 'index.ts'), 'utf8');
    expect(baseContent).toBe('console.log("hello base");');
  });

  it('deve realizar cleanup e remover o workspace efêmero ao liberar a conversa', async () => {
    await manager.acquireWorkspace('conv-1', baseProjectDir);
    const alloc2 = await manager.acquireWorkspace('conv-2', baseProjectDir);

    const ephemeralPath = alloc2.workDir;
    expect(fs.existsSync(ephemeralPath)).toBe(true);

    // Libera a segunda sessão concorrente
    await manager.releaseWorkspace('conv-2');
    expect(fs.existsSync(ephemeralPath)).toBe(false);
    expect(manager.getAllocation('conv-2')).toBeUndefined();

    // Primeira sessão ainda mantém o lock do projeto base
    expect(manager.isDirInUse(baseProjectDir)).toBe(true);

    // Libera a primeira sessão
    await manager.releaseWorkspace('conv-1');
    expect(manager.isDirInUse(baseProjectDir)).toBe(false);
  });

  it('deve purgar workspaces órfãos antigos não associados a conversas ativas', async () => {
    const orphanDir = path.join(ephemeralRoot, 'orphan-conv-999');
    fs.mkdirSync(orphanDir, { recursive: true });
    fs.writeFileSync(path.join(orphanDir, 'temp.txt'), 'abandoned data', 'utf8');

    // Força mtime antigo no passado (1 hora atrás)
    const oldTime = (Date.now() - 3600 * 1000) / 1000;
    fs.utimesSync(orphanDir, oldTime, oldTime);

    const purgedCount = await manager.purgeOrphanWorkspaces(60 * 1000); // threshold 1 minuto
    expect(purgedCount).toBe(1);
    expect(fs.existsSync(orphanDir)).toBe(false);
  });
});
