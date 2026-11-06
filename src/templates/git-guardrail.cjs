#!/usr/bin/env node

/**
 * Kraken Git Guardrail - Interceptor PreToolUse
 * 
 * Intercepta chamadas de ferramentas de execução de comandos (run_command, Bash)
 * e bloqueia deterministicamente tentativas de 'git push' ou 'git reset --hard'
 * direto nas branches principais ('main' e 'master').
 * 
 * Exibe mensagem didática orientando o agente a retornar ao fluxo obrigatório:
 * Issue -> Branch -> PR -> Code Review -> Aprovação Manual.
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const process = require('node:process');

const BANNER_MESSAGE = (reason, command) => `
🚨 [KRAKEN GIT GUARDRAIL BLOQUEOU ESTA AÇÃO] 🚨
--------------------------------------------------------------------------------
Motivo: ${reason}
Comando Interceptado: "${command}"

Por diretriz de engenharia e governança de agentes, NENHUM agente autônomo
tem permissão para comitar, resetar ou empurrar código diretamente para a
branch principal (main/master) sem revisão e aprovação humana.

O fluxo OBRIGATÓRIO que você DEVE seguir:
  1. Crie uma branch de trabalho:
     git checkout -b feat/#<id>-<slug>  (ou fix/#<id>-<slug>)
  2. Implemente suas alterações e teste na branch
  3. Publique a branch:
     git push -u origin feat/#<id>-<slug>
  4. Abra o Pull Request / Merge Request:
     gh pr create --assignee @me --title "..." --body "..."
  5. Aguarde a aprovação manual do usuário no chat antes de qualquer merge.
--------------------------------------------------------------------------------
`;

const inspectCommand = (command, cwd) => {
  if (!command || typeof command !== 'string') return { blocked: false };

  // Detectar comandos git na linha de comando
  const gitRegex = /(?:^|[;&|]\s*|\$\(|\`)\s*git\s+([^\n;&|`]+)/g;
  let match;

  while ((match = gitRegex.exec(command)) !== null) {
    const gitArgs = match[1].trim();

    // 1. Interceptar git push
    if (/^push\b/.test(gitArgs)) {
      // 1.1 Tentativa explícita mencionando main ou master
      if (
        /\b(?:origin\s+)?(?:main|master)\b/.test(gitArgs) ||
        /:main\b/.test(gitArgs) ||
        /:master\b/.test(gitArgs)
      ) {
        return {
          blocked: true,
          reason: 'Tentativa explícita de push direto na branch protegida (main/master).',
          command: match[0].trim(),
        };
      }

      // 1.2 Push implícito (ex: 'git push', 'git push origin', 'git push -u origin') sem branch explícita
      const hasExplicitFeatureBranch =
        /\b(?:feat|fix|docs|chore|refactor|test|bugfix|hotfix|feature)\/[^\s]+/i.test(gitArgs) ||
        /\bHEAD:[^\s]+/.test(gitArgs);

      if (!hasExplicitFeatureBranch) {
        try {
          const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: cwd || process.cwd(),
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
          }).trim();

          if (currentBranch === 'main' || currentBranch === 'master') {
            return {
              blocked: true,
              reason: `Tentativa de push enquanto a branch ativa é protegida ("${currentBranch}").`,
              command: match[0].trim(),
            };
          }
        } catch {
          // Não está em repositório git ou erro ignorável
        }
      }
    }

    // 2. Interceptar git reset --hard direto na main/master
    if (/^reset\s+--hard\b/.test(gitArgs)) {
      try {
        const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: cwd || process.cwd(),
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();

        if (currentBranch === 'main' || currentBranch === 'master') {
          return {
            blocked: true,
            reason: `Tentativa de reset destrutivo (--hard) na branch protegida ("${currentBranch}").`,
            command: match[0].trim(),
          };
        }
      } catch {}
    }
  }

  return { blocked: false };
};

// Leitura do payload JSON de stdin enviado pelo PreToolUse
let rawInput = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  rawInput += chunk;
});

process.stdin.on('end', () => {
  let commandToInspect = '';
  let cwd = process.cwd();

  if (rawInput.trim()) {
    try {
      const payload = JSON.parse(rawInput);
      const toolInput = payload.tool_input || payload.input || payload;

      commandToInspect =
        toolInput.CommandLine ||
        toolInput.command ||
        toolInput.cmd ||
        (typeof toolInput === 'string' ? toolInput : '');

      if (toolInput.cwd || toolInput.workingDir) {
        cwd = toolInput.cwd || toolInput.workingDir;
      }
    } catch {
      // Se não for JSON, trata o texto puro como o comando
      commandToInspect = rawInput.trim();
    }
  } else {
    // Se nenhum input via stdin, verifica argumentos de linha de comando
    commandToInspect = process.argv.slice(2).join(' ');
  }

  const result = inspectCommand(commandToInspect, cwd);

  if (result.blocked) {
    console.error(BANNER_MESSAGE(result.reason, result.command));
    process.exit(2);
  }

  process.exit(0);
});
