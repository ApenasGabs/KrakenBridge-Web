import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

// 1x1 PNG transparente válido
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
// Cabeçalho JPEG mínimo válido
const TINY_JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString('base64');
// Cabeçalho GIF89a mínimo válido
const TINY_GIF_BASE64 = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'binary').toString('base64');
// Cabeçalho WebP mínimo válido
const TINY_WEBP_BASE64 = Buffer.from('RIFF\x12\x00\x00\x00WEBP\x56\x50\x38\x20', 'binary').toString('base64');

describe('imageMediaService (Issue #210)', () => {
  let tempUploadsDir = '';
  let svc;

  before(async () => {
    tempUploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kraken-uploads-test-'));
    process.env.KRAKEN_UPLOADS_DIR = tempUploadsDir;
    svc = await import('../dist-server/services/imageMediaService.js');
  });

  after(async () => {
    delete process.env.KRAKEN_UPLOADS_DIR;
    if (tempUploadsDir) {
      await fs.rm(tempUploadsDir, { recursive: true, force: true });
    }
  });

  it('detecta magic bytes de PNG, JPEG, GIF e WebP e rejeita texto arbitrário', () => {
    assert.equal(svc.detectImageMimeFromMagicBytes(Buffer.from(TINY_PNG_BASE64, 'base64')), 'image/png');
    assert.equal(svc.detectImageMimeFromMagicBytes(Buffer.from(TINY_JPEG_BASE64, 'base64')), 'image/jpeg');
    assert.equal(svc.detectImageMimeFromMagicBytes(Buffer.from(TINY_GIF_BASE64, 'base64')), 'image/gif');
    assert.equal(svc.detectImageMimeFromMagicBytes(Buffer.from(TINY_WEBP_BASE64, 'base64')), 'image/webp');
    assert.equal(svc.detectImageMimeFromMagicBytes(Buffer.from('<script>alert(1)</script>')), null);
  });

  it('salva imagem PNG válida em disco e retorna metadados de anexo seguros', async () => {
    const attachment = await svc.saveUploadedImage({
      filename: 'screenshot tela.png',
      mimeType: 'image/png',
      dataBase64: `data:image/png;base64,${TINY_PNG_BASE64}`,
      conversationId: 'conv-123'
    });

    assert.equal(attachment.mimeType, 'image/png');
    assert.equal(attachment.name, 'screenshot tela.png');
    assert.ok(attachment.size > 0);
    assert.ok(attachment.path.startsWith(tempUploadsDir));
    assert.ok(attachment.url.startsWith('/api/files/media?path='));

    const saved = await fs.readFile(attachment.path);
    assert.equal(saved.toString('base64'), TINY_PNG_BASE64);
  });

  it('rejeita spoofing de MIME (arquivo de texto fingindo ser PNG)', async () => {
    await assert.rejects(
      () =>
        svc.saveUploadedImage({
          filename: 'fake.png',
          mimeType: 'image/png',
          dataBase64: Buffer.from('not a real image').toString('base64')
        }),
      (err) => err.name === 'ImageUploadError' && err.statusCode === 400
    );
  });

  it('rejeita MIME não suportado como SVG no upload', async () => {
    await assert.rejects(
      () =>
        svc.saveUploadedImage({
          filename: 'xss.svg',
          mimeType: 'image/svg+xml',
          dataBase64: Buffer.from('<svg></svg>').toString('base64')
        }),
      (err) => err.name === 'ImageUploadError' && err.statusCode === 400
    );
  });

  it('filtra caminhos fora dos diretórios autorizados e extensões não-imagem em sanitizeChatAttachments', () => {
    const allowedPath = path.join(tempUploadsDir, 'ok.png');
    const nonImageTsPath = path.join(tempUploadsDir, 'secret.ts');
    const nonImageEnvPath = path.join(tempUploadsDir, '.env');
    const result = svc.sanitizeChatAttachments([
      { id: '1', name: 'ok.png', mimeType: 'image/png', size: 120, path: allowedPath, url: '' },
      { id: '2', name: 'secret.png', mimeType: 'image/png', size: 120, path: '/etc/passwd', url: '' },
      { id: '3', name: 'secret.ts', mimeType: 'image/png', size: 120, path: nonImageTsPath, url: '' },
      { id: '4', name: '.env', mimeType: 'image/png', size: 120, path: nonImageEnvPath, url: '' }
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0].path, path.resolve(allowedPath));
  });

  it('injeta instruções de leitura de imagens no prompt e cria fallback quando texto é vazio', () => {
    const att = {
      id: 'att-1',
      name: 'erro.png',
      mimeType: 'image/png',
      size: 100,
      path: '/workspace/erro.png',
      url: '/api/files/media?path=%2Fworkspace%2Ferro.png'
    };

    const withText = svc.buildPromptWithAttachments('O que está errado aqui?', [att]);
    assert.ok(withText.includes('O que está errado aqui?'));
    assert.ok(withText.includes('/workspace/erro.png'));
    assert.ok(withText.includes('read_file'));

    const withoutText = svc.buildPromptWithAttachments('   ', [att]);
    assert.ok(withoutText.includes('/workspace/erro.png'));
    assert.ok(withoutText.includes('Analise a(s) imagem(ns)'));
  });
});

describe('Rotas HTTP /api/files/upload-image e /api/files/media (Issue #210)', () => {
  let tempUploadsDir = '';
  let server;
  let baseUrl = '';

  before(async () => {
    tempUploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kraken-files-http-test-'));
    process.env.KRAKEN_UPLOADS_DIR = tempUploadsDir;

    const { filesRouter } = await import('../dist-server/routes/files.js');
    const app = express();
    app.use('/api/files', filesRouter);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    delete process.env.KRAKEN_UPLOADS_DIR;
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (tempUploadsDir) {
      await fs.rm(tempUploadsDir, { recursive: true, force: true });
    }
  });

  it('POST /api/files/upload-image retorna 201 para imagem válida, 400 para MIME spoof/SVG e 413 para > 10MB', async () => {
    // 1. 201 válido
    const validRes = await fetch(`${baseUrl}/api/files/upload-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'evidencia.png',
        mimeType: 'image/png',
        dataBase64: `data:image/png;base64,${TINY_PNG_BASE64}`,
        conversationId: 'http-conv-1'
      })
    });
    assert.equal(validRes.status, 201);
    const validBody = await validRes.json();
    assert.equal(validBody.ok, true);
    assert.equal(validBody.attachment.mimeType, 'image/png');
    assert.ok(validBody.attachment.path.startsWith(tempUploadsDir));

    // 2. 400 MIME spoof
    const spoofRes = await fetch(`${baseUrl}/api/files/upload-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'fake.png',
        mimeType: 'image/png',
        dataBase64: Buffer.from('not-a-png').toString('base64')
      })
    });
    assert.equal(spoofRes.status, 400);

    // 3. 400 SVG não suportado no upload
    const svgRes = await fetch(`${baseUrl}/api/files/upload-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'xss.svg',
        mimeType: 'image/svg+xml',
        dataBase64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64')
      })
    });
    assert.equal(svgRes.status, 400);

    // 4. 413 > 10MB
    const oversizedBuf = Buffer.alloc(10 * 1024 * 1024 + 2048, 0);
    const bigRes = await fetch(`${baseUrl}/api/files/upload-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'grande.png',
        mimeType: 'image/png',
        dataBase64: oversizedBuf.toString('base64')
      })
    });
    assert.equal(bigRes.status, 413);
  });

  it('GET /api/files/media serve imagens com headers seguros, bloqueia /etc/passwd, traversal e symlinks com 403 e rejeita não-imagens com 415', async () => {
    const pngPath = path.join(tempUploadsDir, 'sample.png');
    const svgPath = path.join(tempUploadsDir, 'diagram.svg');
    const txtPath = path.join(tempUploadsDir, 'notes.txt');
    const symlinkPath = path.join(tempUploadsDir, 'leak.png');

    await fs.writeFile(pngPath, Buffer.from(TINY_PNG_BASE64, 'base64'));
    await fs.writeFile(svgPath, '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>', 'utf8');
    await fs.writeFile(txtPath, 'segredo', 'utf8');
    await fs.symlink('/etc/passwd', symlinkPath);

    // 1. 200 PNG + X-Content-Type-Options: nosniff
    const pngRes = await fetch(`${baseUrl}/api/files/media?path=${encodeURIComponent(pngPath)}`);
    assert.equal(pngRes.status, 200);
    assert.equal(pngRes.headers.get('content-type'), 'image/png');
    assert.equal(pngRes.headers.get('x-content-type-options'), 'nosniff');

    // 2. 200 SVG + Content-Security-Policy: sandbox
    const svgRes = await fetch(`${baseUrl}/api/files/media?path=${encodeURIComponent(svgPath)}`);
    assert.equal(svgRes.status, 200);
    assert.equal(svgRes.headers.get('content-type'), 'image/svg+xml');
    assert.equal(svgRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(svgRes.headers.get('content-security-policy'), 'sandbox');

    // 3. 403 para caminho absoluto fora dos diretórios permitidos (/etc/passwd)
    const etcRes = await fetch(`${baseUrl}/api/files/media?path=${encodeURIComponent('/etc/passwd')}`);
    assert.equal(etcRes.status, 403);

    // 4. 403 para path traversal relativo (../../etc/passwd)
    const traversalRes = await fetch(`${baseUrl}/api/files/media?path=${encodeURIComponent('../../etc/passwd')}`);
    assert.equal(traversalRes.status, 403);

    // 5. 403 para symlink apontando para fora dos diretórios permitidos
    const symlinkRes = await fetch(`${baseUrl}/api/files/media?path=${encodeURIComponent(symlinkPath)}`);
    assert.equal(symlinkRes.status, 403);

    // 6. 415 para extensão não-imagem em diretório permitido
    const txtRes = await fetch(`${baseUrl}/api/files/media?path=${encodeURIComponent(txtPath)}`);
    assert.equal(txtRes.status, 415);

    // 7. 404 para imagem inexistente em diretório permitido
    const missingPath = path.join(tempUploadsDir, 'nao-existe.png');
    const missingRes = await fetch(`${baseUrl}/api/files/media?path=${encodeURIComponent(missingPath)}`);
    assert.equal(missingRes.status, 404);
  });
});
