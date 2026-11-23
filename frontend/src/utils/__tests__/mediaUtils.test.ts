import { describe, it, expect } from 'vitest';
import { isSafeDataImageUrl, isLocalImageSource, resolveImageUrl, formatImageBytes } from '../mediaUtils';

describe('mediaUtils (Issue #210)', () => {
  it('libera apenas data URLs de imagem raster seguras e bloqueia SVG/HTML', () => {
    expect(isSafeDataImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isSafeDataImageUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
    expect(isSafeDataImageUrl('data:image/webp;base64,UklGRg==')).toBe(true);
    expect(isSafeDataImageUrl('data:image/gif;base64,R0lGODlh')).toBe(true);

    expect(isSafeDataImageUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isSafeDataImageUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
  });

  it('identifica caminhos locais de imagem e ignora URLs externas', () => {
    expect(isLocalImageSource('/workspace/app/screenshot.png')).toBe(true);
    expect(isLocalImageSource('file:///root/.gemini/antigravity-cli/brain/abc/img.webp')).toBe(true);
    expect(isLocalImageSource('./assets/logo.png')).toBe(true);
    expect(isLocalImageSource('https://example.com/photo.jpg')).toBe(false);
    expect(isLocalImageSource('/api/files/media?path=%2Fworkspace%2Fa.png')).toBe(false);
  });

  it('reescreve caminhos locais e file:// para /api/files/media preservando subproject e token', () => {
    const resolved = resolveImageUrl('file:///workspace/demo/tela.png', {
      apiBase: '/chat/api',
      subproject: 'demo',
      token: 'abc123'
    });

    expect(resolved).toBe(
      '/chat/api/files/media?path=%2Fworkspace%2Fdemo%2Ftela.png&subproject=demo&token=abc123'
    );
  });

  it('normaliza URLs de mídia já construídas e bloqueia data:image/svg+xml', () => {
    const normalized = resolveImageUrl('/api/files/media?path=%2Ftmp%2Fimg.png', {
      apiBase: '/chat/api',
      token: 'tok'
    });
    expect(normalized).toBe('/chat/api/files/media?path=%2Ftmp%2Fimg.png&token=tok');

    expect(resolveImageUrl('data:image/svg+xml;base64,PHN2Zz4=', { apiBase: '/api', token: null })).toBe('');
  });

  it('formata tamanho de arquivos corretamente', () => {
    expect(formatImageBytes(512)).toBe('512 B');
    expect(formatImageBytes(2048)).toBe('2.0 KB');
    expect(formatImageBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});
