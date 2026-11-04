// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';
import {
  applyPwaResponseHeaders,
  createSpaAssetMiddleware,
  createIndexHtmlSender
} from '../../../../src/utils/spaRoutingHelper';

const PUBLIC_DIR = path.resolve(__dirname, '../../../public');

function readPngDimensions(filePath: string): { width: number; height: number } {
  const buf = fs.readFileSync(filePath);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

describe('PWA Headers, Manifest & Standard Icons (Issue #129)', () => {
  let tempDir: string;
  let distDir: string;

  beforeEach(() => {
    tempDir = path.join('/tmp', `kraken-pwa-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    distDir = path.join(tempDir, 'dist');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, 'sw.js'), 'self.addEventListener("fetch", () => {});', 'utf8');
    fs.writeFileSync(path.join(distDir, 'manifest.webmanifest'), '{"name":"Kraken"}', 'utf8');
    fs.writeFileSync(
      path.join(distDir, 'index.html'),
      '<!doctype html><html><head><base href="/" /></head><body><div id="root"></div></body></html>',
      'utf8'
    );
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors
    }
  });

  describe('applyPwaResponseHeaders', () => {
    it('deve aplicar Service-Worker-Allowed: / e Cache-Control: no-cache, no-store, must-revalidate para sw.js', () => {
      const headers: Record<string, string> = {};
      const res: Partial<Pick<Response, 'setHeader'>> = {
        setHeader: vi.fn((k: string, v: string | number | readonly string[]) => {
          headers[k] = String(v);
          return res as Response;
        })
      };

      applyPwaResponseHeaders(res, '/app/dist/sw.js');

      expect(headers['Service-Worker-Allowed']).toBe('/');
      expect(headers['Cache-Control']).toBe('no-cache, no-store, must-revalidate');
      expect(headers['Content-Type']).toBe('application/javascript; charset=UTF-8');
    });

    it('deve aplicar Content-Type application/manifest+json e Cache-Control: no-cache para manifest.webmanifest', () => {
      const headers: Record<string, string> = {};
      const res: Partial<Pick<Response, 'setHeader'>> = {
        setHeader: vi.fn((k: string, v: string | number | readonly string[]) => {
          headers[k] = String(v);
          return res as Response;
        })
      };

      applyPwaResponseHeaders(res, '/app/dist/manifest.webmanifest');

      expect(headers['Content-Type']).toBe('application/manifest+json; charset=UTF-8');
      expect(headers['Cache-Control']).toBe('no-cache');
    });

    it('deve aplicar cabeçalhos de PWA ao interceptar /sw.js ou /chat/sw.js no createSpaAssetMiddleware', () => {
      const middleware = createSpaAssetMiddleware(distDir);
      const req = { path: '/chat/sw.js' } as unknown as Request;
      const res = {
        setHeader: vi.fn(),
        sendFile: vi.fn()
      } as unknown as Response;
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Service-Worker-Allowed', '/');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-store, must-revalidate');
      expect(res.sendFile).toHaveBeenCalledWith(path.join(distDir, 'sw.js'));
      expect(next).not.toHaveBeenCalled();
    });

    it('deve definir Cache-Control: no-cache ao servir index.html no createIndexHtmlSender', async () => {
      const sender = createIndexHtmlSender(distDir);
      const req = { originalUrl: '/' } as unknown as Request;
      const res = {
        setHeader: vi.fn(),
        send: vi.fn()
      } as unknown as Response;

      await new Promise<void>((resolve) => {
        res.send = vi.fn(() => {
          resolve();
          return res;
        });
        sender(req, res);
      });

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=UTF-8');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    });
  });

  describe('Manifest & PNG Icons Validation', () => {
    it('deve possuir manifest.webmanifest válido sem vite.svg e com id, lang, shortcuts e ícones PNG', () => {
      const manifestPath = path.join(PUBLIC_DIR, 'manifest.webmanifest');
      const raw = fs.readFileSync(manifestPath, 'utf8');
      expect(raw).not.toContain('vite.svg');

      const manifest = JSON.parse(raw);
      expect(manifest.id).toBe('/?source=pwa');
      expect(manifest.lang).toBe('pt-BR');
      expect(manifest.start_url).toBe('/?source=pwa');
      expect(manifest.display).toBe('standalone');

      const iconSrcs = manifest.icons.map((i: { src: string }) => i.src);
      expect(iconSrcs).toContain('./icon-192x192.png');
      expect(iconSrcs).toContain('./icon-512x512.png');
      expect(iconSrcs).toContain('./icon-maskable-192x192.png');
      expect(iconSrcs).toContain('./icon-maskable-512x512.png');
      expect(iconSrcs).not.toContain('/vite.svg');

      expect(Array.isArray(manifest.shortcuts)).toBe(true);
      expect(manifest.shortcuts.length).toBeGreaterThanOrEqual(4);
    });

    it('deve conter todos os ícones PNG padronizados com dimensões exatas em frontend/public', () => {
      expect(readPngDimensions(path.join(PUBLIC_DIR, 'icon-192x192.png'))).toEqual({
        width: 192,
        height: 192
      });
      expect(readPngDimensions(path.join(PUBLIC_DIR, 'icon-512x512.png'))).toEqual({
        width: 512,
        height: 512
      });
      expect(readPngDimensions(path.join(PUBLIC_DIR, 'icon-maskable-192x192.png'))).toEqual({
        width: 192,
        height: 192
      });
      expect(readPngDimensions(path.join(PUBLIC_DIR, 'icon-maskable-512x512.png'))).toEqual({
        width: 512,
        height: 512
      });
      expect(readPngDimensions(path.join(PUBLIC_DIR, 'apple-touch-icon.png'))).toEqual({
        width: 180,
        height: 180
      });
      expect(fs.existsSync(path.join(PUBLIC_DIR, 'vite.svg'))).toBe(false);
    });
  });
});
