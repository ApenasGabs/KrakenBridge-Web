#!/usr/bin/env node
/**
 * Kraken Guard — hooks de ciclo de vida do Claude Code (Issue #184).
 *
 * Provisionado pelo KrakenBridge em $CLAUDE_CONFIG_DIR/kraken-guardrails/ e
 * registrado em $CLAUDE_CONFIG_DIR/settings.json. Hooks continuam valendo com
 * --dangerously-skip-permissions, então as negações aqui são mecânicas.
 *
 * Uso: node kraken-guard.cjs <user-prompt|pre-tool|post-tool|stop>  (payload JSON no stdin)
 *
 * Nunca derruba o agente: qualquer erro interno resulta em "permitir" (exit 0).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const REVIEW_CMD_RE = /spec-code-review\.mjs|agent-standards["']?\s+review\b/;
const REPORT_NAME = 'REVIEW_REPORT.md';
const MAX_STOP_BLOCKS = 2;
const MAX_REPORT_CHARS = 15000;

const RULES_REMINDER = [
  '[KRAKEN GUARD — diretivas obrigatórias deste turno]',
  '1. Narração antes de agir: antes de CADA chamada de ferramenta, escreva no chat (texto visível, não só thinking) o que vai fazer e por quê. Após cada resultado, comente brevemente o que descobriu. O KrakenBridge audita e sinaliza toda ferramenta chamada sem narração prévia.',
  '2. Code review (agent-standards / spec-code-review.mjs): anuncie no chat ANTES de rodar; rode sem filtrar a saída (sem | grep/head/tail, sem > arquivo); leia o REVIEW_REPORT.md completo; liste no chat os apontamentos do Eixo Spec e do Eixo Standards e diga quais serão corrigidos.',
  '3. Se o status for 🔴 Reprovado: corrija os itens ou apresente-os no chat e aguarde confirmação explícita do usuário antes de classificar qualquer item como falso positivo, comentar/aprovar o PR ou declarar aprovação. Nunca mova, apague ou edite o REVIEW_REPORT.md (para não sujar o git status use .git/info/exclude).'
].join('\n');

// ---------- utilidades ----------

const configDir = () => {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
};

const stateFile = (sessionId) => {
  const safe = String(sessionId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return path.join(configDir(), 'kraken-guardrails', 'state', `${safe}.json`);
};

const loadState = (sessionId) => {
  try {
    return JSON.parse(fs.readFileSync(stateFile(sessionId), 'utf8'));
  } catch {
    return null;
  }
};

const saveState = (sessionId, state) => {
  const f = stateFile(sessionId);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(state, null, 2));
};

/** Divide um comando shell em segmentos separados por ; && || e quebras de linha. */
const segments = (command) => {
  return String(command || '').split(/;|&&|\|\||\n/);
};

// ---------- decisões puras (exportadas para testes) ----------

const isReviewCommand = (command) => {
  return REVIEW_CMD_RE.test(String(command || ''));
};

/** True se a execução do revisor tem a saída filtrada ou descartada. */
const isMaskedReviewCommand = (command) => {
  for (const seg of segments(command)) {
    if (!REVIEW_CMD_RE.test(seg)) continue;
    const tail = seg.slice(seg.search(REVIEW_CMD_RE));
    // Pipes: só `| tee ...` é aceitável (duplica a saída sem esconder).
    const pipes = tail.split('|').slice(1);
    if (pipes.some((p) => !/^\s*tee\b/.test(p))) return true;
    // Redirecionamento de stdout (stderr para stdout ou descartar só stderr é ok).
    const withoutStderr = tail.replace(/\b2>&1/g, '').replace(/\b2>>?\s*\S+/g, '');
    if (/>/.test(withoutStderr)) return true;
  }
  return false;
};

/** True se o comando move, apaga, sobrescreve ou reverte o REVIEW_REPORT.md. */
const isReportTamperCommand = (command) => {
  return segments(command).some((seg) => {
    if (!seg.includes(REPORT_NAME)) return false;
    return (
      /\b(mv|rm|unlink|truncate|shred)\b/.test(seg) ||
      /\bgit\s+(rm|restore|checkout|stash|clean)\b/.test(seg) ||
      /\bsed\s+(-[a-zA-Z]*i|--in-place)/.test(seg) ||
      new RegExp(`>\\s*[^\\s|]*${REPORT_NAME.replace('.', '\\.')}`).test(seg)
    );
  });
};

const isPrFeedbackCommand = (command) => {
  return /\bgh\s+(pr\s+(comment|review|merge)\b|api\b[^\n]*(comments|reviews|merge))/.test(String(command || ''));
};

/** Extrai o status do relatório: 'reprovado' | 'aprovado' | 'desconhecido'. */
const parseReportStatus = (content) => {
  const text = String(content || '');
  const statusLine = text.split('\n').find((l) => /status/i.test(l)) || text.slice(0, 2000);
  if (/reprovad|requer ajustes|🔴/i.test(statusLine)) return 'reprovado';
  if (/aprovad|🟢|✅/i.test(statusLine)) return 'aprovado';
  return 'desconhecido';
};

/** Decide o PreToolUse. Retorna { deny: string } ou null. */
const decidePreTool = (input, state) => {
  const tool = input.tool_name;
  const ti = input.tool_input || {};

  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const fp = ti.file_path || ti.notebook_path || '';
    if (path.basename(String(fp)) === REPORT_NAME) {
      return { deny: `KRAKEN GUARD: o ${REPORT_NAME} é a evidência oficial do revisor agent-standards e não pode ser editado. Apresente os apontamentos no chat; para corrigir, altere o código e rode o revisor de novo.` };
    }
    return null;
  }

  if (tool !== 'Bash') return null;
  const cmd = String(ti.command || '');

  if (isReviewCommand(cmd) && isMaskedReviewCommand(cmd)) {
    return { deny: 'KRAKEN GUARD: não filtre nem descarte a saída do revisor agent-standards (sem | grep/head/tail/sed/awk e sem > arquivo). Anuncie no chat que a revisão está começando e rode o comando sem filtros; a saída completa e o REVIEW_REPORT.md precisam ser lidos e expostos no chat.' };
  }
  if (isReportTamperCommand(cmd)) {
    return { deny: `KRAKEN GUARD: proibido mover, apagar, sobrescrever ou reverter o ${REPORT_NAME}. Ele precisa ser lido e seus apontamentos (Eixo Spec e Eixo Standards) expostos no chat. Para não sujar o git status, adicione-o a .git/info/exclude.` };
  }
  if (state && state.status === 'reprovado' && !state.presented && isPrFeedbackCommand(cmd)) {
    return { deny: 'KRAKEN GUARD: o revisor agent-standards REPROVOU esta entrega e os apontamentos ainda não foram apresentados ao usuário. Liste no chat os itens do Eixo Spec e do Eixo Standards, corrija-os ou obtenha confirmação explícita do usuário antes de comentar, revisar ou mergear o PR (nada de classificar falso positivo sozinha).' };
  }
  return null;
};

/** Decide o Stop. Retorna { block: string } ou null. */
const decideStop = (input, state) => {
  if (!state || !state.reviewRan || state.presented) return null;
  if ((state.stopBlocks || 0) >= MAX_STOP_BLOCKS) return null; // evita laço infinito
  const msg = String(input.last_assistant_message || '');
  const missing = [];
  if (!/\bspec\b|aderência|aderencia/i.test(msg)) missing.push('apontamentos do Eixo Spec (aderência à tarefa)');
  if (!/standards|conformidade|padr[õo]es/i.test(msg)) missing.push('apontamentos do Eixo Standards (conformidade com padrões)');
  if (state.status === 'reprovado' && !/reprovad|requer ajustes/i.test(msg)) {
    missing.push('o status oficial 🔴 Reprovado do revisor (não declare aprovação sem resolver os itens ou sem confirmação explícita do usuário)');
  }
  if (missing.length === 0) return null;
  return {
    block: `KRAKEN GUARD: o revisor agent-standards rodou neste turno${state.reportPath ? ` (relatório: ${state.reportPath})` : ''}, mas sua resposta final ainda não expõe: ${missing.join('; ')}. Antes de encerrar, apresente no chat cada apontamento, diga quais serão corrigidos e quais você considera falso positivo (com justificativa) e peça a confirmação do usuário.`
  };
};

const findReport = (input) => {
  const cmd = String((input.tool_input || {}).command || '');
  const candidates = [];
  const target = cmd.match(/--target[ =]+("[^"]+"|'[^']+'|\S+)/);
  if (target) candidates.push(target[1].replace(/^["']|["']$/g, ''));
  const cd = cmd.match(/^\s*cd\s+("[^"]+"|'[^']+'|\S+)/);
  if (cd) candidates.push(cd[1].replace(/^["']|["']$/g, ''));
  if (input.cwd) candidates.push(input.cwd);
  let best = null;
  for (const dir of candidates) {
    const f = path.resolve(input.cwd || process.cwd(), dir, REPORT_NAME);
    try {
      const st = fs.statSync(f);
      if (!best || st.mtimeMs > best.mtimeMs) best = { path: f, mtimeMs: st.mtimeMs };
    } catch {}
  }
  return best ? best.path : null;
};

// ---------- handlers ----------

const handle = (mode, input) => {
  const sessionId = input.session_id;
  const state = loadState(sessionId);

  if (mode === 'user-prompt') {
    return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: RULES_REMINDER } };
  }

  if (mode === 'pre-tool') {
    const d = decidePreTool(input, state);
    if (!d) return null;
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: d.deny } };
  }

  if (mode === 'post-tool') {
    if (input.tool_name !== 'Bash' || !isReviewCommand((input.tool_input || {}).command)) return null;
    const reportPath = findReport(input);
    let content = '';
    try {
      if (reportPath) content = fs.readFileSync(reportPath, 'utf8');
    } catch {}
    const status = content ? parseReportStatus(content) : 'desconhecido';
    saveState(sessionId, { reviewRan: true, status, reportPath, presented: false, stopBlocks: 0, at: new Date().toISOString() });
    const body = content
      ? `\n\n----- ${reportPath} (status detectado: ${status}) -----\n${content.length > MAX_REPORT_CHARS ? content.slice(0, MAX_REPORT_CHARS) + '\n…[truncado — leia o arquivo completo]' : content}`
      : '\n\n(REVIEW_REPORT.md não encontrado — use a saída completa do comando acima.)';
    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `KRAKEN GUARD: o revisor agent-standards terminou. OBRIGATÓRIO agora: exponha no chat todos os apontamentos do Eixo Spec e do Eixo Standards, diga quais vai corrigir e não declare aprovação se o status for Reprovado sem resolver os itens ou sem confirmação explícita do usuário.${body}`
      }
    };
  }

  if (mode === 'stop') {
    const d = decideStop(input, state);
    if (!d) {
      if (state && state.reviewRan && !state.presented) saveState(sessionId, { ...state, presented: true });
      return null;
    }
    saveState(sessionId, { ...state, stopBlocks: (state.stopBlocks || 0) + 1 });
    return { decision: 'block', reason: d.block };
  }

  return null;
};

module.exports = {
  isReviewCommand,
  isMaskedReviewCommand,
  isReportTamperCommand,
  isPrFeedbackCommand,
  parseReportStatus,
  decidePreTool,
  decideStop,
  handle,
  RULES_REMINDER
};

if (require.main === module) {
  const mode = process.argv[2];
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      const out = handle(mode, raw ? JSON.parse(raw) : {});
      if (out) process.stdout.write(JSON.stringify(out));
    } catch (err) {
      process.stderr.write(`[kraken-guard] erro interno (permitindo): ${err && err.message}\n`);
    }
    process.exit(0);
  });
}
