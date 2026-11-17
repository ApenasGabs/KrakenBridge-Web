import {
  DEFAULT_PAPERCLIP_URL,
  DEFAULT_COMPANY_ID,
  DEFAULT_API_TOKEN,
  DEFAULT_CEO_AGENT_ID
} from './paperclipAutoRemediationService.js';

export interface DelegateIssueParams {
  repo: string;
  number: number;
  title: string;
  url: string;
  body?: string;
  notes?: string;
}

export interface DelegateIssueResult {
  paperclipIssueId: string;
  identifier?: string;
  message: string;
}

/**
 * Delega uma issue do GitHub ao Paperclip (cria a tarefa e acorda o CEO para roteá-la).
 */
export class PaperclipDelegationService {
  private get baseUrl(): string {
    return (process.env.PAPERCLIP_URL || DEFAULT_PAPERCLIP_URL).replace(/\/+$/, '');
  }
  private get companyId(): string {
    return process.env.PAPERCLIP_COMPANY_ID || DEFAULT_COMPANY_ID;
  }
  private get token(): string {
    return process.env.PAPERCLIP_API_TOKEN || DEFAULT_API_TOKEN;
  }

  async delegateGithubIssue(params: DelegateIssueParams): Promise<DelegateIssueResult> {
    const { repo, number, title, url, body, notes } = params;
    const description = [
      `Delegada pelo Kraken a partir da issue GitHub [${repo}#${number}](${url}).`,
      notes?.trim() ? `\n**Direcionamento do usuário:**\n${notes.trim()}` : '',
      body?.trim() ? `\n---\n${body.trim().slice(0, 6000)}` : ''
    ].filter(Boolean).join('\n');

    const headers = {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const res = await fetch(`${this.baseUrl}/api/companies/${this.companyId}/issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: `[${repo}#${number}] ${title}`,
        description,
        status: 'todo'
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      throw new Error(`Paperclip recusou a criação da issue (HTTP ${res.status})`);
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string; identifier?: string };
    if (!data.id) {
      throw new Error('Paperclip não retornou o id da issue criada');
    }

    // Acorda o CEO para rotear a nova tarefa; falha aqui não invalida a criação.
    await fetch(`${this.baseUrl}/api/agents/${DEFAULT_CEO_AGENT_ID}/wakeup`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'issue_assigned' }),
      signal: AbortSignal.timeout(5000)
    }).catch(() => null);

    return {
      paperclipIssueId: data.id,
      identifier: data.identifier,
      message: `Delegada ao Paperclip${data.identifier ? ` como ${data.identifier}` : ''}`
    };
  }
}

export const paperclipDelegationService = new PaperclipDelegationService();
