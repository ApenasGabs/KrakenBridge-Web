// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  injectBaseHref,
  getBaseHrefForRequest,
  createSpaAssetMiddleware,
  createIndexHtmlSender
} from '../../../../src/utils/spaRoutingHelper';

describe('SPA Routing Resilience & Asset Interception (Issue #93)', () => {
  let tempDir: string;
  let distDir: string;
  let assetsDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `kraken-spa-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    distDir = path.join(tempDir, 'dist');
    assetsDir = path.join(distDir, 'assets');

    fs.mkdirSync(assetsDir, { recursive: true });

    // Mock index.html com tag auto-fechada como em produção (Issue #114)
    const sampleHtml = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <base href="/" />
    <link rel="icon" type="image/svg+xml" href="./kraken-icon.svg" />
    <link rel="manifest" href="./manifest.webmanifest" />
    <title>Kraken</title>
    <script type="module" src="./assets/index-test.js"></script>
    <link rel="stylesheet" href="./assets/index-test.css" />
  </head>
  <body><div id="root"></div></body>
</html>`;
    fs.writeFileSync(path.join(distDir, 'index.html'), sampleHtml, 'utf8');

    // Mock static assets
    fs.writeFileSync(path.join(assetsDir, 'index-test.js'), 'console.log("kraken js")', 'utf8');
    fs.writeFileSync(path.join(assetsDir, 'index-test.css'), 'body { background: #000; }', 'utf8');
    fs.writeFileSync(path.join(distDir, 'kraken-icon.svg'), '<svg></svg>', 'utf8');
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe('injectBaseHref', () => {
    it('deve injetar a tag <base href="/"> no <head> quando não existir', () => {
      const html = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';
      const result = injectBaseHref(html, '/');
      expect(result).toContain('<base href="/">');
      expect(result).toMatch(/<head>\s*<base href="\/">/);
    });

    it('deve injetar a tag <base href="/chat/"> para roteamento de subcaminho', () => {
      const html = '<!doctype html><html><head><title>Test</title></head><body></body></html>';
      const result = injectBaseHref(html, '/chat/');
      expect(result).toContain('<base href="/chat/">');
    });

    it('deve substituir uma tag <base href> existente dinamicamente', () => {
      const html = '<!doctype html><html><head><base href="/"><title>Test</title></head></html>';
      const result = injectBaseHref(html, '/chat/');
      expect(result).toContain('<base href="/chat/">');
      expect(result).not.toContain('<base href="/">');
    });

    it('deve substituir uma tag auto-fechada <base href="/" /> por <base href="/chat/"> (Issue #114)', () => {
      const html = '<!doctype html><html><head><base href="/" /><title>Test</title></head></html>';
      const result = injectBaseHref(html, '/chat/');
      expect(result).toContain('<base href="/chat/">');
      expect(result).not.toContain('<base href="/" />');
      expect(result).not.toContain('/>');
    });

    it('deve suportar variações com múltiplos espaços e maiúsculas (ex: <BASE   HREF="/"   />)', () => {
      const html = '<!doctype html><html><head><BASE   HREF="/"   /><title>Test</title></head></html>';
      const result = injectBaseHref(html, '/chat/');
      expect(result).toContain('<base href="/chat/">');
      expect(result).not.toContain('<BASE');
      expect(result).not.toContain('/>');
    });

    it('deve manter caminhos relativos de ícones e manifest intactos na presença de <base href="/chat/">', () => {
      const html = `<!doctype html><html><head>
        <base href="/" />
        <link rel="icon" type="image/svg+xml" href="./kraken-icon.svg" />
        <link rel="manifest" href="./manifest.webmanifest" />
      </head></html>`;
      const result = injectBaseHref(html, '/chat/');
      expect(result).toContain('<base href="/chat/">');
      expect(result).toContain('href="./kraken-icon.svg"');
      expect(result).toContain('href="./manifest.webmanifest"');
    });
  });

  describe('getBaseHrefForRequest', () => {
    it('deve retornar "/" para rotas na raiz (/ ou /c/:id ou /status)', () => {
      expect(getBaseHrefForRequest({ originalUrl: '/' })).toBe('/');
      expect(getBaseHrefForRequest({ originalUrl: '/c/9a2bffae-ea21-47c6-855e-4bdb9c2b3adf' })).toBe('/');
      expect(getBaseHrefForRequest({ originalUrl: '/status' })).toBe('/');
      expect(getBaseHrefForRequest({ path: '/ide' })).toBe('/');
    });

    it('deve retornar "/chat/" para rotas sob o subcaminho (/chat ou /chat/c/:id)', () => {
      expect(getBaseHrefForRequest({ originalUrl: '/chat' })).toBe('/chat/');
      expect(getBaseHrefForRequest({ originalUrl: '/chat/c/9a2bffae-ea21-47c6-855e-4bdb9c2b3adf' })).toBe('/chat/');
      expect(getBaseHrefForRequest({ baseUrl: '/chat' })).toBe('/chat/');
      expect(getBaseHrefForRequest({ path: '/chat/whatsnext' })).toBe('/chat/');
    });
  });

  describe('createSpaAssetMiddleware', () => {
    it('deve interceptar e servir arquivos de assets requisitados com prefixo de sub-rota /c/assets/*', () => {
      const middleware = createSpaAssetMiddleware(distDir);
      const req = { path: '/c/assets/index-test.js' } as any;
      const res = {
        sendFile: vi.fn()
      } as any;
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.sendFile).toHaveBeenCalledWith(path.join(distDir, 'assets/index-test.js'));
      expect(next).not.toHaveBeenCalled();
    });

    it('deve interceptar e servir arquivos de assets requisitados com prefixo /chat/c/assets/*', () => {
      const middleware = createSpaAssetMiddleware(distDir);
      const req = { path: '/chat/c/assets/index-test.css' } as any;
      const res = {
        sendFile: vi.fn()
      } as any;
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.sendFile).toHaveBeenCalledWith(path.join(distDir, 'assets/index-test.css'));
      expect(next).not.toHaveBeenCalled();
    });

    it('deve servir arquivos estáticos da raiz como kraken-icon.svg quando requisitados em sub-rota /c/*', () => {
      const middleware = createSpaAssetMiddleware(distDir);
      const req = { path: '/c/kraken-icon.svg' } as any;
      const res = {
        sendFile: vi.fn()
      } as any;
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.sendFile).toHaveBeenCalledWith(path.join(distDir, 'kraken-icon.svg'));
      expect(next).not.toHaveBeenCalled();
    });

    it('deve ignorar e passar adiante rotas SPA não estáticas como /c/9a2bffae', () => {
      const middleware = createSpaAssetMiddleware(distDir);
      const req = { path: '/c/9a2bffae-ea21-47c6-855e-4bdb9c2b3adf' } as any;
      const res = { sendFile: vi.fn() } as any;
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.sendFile).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('deve ignorar chamadas de API como /api/conversations ou /chat/api/chat', () => {
      const middleware = createSpaAssetMiddleware(distDir);
      const req = { path: '/api/conversations' } as any;
      const res = { sendFile: vi.fn() } as any;
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.sendFile).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('createIndexHtmlSender', () => {
    it('deve entregar o index.html com <base href="/"> quando acessado em rota raiz /c/:id', async () => {
      const sender = createIndexHtmlSender(distDir);
      const req = { originalUrl: '/c/9a2bffae-ea21-47c6-855e-4bdb9c2b3adf' } as any;

      let sentBody = '';
      const res = {
        setHeader: vi.fn(),
        send: vi.fn((body: string) => { sentBody = body; })
      } as any;

      await new Promise<void>((resolve) => {
        res.send = vi.fn((body: string) => {
          sentBody = body;
          resolve();
        });
        sender(req, res);
      });

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=UTF-8');
      expect(sentBody).toContain('<base href="/">');
      expect(sentBody).toContain('<div id="root"></div>');
    });

    it('deve entregar o index.html com <base href="/chat/"> quando acessado em rota /chat/c/:id', async () => {
      const sender = createIndexHtmlSender(distDir);
      const req = { originalUrl: '/chat/c/9a2bffae-ea21-47c6-855e-4bdb9c2b3adf' } as any;

      let sentBody = '';
      const res = {
        setHeader: vi.fn(),
        send: vi.fn((body: string) => { sentBody = body; })
      } as any;

      await new Promise<void>((resolve) => {
        res.send = vi.fn((body: string) => {
          sentBody = body;
          resolve();
        });
        sender(req, res);
      });

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=UTF-8');
      expect(sentBody).toContain('<base href="/chat/">');
      expect(sentBody).not.toContain('<base href="/" />');
      expect(sentBody).toContain('href="./kraken-icon.svg"');
      expect(sentBody).toContain('href="./manifest.webmanifest"');
    });
  });
});
