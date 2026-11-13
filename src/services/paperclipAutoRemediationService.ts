import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  PaperclipIssue,
  RemediationCategory,
  RemediationResult,
  RemediationScanReport
} from '../types/paperclip.js';

const execAsync = promisify(exec);

const DEFAULT_PAPERCLIP_URL = 'http://192.168.31.5:3101';
const DEFAULT_COMPANY_ID = '4034eb89-a640-48d2-8b4d-f2bb0f10a119';
const DEFAULT_API_TOKEN = 'pcp_5df95fac0e950db0d8e9770214678a478ccb79d6d6ce9f3a';
const DEFAULT_CEO_AGENT_ID = '38631dff-5dd3-4fb6-bc81-d90aa6b27a00';

export interface AutoRemediationOptions {
  paperclipUrl?: string;
  companyId?: string;
  apiToken?: string;
  ceoAgentId?: string;
  cooldownMs?: number;
  notifyAlert?: (options: {
    key: string;
    severity: 'red' | 'yellow' | 'green';
    title: string;
    body: string;
    linkPaperclip?: string;
    force?: boolean;
    requiresHumanAction?: boolean;
  }) => Promise<{ sent: boolean; deduped?: boolean } | void | unknown>;
  addTimelineEvent?: (event: {
    type: 'issue.auto_remediated';
    timestamp: string;
    title: string;
    description: string;
    severity: 'success';
    issueIdentifier?: string;
    issueUrl?: string;
  }) => void;
}

interface IssueCommentItem {
  id?: string;
  body?: string;
}

/**
 * Requisitos Arquiteturais (Issue #163 & agent-standards):
 * - Motor de execução de playbooks seguros e determinísticos.
 * - Detecção precisa de causas de bloqueio de infraestrutura sem falsos-positivos em erros de lógica de negócio.
 * - Cobertura de detecção de erros, execução de playbooks e resiliência de rede.
 * - Conformidade total com agent-standards.
 */
export class PaperclipAutoRemediationService {
  private paperclipUrl: string;
  private companyId: string;
  private apiToken: string;
  private ceoAgentId: string;
  private cooldownMs: number;
  private notifyAlertCallback?: AutoRemediationOptions['notifyAlert'];
  private addTimelineEventCallback?: AutoRemediationOptions['addTimelineEvent'];

  private recentRemediations: RemediationResult[] = [];
  private issueCooldownMap: Map<string, number> = new Map();

  constructor(options: AutoRemediationOptions = {}) {
    this.paperclipUrl = (options.paperclipUrl || process.env.PAPERCLIP_URL || DEFAULT_PAPERCLIP_URL).replace(/\/+$/, '');
    this.companyId = options.companyId || process.env.PAPERCLIP_COMPANY_ID || DEFAULT_COMPANY_ID;
    this.apiToken = options.apiToken || process.env.PAPERCLIP_API_TOKEN || DEFAULT_API_TOKEN;
    this.ceoAgentId = options.ceoAgentId || DEFAULT_CEO_AGENT_ID;
    this.cooldownMs = options.cooldownMs ?? 5 * 60 * 1000; // 5 minutos de cooldown por issue
    this.notifyAlertCallback = options.notifyAlert;
    this.addTimelineEventCallback = options.addTimelineEvent;
  }

  public setCallbacks(
    notifyAlert: AutoRemediationOptions['notifyAlert'],
    addTimelineEvent: AutoRemediationOptions['addTimelineEvent']
  ) {
    this.notifyAlertCallback = notifyAlert;
    this.addTimelineEventCallback = addTimelineEvent;
  }

  public getRecentRemediations(): RemediationResult[] {
    return [...this.recentRemediations];
  }

  /**
   * Avalia uma lista de issues e executa a auto-remediação para as que estiverem bloqueadas por infraestrutura.
   */
  public async evaluateBlockedIssues(issues: PaperclipIssue[]): Promise<RemediationResult[]> {
    const blockedIssues = issues.filter(i => i.status === 'blocked');
    const results: RemediationResult[] = [];

    for (const issue of blockedIssues) {
      const now = Date.now();
      const lastRemediated = this.issueCooldownMap.get(issue.id) || 0;
      if (now - lastRemediated < this.cooldownMs) {
        continue; // Em cooldown
      }

      const res = await this.inspectAndRemediate(issue);
      if (res) {
        results.push(res);
        this.issueCooldownMap.set(issue.id, now);
        this.recentRemediations.unshift(res);
        if (this.recentRemediations.length > 50) {
          this.recentRemediations.pop();
        }
      }
    }

    return results;
  }

  /**
   * Executa varredura sob demanda de todas as issues bloqueadas
   */
  public async scanAndRemediate(): Promise<RemediationScanReport> {
    try {
      const url = `${this.paperclipUrl}/api/companies/${this.companyId}/issues`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!res.ok) {
        return {
          scannedAt: new Date().toISOString(),
          blockedIssuesCount: 0,
          remediations: []
        };
      }

      const issues = (await res.json()) as PaperclipIssue[];
      const blocked = issues.filter(i => i.status === 'blocked');
      const remediations = await this.evaluateBlockedIssues(issues);

      return {
        scannedAt: new Date().toISOString(),
        blockedIssuesCount: blocked.length,
        remediations
      };
    } catch (err) {
      console.warn('[PaperclipAutoRemediationService] Erro ao varrer issues bloqueadas:', (err as Error).message);
      return {
        scannedAt: new Date().toISOString(),
        blockedIssuesCount: 0,
        remediations: []
      };
    }
  }

  /**
   * Remediação manual/sob demanda por ID da issue
   */
  public async remediateIssueById(issueId: string): Promise<RemediationResult | null> {
    try {
      const url = `${this.paperclipUrl}/api/issues/${issueId}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!res.ok) return null;
      const issue = (await res.json()) as PaperclipIssue;
      return await this.inspectAndRemediate(issue, true);
    } catch (err) {
      console.warn(`[PaperclipAutoRemediationService] Falha ao consultar issue ${issueId}:`, (err as Error).message);
      return null;
    }
  }

  /**
   * Inspeciona os detalhes e comentários da issue para detectar a categoria do erro e executar o playbook
   */
  private async inspectAndRemediate(issue: PaperclipIssue, ignoreCooldown = false): Promise<RemediationResult | null> {
    const now = Date.now();
    const lastAttempt = this.issueCooldownMap.get(issue.id) || 0;
    if (!ignoreCooldown && now - lastAttempt < this.cooldownMs) {
      return null;
    }

    try {
      // 1. Busca comentários recentes da issue para extrair a evidência do erro
      const commentsUrl = `${this.paperclipUrl}/api/issues/${issue.id}/comments`;
      const commentsRes = await fetch(commentsUrl, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      }).catch(() => null);

      let contextText = `${issue.title} ${issue.description || ''} ${issue.activeRecoveryAction?.nextAction || ''}`;

      if (commentsRes && commentsRes.ok) {
        const comments = await commentsRes.json().catch(() => []);
        if (Array.isArray(comments)) {
          const recentBodies = comments.slice(0, 5).map((c: IssueCommentItem) => c.body || '').join(' ');
          contextText += ` ${recentBodies}`;
        }
      }

      // 2. Classifica a falha
      const category = this.detectCategory(contextText);
      if (category === 'unknown') {
        return null; // Não é uma falha de ambiente conhecida que o Kraken possa auto-remediar
      }

      // 3. Executa o playbook correspondente
      const actionsTaken: string[] = [];
      let remediated = false;

      if (category === 'permission_denied') {
        const targetPath = this.resolveWorkspacePath(contextText, issue);
        const fixResult = await this.playbookFixPermissions(targetPath);
        actionsTaken.push(...fixResult.actions);
        remediated = fixResult.success;
      } else if (category === 'git_hook_missing') {
        const hookResult = await this.playbookFixGitHooks();
        actionsTaken.push(...hookResult.actions);
        remediated = hookResult.success;
      } else if (category === 'git_index_lock') {
        const targetPath = this.resolveWorkspacePath(contextText, issue);
        const lockResult = await this.playbookFixGitIndexLock(targetPath);
        actionsTaken.push(...lockResult.actions);
        remediated = lockResult.success;
      }

      if (!remediated) {
        return {
          issueId: issue.id,
          identifier: issue.identifier,
          category,
          remediated: false,
          actionsTaken,
          unblocked: false,
          error: 'Falha na execução do playbook de remediação',
          timestamp: new Date().toISOString()
        };
      }

      // 4. Se remediou no host, desbloqueia a issue no Paperclip
      const unblocked = await this.unblockIssue(issue, category, actionsTaken);

      const result: RemediationResult = {
        issueId: issue.id,
        identifier: issue.identifier,
        category,
        remediated: true,
        actionsTaken,
        unblocked,
        timestamp: new Date().toISOString()
      };

      // 5. Emite evento e notificação
      if (unblocked) {
        if (this.addTimelineEventCallback) {
          this.addTimelineEventCallback({
            type: 'issue.auto_remediated',
            timestamp: result.timestamp,
            title: `🛠️ Auto-Remediação: ${issue.identifier} desbloqueada`,
            description: `Causa corrigida: ${category}. Ações: ${actionsTaken.join(', ')}`,
            severity: 'success',
            issueIdentifier: issue.identifier,
            issueUrl: `${this.paperclipUrl}/APE/issues/${issue.identifier}`
          });
        }

        if (this.notifyAlertCallback) {
          await this.notifyAlertCallback({
            key: `remediation-success-${issue.id}`,
            severity: 'green',
            title: `✅ [SRE] Issue ${issue.identifier} Auto-Remediada`,
            body: `O Kraken detectou o bloqueio (${category}) na issue ${issue.identifier} e aplicou o reparo automaticamente:\n${actionsTaken.map(a => `• ${a}`).join('\n')}\n\nA tarefa foi retornada para TODO e o agente foi notificado via wakeup.`,
            linkPaperclip: `${this.paperclipUrl}/APE/issues/${issue.identifier}`,
            force: true
          });
        }
      }

      return result;
    } catch (err) {
      console.warn(`[PaperclipAutoRemediationService] Erro ao processar remediação da issue ${issue.id}:`, (err as Error).message);
      return null;
    }
  }

  /**
   * Detecta a categoria de falha de infraestrutura com base nos textos de log e comentários
   */
  public detectCategory(text: string): RemediationCategory {
    if (
      /(?:permission denied|EACCES|open .*permission denied|chmod .*denied)/i.test(text)
    ) {
      return 'permission_denied';
    }

    if (
      /(?:Cannot find module '.*git-guardrail|git-guardrail\.cjs|jsonhook__git-guardrails_PreToolUse)/i.test(text)
    ) {
      return 'git_hook_missing';
    }

    if (
      /(?:index\.lock': File exists|Another git process seems to be running)/i.test(text)
    ) {
      return 'git_index_lock';
    }

    return 'unknown';
  }

  /**
   * Resolve o caminho do workspace seguro dentro de /workspace
   */
  public resolveWorkspacePath(text: string, issue: PaperclipIssue): string {
    const match = text.match(/\/workspace\/([a-zA-Z0-9_\-]+)/);
    if (match && match[1]) {
      const candidate = path.join('/workspace', match[1]);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    if (issue.projectName) {
      const byName = path.join('/workspace', issue.projectName);
      if (fs.existsSync(byName)) {
        return byName;
      }
    }

    return '/workspace/KrakenBridge-Web';
  }

  /**
   * Playbook 1: Correção de permissões de escrita (chmod -R a+rw)
   */
  public async playbookFixPermissions(targetPath: string): Promise<{ success: boolean; actions: string[] }> {
    const actions: string[] = [];
    try {
      // Validação de segurança: apenas subpastas de /workspace
      const normalized = path.resolve(targetPath);
      if (!normalized.startsWith('/workspace')) {
        return { success: false, actions: ['Caminho fora de /workspace rejeitado por segurança'] };
      }

      await execAsync(`chmod -R a+rw "${normalized}"`, { timeout: 15000 });
      actions.push(`Permissões a+rw aplicadas com sucesso em "${normalized}"`);
      return { success: true, actions };
    } catch (err) {
      actions.push(`Falha ao aplicar chmod: ${(err as Error).message}`);
      return { success: false, actions };
    }
  }

  /**
   * Playbook 2: Correção de hooks do Git Guardrail e Skill Scout
   */
  public async playbookFixGitHooks(): Promise<{ success: boolean; actions: string[] }> {
    const actions: string[] = [];
    try {
      const rootConfigDir = '/root/.gemini/config';
      const realGuardrail = path.join(rootConfigDir, 'git-guardrail.cjs');

      if (!fs.existsSync(realGuardrail)) {
        return { success: false, actions: [`Arquivo mestre ${realGuardrail} não encontrado`] };
      }

      // Normaliza hooks.json no perfil do usuário
      const hooksFile = path.join(rootConfigDir, 'hooks.json');
      if (fs.existsSync(hooksFile)) {
        try {
          const content = fs.readFileSync(hooksFile, 'utf8');
          if (content.includes('/paperclip/accounts/profiles/')) {
            const patched = content.replace(
              /"node \\"\/paperclip\/accounts\/profiles\/[^/]+\/\.gemini\/config\/git-guardrail\.cjs\\""/g,
              '"node \\"${HOME:-/root}/.gemini/config/git-guardrail.cjs\\""'
            );
            fs.writeFileSync(hooksFile, patched, 'utf8');
            actions.push(`Corrigido caminho estático em ${hooksFile}`);
          }
        } catch {}
      }

      // Garante suporte a perfis de accounts do paperclip se existirem no sistema de arquivos
      const profilesDir = '/paperclip/accounts/profiles';
      if (fs.existsSync(profilesDir)) {
        const entries = fs.readdirSync(profilesDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const targetConfig = path.join(profilesDir, entry.name, '.gemini', 'config');
            if (fs.existsSync(targetConfig)) {
              const guardrailDest = path.join(targetConfig, 'git-guardrail.cjs');
              const wrapperCode = `#!/usr/bin/env node\nrequire('${realGuardrail}');\n`;
              fs.writeFileSync(guardrailDest, wrapperCode, { mode: 0o755 });
              actions.push(`Wrapper criado em ${guardrailDest}`);
            }
          }
        }
      }

      return { success: true, actions: actions.length > 0 ? actions : ['Hooks verificados e íntegros'] };
    } catch (err) {
      actions.push(`Falha no reparo de hooks: ${(err as Error).message}`);
      return { success: false, actions };
    }
  }

  /**
   * Playbook 3: Remoção de lock órfão do Git (.git/index.lock)
   */
  public async playbookFixGitIndexLock(targetPath: string): Promise<{ success: boolean; actions: string[] }> {
    const actions: string[] = [];
    try {
      const lockPath = path.join(targetPath, '.git', 'index.lock');
      if (fs.existsSync(lockPath)) {
        const stat = fs.statSync(lockPath);
        const ageSec = (Date.now() - stat.mtimeMs) / 1000;
        // Remove se o lock tiver mais de 60 segundos
        if (ageSec > 60) {
          fs.unlinkSync(lockPath);
          actions.push(`Arquivo de lock órfão removido: ${lockPath} (idade: ${Math.round(ageSec)}s)`);
          return { success: true, actions };
        } else {
          actions.push(`Arquivo ${lockPath} ainda ativo (< 60s); mantido`);
          return { success: false, actions };
        }
      }
      return { success: true, actions: ['Nenhum lock órfão encontrado'] };
    } catch (err) {
      actions.push(`Erro ao verificar git index.lock: ${(err as Error).message}`);
      return { success: false, actions };
    }
  }

  /**
   * Desbloqueia a issue no Paperclip:
   * 1. Gera um runId com wakeup do Pai do Kraken.
   * 2. Publica comentário de auditoria com X-Paperclip-Run-Id.
   * 3. Atualiza o status para todo via PATCH.
   * 4. Dispara wakeup do agente atribuído.
   */
  private async unblockIssue(
    issue: PaperclipIssue,
    category: RemediationCategory,
    actionsTaken: string[]
  ): Promise<boolean> {
    try {
      // 1. Gera contexto de run válido através do wakeup do CEO
      const wakeupUrl = `${this.paperclipUrl}/api/agents/${this.ceoAgentId}/wakeup`;
      const wakeupRes = await fetch(wakeupUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: 'auto_remediation_run' }),
        signal: AbortSignal.timeout(10000)
      });

      let runId: string | undefined = undefined;
      if (wakeupRes.ok) {
        const wakeupData = await wakeupRes.json().catch(() => ({}));
        runId = wakeupData.id;
      }

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      };
      if (runId) {
        headers['X-Paperclip-Run-Id'] = runId;
      }

      // 2. Posta comentário de auditoria na timeline da tarefa
      const commentUrl = `${this.paperclipUrl}/api/issues/${issue.id}/comments`;
      const commentBody = [
        `🛠️ **Auto-Remediação Executada com Sucesso pelo Kraken SRE**:`,
        ``,
        `- **Categoria de Falha**: \`${category}\``,
        `- **Ações Operacionais Realizadas**:`,
        ...actionsTaken.map(a => `  - ${a}`),
        ``,
        `Task reativada automaticamente para \`todo\` e despachada para retomada do agente.`
      ].join('\n');

      await fetch(commentUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body: commentBody, origin: 'comment' }),
        signal: AbortSignal.timeout(10000)
      }).catch(() => null);

      // 3. Atualiza status para todo
      const patchUrl = `${this.paperclipUrl}/api/issues/${issue.id}`;
      const patchRes = await fetch(patchUrl, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'todo' }),
        signal: AbortSignal.timeout(10000)
      });

      if (!patchRes.ok) {
        console.warn(`[PaperclipAutoRemediationService] PATCH /api/issues/${issue.id} falhou: HTTP ${patchRes.status}`);
        return false;
      }

      // 4. Dispara wakeup do agente da issue (ou Pai do Kraken se não puder invocar a si mesmo)
      if (issue.assigneeAgentId) {
        const targetWakeup = `${this.paperclipUrl}/api/agents/${issue.assigneeAgentId}/wakeup`;
        await fetch(targetWakeup, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reason: 'issue_unblocked' }),
          signal: AbortSignal.timeout(5000)
        }).catch(() => null);
      }

      // Wakeup geral do CEO para garantir despacho
      await fetch(wakeupUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: 'issue_unblocked' }),
        signal: AbortSignal.timeout(5000)
      }).catch(() => null);

      return true;
    } catch (err) {
      console.warn(`[PaperclipAutoRemediationService] Falha ao desbloquear issue ${issue.id} na API:`, (err as Error).message);
      return false;
    }
  }
}
