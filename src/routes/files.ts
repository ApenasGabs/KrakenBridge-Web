import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { getAllowedDirectories, isPathAllowed } from '../services/filesService.js';

export const filesRouter = Router();
export { getAllowedDirectories, isPathAllowed };

filesRouter.get('/raw', async (req: Request, res: Response) => {
  const rawPath = String(req.query.path || '').trim();
  if (!rawPath) {
    return res.status(400).json({ error: 'Parâmetro path é obrigatório.' });
  }

  // Tratar links no formato file:///
  let cleanPath = rawPath.replace(/^file:\/\/\/?/, '');
  if (!cleanPath.match(/^[a-zA-Z]:/) && !cleanPath.startsWith('/') && !cleanPath.startsWith('\\')) {
    cleanPath = '/' + cleanPath;
  }

  const resolved = path.resolve(cleanPath);

  if (!isPathAllowed(resolved)) {
    return res.status(403).json({
      error: 'Acesso negado: o caminho solicitado está fora dos diretórios autorizados do Kraken.',
      path: resolved
    });
  }

  try {
    const exists = fsSync.existsSync(resolved);
    if (!exists) {
      return res.status(404).json({ error: 'Arquivo não encontrado.', path: resolved });
    }

    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'O caminho solicitado é um diretório, não um arquivo.', path: resolved });
    }

    // Limite de segurança de 10MB para visualização in-app
    if (stat.size > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'Arquivo muito grande para visualização in-app (> 10MB).', path: resolved });
    }

    const content = await fs.readFile(resolved, 'utf8');
    const filename = path.basename(resolved);
    const extension = path.extname(resolved).replace('.', '').toLowerCase();
    const isMarkdown = ['md', 'markdown', 'mdown', 'mkdn'].includes(extension);

    return res.json({
      path: resolved,
      filename,
      extension,
      size: stat.size,
      isMarkdown,
      content
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message, path: resolved });
  }
});
