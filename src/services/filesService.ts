import path from 'path';
import os from 'os';

export function getAllowedDirectories(): string[] {
  const dirs = [
    process.env.WORKSPACE_DIR || '/workspace',
    process.env.DATA_DIR || '/DATA',
    '/root/.gemini',
    '/app',
    os.tmpdir(),
    '/tmp'
  ];

  const home = os.homedir();
  if (home) {
    dirs.push(path.join(home, '.gemini'));
    dirs.push(path.join(home, '.gemini', 'antigravity'));
  }

  if (process.env.CUSTOM_ALLOWED_FILE_DIR) {
    dirs.push(process.env.CUSTOM_ALLOWED_FILE_DIR);
  }

  // Permite o diretório atual de execução para dev/testes
  dirs.push(process.cwd());

  return dirs.map(d => path.resolve(d).toLowerCase());
}

export function isPathAllowed(targetPath: string): boolean {
  if (!targetPath || typeof targetPath !== 'string') return false;
  try {
    const resolved = path.resolve(targetPath).toLowerCase();
    const allowed = getAllowedDirectories();
    return allowed.some(base => {
      const normalizedBase = path.resolve(base).toLowerCase();
      return (
        resolved === normalizedBase ||
        resolved.startsWith(normalizedBase + path.sep) ||
        resolved.startsWith(normalizedBase + '/') ||
        resolved.startsWith(normalizedBase + '\\')
      );
    });
  } catch {
    return false;
  }
}
