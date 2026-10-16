import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { historyService } from './historyService.js';
import { getActiveSessionCount } from './sessionState.js';
import type { EvolutionState, PendingReload, TriggerReloadOptions, TriggerReloadResult } from '../types/evolution.js';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const STATE_FILE = path.join(DATA_DIR, 'evolution_state.json');

class EvolutionService {
  private isDraining = false;
  private drainTimer: NodeJS.Timeout | null = null;
  private pendingReload: PendingReload | null = null;

  /**
   * Indica se o sistema está em processo de Pod Drain ativo
   */
  isDrainingActive(): boolean {
    return this.isDraining;
  }

  /**
   * Obtém o estado atual da última auto-evolução e do processo de draining
   */
  async getState(): Promise<EvolutionState> {
    let fileState: Partial<EvolutionState> = { active: false };
    try {
      const exists = await fs.stat(STATE_FILE).catch(() => null);
      if (exists) {
        const raw = await fs.readFile(STATE_FILE, 'utf8');
        fileState = JSON.parse(raw);
      }
    } catch {}

    const activeCount = getActiveSessionCount();
    const currentStatus = this.isDraining 
      ? 'draining' 
      : (fileState.status || 'idle');

    return {
      active: !!fileState.active || this.isDraining,
      ...fileState,
      status: currentStatus,
      isDraining: this.isDraining,
      activeTasksCount: activeCount,
      pendingReload: this.pendingReload
    };
  }

  /**
   * Inicia o ciclo de Graceful Reload estilo "Pod Drain":
   * Se houver tarefas ativas no chat, aguarda todas finalizarem antes de reiniciar.
   */
  async triggerReload({ conversationId, taskDescription, rebuildFrontend = false }: TriggerReloadOptions): Promise<TriggerReloadResult> {
    await fs.mkdir(DATA_DIR, { recursive: true });

    const activeCount = getActiveSessionCount();

    this.isDraining = true;
    this.pendingReload = {
      conversationId: conversationId || null,
      taskDescription: taskDescription || 'Auto-construção e atualização de código',
      rebuildFrontend: !!rebuildFrontend,
      requestedAt: new Date().toISOString()
    };

    const state: EvolutionState = {
      active: true,
      status: activeCount > 0 ? 'draining' : 'reloading',
      isDraining: true,
      conversationId: conversationId || null,
      taskDescription: taskDescription || 'Auto-construção e atualização de código',
      rebuildFrontend: !!rebuildFrontend,
      triggeredAt: new Date().toISOString(),
      pid: process.pid,
      activeTasksWhenTriggered: activeCount,
      activeTasksCount: activeCount
    };

    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');

    // Notifica na conversa que a drenagem começou
    if (conversationId) {
      const msg = activeCount > 1
        ? `⏳ **[Pod Drain - Aguardando Tarefas]**\nO reinício do serviço foi agendado para aplicar: *"${taskDescription}"*.\nExistem **${activeCount} tarefas ativas** rodando. O servidor aguardará a conclusão de todas para reiniciar sem interromper nada no meio do caminho.`
        : `⚙️ **[Auto-Evolução]** Reinício do serviço iniciado para aplicar as modificações: *"${taskDescription}"*.\nO servidor será reiniciado e esta sessão continuará em seguida.`;

      await historyService.addMessage(conversationId, {
        id: randomUUID(),
        role: 'system',
        content: msg,
        timestamp: new Date().toISOString()
      }).catch(() => {});
    }

    // Inicia monitoramento de drenagem em segundo plano
    this.startDrainWatcher();

    return {
      success: true,
      status: activeCount > 0 ? 'draining' : 'reloading',
      activeTasksCount: activeCount,
      message: activeCount > 0
        ? `Modo Draining ativado. Aguardando ${activeCount} tarefa(s) concluírem antes do reinício.`
        : 'Nenhuma tarefa ativa pendente. Reinício imediato disparado.'
    };
  }

  /**
   * Monitora ativamente as sessões até que todas terminem (Graceful Drain)
   */
  startDrainWatcher(): void {
    if (this.drainTimer) return;

    console.log('[EvolutionService] Iniciando drain watcher...');

    const checkAndExecute = async () => {
      const activeCount = getActiveSessionCount();
      console.log(`[EvolutionService] Drain check: ${activeCount} tarefa(s) ativas.`);

      if (activeCount === 0) {
        if (this.drainTimer) {
          clearInterval(this.drainTimer);
          this.drainTimer = null;
        }
        console.log('[EvolutionService] Todas as tarefas foram concluídas! Executando auto-reload agora...');
        await this.executeReloadScript();
      }
    };

    // Checa a cada 2 segundos
    this.drainTimer = setInterval(checkAndExecute, 2000);
    // Checagem imediata inicial
    checkAndExecute();
  }

  /**
   * Executa fisicamente o script desacoplado de reinício
   */
  async executeReloadScript(): Promise<void> {
    const rebuildFrontend = this.pendingReload?.rebuildFrontend;

    // Atualiza o estado para reloading antes do reboot
    try {
      const current = await this.getState();
      current.status = 'reloading';
      current.drainedAt = new Date().toISOString();
      await fs.writeFile(STATE_FILE, JSON.stringify(current, null, 2), 'utf8');
    } catch {}

    const scriptPath = path.resolve('scripts/self-reload.sh');
    const child = spawn('bash', [scriptPath, rebuildFrontend ? 'build' : 'quick'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env }
    });
    child.unref();
  }

  /**
   * Chamado na inicialização do servidor (server.ts) para verificar se veio de um auto-reload
   */
  async checkAndResumeAfterBoot(): Promise<void> {
    this.isDraining = false;
    this.pendingReload = null;

    try {
      const state = await this.getState();
      if (!state || !state.active || (state.status !== 'reloading' && state.status !== 'draining')) {
        return;
      }

      console.log(`[EvolutionService] Retomando sessão pós-reboot para conversa: ${state.conversationId}`);

      state.status = 'resumed';
      state.active = false;
      state.isDraining = false;
      state.resumedAt = new Date().toISOString();
      state.resumedPid = process.pid;

      await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');

      if (state.conversationId) {
        await historyService.addMessage(state.conversationId, {
          id: randomUUID(),
          role: 'assistant',
          content: `✅ **[Auto-Evolução Concluída - Pod Restabelecido]**\nO serviço concluiu todas as tarefas pendentes e foi reiniciado com sucesso na nova versão!\n- **Tarefa:** ${state.taskDescription}\n- **Novo PID:** \`${process.pid}\`\n- **Status:** Saudável (Zero interrupção de tarefas anteriores).`,
          timestamp: new Date().toISOString()
        }).catch((err) => console.warn('[EvolutionService] Falha ao injetar mensagem de retorno:', (err as Error).message));
      }
    } catch (err) {
      console.warn('[EvolutionService] Erro ao checar retomada pós-boot:', (err as Error).message);
    }
  }
}

export const evolutionService = new EvolutionService();
