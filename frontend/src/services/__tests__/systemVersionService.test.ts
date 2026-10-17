import { describe, it, expect, vi, beforeEach } from 'vitest';
import { systemVersionService } from '../../../../src/services/systemVersionService';

describe('SystemVersionService - Version Lifecycle & Auto-Update (Issue #64)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve obter a versão atual do sistema a partir do package.json', () => {
    const version = systemVersionService.getCurrentVersion();
    expect(version).toBeDefined();
    expect(/^\d+\.\d+\.\d+$/.test(version)).toBe(true);
  });

  it('deve comparar corretamente versões SemVer com e sem prefixo v', () => {
    expect(systemVersionService.compareSemver('1.11.0', '1.10.0')).toBe(1);
    expect(systemVersionService.compareSemver('v1.5.0', '1.6.0')).toBe(-1);
    expect(systemVersionService.compareSemver('v1.11.0', '1.11.0')).toBe(0);
    expect(systemVersionService.compareSemver('2.0.0', '1.99.99')).toBe(1);
  });

  it('deve gerenciar a alternância da política de atualização (auto vs pinned)', () => {
    const autoPolicy = systemVersionService.setPolicy('auto');
    expect(autoPolicy.policy).toBe('auto');
    expect(autoPolicy.pinnedVersion).toBeNull();

    const pinnedPolicy = systemVersionService.setPolicy('pinned', 'v1.9.0');
    expect(pinnedPolicy.policy).toBe('pinned');
    expect(pinnedPolicy.pinnedVersion).toBe('v1.9.0');

    const state = systemVersionService.getPolicyState();
    expect(state.policy).toBe('pinned');
    expect(state.pinnedVersion).toBe('v1.9.0');

    // Restaurar auto
    systemVersionService.setPolicy('auto');
  });

  it('deve retornar status completo com releases e detecção de atualização', async () => {
    const status = await systemVersionService.getStatus();

    expect(status.currentVersion).toBeDefined();
    expect(status.latestVersion).toBeDefined();
    expect(typeof status.hasUpdate).toBe('boolean');
    expect(Array.isArray(status.releases)).toBe(true);
    expect(status.releases.length).toBeGreaterThan(0);

    const first = status.releases[0];
    expect(first.tag).toBeDefined();
    expect(first.isLatest).toBe(true);
  });
});
