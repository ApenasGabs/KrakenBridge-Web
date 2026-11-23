import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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

  it('filtra caminhos fora dos diretórios autorizados em sanitizeChatAttachments', () => {
    const allowedPath = path.join(tempUploadsDir, 'ok.png');
    const result = svc.sanitizeChatAttachments([
      { id: '1', name: 'ok.png', mimeType: 'image/png', size: 120, path: allowedPath, url: '' },
      { id: '2', name: 'secret.png', mimeType: 'image/png', size: 120, path: '/etc/passwd', url: '' }
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
