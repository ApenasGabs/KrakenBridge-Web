import { describe, it, expect } from 'vitest';
import { formatUsd } from '../currencyFormat';

describe('currencyFormat - formatUsd', () => {
  it('retorna traço para null, undefined ou NaN', () => {
    expect(formatUsd(null)).toBe('—');
    expect(formatUsd(undefined)).toBe('—');
    expect(formatUsd(Number.NaN)).toBe('—');
  });

  it('formata zero e valores menores que 1 centavo com 4 casas decimais', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(0.0042)).toBe('$0.0042');
    expect(formatUsd(0.0099)).toBe('$0.0099');
  });

  it('formata valores normais com 2 casas decimais e separador de milhar', () => {
    expect(formatUsd(0.25)).toBe('$0.25');
    expect(formatUsd(12.345)).toBe('$12.35');
    expect(formatUsd(1250.5)).toBe('$1,250.50');
  });
});
