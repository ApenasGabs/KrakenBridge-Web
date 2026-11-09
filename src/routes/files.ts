import express, { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { 
  getAllowedDirectories, 
  isPathAllowed,
  cleanRawPath,
  resolveCandidatePaths,
  extractMemoryPagePath,
  findMemoryPageInWiki,
  findContentInConversationHistory
} from '../services/filesService.js';
import { aiMemoryService } from '../services/aiMemoryService.js';

export const filesRouter = Router();
export { getAllowedDirectories, isPathAllowed };

filesRouter.get('/raw', async (req: Request, res: Response) => {
  const rawPath = String(req.query.path || '').trim();
  const subproject = typeof req.query.subproject === 'string' ? req.query.subproject.trim() : undefined;
  const conversationId = typeof req.query.conversationId === 'string' ? req.query.conversationId.trim() : undefined;

  if (!rawPath) {
    return res.status(400).json({ error: 'Parâmetro path é obrigatório.' });
  }

  const cleanPath = cleanRawPath(rawPath);

  // 1. Estratégia Principal: Busca determinística nos caminhos candidatos no disco físico
  const candidates = resolveCandidatePaths(cleanPath, subproject);
  let checkedCandidate = cleanPath;

  for (const candidate of candidates) {
    if (!isPathAllowed(candidate)) continue;
    checkedCandidate = candidate;

    try {
      if (fsSync.existsSync(candidate)) {
        const stat = await fs.stat(candidate);
        if (stat.isDirectory()) {
          return res.status(400).json({ error: 'O caminho solicitado é um diretório, não um arquivo.', path: candidate });
        }

        // Limite de segurança de 10MB para visualização in-app
        if (stat.size > 10 * 1024 * 1024) {
          return res.status(413).json({ error: 'Arquivo muito grande para visualização in-app (> 10MB).', path: candidate });
        }

        const content = await fs.readFile(candidate, 'utf8');
        const filename = path.basename(candidate);
        const extension = path.extname(candidate).replace('.', '').toLowerCase();
        const isMarkdown = ['md', 'markdown', 'mdown', 'mkdn'].includes(extension);

        return res.json({
          path: candidate,
          filename,
          extension,
          size: stat.size,
          isMarkdown,
          content,
          source: 'disk'
        });
      }
    } catch {
      // Ignora e tenta o próximo candidato
    }
  }

  // 2. Estratégia Secundária: Fallback para páginas do AI Memory (MCP + wiki em disco)
  const memoryPagePath = extractMemoryPagePath(rawPath) || (cleanPath.endsWith('.md') && !cleanPath.includes('/') ? cleanPath : null);
  if (memoryPagePath) {
    // 2.1 Tentar via serviço oficial do AI Memory (MCP Tool memory_read_page)
    try {
      const memoryPage = await aiMemoryService.readPage(memoryPagePath);
      if (memoryPage && memoryPage.content) {
        return res.json({
          path: `ai-memory:${memoryPage.path}`,
          filename: path.basename(memoryPage.path),
          extension: 'md',
          size: Buffer.byteLength(memoryPage.content, 'utf8'),
          isMarkdown: true,
          content: memoryPage.content,
          source: 'ai-memory'
        });
      }
    } catch {
      // Falha do MCP tratada silenciosamente para acionar a busca direta na wiki
    }

    // 2.2 Tentar busca direta no diretório wiki do AI Memory em disco
    try {
      const wikiResult = await findMemoryPageInWiki(memoryPagePath);
      if (wikiResult) {
        return res.json({
          path: `ai-memory:${wikiResult.path}`,
          filename: path.basename(wikiResult.path),
          extension: 'md',
          size: Buffer.byteLength(wikiResult.content, 'utf8'),
          isMarkdown: true,
          content: wikiResult.content,
          source: 'ai-memory'
        });
      }
    } catch {
      // Ignora e avança para a recuperação por histórico
    }
  }

  // 3. Estratégia Terciária: Recuperação resiliente no Histórico da Sessão Ativa
  if (conversationId) {
    try {
      const historyResult = await findContentInConversationHistory(conversationId, cleanPath, memoryPagePath);
      if (historyResult) {
        const extension = path.extname(historyResult.filename).replace('.', '').toLowerCase() || 'md';
        const isMarkdown = ['md', 'markdown', 'mdown', 'mkdn'].includes(extension);
        return res.json({
          path: historyResult.path || cleanPath,
          filename: historyResult.filename,
          extension,
          size: Buffer.byteLength(historyResult.content, 'utf8'),
          isMarkdown,
          content: historyResult.content,
          source: historyResult.source
        });
      }
    } catch {
      // Se a leitura do histórico falhar, prossegue para o 404 descritivo
    }
  }

  return res.status(404).json({
    error: 'Arquivo não encontrado nos diretórios autorizados, AI Memory ou histórico da conversa.',
    path: checkedCandidate || cleanPath
  });
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
