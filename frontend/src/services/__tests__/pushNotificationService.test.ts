// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pushNotificationService } from '../../../../src/services/pushNotificationService';

describe('PushNotificationService - PWA & Web Push (Issue #53)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve possuir chave pública VAPID configurada e válida', () => {
    const key = pushNotificationService.getVapidPublicKey();
    expect(key).toBeDefined();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(20);
  });

  it('deve registrar nova assinatura push com sucesso e permitir desinscrição', () => {
    const mockSub = {
      endpoint: `https://push.example.com/test-endpoint-${Date.now()}`,
      keys: {
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM=',
        auth: 'tBHItJI5svbpez7KI4CCXg=='
      }
    };

    const countBefore = pushNotificationService.getSubscriptionsCount();
    const ok = pushNotificationService.subscribe(mockSub, 'Mozilla/5.0 Mobile');
    expect(ok).toBe(true);
    expect(pushNotificationService.getSubscriptionsCount()).toBe(countBefore + 1);

    // Desinscrição
    const unsubOk = pushNotificationService.unsubscribe(mockSub.endpoint);
    expect(unsubOk).toBe(true);
    expect(pushNotificationService.getSubscriptionsCount()).toBe(countBefore);
  });

  it('deve silenciar mutação de código e início de tarefa por padrão para evitar alert fatigue', async () => {
    const sendSpy = vi.spyOn(pushNotificationService, 'sendPushNotification').mockResolvedValue({ sent: 1, failed: 0 });

    delete process.env.ENABLE_FILE_MUTATION_PUSH;
    delete process.env.ENABLE_TASK_LIFECYCLE_PUSH;

    const convId = `conv-quiet-${Date.now()}`;
    await pushNotificationService.notifyTaskStart({
      conversationId: convId,
      agent: 'antigravity',
      subproject: 'backend'
    });

    await pushNotificationService.notifyFileMutation({
      conversationId: convId,
      agent: 'antigravity',
      file: '/workspace/src/App.tsx',
      toolName: 'replace_file_content'
    });

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('deve disparar notificação de início de tarefa respeitando throttle quando flag está ativa', async () => {
    process.env.ENABLE_TASK_LIFECYCLE_PUSH = 'true';
    const sendSpy = vi.spyOn(pushNotificationService, 'sendPushNotification').mockResolvedValue({ sent: 1, failed: 0 });

    const convId = `conv-test-${Date.now()}`;
    await pushNotificationService.notifyTaskStart({
      conversationId: convId,
      agent: 'antigravity',
      subproject: 'backend'
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringContaining('ANTIGRAVITY'),
      body: expect.stringContaining('backend')
    }));

    // Segunda chamada imediata deve sofrer throttle
    await pushNotificationService.notifyTaskStart({
      conversationId: convId,
      agent: 'antigravity',
      subproject: 'backend'
    });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    delete process.env.ENABLE_TASK_LIFECYCLE_PUSH;
  });

  it('deve disparar notificação de mutação de arquivo no disco informando TargetFile quando flag está ativa', async () => {
    process.env.ENABLE_FILE_MUTATION_PUSH = 'true';
    const sendSpy = vi.spyOn(pushNotificationService, 'sendPushNotification').mockResolvedValue({ sent: 1, failed: 0 });

    const convId = `conv-mut-${Date.now()}`;
    await pushNotificationService.notifyFileMutation({
      conversationId: convId,
      agent: 'antigravity',
      file: '/workspace/src/App.tsx',
      toolName: 'replace_file_content'
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringContaining('App.tsx'),
      body: expect.stringContaining('editou')
    }));
    delete process.env.ENABLE_FILE_MUTATION_PUSH;
  });

  it('deve disparar notificação de conclusão de tarefa com tempo de execução quando habilitado', async () => {
    process.env.ENABLE_TASK_LIFECYCLE_PUSH = 'true';
    const sendSpy = vi.spyOn(pushNotificationService, 'sendPushNotification').mockResolvedValue({ sent: 1, failed: 0 });

    const convId = `conv-done-${Date.now()}`;
    await pushNotificationService.notifyTaskComplete({
      conversationId: convId,
      agent: 'antigravity',
      success: true,
      durationMs: 4200
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringContaining('Tarefa Concluída'),
      body: expect.stringContaining('4.2 segundos')
    }));
    delete process.env.ENABLE_TASK_LIFECYCLE_PUSH;
  });

  it('deve disparar notificação de ação humana necessária (Human-in-the-Loop)', async () => {
    const sendSpy = vi.spyOn(pushNotificationService, 'sendPushNotification').mockResolvedValue({ sent: 1, failed: 0 });

    await pushNotificationService.notifyHumanActionRequired({
      title: 'Aprovação Manual do PR #156',
      body: 'O PR está pronto e requer revisão manual',
      url: '/APE/issues/APE-156'
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringContaining('Ação Humana Necessária'),
      body: expect.stringContaining('revisão manual')
    }));
  });
});
