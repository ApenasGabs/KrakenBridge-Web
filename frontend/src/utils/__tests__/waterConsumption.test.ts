import { describe, it, expect, beforeEach } from 'vitest';
import { 
  tokensToWaterLiters, 
  formatWaterLiters, 
  formatTokens,
  formatTokensOrWater,
  getWaterMetricsPreference,
  setWaterMetricsPreference,
  LITERS_PER_TOKEN 
} from '../waterConsumption';

describe('waterConsumption utils', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  describe('tokensToWaterLiters', () => {
    it('deve retornar 0 para valores inválidos, nulos ou negativos', () => {
      expect(tokensToWaterLiters(0)).toBe(0);
      expect(tokensToWaterLiters(undefined)).toBe(0);
      expect(tokensToWaterLiters(-500)).toBe(0);
      expect(tokensToWaterLiters(NaN)).toBe(0);
    });

    it('deve converter tokens corretamente baseado no fator de 0.5L por 1000 tokens', () => {
      expect(tokensToWaterLiters(1000)).toBe(0.5);
      expect(tokensToWaterLiters(2000)).toBe(1.0);
      expect(tokensToWaterLiters(10000)).toBe(5.0);
      expect(tokensToWaterLiters(2000000)).toBe(1000.0);
    });
  });

  describe('formatWaterLiters', () => {
    it('deve formatar 0 ou valores inválidos como "0 L"', () => {
      expect(formatWaterLiters(0)).toBe('0 L');
      expect(formatWaterLiters(undefined)).toBe('0 L');
      expect(formatWaterLiters(-10)).toBe('0 L');
    });

    it('deve formatar valores pequenos com precisão adequada', () => {
      expect(formatWaterLiters(0.005)).toBe('0.005 L');
      expect(formatWaterLiters(0.5)).toBe('0.50 L');
      expect(formatWaterLiters(2.75)).toBe('2.75 L');
    });

    it('deve formatar valores intermediários e altos em litros', () => {
      expect(formatWaterLiters(25.4)).toBe('25.4 L');
      expect(formatWaterLiters(1500)).toContain('1');
      expect(formatWaterLiters(1500)).toContain('L');
    });

    it('deve aceitar tokens diretamente quando isTokensInput for true', () => {
      // 10.000 tokens * 0.0005 = 5.0 L
      expect(formatWaterLiters(10000, true)).toBe('5.00 L');
      // 1.000 tokens * 0.0005 = 0.5 L
      expect(formatWaterLiters(1000, true)).toBe('0.50 L');
    });
  });

  describe('formatTokens', () => {
    it('deve formatar valores nulos ou zero como "0"', () => {
      expect(formatTokens(0)).toBe('0');
      expect(formatTokens(undefined)).toBe('0');
      expect(formatTokens(-10)).toBe('0');
    });

    it('deve formatar valores com sufixos k e M', () => {
      expect(formatTokens(950)).toBe('950');
      expect(formatTokens(1500)).toBe('1.5k');
      expect(formatTokens(2500000)).toBe('2.50M');
    });
  });

  describe('formatTokensOrWater', () => {
    it('deve formatar em tokens quando showWaterMetrics for false', () => {
      expect(formatTokensOrWater(50000, false)).toBe('50.0k');
    });

    it('deve formatar em litros de água quando showWaterMetrics for true', () => {
      // 50.000 tokens * 0.0005 = 25.0 L
      expect(formatTokensOrWater(50000, true)).toBe('25.0 L');
    });
  });

  describe('preferências e persistência de pegada hídrica', () => {
    it('deve ler false por padrão quando não definido', () => {
      expect(getWaterMetricsPreference()).toBe(false);
    });

    it('deve salvar e carregar preferência no localStorage', () => {
      setWaterMetricsPreference(true);
      expect(getWaterMetricsPreference()).toBe(true);

      setWaterMetricsPreference(false);
      expect(getWaterMetricsPreference()).toBe(false);
    });
  });
});
