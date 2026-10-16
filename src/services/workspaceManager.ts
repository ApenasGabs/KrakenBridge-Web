import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface WorkspaceAllocation {
  conversationId: string;
  baseDir: string;
  workDir: string;
  isEphemeral: boolean;
  subproject?: string;
  createdAt: number;
  cleanup?: () => Promise<void>;
}

export class WorkspaceManager {
  private allocations = new Map<string, WorkspaceAllocation>();
  private ephemeralRoot: string;

  constructor(ephemeralRoot?: string) {
    this.ephemeralRoot = ephemeralRoot || process.env.EPHEMERAL_WORKSPACES_ROOT || path.join(os.tmpdir(), 'kraken-workspaces');
  }

  public getEphemeralRoot(): string {
    return this.ephemeralRoot;
  }

  public isDirInUse(targetDir: string, excludeConvId?: string): boolean {
    const normalizedTarget = path.resolve(targetDir).toLowerCase();
    for (const [convId, alloc] of this.allocations.entries()) {
      if (excludeConvId && convId === excludeConvId) continue;
      const allocBase = path.resolve(alloc.baseDir).toLowerCase();
      if (allocBase === normalizedTarget) {
        return true;
      }
    }
    return false;
  }

  public getAllocations(): WorkspaceAllocation[] {
    return Array.from(this.allocations.values());
  }

  public getAllocation(conversationId: string): WorkspaceAllocation | undefined {
    return this.allocations.get(conversationId);
  }

  public async acquireWorkspace(
    conversationId: string,
    baseDir: string,
    options?: { subproject?: string }
  ): Promise<WorkspaceAllocation> {
    const resolvedBase = path.resolve(baseDir);

    // Se já havia uma alocação para esta conversa, libera antes de re-alocar
    if (this.allocations.has(conversationId)) {
      await this.releaseWorkspace(conversationId);
    }

    const inUse = this.isDirInUse(resolvedBase, conversationId);

    if (!inUse) {
      const allocation: WorkspaceAllocation = {
        conversationId,
        baseDir: resolvedBase,
        workDir: resolvedBase,
        isEphemeral: false,
        subproject: options?.subproject,
        createdAt: Date.now()
      };
      this.allocations.set(conversationId, allocation);
      return allocation;
    }

    // CONCORRÊNCIA DETECTADA: Instancia workspace efêmero isolado
    console.log(`[WorkspaceManager] Concorrência detectada em "${resolvedBase}". Criando workspace efêmero para conv: ${conversationId}`);

    if (!fs.existsSync(this.ephemeralRoot)) {
      fs.mkdirSync(this.ephemeralRoot, { recursive: true });
    }

    const ephemeralDir = path.join(this.ephemeralRoot, conversationId);

    // Se o diretório efêmero já existir por algum motivo antigo, limpa antes
    if (fs.existsSync(ephemeralDir)) {
      try {
        fs.rmSync(ephemeralDir, { recursive: true, force: true });
      } catch (err) {
        console.warn(`[WorkspaceManager] Aviso ao pré-limpar ${ephemeralDir}:`, (err as Error).message);
      }
    }

    const isGitRepo = fs.existsSync(path.join(resolvedBase, '.git'));
    let usedWorktree = false;

    if (isGitRepo) {
      try {
        // Tenta git worktree add (compartilha objetos sem cópia pesada em disco)
        await execFileAsync('git', ['worktree', 'add', '--detach', ephemeralDir, 'HEAD'], {
          cwd: resolvedBase
        });
        usedWorktree = true;
        console.log(`[WorkspaceManager] Git worktree efêmero criado com sucesso: ${ephemeralDir}`);
      } catch (wtErr) {
        console.warn(`[WorkspaceManager] Falha ao criar git worktree (${(wtErr as Error).message}), tentando fallback clone local...`);
        try {
          await execFileAsync('git', ['clone', '--local', resolvedBase, ephemeralDir]);
          console.log(`[WorkspaceManager] Git clone local efêmero criado: ${ephemeralDir}`);
        } catch (cloneErr) {
          console.warn(`[WorkspaceManager] Falha no fallback clone local (${(cloneErr as Error).message}), copiando arquivos...`);
          fs.cpSync(resolvedBase, ephemeralDir, {
            recursive: true,
            filter: (source: string) => !source.includes('node_modules') && !source.includes('.git')
          });
        }
      }
    } else {
      // Diretório não-git: cópia simples
      fs.cpSync(resolvedBase, ephemeralDir, {
        recursive: true,
        filter: (source: string) => !source.includes('node_modules')
      });
    }

    const cleanup = async () => {
      console.log(`[WorkspaceManager] Desmontando workspace efêmero para ${conversationId}: ${ephemeralDir}`);
      if (usedWorktree && isGitRepo) {
        try {
          await execFileAsync('git', ['worktree', 'remove', '--force', ephemeralDir], {
            cwd: resolvedBase
          });
          await execFileAsync('git', ['worktree', 'prune'], {
            cwd: resolvedBase
          });
        } catch (err) {
          console.warn(`[WorkspaceManager] Aviso no git worktree remove: ${(err as Error).message}`);
        }
      }

      try {
        if (fs.existsSync(ephemeralDir)) {
          fs.rmSync(ephemeralDir, { recursive: true, force: true });
        }
      } catch (err) {
        console.warn(`[WorkspaceManager] Erro ao remover pasta efêmera ${ephemeralDir}:`, (err as Error).message);
      }
    };

    const allocation: WorkspaceAllocation = {
      conversationId,
      baseDir: resolvedBase,
      workDir: ephemeralDir,
      isEphemeral: true,
      subproject: options?.subproject,
      createdAt: Date.now(),
      cleanup
    };

    this.allocations.set(conversationId, allocation);
    return allocation;
  }

  public async releaseWorkspace(conversationId: string): Promise<void> {
    const allocation = this.allocations.get(conversationId);
    if (!allocation) return;

    if (allocation.cleanup) {
      try {
        await allocation.cleanup();
      } catch (err) {
        console.warn(`[WorkspaceManager] Erro durante cleanup de ${conversationId}:`, (err as Error).message);
      }
    }

    this.allocations.delete(conversationId);
    console.log(`[WorkspaceManager] Workspace liberado para a conversa ${conversationId}`);
  }

  public async purgeOrphanWorkspaces(maxAgeMs: number = 30 * 60 * 1000): Promise<number> {
    if (!fs.existsSync(this.ephemeralRoot)) return 0;
    let purged = 0;
    const now = Date.now();

    try {
      const entries = fs.readdirSync(this.ephemeralRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const convId = entry.name;
        const dirPath = path.join(this.ephemeralRoot, convId);

        // Se está ativo no mapa, não remove
        if (this.allocations.has(convId)) continue;

        try {
          const stats = fs.statSync(dirPath);
          const age = now - stats.mtimeMs;
          if (age >= maxAgeMs) {
            console.log(`[WorkspaceManager] Purgando workspace órfão inativo há ${Math.round(age / 1000)}s: ${dirPath}`);
            fs.rmSync(dirPath, { recursive: true, force: true });
            purged++;
          }
        } catch (err) {
          console.warn(`[WorkspaceManager] Erro ao purgar ${dirPath}:`, (err as Error).message);
        }
      }
    } catch (err) {
      console.warn(`[WorkspaceManager] Erro ao ler diretório efêmero raiz:`, (err as Error).message);
    }

    return purged;
  }
}

export const workspaceManager = new WorkspaceManager();
