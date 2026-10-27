import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { evolutionService } from '../services/evolutionService.js';
import { telemetryService } from '../services/telemetryService.js';
import { historyService } from '../services/historyService.js';
import { systemVersionService } from '../services/systemVersionService.js';

export const systemRouter = Router();

// Obter status da auto-evolução
systemRouter.get('/evolution/status', async (_req: Request, res: Response) => {
  try {
    const state = await evolutionService.getState();
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Disparar auto-reload pós-modificação de código
systemRouter.post('/self-reload', async (req: Request, res: Response) => {
  try {
    const { conversationId, taskDescription, rebuildFrontend } = req.body || {};
    const result = await evolutionService.triggerReload({
      conversationId,
      taskDescription,
      rebuildFrontend
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Obter status em tempo real da stack de telemetria, cgroups e lacunas resolvidas
systemRouter.get('/telemetry', async (req: Request, res: Response) => {
  try {
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost';
    const status = await telemetryService.getTelemetryStatus(host);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Provisionar ou reparar a stack de telemetria Out-of-the-Box e limites de cgroups
systemRouter.post('/telemetry/provision', async (_req: Request, res: Response) => {
  try {
    const result = await telemetryService.provisionOutOfBoxTelemetry();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Obter configuração Out-of-the-Box do Kraken
systemRouter.get('/setup', async (_req: Request, res: Response) => {
  try {
    const config = await telemetryService.getSetupConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Aplicar configurações Out-of-the-Box (envs, chaves, portas, limites de cgroups)
systemRouter.post('/setup/apply', async (req: Request, res: Response) => {
  try {
    const result = await telemetryService.applySetupConfig(req.body || {});
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Iniciar Chat Interativo de Configuração (Onboarding via Chat)
systemRouter.post('/setup/start-chat', async (req: Request, res: Response) => {
  try {
    const { customNotes } = req.body || {};
    const newId = randomUUID();
    const basePrompt = await telemetryService.buildOnboardingChatPrompt();
    const suggestedPrompt = customNotes && String(customNotes).trim()
      ? `${basePrompt}\n\nMinhas informações/preferências iniciais:\n${String(customNotes).trim()}`
      : basePrompt;

    const newSession = await historyService.save({
      id: newId,
      title: '⚙️ Setup & Auto-Configuração',
      agent: 'antigravity',
      model: 'gemini-3.8-flash-high',
      effort: 'high',
      mode: 'default',
      subproject: '',
      tags: ['setup', 'config', 'telemetria'],
      messages: []
    });

    res.json({
      success: true,
      conversationId: newSession?.id || newId,
      suggestedPrompt
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Obter status de versão atual, última disponível, releases e política ativa
systemRouter.get('/version', async (_req: Request, res: Response) => {
  try {
    const status = await systemVersionService.getStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (err: any) {
    console.error('[SystemRoute] Erro ao consultar versão:', err);
    res.status(500).json({ success: false, error: err?.message || 'Falha ao consultar versão' });
  }
});

// Atualizar política de versão (auto vs pinned)
systemRouter.post('/version/policy', (req: Request, res: Response) => {
  try {
    const { policy, pinnedVersion } = req.body || {};
    if (!['auto', 'pinned'].includes(policy)) {
      res.status(400).json({ success: false, error: 'Política inválida. Escolha "auto" ou "pinned".' });
      return;
    }

    const updated = systemVersionService.setPolicy(policy, pinnedVersion);
    res.json({
      success: true,
      policy: updated
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Erro ao alterar política' });
  }
});

// Executar atualização ou rollback para versão alvo
systemRouter.post('/version/update', async (req: Request, res: Response) => {
  try {
    const { targetTag } = req.body || {};
    const result = await systemVersionService.updateToVersion(targetTag);
    res.json(result);
  } catch (err: any) {
    console.error('[SystemRoute] Erro ao atualizar sistema:', err);
    const status = err?.statusCode || (err?.message?.includes('em andamento') ? 409 : 500);
    res.status(status).json({ success: false, error: err?.message || 'Falha ao atualizar versão' });
  }
});
