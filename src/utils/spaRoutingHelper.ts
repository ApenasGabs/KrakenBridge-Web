import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';

/**
 * Injeta ou substitui a tag <base href="..."> no <head> do HTML.
 * Suporta tags auto-fechadas com ou sem espaços (ex: <base href="/" />).
 */
export function injectBaseHref(html: string, baseHref: string): string {
  const baseRegex = /<base\s+href="[^"]*"\s*\/?>/i;
  if (!baseRegex.test(html)) {
    return html.replace('<head>', `<head>\n    <base href="${baseHref}">`);
  }
  return html.replace(baseRegex, `<base href="${baseHref}">`);
}

/**
 * Determina a URL base canônica para a requisição atual (/ ou /chat/).
 */
export function getBaseHrefForRequest(req: { originalUrl?: string; baseUrl?: string; path?: string }): string {
  const url = req.originalUrl || req.path || '';
  const isSubpath = url.startsWith('/chat') || req.baseUrl === '/chat';
  return isSubpath ? '/chat/' : '/';
}

/**
 * Middleware para interceptar requisições de assets (/assets/*, /c/assets/*, etc.)
 * e arquivos estáticos da raiz mesmo quando requisitados com caminhos aninhados.
 */
export function createSpaAssetMiddleware(distDir: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/chat/api')) return next();

    // Se a rota contiver /assets/...
    const assetsMatch = req.path.match(/\/(assets\/[^?#]+)$/);
    if (assetsMatch) {
      const assetPath = path.join(distDir, assetsMatch[1]);
      if (fs.existsSync(assetPath)) {
        return res.sendFile(assetPath);
      }
    }

    // Se for um arquivo estático conhecido na raiz de distDir (ex: kraken-icon.svg, manifest.webmanifest, vite.svg, sw.js)
    const baseName = path.basename(req.path);
    if (baseName && baseName.includes('.')) {
      const directFile = path.join(distDir, baseName);
      if (fs.existsSync(directFile) && fs.statSync(directFile).isFile()) {
        return res.sendFile(directFile);
      }
    }

    next();
  };
}

/**
 * Cria o handler de entrega do index.html com injeção dinâmica de <base href>.
 */
export function createIndexHtmlSender(distDir: string) {
  return (req: Request, res: Response) => {
    const indexPath = path.join(distDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      return res.status(404).send('Frontend não encontrado');
    }

    const baseHref = getBaseHrefForRequest(req);

    fs.readFile(indexPath, 'utf8', (err, html) => {
      if (err) return res.status(500).send('Erro ao carregar frontend');

      const finalHtml = injectBaseHref(html, baseHref);
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.send(finalHtml);
    });
  };
}
