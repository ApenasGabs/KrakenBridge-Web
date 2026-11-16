import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Issue #184: guardrails mecânicos contra bypass do code reviewer agent-standards.

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = path.join(ROOT, 'src/templates/claude-guardrails/kraken-guard.cjs');
const guard = require(GUARD);

const ISSUE_CMD = 'node /workspace/.agents/scripts/spec-code-review.mjs --target /workspace/paperclip --task 11 --base origin/master 2>&1 | grep -E "Comparação|Análise|status"';

test('detecta saída do revisor mascarada (comando exato da issue #184)', () => {
  assert.equal(guard.isMaskedReviewCommand(ISSUE_CMD), true);
  assert.equal(guard.isMaskedReviewCommand('node spec-code-review.mjs --target . | head -20'), true);
  assert.equal(guard.isMaskedReviewCommand('node spec-code-review.mjs --target . > /dev/null'), true);
  assert.equal(guard.isMaskedReviewCommand('node spec-code-review.mjs --target . &> out.txt'), true);
  assert.equal(guard.isMaskedReviewCommand('npx @apenasgabs/agent-standards review --base origin/main | tail -5'), true);
  // Permitidos
  assert.equal(guard.isMaskedReviewCommand('node spec-code-review.mjs --target . --task 11 2>&1'), false);
  assert.equal(guard.isMaskedReviewCommand('node spec-code-review.mjs --target . 2>/dev/null'), false);
  assert.equal(guard.isMaskedReviewCommand('node spec-code-review.mjs --target . 2>&1 | tee /tmp/review.log'), false);
  assert.equal(guard.isMaskedReviewCommand('cd /x && node spec-code-review.mjs --target . ; ls | grep a'), false, 'pipe em outro segmento não conta');
});

test('detecta adulteração do REVIEW_REPORT.md', () => {
  assert.equal(guard.isReportTamperCommand('mv REVIEW_REPORT.md /root/kraken-patches/2026-11-14-pr12-REVIEW_REPORT.md'), true);
  assert.equal(guard.isReportTamperCommand('rm -f /workspace/paperclip/REVIEW_REPORT.md'), true);
  assert.equal(guard.isReportTamperCommand('git restore REVIEW_REPORT.md'), true);
  assert.equal(guard.isReportTamperCommand('echo ok > REVIEW_REPORT.md'), true);
  assert.equal(guard.isReportTamperCommand('sed -i "s/Reprovado/Aprovado/" REVIEW_REPORT.md'), true);
  assert.equal(guard.isReportTamperCommand('cat REVIEW_REPORT.md'), false);
  assert.equal(guard.isReportTamperCommand('cp REVIEW_REPORT.md /tmp/'), false);
  assert.equal(guard.isReportTamperCommand('echo REVIEW_REPORT.md >> .git/info/exclude'), false);
});

test('parseReportStatus', () => {
  assert.equal(guard.parseReportStatus('# Relatório\n🔴 **Status Geral: Reprovado / Requer Ajustes Críticos**'), 'reprovado');
  assert.equal(guard.parseReportStatus('# Relatório\n🟢 **Status Geral: Aprovado**'), 'aprovado');
  assert.equal(guard.parseReportStatus('sem informação'), 'desconhecido');
});

test('decidePreTool bloqueia Edit/Write no relatório e PR feedback com reprovação pendente', () => {
  assert.ok(guard.decidePreTool({ tool_name: 'Edit', tool_input: { file_path: '/r/REVIEW_REPORT.md' } }, null)?.deny);
  assert.equal(guard.decidePreTool({ tool_name: 'Edit', tool_input: { file_path: '/r/README.md' } }, null), null);
  const pending = { reviewRan: true, status: 'reprovado', presented: false };
  const comment = { tool_name: 'Bash', tool_input: { command: 'gh pr comment 12 --body "falso positivo"' } };
  assert.ok(guard.decidePreTool(comment, pending)?.deny);
  assert.equal(guard.decidePreTool(comment, { ...pending, presented: true }), null);
  assert.equal(guard.decidePreTool(comment, { ...pending, status: 'aprovado' }), null);
  assert.equal(guard.decidePreTool({ tool_name: 'Read', tool_input: { file_path: 'REVIEW_REPORT.md' } }, pending), null);
});

test('decideStop exige eixos Spec/Standards e status Reprovado na resposta final', () => {
  const st = { reviewRan: true, status: 'reprovado', presented: false, stopBlocks: 0 };
  assert.ok(guard.decideStop({ last_assistant_message: 'Tudo aprovado! 12 de 13 requisitos.' }, st)?.block);
  assert.ok(guard.decideStop({ last_assistant_message: 'Eixo Spec: 1 divergência. Eixo Standards: 0.' }, st)?.block, 'omitir Reprovado bloqueia');
  assert.equal(guard.decideStop({ last_assistant_message: 'Status 🔴 Reprovado. Eixo Spec: 1 divergência (item X). Eixo Standards: 0 violações. Vou corrigir X.' }, st), null);
  assert.equal(guard.decideStop({ last_assistant_message: '' }, { ...st, stopBlocks: 2 }), null, 'limite evita laço infinito');
  assert.equal(guard.decideStop({ last_assistant_message: '' }, null), null, 'sem revisão no turno não bloqueia');
});

function runHook(mode, payload, configDir) {
  const r = spawnSync(process.execPath, [GUARD, mode], {
    input: JSON.stringify(payload),
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
    encoding: 'utf8'
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout) : null;
}

test('Fluxo Estrito de Code Review e Tolerância Zero a Bypasses: reproduz o cenário do PR #12 e bloqueia cada bypass', () => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-cfg-'));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-repo-'));
  const session = { session_id: 'sess-184', cwd: repo };

  // 1. Revisor com grep -> negado
  const pre = runHook('pre-tool', { ...session, tool_name: 'Bash', tool_input: { command: ISSUE_CMD } }, cfg);
  assert.equal(pre.hookSpecificOutput.permissionDecision, 'deny');

  // 2. Revisor rodado corretamente -> relatório completo injetado
  fs.writeFileSync(path.join(repo, 'REVIEW_REPORT.md'), '# Review\n🔴 **Status Geral: Reprovado / Requer Ajustes Críticos** (Score 92%)\n- Eixo Spec: requisito 13 divergente\n');
  const post = runHook('post-tool', { ...session, tool_name: 'Bash', tool_input: { command: `node spec-code-review.mjs --target ${repo} --task 11 2>&1` } }, cfg);
  assert.match(post.hookSpecificOutput.additionalContext, /requisito 13 divergente/);
  assert.match(post.hookSpecificOutput.additionalContext, /status detectado: reprovado/);

  // 3. Mover o relatório -> negado
  const mv = runHook('pre-tool', { ...session, tool_name: 'Bash', tool_input: { command: 'mv REVIEW_REPORT.md /root/kraken-patches/x.md' } }, cfg);
  assert.equal(mv.hookSpecificOutput.permissionDecision, 'deny');

  // 4. Comentar "falso positivo" no PR antes de apresentar -> negado
  const gh = runHook('pre-tool', { ...session, tool_name: 'Bash', tool_input: { command: 'gh pr comment 12 --body "falso positivo"' } }, cfg);
  assert.equal(gh.hookSpecificOutput.permissionDecision, 'deny');

  // 5. Encerrar declarando aprovação -> bloqueado
  const stop1 = runHook('stop', { ...session, last_assistant_message: 'Aprovado: 12 de 13 requisitos e 0 violações.' }, cfg);
  assert.equal(stop1.decision, 'block');

  // 6. Resposta honesta -> permitido e marcado como apresentado
  const stop2 = runHook('stop', { ...session, stop_hook_active: true, last_assistant_message: 'Revisor: 🔴 Reprovado. Eixo Spec: requisito 13 divergente. Eixo Standards: 0 violações. Confirma se corrijo?' }, cfg);
  assert.equal(stop2, null);

  // 7. Próximo turno (após o usuário ver os apontamentos) -> comentário liberado
  const gh2 = runHook('pre-tool', { ...session, tool_name: 'Bash', tool_input: { command: 'gh pr comment 12 --body "ok"' } }, cfg);
  assert.equal(gh2, null);

  // UserPromptSubmit sempre reinjeta as regras
  const up = runHook('user-prompt', session, cfg);
  assert.match(up.hookSpecificOutput.additionalContext, /Narração antes de agir/);
});

test('Auto-Alinhamento do Claude com suas Próprias Diretrizes: provisionamento em CLAUDE_CONFIG_DIR preserva config do usuário, é idempotente e não destrói JSON inválido', async () => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-prov-'));
  const prev = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = cfg;
  try {
    const other = { matcher: 'Bash', hooks: [{ type: 'command', command: 'node /x/git-guardrail.cjs' }] };
    fs.writeFileSync(path.join(cfg, 'settings.json'), JSON.stringify({ model: 'opus', hooks: { PreToolUse: [other] } }));
    fs.writeFileSync(path.join(cfg, 'CLAUDE.md'), '# Minhas notas\n');

    const { claudeGuardrailsService, GUARD_SCRIPT_NAME } = await import('../dist-server/services/claudeGuardrailsService.js');
    assert.equal(await claudeGuardrailsService.ensureProvisioned(), true);
    assert.equal(await claudeGuardrailsService.ensureProvisioned(), true);

    const settings = JSON.parse(fs.readFileSync(path.join(cfg, 'settings.json'), 'utf8'));
    assert.equal(settings.model, 'opus');
    assert.deepEqual(settings.attribution, { commit: '', pr: '' }, 'desativa coautoria e assinatura de PR do Claude Code');
    assert.deepEqual(settings.hooks.PreToolUse[0], other, 'hook de terceiros preservado');
    for (const ev of ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']) {
      const guards = settings.hooks[ev].filter((g) => g.hooks.some((h) => h.command.includes(GUARD_SCRIPT_NAME)));
      assert.equal(guards.length, 1, `exatamente 1 grupo do guard em ${ev}`);
    }
    assert.ok(fs.existsSync(path.join(cfg, 'kraken-guardrails', GUARD_SCRIPT_NAME)));

    const md = fs.readFileSync(path.join(cfg, 'CLAUDE.md'), 'utf8');
    assert.ok(md.startsWith('# Minhas notas'));
    assert.match(md, /Proibição de créditos\/coautoria/);
    assert.equal(md.split('KRAKEN-GUARDRAILS:BEGIN').length, 2, 'bloco gerenciado único');

    fs.writeFileSync(path.join(cfg, 'settings.json'), '{ invalido');
    assert.equal(await claudeGuardrailsService.ensureProvisioned(), false);
    assert.equal(fs.readFileSync(path.join(cfg, 'settings.json'), 'utf8'), '{ invalido');
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prev;
  }
});

test('Proibição de créditos/coautoria bloqueia Co-Authored-By e branding de Paperclip, Claude e IAs em commits e PRs (Issues #192, #194)', () => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-attr-'));
  const session = { session_id: 'sess-192', cwd: '/workspace/app' };

  const blocked = [
    'git commit -m "feat: ok\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"',
    'git commit -m "feat: ok\n\nCo-Authored-By: Paperclip <noreply@paperclip.ing>"',
    'git commit -m "feat: ok\n\nCo-authored-by: Copilot <copilot@github.com>"',
    'cat <<\'EOF\' > /tmp/msg && git commit -F /tmp/msg\nfeat: ajuste\n\nCo-authored-by: Claude <noreply@anthropic.com>\nEOF',
    'gh pr create --title "feat: x" --body "Resumo\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)"',
    'gh pr create --title "feat: x" --body "Resumo\n\nGenerated with Paperclip (https://paperclip.ing)"',
    'gh pr edit 191 --body "Generated by Claude Code"',
    'glab mr create --title "feat: x" --description "See https://claude.com/claude-code"'
  ];
  for (const command of blocked) {
    assert.equal(guard.hasForbiddenAttribution(command), true, `deveria detectar atribuição em: ${command}`);
    const res = runHook('pre-tool', { ...session, tool_name: 'Bash', tool_input: { command } }, cfg);
    assert.equal(res.hookSpecificOutput.permissionDecision, 'deny', `deveria negar: ${command}`);
  }

  const allowed = [
    'git commit -m "fix(guard): impedir créditos do Claude Code em commits e PRs"',
    'git commit -m "feat: ajuste\n\nCo-authored-by: ApenasGabs <ApenasGabs@users.noreply.github.com>"',
    'gh pr create --title "fix(guard): bloquear créditos" --body "## Resumo\nCloses #192"',
    'grep -rn "Co-Authored-By: Claude" test/',
    'grep -rn "Co-Authored-By: Paperclip" src/'
  ];
  for (const command of allowed) {
    assert.equal(guard.hasForbiddenAttribution(command), false, `não deveria bloquear: ${command}`);
    const res = runHook('pre-tool', { ...session, tool_name: 'Bash', tool_input: { command } }, cfg);
    assert.equal(res, null, `não deveria negar: ${command}`);
  }
});

test('Native commit-msg hook sanitiza trailers de Paperclip e Claude mas preserva coautoria humana', () => {
  const hookPath = '/root/.git-templates/hooks/commit-msg';
  if (!fs.existsSync(hookPath)) return;

  const tmpFile = path.join(os.tmpdir(), `commit-msg-${Date.now()}`);
  const initialContent = [
    'feat(core): nova funcionalidade',
    '',
    'Co-authored-by: Paperclip <noreply@paperclip.ing>',
    'Co-authored-by: Claude <noreply@anthropic.com>',
    'Co-authored-by: ApenasGabs <ApenasGabs@users.noreply.github.com>',
    '',
    'Generated with Claude Code'
  ].join('\n');

  fs.writeFileSync(tmpFile, initialContent, 'utf8');

  const r = spawnSync(hookPath, [tmpFile], { encoding: 'utf8' });
  assert.equal(r.status, 0);

  const sanitized = fs.readFileSync(tmpFile, 'utf8');
  fs.unlinkSync(tmpFile);

  assert.ok(!sanitized.includes('Paperclip'), 'deve remover Paperclip');
  assert.ok(!sanitized.includes('Claude'), 'deve remover Claude');
  assert.ok(!sanitized.includes('Generated with Claude Code'), 'deve remover rodapé');
  assert.ok(sanitized.includes('Co-authored-by: ApenasGabs <ApenasGabs@users.noreply.github.com>'), 'deve manter coautoria humana');
});
