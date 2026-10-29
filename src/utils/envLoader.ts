import fs from 'fs';
import path from 'path';

/**
 * Faz o parse seguro de arquivos .env (suporta CRLF, export KEY=VAL, aspas simples/duplas e comentários).
 */
export function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!content) return result;

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const cleanLine = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const eqIdx = cleanLine.indexOf('=');
    if (eqIdx <= 0) continue;

    const key = cleanLine.slice(0, eqIdx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = cleanLine.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    } else {
      // Remove comentário inline não-escapado precedido por espaço
      const hashIdx = value.indexOf(' #');
      if (hashIdx >= 0) {
        value = value.slice(0, hashIdx).trim();
      }
    }

    if (value) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Carrega variáveis de arquivos .env locais (ex: /app/.env no Gabisa e /workspace/.env)
 * preenchendo apenas chaves ausentes ou vazias em process.env.
 */
export function loadDotEnvFiles(customPaths?: string[]): Record<string, string> {
  const workspaceDir = process.env.WORKSPACE_DIR || '/workspace';
  const candidatePaths = customPaths ?? [
    path.resolve('.env'),
    path.join(workspaceDir, '.env')
  ];

  const loaded: Record<string, string> = {};
  for (const filePath of candidatePaths) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = parseDotEnv(content);
      for (const [key, val] of Object.entries(parsed)) {
        if (!process.env[key] || !process.env[key]!.trim()) {
          process.env[key] = val;
          loaded[key] = val;
        }
      }
    } catch {
      // Ignora arquivo inacessível
    }
  }
  return loaded;
}
