/**
 * Extrai e formata o motivo real de encerramento de um processo de agente CLI.
 * 
 * Mapeia erros de cota (com tempo de reset), autenticação OAuth, estouro de memória (OOM),
 * interrupção manual do usuário ou cancelamento por envio prioritário forçado.
 */
export function extractAgentFailureReason(
  code: number | null,
  stderrLines: string[] = [],
  stopReason?: string
): string {
  if (stopReason) {
    if (stopReason === 'user_stop') {
      return '⏹️ Execução interrompida pelo usuário.';
    }
    if (stopReason === 'forced_turn') {
      return '⏩ Execução anterior cancelada para envio prioritário de nova mensagem.';
    }
    return `⏹️ Execução interrompida (${stopReason}).`;
  }

  const stderrText = stderrLines.join('\n');

  // 1. Cota esgotada (com captura de tempo de reset)
  const quotaResetMatch = stderrText.match(/Resets in ([0-9]+[a-z0-9]+)/i) ||
                          stderrText.match(/resets in ([^.\n]+)/i);
  if (quotaResetMatch) {
    return `⏳ Cota individual do modelo esgotada. O limite será redefinido em ${quotaResetMatch[1].trim()}.`;
  }

  if (/Individual quota reached|quota exceeded|ResourceExhausted|rate limit/i.test(stderrText) || code === 3) {
    return '⏳ Limite de cota esgotado para o modelo selecionado. Aguarde o tempo de reset ou altere o modelo nas opções.';
  }

  // 2. Falha de autenticação
  if (/User not authenticated|invalid_grant|token expired|OAuth/i.test(stderrText)) {
    return '🔒 Erro de autenticação da conta. Acesse as configurações para reautenticar o token.';
  }

  // 3. Falha por falta de memória (OOM)
  if (/JavaScript heap out of memory/i.test(stderrText) || code === 134) {
    return '💥 Erro de falta de memória (Out of Memory) no processo do agente.';
  }

  // 4. Se houver alguma linha relevante no stderr
  const meaningfulErr = stderrLines
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('Debugger') && !l.startsWith('ExperimentalWarning') && !l.startsWith('node:'))
    .pop();

  if (meaningfulErr) {
    return `⚠️ A execução foi interrompida (código ${code ?? 'desconhecido'}): ${meaningfulErr}`;
  }

  return `⚠️ A execução foi interrompida (código ${code ?? 'desconhecido'}) antes de emitir resposta.`;
}
