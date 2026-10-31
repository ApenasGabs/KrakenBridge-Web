// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { quotaService } from '../../../../src/services/quotaService.js';
import { accountService } from '../../../../src/services/accountService.js';
import type { QuotaGroup } from '../../../../src/types/quota.js';

describe('QuotaService - Smart Model & Quota Routing (Issue #112)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getModelFamily', () => {
    it('deve mapear corretamente modelos da família Gemini Standard', () => {
      expect(quotaService.getModelFamily('gemini-3.8-flash-high')).toBe('gemini');
      expect(quotaService.getModelFamily('gemini-3.8-flash-medium')).toBe('gemini');
      expect(quotaService.getModelFamily('gemini-3.7-flash-high')).toBe('gemini');
      expect(quotaService.getModelFamily('gemini-3.1-pro-high')).toBe('gemini');
    });

    it('deve mapear modelos Claude e GPT para a família claudeGpt', () => {
      expect(quotaService.getModelFamily('claude-opus-5-5-high')).toBe('claudeGpt');
      expect(quotaService.getModelFamily('claude-opus-5-5-medium')).toBe('claudeGpt');
      expect(quotaService.getModelFamily('claude-sonnet-5-5-high')).toBe('claudeGpt');
      expect(quotaService.getModelFamily('gpt-oss-120b-medium')).toBe('claudeGpt');
    });

    it('deve mapear modelos Argon para a família geminiArgon', () => {
      expect(quotaService.getModelFamily('gemini-4-argon-high')).toBe('geminiArgon');
      expect(quotaService.getModelFamily('gemini-argon-experimental')).toBe('geminiArgon');
    });

    it('deve usar fallback gemini para entradas indefinidas ou vazias', () => {
      expect(quotaService.getModelFamily()).toBe('gemini');
      expect(quotaService.getModelFamily('')).toBe('gemini');
    });
  });

  describe('extractModelSummaryFromGroups', () => {
    it('deve extrair percentuais de cota e o menor limite entre weekly e 5h', () => {
      const mockGroups: QuotaGroup[] = [
        {
          name: 'Gemini Models',
          description: 'Flash and Pro',
          buckets: [
            { name: 'Weekly Limit Remaining', window: 'weekly', remaining: 48, resetAt: 1793400000 },
            { name: 'Five Hour Limit Remaining', window: '5h', remaining: 95, resetAt: 1793390000 }
          ]
        },
        {
          name: 'Claude and GPT models',
          description: 'Opus, Sonnet, GPT-OSS',
          buckets: [
            { name: 'Weekly Limit Remaining', window: 'weekly', remaining: 0, resetAt: 1793410000 },
            { name: 'Five Hour Limit Remaining', window: '5h', remaining: 100 }
          ]
        },
        {
          name: 'Gemini 4 Argon',
          description: 'Argon quota separate',
          buckets: [
            { name: 'Gemini 4 Argon Weekly Limit', window: 'weekly', remaining: 75, resetAt: 1793450000 }
          ]
        }
      ];

      const summary = quotaService.extractModelSummaryFromGroups(mockGroups);

      // Gemini: weekly=48, 5h=95 -> remaining = min(48, 95) = 48
      expect(summary.gemini.remaining).toBe(48);
      expect(summary.gemini.weeklyRemaining).toBe(48);
      expect(summary.gemini.fiveHourRemaining).toBe(95);
      expect(summary.gemini.isAvailable).toBe(true);

      // Claude: weekly=0 -> remaining = 0 (bloqueado)
      expect(summary.claudeGpt.remaining).toBe(0);
      expect(summary.claudeGpt.isAvailable).toBe(false);

      // Argon: weekly=75 -> remaining = 75
      expect(summary.geminiArgon.remaining).toBe(75);
      expect(summary.geminiArgon.isAvailable).toBe(true);
    });
  });

  describe('routeByModel', () => {
    it('deve alternar para a conta do pool com mais cota quando a atual tiver menos', async () => {
      // Mock do overview multi-contas
      vi.spyOn(quotaService, 'getMultiAccountQuotaOverview').mockResolvedValue({
        activeEmail: 'conta1@gmail.com',
        accounts: [
          {
            email: 'conta1@gmail.com',
            name: 'Conta 1 (Atual)',
            picture: null,
            isActive: true,
            groups: [],
            modelSummary: {
              gemini: { remaining: 50, weeklyRemaining: 50, fiveHourRemaining: 50, resetAt: null, isAvailable: true },
              claudeGpt: { remaining: 0, weeklyRemaining: 0, fiveHourRemaining: 100, resetAt: null, isAvailable: false },
              geminiArgon: { remaining: 0, weeklyRemaining: 0, fiveHourRemaining: 0, resetAt: null, isAvailable: false }
            },
            lastUpdated: new Date().toISOString()
          },
          {
            email: 'conta2@gmail.com',
            name: 'Conta 2 (Disponível)',
            picture: null,
            isActive: false,
            groups: [],
            modelSummary: {
              gemini: { remaining: 30, weeklyRemaining: 30, fiveHourRemaining: 30, resetAt: null, isAvailable: true },
              claudeGpt: { remaining: 85, weeklyRemaining: 85, fiveHourRemaining: 100, resetAt: null, isAvailable: true },
              geminiArgon: { remaining: 0, weeklyRemaining: 0, fiveHourRemaining: 0, resetAt: null, isAvailable: false }
            },
            lastUpdated: new Date().toISOString()
          }
        ],
        bestAccountsByFamily: {
          gemini: { email: 'conta1@gmail.com', name: 'Conta 1', remaining: 50 },
          claudeGpt: { email: 'conta2@gmail.com', name: 'Conta 2', remaining: 85 },
          geminiArgon: { email: 'conta1@gmail.com', name: 'Conta 1', remaining: 0 }
        },
        modelQuotaMap: {}
      });

      const switchMock = vi.spyOn(accountService, 'switchAccount').mockResolvedValue({
        success: true,
        email: 'conta2@gmail.com',
        name: 'Conta 2',
        picture: null
      });

      // Seleciona Claude Opus 5.5 (família claudeGpt)
      const res = await quotaService.routeByModel('claude-opus-5-5-high');

      expect(res.success).toBe(true);
      expect(res.switched).toBe(true);
      expect(res.previousEmail).toBe('conta1@gmail.com');
      expect(res.currentEmail).toBe('conta2@gmail.com');
      expect(res.remainingQuota).toBe(85);
      expect(res.isBlocked).toBe(false);
      expect(switchMock).toHaveBeenCalledWith('conta2@gmail.com');
    });

    it('deve bloquear e sinalizar cota crítica quando todas as contas tiverem <= 5% de cota', async () => {
      vi.spyOn(quotaService, 'getMultiAccountQuotaOverview').mockResolvedValue({
        activeEmail: 'conta1@gmail.com',
        accounts: [
          {
            email: 'conta1@gmail.com',
            name: 'Conta 1',
            picture: null,
            isActive: true,
            groups: [],
            modelSummary: {
              gemini: { remaining: 3, weeklyRemaining: 3, fiveHourRemaining: 3, resetAt: null, isAvailable: true },
              claudeGpt: { remaining: 0, weeklyRemaining: 0, fiveHourRemaining: 0, resetAt: null, isAvailable: false },
              geminiArgon: { remaining: 0, weeklyRemaining: 0, fiveHourRemaining: 0, resetAt: null, isAvailable: false }
            },
            lastUpdated: new Date().toISOString()
          }
        ],
        bestAccountsByFamily: {
          gemini: { email: 'conta1@gmail.com', name: 'Conta 1', remaining: 3 },
          claudeGpt: { email: 'conta1@gmail.com', name: 'Conta 1', remaining: 0 },
          geminiArgon: { email: 'conta1@gmail.com', name: 'Conta 1', remaining: 0 }
        },
        modelQuotaMap: {}
      });

      const switchMock = vi.spyOn(accountService, 'switchAccount');

      const res = await quotaService.routeByModel('gemini-3.8-flash-high', 5);

      expect(res.success).toBe(false);
      expect(res.isBlocked).toBe(true);
      expect(res.switched).toBe(false);
      expect(res.message).toContain('Cota esgotada');
      expect(switchMock).not.toHaveBeenCalled();
    });
  });
});
