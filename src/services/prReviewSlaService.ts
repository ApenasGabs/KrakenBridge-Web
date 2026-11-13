import fs from 'fs';
import path from 'path';
import type {
  EnrichedPullRequest,
  TrackedPrSla,
  PrSlaInfo,
  PrSlaStatus
} from '../types/paperclip.js';

// Mapeamento canônico dos 9 repositórios para os projetos correspondentes no Paperclip (APE)
export const REPO_TO_PROJECT_ID: Record<string, string> = {
  'ApenasGabs/status-hub': 'aa682ef0-042c-4605-8ed8-fb2dc6fb78c0',
  'ApenasGabs/KrakenBridge-Web': 'c06b435c-867f-4f5b-b023-dac168cbcb38',
  'ApenasGabs/kraken-cleanroom': 'e49b69a5-5078-4853-9ee4-997b2082129e',
  'ApenasGabs/JobsFinder': 'cd7289c2-97c8-4cce-869d-85dbd16fbbe2',
  'ApenasGabs/querocomprar': '836fb854-73fc-46df-ab7b-a0095d58238a',
  'ApenasGabs/meuestoque': '5a590ed4-6aff-4470-8560-783fa9209ca9',
  'ApenasGabs/G_aBot': '91b2e09d-72c4-4306-b2aa-f2fc356e238c',
  'ApenasGabs/paperclip': '66b5910f-f90a-44e9-adf2-71de7b7ffb84',
  'ApenasGabs/agent-standards': '627f5015-6e8b-4129-b89e-168347c36a3f'
};

export const DEFAULT_PAPERCLIP_PROJECT_ID = 'aa682ef0-042c-4605-8ed8-fb2dc6fb78c0';
export const DEFAULT_SLA_DURATION_MS = 2 * 60 * 60 * 1000; // 2 horas corridas
export const DEFAULT_SENTINEL_AGENT_ID = '217c4ccc-e831-4d0e-bf70-a0266f7ceb15'; // Kraken Sentinel
export const DEFAULT_FORGE_AGENT_ID = 'fb0ad346-e4b6-42dc-a3fa-ec26d43454d1'; // Kraken Forge

export interface PrReviewSlaServiceOptions {
  slaDurationMs?: number;
  paperclipUrl?: string;
  companyId?: string;
  apiToken?: string;
  sentinelAgentId?: string;
  storagePath?: string;
  notifyAlert?: (options: {
    key: string;
    severity: 'red' | 'yellow' | 'green';
    title: string;
    body: string;
    linkPr?: string;
    linkPaperclip?: string;
    force?: boolean;
    requiresHumanAction?: boolean;
  }) => Promise<any>;
}

export class PrReviewSlaService {
  private slaDurationMs: number;
  private paperclipUrl: string;
  private companyId: string;
  private apiToken: string;
  private sentinelAgentId: string;
  private storagePath: string;
  private notifyAlertCallback?: PrReviewSlaServiceOptions['notifyAlert'];

  private trackedPrs: Map<string, TrackedPrSla> = new Map();

  constructor(options: PrReviewSlaServiceOptions = {}) {
    this.slaDurationMs = options.slaDurationMs ?? DEFAULT_SLA_DURATION_MS;
    this.paperclipUrl = options.paperclipUrl || process.env.PAPERCLIP_URL || 'http://192.168.31.5:3101';
    this.companyId = options.companyId || process.env.PAPERCLIP_COMPANY_ID || '4034eb89-a640-48d2-8b4d-f2bb0f10a119';
    this.apiToken = options.apiToken || process.env.PAPERCLIP_API_TOKEN || 'pcp_5df95fac0e950db0d8e9770214678a478ccb79d6d6ce9f3a';
    this.sentinelAgentId = options.sentinelAgentId || DEFAULT_SENTINEL_AGENT_ID;
    this.storagePath = options.storagePath || path.join(process.cwd(), 'data', 'pr_review_sla.json');
    this.notifyAlertCallback = options.notifyAlert;

    this.loadState();
  }

  /**
   * Carrega o estado persistido do arquivo JSON local para tolerar reinicializações
   */
  public loadState(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.trackedPrs.clear();
          for (const item of parsed) {
            if (item && item.prKey) {
              this.trackedPrs.set(item.prKey, item);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[PrReviewSlaService] Aviso ao carregar pr_review_sla.json:', (err as Error).message);
    }
  }

  /**
   * Salva o estado atual no disco de forma resiliente
   */
  public saveState(): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.trackedPrs.values());
      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.warn('[PrReviewSlaService] Falha ao persistir pr_review_sla.json:', (err as Error).message);
    }
  }

  /**
   * Extrai um resumo limpo de alterações a partir do corpo do PR
   */
  public extractSummary(body?: string, title?: string): string {
    if (!body || !body.trim()) {
      return title ? `Implementação da tarefa: ${title}` : 'Alterações prontas para revisão de código.';
    }

    // Remove comentários HTML <!-- ... -->
    let clean = body.replace(/<!--[\s\S]*?-->/g, '');

    // Procura por seções como 'Resumo', 'Contexto', 'Mudanças Técnicas' ou primeiras linhas
    const lines = clean
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('- [ ]') && !l.startsWith('- [x]'));

    if (lines.length > 0) {
      const candidate = lines.slice(0, 3).join(' ');
      return candidate.length > 280 ? `${candidate.slice(0, 277)}...` : candidate;
    }

    return title || 'Alterações prontas para revisão.';
  }

  /**
   * Formata a hora de expiração no fuso de Brasília (BRT)
   */
  public formatExpiryTime(timestampMs: number): string {
    return new Date(timestampMs).toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Gera a mensagem do WhatsApp para quando o PR é aberto
   */
  public formatOpenNotification(tracked: TrackedPrSla): string {
    const expiresFormatted = this.formatExpiryTime(tracked.slaExpiresAt);
    const lines = [
      `🔀 *Novo PR Aberto para Revisão (SLA 2h)*`,
      `• *Repositório*: ${tracked.repo}`,
      `• *PR*: #${tracked.number} — ${tracked.title}`,
      tracked.headRefName ? `• *Branch*: \`${tracked.headRefName}\`` : '',
      tracked.issueIdentifier ? `• *Issue*: ${tracked.issueIdentifier}` : '',
      tracked.author ? `• *Autor*: @${tracked.author}` : '',
      `• *Resumo*: ${tracked.summary || 'Alterações submetidas para aprovação manual.'}`,
      `• ⏳ *Prazo de Aprovação Humana*: 2 horas (até ${expiresFormatted} BRT)`,
      `• 🤖 *Política Autônoma*: Se você não aprovar até ${expiresFormatted}, a revisão será delegada ao *Kraken Sentinel* no Paperclip.`,
      `• *Link*: ${tracked.url}`
    ];
    return lines.filter(Boolean).join('\n');
  }

  /**
   * Gera a mensagem do WhatsApp quando o prazo de 2h expira
   */
  public formatTimeoutNotification(tracked: TrackedPrSla, paperclipIssueIdentifier?: string): string {
    const lines = [
      `⏰ *Timeout de Aprovação Humana (SLA 2h Expirado)*`,
      `• *Repositório*: ${tracked.repo}`,
      `• *PR*: #${tracked.number} — ${tracked.title}`,
      `• 🤖 *Ação Autônoma*: Revisão delegada para o agente *Kraken Sentinel* no Paperclip.`,
      paperclipIssueIdentifier ? `• *Tarefa Paperclip*: \`${paperclipIssueIdentifier}\`` : '',
      `• *Diretrizes do Sentinel*:`,
      `  1. Auditoria Standards (\`agent-standards\`) + Spec + CI + UI;`,
      `  2. Se 100% aprovado: aprova e mergeia na main (vigiando o deploy);`,
      `  3. Se ajustes pequenos: correção cirúrgica pelo próprio Sentinel/Mender;`,
      `  4. Se reprovado: reject com comentários e delegação para o Kraken Forge.`,
      `• *Link PR*: ${tracked.url}`
    ];
    return lines.filter(Boolean).join('\n');
  }

  /**
   * Dispara a criação da tarefa de code review no Paperclip e acorda o Sentinel
   */
  public async delegateToSentinel(tracked: TrackedPrSla): Promise<{
    success: boolean;
    issueId?: string;
    issueIdentifier?: string;
    error?: string;
  }> {
    const projectId = REPO_TO_PROJECT_ID[tracked.repo] || DEFAULT_PAPERCLIP_PROJECT_ID;

    const issuePayload = {
      title: `review(code): Revisão autônoma do PR #${tracked.number} [Timeout SLA 2h]`,
      description: [
        `## 🎯 Contexto do PR`,
        `- **Repositório**: ${tracked.repo}`,
        `- **PR**: #${tracked.number} (${tracked.url})`,
        tracked.headRefName ? `- **Branch**: \`${tracked.headRefName}\`` : '',
        tracked.issueIdentifier ? `- **Issue Relacionada**: ${tracked.issueIdentifier}` : '',
        tracked.author ? `- **Autor Original**: @${tracked.author}` : '',
        `- **Resumo**: ${tracked.summary || 'N/A'}`,
        ``,
        `## 📋 Mandato de Revisão e Governança (Protocolo Sentinel)`,
        `1. **Auditoria 2 Eixos**: Avaliar conformidade de *Standards* (\`agent-standards\`) e fidelidade à *Spec*.`,
        `2. **CI & UI**: Validar se o CI do GitHub Actions está 100% verde e auditar responsividade/UX caso haja interface.`,
        `3. **Decisão Autônoma**:`,
        `   - **Aprovado**: Executar \`gh pr review --approve\` e \`gh pr merge --squash\`, vigiando a pipeline da main até ficar verde.`,
        `   - **Ajustes Pequenos / Cirúrgicos** (typos, lint, tipos simples): O próprio Sentinel (ou Mender) comita a correção direta na branch e conclui o merge.`,
        `   - **Reprovação / Ajuste Complexo**: Rejeitar o PR com parecer técnico fundamentado e reatribuir esta issue para o **Kraken Forge** (\`${DEFAULT_FORGE_AGENT_ID}\`).`
      ].filter(Boolean).join('\n'),
      status: 'todo',
      priority: 'high',
      projectId,
      assigneeAgentId: this.sentinelAgentId
    };

    try {
      // 1. Cria a issue no Paperclip
      const res = await fetch(`${this.paperclipUrl}/api/companies/${this.companyId}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(issuePayload),
        signal: AbortSignal.timeout(10000)
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return { success: false, error: `HTTP ${res.status}: ${errText}` };
      }

      const issueData = await res.json() as { id?: string; identifier?: string };
      const issueId = issueData?.id;
      const issueIdentifier = issueData?.identifier;

      // 2. Acorda o agente Sentinel para processamento imediato
      try {
        await fetch(`${this.paperclipUrl}/api/agents/${this.sentinelAgentId}/wakeup`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reason: 'sla_timeout_review_assigned', issueId }),
          signal: AbortSignal.timeout(5000)
        });
      } catch (wakeErr) {
        console.warn('[PrReviewSlaService] Aviso ao acordar Sentinel:', (wakeErr as Error).message);
      }

      return {
        success: true,
        issueId,
        issueIdentifier
      };
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message
      };
    }
  }

  /**
   * Avalia a lista de PRs abertos, despacha notificações e gerencia timeouts de 2h
   */
  public async evaluatePrs(openPrs: EnrichedPullRequest[], now: number = Date.now()): Promise<{
    newTracked: number;
    delegated: number;
    closed: number;
  }> {
    let newTracked = 0;
    let delegated = 0;
    let closed = 0;

    const currentKeys = new Set<string>();

    for (const pr of openPrs) {
      const prKey = `${pr.repo}#${pr.number}`;
      currentKeys.add(prKey);

      let tracked = this.trackedPrs.get(prKey);

      if (!tracked) {
        // Novo PR detectado!
        const summary = pr.bodySummary || this.extractSummary('', pr.title);
        tracked = {
          prKey,
          repo: pr.repo,
          number: pr.number,
          title: pr.title,
          url: pr.url,
          headRefName: pr.headRefName,
          author: pr.author,
          issueIdentifier: pr.issueIdentifier,
          summary,
          firstSeenAt: now,
          slaExpiresAt: now + this.slaDurationMs,
          notifiedOpened: false,
          delegatedToSentinel: false,
          status: 'pending_human'
        };

        this.trackedPrs.set(prKey, tracked);
        newTracked++;

        // Notifica abertura no WhatsApp
        if (this.notifyAlertCallback) {
          const expiresFormatted = this.formatExpiryTime(tracked.slaExpiresAt);
          await this.notifyAlertCallback({
            key: `pr_open_${prKey}`,
            severity: 'yellow',
            title: `🔀 Novo PR Aberto para Revisão (SLA 2h) — ${pr.repo} #${pr.number}`,
            body: this.formatOpenNotification(tracked),
            linkPr: pr.url,
            force: true,
            requiresHumanAction: true
          });
          tracked.notifiedOpened = true;
        }
      }

      // Verifica timeout de SLA para PRs ainda pendentes de aprovação humana
      if (tracked.status === 'pending_human' && now >= tracked.slaExpiresAt) {
        console.log(`[PrReviewSlaService] ⏰ Timeout de 2h atingido para ${prKey}. Delegando para Kraken Sentinel...`);
        const delegation = await this.delegateToSentinel(tracked);

        tracked.delegatedToSentinel = true;
        tracked.status = 'delegated_sentinel';
        if (delegation.issueId) tracked.paperclipIssueId = delegation.issueId;
        if (delegation.issueIdentifier) tracked.paperclipIssueIdentifier = delegation.issueIdentifier;
        delegated++;

        // Notifica timeout e delegação no WhatsApp
        if (this.notifyAlertCallback) {
          await this.notifyAlertCallback({
            key: `pr_timeout_${prKey}`,
            severity: 'red',
            title: `⏰ Timeout de 2h no PR #${pr.number} — Delegado ao Sentinel`,
            body: this.formatTimeoutNotification(tracked, delegation.issueIdentifier),
            linkPr: pr.url,
            linkPaperclip: delegation.issueIdentifier ? `${this.paperclipUrl}/APE/issues/${delegation.issueIdentifier}` : undefined,
            force: true,
            requiresHumanAction: true
          });
        }
      }

      // Enriquecer o objeto do PR com as informações de SLA para exibição na UI
      const timeRemainingMs = Math.max(0, tracked.slaExpiresAt - now);
      pr.sla = {
        firstSeenAt: tracked.firstSeenAt,
        slaExpiresAt: tracked.slaExpiresAt,
        status: tracked.status,
        timeRemainingMs,
        isExpired: now >= tracked.slaExpiresAt,
        delegatedToSentinel: tracked.delegatedToSentinel,
        paperclipIssueId: tracked.paperclipIssueId,
        paperclipIssueIdentifier: tracked.paperclipIssueIdentifier
      };
    }

    // Identifica PRs que não estão mais abertos (foram mergeados ou fechados)
    for (const [key, tracked] of this.trackedPrs.entries()) {
      if (!currentKeys.has(key)) {
        if (tracked.status === 'pending_human' || tracked.status === 'delegated_sentinel') {
          tracked.status = 'closed';
          closed++;
        }
      }
    }

    this.saveState();

    return { newTracked, delegated, closed };
  }

  public getTrackedPr(prKey: string): TrackedPrSla | undefined {
    return this.trackedPrs.get(prKey);
  }

  public getAllTrackedPrs(): TrackedPrSla[] {
    return Array.from(this.trackedPrs.values());
  }

  public clearTrackedPrs(): void {
    this.trackedPrs.clear();
    this.saveState();
  }
}
