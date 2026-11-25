import fs from 'fs';
import path from 'path';

const TOKEN_FILE = 'paperclip_token';
let warned = false;

/** Token lido a cada chamada: permite trocar a credencial sem reiniciar o servidor. */
export const getPaperclipApiToken = (): string => {
  const fromEnv = process.env.PAPERCLIP_API_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    const fromFile = fs.readFileSync(path.join(process.env.DATA_DIR || path.resolve('data'), TOKEN_FILE), 'utf8').trim();
    if (fromFile) {
      warned = false;
      return fromFile;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[Paperclip] Falha ao ler o arquivo de token:', (err as Error).message);
    }
  }
  if (!warned) {
    warned = true;
    console.warn('[Paperclip] Token ausente: defina PAPERCLIP_API_TOKEN ou o arquivo paperclip_token em DATA_DIR.');
  }
  return '';
};
