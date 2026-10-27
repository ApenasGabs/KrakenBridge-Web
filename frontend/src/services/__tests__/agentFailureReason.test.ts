// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { extractAgentFailureReason } from '../../../../src/utils/agentFailureReason';

describe('Agent Failure Reason & Termination Traceability (Issue #76)', () => {
  it('deve extrair e formatar cota esgotada com tempo de reset específico', () => {
    const stderr = [
      'Print mode: run ended with error and no response: Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 77h5m36s.'
    ];
    const reason = extractAgentFailureReason(3, stderr);
    expect(reason).toContain('Cota individual do modelo esgotada');
    expect(reason).toContain('77h5m36s');
    expect(reason.startsWith('⏳')).toBe(true);
  });

  it('deve formatar cota esgotada genérica quando não houver tempo de reset', () => {
    const stderr = [
      'ResourceExhausted: 429 Resource has been exhausted (e.g. check quota).'
    ];
    const reason = extractAgentFailureReason(1, stderr);
    expect(reason).toContain('Limite de cota esgotado para o modelo selecionado');
    expect(reason.startsWith('⏳')).toBe(true);
  });

  it('deve identificar falhas de autenticação OAuth / Token expirado', () => {
    const stderr = [
      'User not authenticated. Please run login or set GEMINI_API_KEY.'
    ];
    const reason = extractAgentFailureReason(1, stderr);
    expect(reason).toContain('Erro de autenticação da conta');
    expect(reason.startsWith('🔒')).toBe(true);
  });

  it('deve identificar estouro de memória (Out of Memory - OOM)', () => {
    const stderr = [
      '<--- Last few GCs --->',
      '<--- JS stacktrace --->',
      'FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory'
    ];
    const reason = extractAgentFailureReason(134, stderr);
    expect(reason).toContain('falta de memória (Out of Memory)');
    expect(reason.startsWith('💥')).toBe(true);
  });

  it('deve identificar interrupção manual pelo usuário (user_stop)', () => {
    const reason = extractAgentFailureReason(130, [], 'user_stop');
    expect(reason).toBe('⏹️ Execução interrompida pelo usuário.');
  });

  it('deve identificar cancelamento por novo turno forçado (forced_turn)', () => {
    const reason = extractAgentFailureReason(130, [], 'forced_turn');
    expect(reason).toBe('⏩ Execução anterior cancelada para envio prioritário de nova mensagem.');
  });

  it('deve extrair a última linha relevante do stderr em erros genéricos', () => {
    const stderr = [
      'ExperimentalWarning: VM Modules is an experimental feature',
      'Debugger listening on ws://127.0.0.1:9229',
      'Error: spawn git ENOENT at Process.ChildProcess._handle.onexit'
    ];
    const reason = extractAgentFailureReason(1, stderr);
    expect(reason).toContain('código 1');
    expect(reason).toContain('Error: spawn git ENOENT');
    expect(reason.startsWith('⚠️')).toBe(true);
  });

  it('deve fornecer mensagem de fallback quando stderr estiver vazio', () => {
    const reason = extractAgentFailureReason(143, []);
    expect(reason).toBe('⚠️ A execução foi interrompida (código 143) antes de emitir resposta.');
  });
});
