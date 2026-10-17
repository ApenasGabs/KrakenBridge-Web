import path from 'path';
import os from 'os';

export function getAllowedDirectories(): string[] {
  const isTest = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
  const dirs = [
    process.env.WORKSPACE_DIR || '/workspace',
    process.env.DATA_DIR || '/DATA',
    '/root/.gemini',
    ...(isTest ? [] : ['/app']),
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
    // Bloquear caminhos absolutos do Windows em sistemas POSIX (ex: C:\Windows)
    if (process.platform !== 'win32' && /^[a-zA-Z]:[/\\]/.test(targetPath)) {
      return false;
    }
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
