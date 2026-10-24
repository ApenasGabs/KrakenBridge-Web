import express, { Router, Request, Response } from 'express';
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

  // Tratar links no formato file:/// e remover âncoras como #L10-L20
  const pathWithoutAnchor = rawPath.split('#')[0].trim();
  let cleanPath = pathWithoutAnchor.replace(/^file:\/\/\/?/, '');
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

/**
 * Salva (sobrescreve) um arquivo existente editado pelo visualizador in-app (CodeMirror / Monaco).
 * Regras de segurança: protegido pelo PIN global, somente diretórios autorizados,
 * somente arquivos já existentes (não cria arquivos novos), limite de 10MB e escrita atômica.
 */
filesRouter.put('/raw', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
  const rawPath = String(req.body?.path || '').trim();
  const content = req.body?.content;
  if (!rawPath || typeof content !== 'string') {
    return res.status(400).json({ error: 'Campos path (string) e content (string) são obrigatórios.' });
  }

  let cleanPath = rawPath.split('#')[0].trim().replace(/^file:\/\/\/?/, '');
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
    if (!fsSync.existsSync(resolved)) {
      return res.status(404).json({ error: 'Arquivo não encontrado (a edição in-app não cria arquivos novos).', path: resolved });
    }
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'O caminho solicitado não é um arquivo regular.', path: resolved });
    }
    if (Buffer.byteLength(content, 'utf8') > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'Conteúdo muito grande para salvar in-app (> 10MB).', path: resolved });
    }

    const tmpPath = `${resolved}.kraken-tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmpPath, content, { encoding: 'utf8', mode: stat.mode });
    await fs.rename(tmpPath, resolved);
    const newStat = await fs.stat(resolved);

    return res.json({ ok: true, path: resolved, size: newStat.size, savedAt: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message, path: resolved });
  }
});
