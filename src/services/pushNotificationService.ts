import fs from 'fs';
import path from 'path';
import webpush, { type PushSubscription } from 'web-push';

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, any>;
}

export interface StoredSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: string;
  userAgent?: string;
}

export interface TaskStartEvent {
  conversationId: string;
  agent: string;
  subproject?: string;
}

export interface FileMutationEvent {
  conversationId: string;
  agent: string;
  file: string;
  toolName?: string;
}

export interface TaskCompleteEvent {
  conversationId: string;
  agent: string;
  success: boolean;
  durationMs: number;
}

class PushNotificationService {
  private dataDir = path.resolve('data');
  private vapidFilePath = path.join(this.dataDir, 'vapid_keys.json');
  private subscriptionsFilePath = path.join(this.dataDir, 'push_subscriptions.json');

  private vapidPublicKey = '';
  private vapidPrivateKey = '';
  private vapidSubject = 'mailto:admin@krakenbridge.local';
  private subscriptions: StoredSubscription[] = [];

  // Debounce maps para evitar flood de notificações no smartphone
  private recentMutations = new Map<string, number>();
  private taskStartDebounce = new Map<string, number>();

  constructor() {
    this.ensureDataDir();
    this.initializeVapidKeys();
    this.loadSubscriptions();
  }

  private ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (err) {
        console.warn('[PushNotificationService] Aviso ao criar pasta data/:', (err as Error).message);
      }
    }
  }

  private initializeVapidKeys() {
    // 1. Tenta carregar das variáveis de ambiente
    const envPublic = process.env.VAPID_PUBLIC_KEY;
    const envPrivate = process.env.VAPID_PRIVATE_KEY;
    const envSubject = process.env.VAPID_SUBJECT;

    if (envPublic && envPrivate) {
      this.vapidPublicKey = envPublic.trim();
      this.vapidPrivateKey = envPrivate.trim();
      if (envSubject) this.vapidSubject = envSubject.trim();
    } else if (fs.existsSync(this.vapidFilePath)) {
      // 2. Tenta carregar de data/vapid_keys.json
      try {
        const raw = fs.readFileSync(this.vapidFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.publicKey && parsed.privateKey) {
          this.vapidPublicKey = parsed.publicKey;
          this.vapidPrivateKey = parsed.privateKey;
          if (parsed.subject) this.vapidSubject = parsed.subject;
        }
      } catch (err) {
        console.warn('[PushNotificationService] Falha ao ler vapid_keys.json, gerando novas chaves:', (err as Error).message);
      }
    }

    // 3. Se ainda não possui chaves válidas, gera automaticamente
    if (!this.vapidPublicKey || !this.vapidPrivateKey) {
      try {
        const newKeys = webpush.generateVAPIDKeys();
        this.vapidPublicKey = newKeys.publicKey;
        this.vapidPrivateKey = newKeys.privateKey;
        this.ensureDataDir();
        fs.writeFileSync(
          this.vapidFilePath,
          JSON.stringify({
            publicKey: this.vapidPublicKey,
            privateKey: this.vapidPrivateKey,
            subject: this.vapidSubject,
            createdAt: new Date().toISOString()
          }, null, 2),
          'utf-8'
        );
        console.log('[PushNotificationService] Novas chaves VAPID geradas e salvas em data/vapid_keys.json');
      } catch (err) {
        console.error('[PushNotificationService] Erro ao gerar chaves VAPID:', err);
      }
    }

    if (this.vapidPublicKey && this.vapidPrivateKey) {
      try {
        webpush.setVapidDetails(
          this.vapidSubject,
          this.vapidPublicKey,
          this.vapidPrivateKey
        );
      } catch (err) {
        console.warn('[PushNotificationService] Erro ao configurar VAPID details:', (err as Error).message);
      }
    }
  }

  private loadSubscriptions() {
    if (!fs.existsSync(this.subscriptionsFilePath)) {
      this.subscriptions = [];
      return;
    }
    try {
      const raw = fs.readFileSync(this.subscriptionsFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.subscriptions = parsed;
      }
    } catch (err) {
      console.warn('[PushNotificationService] Erro ao carregar push_subscriptions.json:', (err as Error).message);
      this.subscriptions = [];
    }
  }

  private saveSubscriptions() {
    this.ensureDataDir();
    try {
      fs.writeFileSync(
        this.subscriptionsFilePath,
        JSON.stringify(this.subscriptions, null, 2),
        'utf-8'
      );
    } catch (err) {
      console.error('[PushNotificationService] Erro ao salvar push_subscriptions.json:', err);
    }
  }

  public getVapidPublicKey(): string {
    return this.vapidPublicKey;
  }

  public getSubscriptionsCount(): number {
    return this.subscriptions.length;
  }

  public subscribe(sub: PushSubscription, userAgent?: string): boolean {
    if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      return false;
    }

    const existingIndex = this.subscriptions.findIndex(s => s.endpoint === sub.endpoint);
    const item: StoredSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth
      },
      createdAt: new Date().toISOString(),
      userAgent
    };

    if (existingIndex >= 0) {
      this.subscriptions[existingIndex] = item;
    } else {
      this.subscriptions.push(item);
    }

    this.saveSubscriptions();
    console.log(`[PushNotificationService] Dispositivo registrado com sucesso (${this.subscriptions.length} assinaturas ativas)`);
    return true;
  }

  public unsubscribe(endpoint: string): boolean {
    const initialLength = this.subscriptions.length;
    this.subscriptions = this.subscriptions.filter(s => s.endpoint !== endpoint);
    if (this.subscriptions.length !== initialLength) {
      this.saveSubscriptions();
      console.log(`[PushNotificationService] Dispositivo desinscrito (${this.subscriptions.length} restantes)`);
      return true;
    }
    return false;
  }

  public async sendPushNotification(payload: PushNotificationPayload): Promise<{ sent: number; failed: number }> {
    if (this.subscriptions.length === 0) {
      return { sent: 0, failed: 0 };
    }

    const jsonPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/kraken-icon.svg',
      badge: payload.badge || '/kraken-icon.svg',
      tag: payload.tag || 'kraken-agent-event',
      data: payload.data || { url: '/' }
    });

    let sent = 0;
    let failed = 0;
    const expiredEndpoints: string[] = [];

    await Promise.all(
      this.subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth
              }
            },
            jsonPayload,
            { TTL: 60 * 60 } // 1 hora de TTL para entrega em smartphones
          );
          sent++;
        } catch (err: any) {
          failed++;
          // Se o endpoint retornou 404 (Not Found) ou 410 (Gone), a inscrição foi revogada pelo browser
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            expiredEndpoints.push(sub.endpoint);
          } else {
            console.warn('[PushNotificationService] Falha ao enviar push para endpoint:', err?.message || err);
          }
        }
      })
    );

    if (expiredEndpoints.length > 0) {
      this.subscriptions = this.subscriptions.filter(s => !expiredEndpoints.includes(s.endpoint));
      this.saveSubscriptions();
      console.log(`[PushNotificationService] Removidas ${expiredEndpoints.length} assinaturas expiradas.`);
    }

    return { sent, failed };
  }

  /**
   * Notifica início de tarefa de agente (com throttle de 15 segundos por conversa)
   */
  public async notifyTaskStart(event: TaskStartEvent): Promise<void> {
    const now = Date.now();
    const lastStart = this.taskStartDebounce.get(event.conversationId) || 0;
    if (now - lastStart < 15000) return;
    this.taskStartDebounce.set(event.conversationId, now);

    const agentName = event.agent ? event.agent.toUpperCase() : 'ANTIGRAVITY';
    const subproj = event.subproject ? `no projeto ${event.subproject}` : 'no workspace';

    await this.sendPushNotification({
      title: `🤖 Kraken: ${agentName} em Execução`,
      body: `Nova tarefa iniciada ${subproj}.`,
      tag: `task-start-${event.conversationId}`,
      data: { url: `/?conv=${event.conversationId}` }
    });
  }

  /**
   * Notifica mutação de arquivo no disco (com throttle de 3 segundos por arquivo)
   */
  public async notifyFileMutation(event: FileMutationEvent): Promise<void> {
    if (!event.file) return;

    const fileName = path.basename(event.file);
    const key = `${event.conversationId}:${fileName}`;
    const now = Date.now();
    const lastMutation = this.recentMutations.get(key) || 0;
    if (now - lastMutation < 3000) return;
    this.recentMutations.set(key, now);

    const agentName = event.agent ? event.agent.toUpperCase() : 'Agente';
    const actionDesc = event.toolName === 'write_to_file' ? 'criou/escreveu' : 'editou';

    await this.sendPushNotification({
      title: `📝 Alteração de Código: ${fileName}`,
      body: `O agente ${agentName} ${actionDesc} o arquivo.`,
      tag: `mutation-${event.conversationId}`,
      data: { url: `/?conv=${event.conversationId}`, file: event.file }
    });
  }

  /**
   * Notifica conclusão da tarefa
   */
  public async notifyTaskComplete(event: TaskCompleteEvent): Promise<void> {
    const agentName = event.agent ? event.agent.toUpperCase() : 'Agente';
    const secs = (event.durationMs / 1000).toFixed(1);

    await this.sendPushNotification({
      title: event.success ? `✅ Tarefa Concluída (${secs}s)` : `⚠️ Tarefa Finalizada com Alerta`,
      body: `${agentName} finalizou a execução em ${secs} segundos.`,
      tag: `task-complete-${event.conversationId}`,
      data: { url: `/?conv=${event.conversationId}` }
    });
  }
}

export const pushNotificationService = new PushNotificationService();
