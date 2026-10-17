import tls from 'tls';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import selfsigned from 'selfsigned';
import QRCode from 'qrcode';

export interface CoucouSession {
  pillId: string;
  agent: string;
  state: 'idle' | 'working' | 'thinking' | 'searching' | 'approval' | 'question' | 'error' | 'finished' | 'ratelimit' | 'sleeping' | 'dizzy';
  statusText: string;
  stepIndex: number;
  stepCount: number;
  updatedAt: number;
  steps?: string[];
  finalLine?: string;
  project?: string;
  color?: string;
}

export interface CoucouApprovalRequest {
  pillId: string;
  sessionId: string;
  tool: string;
  command: string;
  inputKey?: string;
}

export interface PendingApproval {
  fingerprint: string;
  pillId: string;
  sessionId: string;
  tool: string;
  command: string;
  truncated: boolean;
  createdAt: number;
  timer: NodeJS.Timeout;
  resolve: (decision: 'allow' | 'deny') => void;
}

export interface AuthenticatedClient {
  socket: tls.TLSSocket;
  device: string;
  caps: string[];
  connectedAt: number;
}

class CoucouPhoneLinkService {
  private dataDir = path.resolve('data');
  private certFilePath = path.join(this.dataDir, 'coucou_cert.json');
  private pairingFilePath = path.join(this.dataDir, 'coucou_pairing.json');

  private port: number = parseInt(process.env.COUCOU_PORT || '47821', 10);
  private server: tls.Server | null = null;
  private certPem: string = '';
  private keyPem: string = '';
  private fingerprint: string = '';
  private pairingToken: string = '';
  private pairedDeviceName: string = '';
  private pairedAt: number | null = null;

  private clients: Map<tls.TLSSocket, AuthenticatedClient> = new Map();
  private sessions: Map<string, CoucouSession> = new Map();
  private pendingApprovals: Map<string, PendingApproval> = new Map();

  constructor() {
    this.ensureDataDir();
  }

  private ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (err) {
        console.error('[CoucouPhoneLink] Falha ao criar diretório data:', err);
      }
    }
  }

  public async init(): Promise<void> {
    await this.loadOrGenerateCert();
    this.loadOrGeneratePairingToken();
  }

  private async loadOrGenerateCert(): Promise<void> {
    if (fs.existsSync(this.certFilePath)) {
      try {
        const raw = fs.readFileSync(this.certFilePath, 'utf-8');
        const data = JSON.parse(raw);
        if (data.cert && data.key && data.fingerprint) {
          this.certPem = data.cert;
          this.keyPem = data.key;
          this.fingerprint = data.fingerprint;
          return;
        }
      } catch (err) {
        console.warn('[CoucouPhoneLink] Certificado corrompido, gerando novo:', err);
      }
    }

    try {
      console.log('[CoucouPhoneLink] Gerando novo par de chaves e certificado TLS autoassinado...');
      const pems = await selfsigned.generate(
        [{ name: 'commonName', value: 'Kraken Desktop Link' }],
        { 
          keyType: 'ec',
          curve: 'P-256',
          notAfterDate: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000)
        }
      );

      const x509 = new crypto.X509Certificate(pems.cert);
      this.certPem = pems.cert;
      this.keyPem = pems.private;
      this.fingerprint = crypto.createHash('sha256').update(x509.raw).digest('hex').toLowerCase();

      fs.writeFileSync(this.certFilePath, JSON.stringify({
        cert: this.certPem,
        key: this.keyPem,
        fingerprint: this.fingerprint,
        createdAt: new Date().toISOString()
      }, null, 2), 'utf-8');

      console.log(`[CoucouPhoneLink] Certificado TLS pronto. SHA-256 Fingerprint: ${this.fingerprint}`);
    } catch (err) {
      console.error('[CoucouPhoneLink] Erro crítico ao gerar certificado TLS:', err);
    }
  }

  private loadOrGeneratePairingToken(): void {
    if (fs.existsSync(this.pairingFilePath)) {
      try {
        const raw = fs.readFileSync(this.pairingFilePath, 'utf-8');
        const data = JSON.parse(raw);
        if (data.token) {
          this.pairingToken = data.token;
          this.pairedDeviceName = data.deviceName || '';
          this.pairedAt = data.pairedAt || null;
          return;
        }
      } catch (err) {
        console.warn('[CoucouPhoneLink] Token de pareamento corrompido, gerando novo:', err);
      }
    }

    this.pairingToken = crypto.randomBytes(24).toString('base64url');
    this.savePairingData();
  }

  private savePairingData(): void {
    try {
      fs.writeFileSync(this.pairingFilePath, JSON.stringify({
        token: this.pairingToken,
        deviceName: this.pairedDeviceName,
        pairedAt: this.pairedAt
      }, null, 2), 'utf-8');
    } catch (err) {
      console.error('[CoucouPhoneLink] Falha ao persistir token de pareamento:', err);
    }
  }

  public getLocalIp(): string {
    if (process.env.COUCOU_HOST) {
      return process.env.COUCOU_HOST;
    }
    const interfaces = os.networkInterfaces();
    let tailscaleIp = '';
    let lanIp = '';

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          if (iface.address.startsWith('100.')) {
            tailscaleIp = iface.address;
          } else if (
            iface.address.startsWith('192.168.') || 
            iface.address.startsWith('10.') || 
            iface.address.startsWith('172.')
          ) {
            lanIp = iface.address;
          }
        }
      }
    }

    return tailscaleIp || lanIp || '127.0.0.1';
  }

  public async start(): Promise<void> {
    if (this.server) return;
    await this.init();

    if (!this.certPem || !this.keyPem) {
      console.error('[CoucouPhoneLink] Não é possível iniciar o servidor sem certificado TLS.');
      return;
    }

    try {
      this.server = tls.createServer({
        cert: this.certPem,
        key: this.keyPem,
        minVersion: 'TLSv1.2'
      }, (socket) => {
        this.handleClientSocket(socket);
      });

      this.server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[CoucouPhoneLink] Porta ${this.port} já em uso. Servidor de Phone Link não iniciado nesta instância.`);
        } else {
          console.error('[CoucouPhoneLink] Erro no servidor TLS:', err.message);
        }
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        console.log(`[CoucouPhoneLink] Servidor Coucou Phone Link TLS ativo na porta ${this.port}`);
      });
    } catch (err: any) {
      console.warn('[CoucouPhoneLink] Falha ao iniciar servidor TLS:', err?.message);
    }
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const [socket] of this.clients.entries()) {
        try {
          socket.destroy();
        } catch {}
      }
      this.clients.clear();

      for (const [, approval] of this.pendingApprovals.entries()) {
        clearTimeout(approval.timer);
      }
      this.pendingApprovals.clear();

      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private handleClientSocket(socket: tls.TLSSocket) {
    let buffer = '';
    let isAuthenticated = false;

    socket.setEncoding('utf-8');

    socket.on('data', (chunk: string) => {
      buffer += chunk;
      if (buffer.length > 65536) {
        this.sendJson(socket, { type: 'error', code: 'too_long', message: 'Payload exceeded 64 KiB' });
        socket.destroy();
        return;
      }

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (!line) continue;

        try {
          const msg = JSON.parse(line);
          this.processMessage(socket, msg, (authed) => {
            isAuthenticated = authed;
          });
        } catch (err) {
          console.warn('[CoucouPhoneLink] Mensagem inválida recebida:', err);
        }
      }
    });

    socket.on('close', () => {
      if (isAuthenticated) {
        this.clients.delete(socket);
        console.log(`[CoucouPhoneLink] Celular desconectado (${this.clients.size} ativos)`);
      }
    });

    socket.on('error', (err) => {
      // Ignorar erros normais de handshake/reset
      if ((err as any)?.code !== 'ECONNRESET') {
        console.warn('[CoucouPhoneLink] Erro no socket cliente:', err.message);
      }
    });
  }

  private processMessage(
    socket: tls.TLSSocket, 
    msg: any, 
    setAuth: (authed: boolean) => void
  ) {
    const isAuthed = this.clients.has(socket);

    if (!isAuthed) {
      if (msg.type !== 'hello') {
        this.sendJson(socket, { type: 'error', code: 'auth', message: 'First message must be hello' });
        socket.destroy();
        return;
      }

      if (msg.v !== 1 || msg.token !== this.pairingToken) {
        console.warn(`[CoucouPhoneLink] Tentativa de conexão rejeitada com token inválido de ${socket.remoteAddress}`);
        this.sendJson(socket, { type: 'error', code: 'auth', message: 'Invalid pairing token' });
        setTimeout(() => socket.destroy(), 200);
        return;
      }

      // Autenticação bem-sucedida
      const deviceName = msg.device || 'Android Device';
      this.pairedDeviceName = deviceName;
      this.pairedAt = Date.now();
      this.savePairingData();

      const clientInfo: AuthenticatedClient = {
        socket,
        device: deviceName,
        caps: Array.isArray(msg.caps) ? msg.caps : [],
        connectedAt: Date.now()
      };
      this.clients.set(socket, clientInfo);
      setAuth(true);

      console.log(`[CoucouPhoneLink] Celular conectado e autenticado com sucesso: "${deviceName}"`);

      // Envia welcome com capability "details"
      this.sendJson(socket, {
        type: 'welcome',
        v: 1,
        desktop: 'Kraken Homelab',
        os: process.platform,
        caps: ['details']
      });

      // Envia imediatamente a lista de sessões ativas
      this.sendSessionsToClient(socket);

      // Envia aprovações pendentes se houver
      for (const [, approval] of this.pendingApprovals.entries()) {
        this.sendJson(socket, {
          type: 'approval',
          pillId: approval.pillId,
          fingerprint: approval.fingerprint,
          tool: approval.tool,
          command: approval.command,
          createdAt: approval.createdAt,
          truncated: approval.truncated
        });
      }
      return;
    }

    // Mensagens pós-autenticação
    if (msg.type === 'ping') {
      this.sendJson(socket, { type: 'pong' });
    } else if (msg.type === 'decision') {
      this.handleDecision(msg.fingerprint, msg.decision);
    } else if (msg.type === 'bye') {
      socket.end();
    }
  }

  private handleDecision(fingerprint: string, decision: 'allow' | 'deny') {
    const approval = this.pendingApprovals.get(fingerprint);
    if (!approval) {
      console.warn(`[CoucouPhoneLink] Decisão recebida para aprovação expirada ou inexistente: ${fingerprint}`);
      return;
    }

    // Se o comando foi truncado, a especificação proíbe 'allow' do celular por segurança
    if (approval.truncated && decision === 'allow') {
      console.warn(`[CoucouPhoneLink] Ignorando 'allow' para comando truncado (apenas deny é permitido via smartphone).`);
      return;
    }

    console.log(`[CoucouPhoneLink] Decisão remota "${decision}" recebida para a ferramenta "${approval.tool}"`);
    clearTimeout(approval.timer);
    this.pendingApprovals.delete(fingerprint);

    approval.resolve(decision);

    // Notifica todos os dispositivos conectados que a aprovação foi resolvida
    this.broadcast({
      type: 'approvalResolved',
      fingerprint
    });
  }

  private sendJson(socket: tls.TLSSocket, obj: Record<string, any>) {
    try {
      if (!socket.destroyed && socket.writable) {
        socket.write(JSON.stringify(obj) + '\n');
      }
    } catch (err) {
      console.warn('[CoucouPhoneLink] Erro ao enviar JSON pelo socket:', err);
    }
  }

  private broadcast(obj: Record<string, any>) {
    const line = JSON.stringify(obj) + '\n';
    for (const [socket] of this.clients.entries()) {
      try {
        if (!socket.destroyed && socket.writable) {
          socket.write(line);
        }
      } catch {}
    }
  }

  public async getPairingInfo(): Promise<{
    running: boolean;
    port: number;
    host: string;
    fingerprint: string;
    token: string;
    pairingUri: string;
    qrCodeDataUrl: string;
    clientCount: number;
    deviceName: string;
    pairedAt: number | null;
  }> {
    await this.init();
    const host = this.getLocalIp();
    const pairingUri = `coucou://pair?v=1&host=${host}&port=${this.port}&fp=${this.fingerprint}&token=${this.pairingToken}&name=Kraken%20Homelab`;
    
    let qrCodeDataUrl = '';
    try {
      qrCodeDataUrl = await QRCode.toDataURL(pairingUri, {
        margin: 2,
        width: 256,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
    } catch (err) {
      console.error('[CoucouPhoneLink] Falha ao gerar QR Code:', err);
    }

    return {
      running: this.server !== null && this.server.listening,
      port: this.port,
      host,
      fingerprint: this.fingerprint,
      token: this.pairingToken,
      pairingUri,
      qrCodeDataUrl,
      clientCount: this.clients.size,
      deviceName: this.pairedDeviceName,
      pairedAt: this.pairedAt
    };
  }

  public async resetPairingToken(): Promise<{ token: string; pairingUri: string; qrCodeDataUrl: string }> {
    this.pairingToken = crypto.randomBytes(24).toString('base64url');
    this.pairedDeviceName = '';
    this.pairedAt = null;
    this.savePairingData();

    // Desconecta clientes atuais para forçar novo pareamento
    for (const [socket] of this.clients.entries()) {
      this.sendJson(socket, { type: 'error', code: 'auth', message: 'Token reset by host' });
      socket.destroy();
    }
    this.clients.clear();

    const info = await this.getPairingInfo();
    return {
      token: info.token,
      pairingUri: info.pairingUri,
      qrCodeDataUrl: info.qrCodeDataUrl
    };
  }

  // === Gerenciamento de Sessões do Agente para o Celular ===

  public startSession(conversationId: string, agent: string, cwd: string) {
    const normalizedCwd = (cwd || '').replace(/\\/g, '/');
    const project = path.basename(normalizedCwd) || 'Kraken';
    const pillId = agent.toLowerCase().includes('claude') ? 'claude' : (agent.toLowerCase().includes('aider') ? 'aider' : 'antigravity');

    const session: CoucouSession = {
      pillId,
      agent: agent === 'antigravity' ? 'Antigravity' : agent,
      state: 'working',
      statusText: 'Iniciando agente...',
      stepIndex: 0,
      stepCount: 1,
      updatedAt: Date.now(),
      steps: [],
      project: project.slice(0, 64),
      color: '#5319e7'
    };

    this.sessions.set(conversationId, session);
    this.broadcastSessions();
  }

  public recordStep(
    conversationId: string, 
    step: { tool?: string; file?: string; command?: string; state?: string }
  ) {
    const sess = this.sessions.get(conversationId);
    if (!sess) return;

    sess.updatedAt = Date.now();
    sess.stepIndex += 1;
    sess.stepCount = Math.max(sess.stepCount, sess.stepIndex + 1);

    if (step.state) {
      if (['working', 'thinking', 'searching', 'approval', 'finished', 'error'].includes(step.state)) {
        sess.state = step.state as any;
      }
    } else {
      sess.state = 'working';
    }

    if (!sess.steps) sess.steps = [];

    let entry = '';
    if (step.file) {
      entry = path.basename(step.file);
    } else if (step.command) {
      entry = step.command.slice(0, 200);
    } else if (step.tool) {
      entry = step.tool;
    }

    if (entry) {
      sess.steps.push(entry.slice(0, 200));
      if (sess.steps.length > 20) {
        sess.steps = sess.steps.slice(-20);
      }
    }

    sess.statusText = entry ? `Executando: ${entry.slice(0, 40)}` : 'Em execução...';
    this.broadcastSessions();
  }

  public endSession(
    conversationId: string, 
    state: 'finished' | 'error', 
    finalLine?: string
  ) {
    const sess = this.sessions.get(conversationId);
    if (!sess) return;

    sess.updatedAt = Date.now();
    sess.state = state;
    sess.statusText = state === 'finished' ? 'Concluído com sucesso' : 'Finalizado com erro';
    if (finalLine) {
      sess.finalLine = finalLine.slice(0, 200);
    }

    this.broadcastSessions();

    // Remove da memória após 1 hora para evitar acúmulo
    setTimeout(() => {
      this.sessions.delete(conversationId);
    }, 3600000);
  }

  public requestApproval(req: CoucouApprovalRequest): Promise<'allow' | 'deny'> {
    return new Promise((resolve) => {
      const inputKey = req.inputKey || `${req.sessionId}-${Date.now()}`;
      const fingerprint = crypto.createHash('sha256')
        .update([req.pillId, req.sessionId, req.tool, req.command, inputKey].join('\u001f'))
        .digest('hex')
        .toLowerCase();

      const isTruncated = req.command.length > 500;
      const safeCommand = req.command.slice(0, 500);

      const sess = this.sessions.get(req.sessionId);
      if (sess) {
        sess.state = 'approval';
        sess.statusText = `Aguardando aprovação: ${req.tool}`;
        sess.updatedAt = Date.now();
        this.broadcastSessions();
      }

      const timer = setTimeout(() => {
        this.pendingApprovals.delete(fingerprint);
        this.broadcast({
          type: 'approvalResolved',
          fingerprint
        });
        if (sess) {
          sess.state = 'working';
          this.broadcastSessions();
        }
        resolve('deny');
      }, 115000); // 115 segundos conforme especificação

      const pending: PendingApproval = {
        fingerprint,
        pillId: req.pillId,
        sessionId: req.sessionId,
        tool: req.tool,
        command: safeCommand,
        truncated: isTruncated,
        createdAt: Date.now(),
        timer,
        resolve: (decision) => {
          if (sess) {
            sess.state = 'working';
            this.broadcastSessions();
          }
          resolve(decision);
        }
      };

      this.pendingApprovals.set(fingerprint, pending);

      this.broadcast({
        type: 'approval',
        pillId: req.pillId,
        fingerprint,
        tool: req.tool,
        command: safeCommand,
        createdAt: pending.createdAt,
        truncated: isTruncated
      });
    });
  }

  public resolveApproval(fingerprint: string): void {
    const approval = this.pendingApprovals.get(fingerprint);
    if (approval) {
      clearTimeout(approval.timer);
      this.pendingApprovals.delete(fingerprint);
      this.broadcast({
        type: 'approvalResolved',
        fingerprint
      });
    }
  }

  public getCoucouSessions(): CoucouSession[] {
    const list = Array.from(this.sessions.values());
    if (list.length === 0) {
      return [{
        pillId: 'antigravity',
        agent: 'Antigravity',
        state: 'idle',
        statusText: 'Pronto para novas tarefas',
        stepIndex: 0,
        stepCount: 0,
        updatedAt: Date.now()
      }];
    }
    return list;
  }

  private sendSessionsToClient(socket: tls.TLSSocket) {
    const sessions = this.getCoucouSessions();
    const payload = this.serializeSessionsUnder56K(sessions);
    this.sendJson(socket, payload);
  }

  private broadcastSessions() {
    const sessions = this.getCoucouSessions();
    const payload = this.serializeSessionsUnder56K(sessions);
    this.broadcast(payload);
  }

  // Garante que o payload nunca exceda 56 KiB
  private serializeSessionsUnder56K(sessions: CoucouSession[]): { type: string; sessions: CoucouSession[] } {
    let cloned: CoucouSession[] = JSON.parse(JSON.stringify(sessions));
    let payload = { type: 'sessions', sessions: cloned };
    let jsonStr = JSON.stringify(payload);

    while (Buffer.byteLength(jsonStr, 'utf-8') > 57344) {
      // Reduz steps das sessões mais antigas
      let reducedAny = false;
      for (const s of cloned) {
        if (s.steps && s.steps.length > 2) {
          s.steps = s.steps.slice(1);
          reducedAny = true;
          break;
        }
      }
      if (!reducedAny) break;
      jsonStr = JSON.stringify({ type: 'sessions', sessions: cloned });
    }

    return { type: 'sessions', sessions: cloned };
  }
}

export const coucouPhoneLinkService = new CoucouPhoneLinkService();
