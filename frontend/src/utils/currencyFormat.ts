/**
 * Utilitário compartilhado para formatação de valores estimados em USD.
 */
export function formatUsd(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  if (value <= 0) {
    return '$0.00';
  }
  if (value < 0.01) {
    return `$${value.toFixed(4)}`;
  }
  if (value < 1000) {
    return `$${value.toFixed(2)}`;
  }
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
