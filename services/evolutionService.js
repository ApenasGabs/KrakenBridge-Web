import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { historyService } from './historyService.js';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const STATE_FILE = path.join(DATA_DIR, 'evolution_state.json');

class EvolutionService {
  /**
   * Obtém o estado atual da última auto-evolução
   */
  async getState() {
    try {
      const exists = await fs.stat(STATE_FILE).catch(() => null);
      if (!exists) return { active: false };
      const raw = await fs.readFile(STATE_FILE, 'utf8');
      return JSON.parse(raw);
    } catch {
      return { active: false };
    }
  }

  /**
   * Dispara o processo de auto-reload desacoplado
   */
  async triggerReload({ conversationId, taskDescription, rebuildFrontend = false }) {
    await fs.mkdir(DATA_DIR, { recursive: true });

    const state = {
      active: true,
      status: 'reloading',
      conversationId: conversationId || null,
      taskDescription: taskDescription || 'Auto-construção e atualização de código',
      rebuildFrontend: !!rebuildFrontend,
      triggeredAt: new Date().toISOString(),
      pid: process.pid
    };

    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');

    // Se estiver associado a uma conversa, já adiciona um aviso no histórico
    if (conversationId) {
      await historyService.addMessage(conversationId, {
        id: randomUUID(),
        role: 'system',
        text: `⚙️ **[Auto-Evolução]** Reinício do serviço iniciado para aplicar as modificações: *"${taskDescription}"*.\nO servidor será reiniciado e esta sessão continuará em seguida.`,
        timestamp: new Date().toISOString()
      }).catch(() => {});
    }

    // Executa o script de reload desacoplado (detached)
    const scriptPath = path.resolve('scripts/self-reload.sh');
    const child = spawn('bash', [scriptPath, rebuildFrontend ? 'build' : 'quick'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env }
    });
    child.unref();

    return {
      success: true,
      message: 'Comando de auto-reload disparado com sucesso.',
      rebuildFrontend: !!rebuildFrontend
    };
  }

  /**
   * Chamado na inicialização do servidor (server.js) para verificar se veio de um auto-reload
   */
  async checkAndResumeAfterBoot() {
    try {
      const state = await this.getState();
      if (!state || !state.active || state.status !== 'reloading') {
        return;
      }

      console.log(`[EvolutionService] Retomando sessão pós-reboot para conversa: ${state.conversationId}`);

      state.status = 'resumed';
      state.active = false;
      state.resumedAt = new Date().toISOString();
      state.resumedPid = process.pid;

      await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');

      if (state.conversationId) {
        const uptime = Math.round(process.uptime());
        await historyService.addMessage(state.conversationId, {
          id: randomUUID(),
          role: 'assistant',
          text: `✅ **[Auto-Evolução Concluída]**\nO serviço foi reiniciado com sucesso na nova versão!\n- **Tarefa:** ${state.taskDescription}\n- **Novo PID:** \`${process.pid}\`\n- **Status do Servidor:** Online e pronto para continuar.`,
          timestamp: new Date().toISOString()
        }).catch((err) => console.warn('[EvolutionService] Falha ao injetar mensagem de retorno:', err.message));
      }
    } catch (err) {
      console.warn('[EvolutionService] Erro ao checar retomada pós-boot:', err.message);
    }
  }
}

export const evolutionService = new EvolutionService();
