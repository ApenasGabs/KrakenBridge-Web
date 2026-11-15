import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kraken-quota-cache-'));
process.env.DATA_DIR = tmpDir;
process.env.QUOTA_REFRESH_INTERVAL_MS = '300000';

const { quotaService } = await import('../dist-server/services/quotaService.js');
const { accountService } = await import('../dist-server/services/accountService.js');
const { claudeAuthService } = await import('../dist-server/services/claudeAuthService.js');

describe('QuotaService Multi-Account Cache & Auto-Refresh (#186)', () => {
  after(async () => {
    quotaService.stopAutoRefresh();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('refreshAllAccounts consolida contas AGY e Claude Code com single-flight e persiste em disco', async () => {
    const origListAccounts = accountService.listAccounts.bind(accountService);
    const origGetStatus = claudeAuthService.getStatus.bind(claudeAuthService);
    const origGetOAuthToken = claudeAuthService.getOAuthAccessToken.bind(claudeAuthService);
    const origFetchLiveAgy = quotaService.fetchLiveQuotaForAccount.bind(quotaService);
    const origFetch = globalThis.fetch;

    let agyFetchCalls = 0;

    accountService.listAccounts = async () => ({
      activeEmail: 'agy1@example.com',
      accounts: [
        { email: 'agy1@example.com', name: 'AGY 1', picture: null, isActive: true, savedAt: new Date().toISOString() },
        { email: 'agy2@example.com', name: 'AGY 2', picture: null, isActive: false, savedAt: new Date().toISOString() }
      ]
    });

    quotaService.fetchLiveQuotaForAccount = async (email) => {
      agyFetchCalls++;
      const remaining = email === 'agy1@example.com' ? 40 : 85;
      return [
        {
          name: 'Gemini Models',
          buckets: [
            { name: 'Five Hour Limit Remaining', window: '5h', remaining },
            { name: 'Weekly Limit Remaining', window: 'weekly', remaining }
          ]
        }
      ];
    };

    claudeAuthService.getStatus = async () => ({
      authenticated: true,
      email: 'claude-pro@example.com',
      authMethod: 'claude.ai',
      hasToken: true,
      hasKey: false,
      planTier: 'pro',
      orgName: 'Claude Pro Org'
    });

    claudeAuthService.getOAuthAccessToken = async () => 'fake-oauth-token-123456';

    globalThis.fetch = async (url) => {
      if (String(url).includes('api.anthropic.com/api/oauth/usage')) {
        return new Response(
          JSON.stringify({
            five_hour: { utilization: 25, resets_at: new Date(Date.now() + 3600_000).toISOString() },
            seven_day: { utilization: 10, resets_at: new Date(Date.now() + 86400_000).toISOString() }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return origFetch(url);
    };

    try {
      await quotaService.init();

      // Dispara duas chamadas simultâneas para validar single-flight
      await Promise.all([
        quotaService.refreshAllAccounts(true),
        quotaService.refreshAllAccounts(true)
      ]);

      assert.equal(agyFetchCalls, 2, 'Single-flight deve evitar execuções duplicadas simultâneas');

      const overview = await quotaService.getMultiAccountQuotaOverview(false);
      assert.equal(overview.accounts.length, 3, 'Deve listar 2 contas AGY + 1 conta Claude Code');

      const claudeAcc = overview.accounts.find((a) => a.engine === 'claude');
      assert.ok(claudeAcc, 'Conta Claude Code deve estar presente no overview');
      assert.equal(claudeAcc.email, 'claude-pro@example.com');
      assert.equal(claudeAcc.planTier, 'pro');
      assert.equal(claudeAcc.modelSummary.claudeGpt.fiveHourRemaining, 75);
      assert.equal(claudeAcc.modelSummary.claudeGpt.weeklyRemaining, 90);

      // bestAccountsByFamily deve considerar apenas contas AGY para roteamento AGY
      assert.equal(overview.bestAccountsByFamily.gemini?.email, 'agy2@example.com');
      assert.equal(overview.bestAccountsByFamily.gemini?.remaining, 85);

      // Verifica persistência em disco
      const cacheFilePath = path.join(tmpDir, 'quota_accounts_cache.json');
      const raw = await fs.readFile(cacheFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      assert.equal(parsed.accounts.length, 3);
      assert.ok(overview.cacheMeta?.lastRefreshedAt);
      assert.equal(overview.cacheMeta?.refreshIntervalMs, 300000);
    } finally {
      accountService.listAccounts = origListAccounts;
      claudeAuthService.getStatus = origGetStatus;
      claudeAuthService.getOAuthAccessToken = origGetOAuthToken;
      quotaService.fetchLiveQuotaForAccount = origFetchLiveAgy;
      globalThis.fetch = origFetch;
    }
  });
});
