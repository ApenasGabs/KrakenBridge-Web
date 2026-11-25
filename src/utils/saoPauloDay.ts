const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/** Dia civil (YYYY-MM-DD) em America/Sao_Paulo. Retorna '' para datas inválidas. */
export const saoPauloDayKey = (value: string | number): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : formatter.format(date);
};

/** Início do dia em epoch ms. O Brasil não adota horário de verão desde 2019 (UTC-3 fixo). */
export const saoPauloDayStart = (day: string): number => Date.parse(`${day}T00:00:00-03:00`);
