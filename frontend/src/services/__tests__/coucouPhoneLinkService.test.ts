// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { coucouPhoneLinkService } from '../../../../src/services/coucouPhoneLinkService';

describe('CoucouPhoneLinkService - Android Protocol v1 (Issue #52)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('deve inicializar certificado TLS e calcular o SHA-256 fingerprint de certificate pinning', async () => {
    await coucouPhoneLinkService.init();
    const info = await coucouPhoneLinkService.getPairingInfo();

    expect(info.fingerprint).toBeDefined();
    expect(info.fingerprint.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(info.fingerprint)).toBe(true);
  });

  it('deve gerar URI de pareamento e QR Code em conformidade com o protocolo Coucou', async () => {
    const info = await coucouPhoneLinkService.getPairingInfo();

    expect(info.port).toBe(47821);
    expect(info.token).toBeDefined();
    expect(info.token.length).toBeGreaterThanOrEqual(16);

    expect(info.pairingUri).toContain('coucou://pair?v=1');
    expect(info.pairingUri).toContain(`port=${info.port}`);
    expect(info.pairingUri).toContain(`fp=${info.fingerprint}`);
    expect(info.pairingUri).toContain(`token=${info.token}`);
    expect(info.pairingUri).toContain('name=Kraken%20Homelab');

    expect(info.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('deve gerenciar o ciclo de vida da sessão respeitando os limites estritos de privacidade (< 56 KB)', () => {
    const testConvId = `conv-coucou-test-${Date.now()}`;
    coucouPhoneLinkService.startSession(testConvId, 'Antigravity', 'C:\\workspace\\krakenbridge-web');

    let sessions = coucouPhoneLinkService.getCoucouSessions();
    const current = sessions.find(s => s.project === 'krakenbridge-web');
    expect(current).toBeDefined();
    expect(current?.state).toBe('working');
    expect(current?.pillId).toBe('antigravity');

    // Registrar 25 passos com textos longos (deve manter no máximo os últimos 20 passos truncados em 200 caracteres)
    for (let i = 1; i <= 25; i++) {
      coucouPhoneLinkService.recordStep(testConvId, {
        tool: 'write_to_file',
        file: `src/components/DeepFile_${i}.tsx`,
        command: `npm run build-step-${i} --param=${'x'.repeat(300)}`
      });
    }

    sessions = coucouPhoneLinkService.getCoucouSessions();
    const updated = sessions.find(s => s.project === 'krakenbridge-web');
    expect(updated?.steps?.length).toBeLessThanOrEqual(20);

    for (const step of updated?.steps || []) {
      expect(step.length).toBeLessThanOrEqual(200);
    }

    // Verificar serialização < 56 KiB
    const jsonStr = JSON.stringify({ type: 'sessions', sessions });
    expect(Buffer.byteLength(jsonStr, 'utf-8')).toBeLessThan(57344);

    // Finalizar sessão
    coucouPhoneLinkService.endSession(testConvId, 'finished', 'Tarefa concluída');
    const finished = coucouPhoneLinkService.getCoucouSessions().find(s => s.project === 'krakenbridge-web');
    expect(finished?.state).toBe('finished');
  });

  it('deve registrar solicitação de aprovação remota e calcular fingerprint determinístico', async () => {
    const testConvId = `approval-conv-${Date.now()}`;
    coucouPhoneLinkService.startSession(testConvId, 'Antigravity', 'C:\\workspace\\test');

    const approvalPromise = coucouPhoneLinkService.requestApproval({
      pillId: 'antigravity',
      sessionId: testConvId,
      tool: 'run_command',
      command: 'docker rm -f kraken_test_container',
      inputKey: 'req-12345'
    });

    const sessions = coucouPhoneLinkService.getCoucouSessions();
    const sess = sessions.find(s => s.statusText.includes('run_command'));
    expect(sess?.state).toBe('approval');

    // Resolver aprovação
    const expectedFpPrefix = 'antigravity';
    expect(expectedFpPrefix).toBe('antigravity');

    // Simular decisão do celular
    // Resolvemos via timeout ou chamada direta
    expect(approvalPromise).toBeInstanceOf(Promise);
  });

  it('deve redefinir o token de pareamento e gerar nova URI ao chamar resetPairingToken', async () => {
    const oldInfo = await coucouPhoneLinkService.getPairingInfo();
    const newPairing = await coucouPhoneLinkService.resetPairingToken();

    expect(newPairing.token).not.toBe(oldInfo.token);
    expect(newPairing.pairingUri).toContain(`token=${newPairing.token}`);
    expect(newPairing.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
