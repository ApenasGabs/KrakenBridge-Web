import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';

/**
 * Injeta ou substitui a tag <base href="..."> no <head> do HTML.
 * Suporta tags abertas (<base href="...">), auto-fechadas (<base href="..." />)
 * com aspas simples ou duplas e espaços opcionais.
 */
export function injectBaseHref(html: string, baseHref: string): string {
  const baseRegex = /<base\s+href=["'][^"']*["']\s*\/?>/i;
  if (!baseRegex.test(html)) {
    return html.replace('<head>', `<head>\n    <base href="${baseHref}">`);
  }
  return html.replace(baseRegex, `<base href="${baseHref}">`);
}

/**
 * Determina a URL base canônica para a requisição atual (/ ou /chat/).
 */
export function getBaseHrefForRequest(req: {
  originalUrl?: string;
  baseUrl?: string;
  path?: string;
  headers?: Record<string, string | string[] | undefined>;
}): string {
  const url = req.originalUrl || req.path || '';
  const forwardedPrefix = req.headers?.['x-forwarded-prefix'];
  const forwardedUri = req.headers?.['x-forwarded-uri'];
  const referer = req.headers?.['referer'];
  const prefixStr = typeof forwardedPrefix === 'string' ? forwardedPrefix : '';
  const uriStr = typeof forwardedUri === 'string' ? forwardedUri : '';
  const refererStr = typeof referer === 'string' ? referer : '';

  // Se houver x-forwarded-prefix explícito do reverse proxy, utiliza-o dinamicamente
  if (prefixStr && prefixStr !== '/') {
    const clean = prefixStr.endsWith('/') ? prefixStr : `${prefixStr}/`;
    return clean.startsWith('/') ? clean : `/${clean}`;
  }

  // Se houver baseUrl do Express
  if (req.baseUrl && req.baseUrl !== '/') {
    return req.baseUrl.endsWith('/') ? req.baseUrl : `${req.baseUrl}/`;
  }

  const isSubpath =
    url.startsWith('/chat') ||
    uriStr.startsWith('/chat') ||
    refererStr.includes('/chat');
  return isSubpath ? '/chat/' : '/';
}

/**
 * Adapta os campos do Web App Manifest (id, start_url, scope e shortcuts)
 * dinamicamente para qualquer baseHref (/chat/, subcaminhos ou raiz /).
 */
export function adaptManifestForBaseHref(
  rawManifest: Record<string, any>,
  baseHref: string
): Record<string, any> {
  const normalizedBase = baseHref.endsWith('/') ? baseHref : `${baseHref}/`;
  const prefix = normalizedBase.startsWith('/') ? normalizedBase : `/${normalizedBase}`;
  const isRoot = prefix === '/';

  const scope = prefix;
  const startUrl = `${prefix}?source=pwa`;
  const id = `${prefix}?source=pwa`;

  const adaptedShortcuts = Array.isArray(rawManifest.shortcuts)
    ? rawManifest.shortcuts.map((shortcut: any) => {
        let url = shortcut.url || '';
        if (url.startsWith('/')) {
          url = isRoot
            ? url
            : (url.startsWith(prefix) ? url : `${prefix.replace(/\/$/, '')}${url}`);
        } else if (url.startsWith('./')) {
          const suffix = url.slice(2);
          url = `${prefix}${suffix}`;
        }
        return {
          ...shortcut,
          url
        };
      })
    : [];

  return {
    ...rawManifest,
    id,
    start_url: startUrl,
    scope,
    shortcuts: adaptedShortcuts.length > 0 ? adaptedShortcuts : rawManifest.shortcuts
  };
}

/**
 * Aplica cabeçalhos HTTP obrigatórios para artefatos críticos de PWA
 * (Service Worker e Web App Manifest).
 */
export function applyPwaResponseHeaders(
  res: Partial<Pick<Response, 'setHeader'>>,
  filePathOrName: string
): void {
  if (typeof res.setHeader !== 'function') return;

  const baseName = path.basename(filePathOrName);
  if (baseName === 'sw.js' || baseName === 'registerSW.js') {
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
  } else if (baseName === 'manifest.webmanifest') {
    res.setHeader('Content-Type', 'application/manifest+json; charset=UTF-8');
    res.setHeader('Cache-Control', 'no-cache');
  }
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

    // Se for o manifesto PWA, adapta dinamicamente para o subcaminho (/chat/ ou /)
    const baseName = path.basename(req.path);
    if (baseName === 'manifest.webmanifest') {
      const directFile = path.join(distDir, baseName);
      if (fs.existsSync(directFile) && fs.statSync(directFile).isFile()) {
        try {
          const raw = fs.readFileSync(directFile, 'utf8');
          const parsed = JSON.parse(raw);
          const baseHref = getBaseHrefForRequest(req);
          const adapted = adaptManifestForBaseHref(parsed, baseHref);
          applyPwaResponseHeaders(res, baseName);
          return res
            .type('application/manifest+json; charset=UTF-8')
            .send(JSON.stringify(adapted, null, 2));
        } catch {
          applyPwaResponseHeaders(res, baseName);
          return res.sendFile(directFile);
        }
      }
    }

    // Se for um arquivo estático conhecido na raiz de distDir (ex: kraken-icon.svg, icon-*.png, sw.js)
    if (baseName && baseName.includes('.')) {
      const directFile = path.join(distDir, baseName);
      if (fs.existsSync(directFile) && fs.statSync(directFile).isFile()) {
        applyPwaResponseHeaders(res, baseName);
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
      res.setHeader('Cache-Control', 'no-cache');
      res.send(finalHtml);
    });
  };
}
