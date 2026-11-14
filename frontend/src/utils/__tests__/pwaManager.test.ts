import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  urlBase64ToUint8Array,
  isPushSupported,
  forcePurgePwaCacheAndReload
} from '../pwaManager';

describe('pwaManager Utility & Cache Purge (Issue #172)', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation
    });
  });

  it('deve converter base64 para Uint8Array corretamente', () => {
    const base64 = 'SGVsbG8gV29ybGQ';
    const arr = urlBase64ToUint8Array(base64);
    expect(arr).toBeInstanceOf(Uint8Array);
    const str = String.fromCharCode(...arr);
    expect(str).toBe('Hello World');
  });

  it('deve verificar suporte a push notifications no ambiente', () => {
    const supported = isPushSupported();
    expect(typeof supported).toBe('boolean');
  });

  it('forcePurgePwaCacheAndReload deve expurgar todos os caches e recarregar a janela', async () => {
    const reloadMock = vi.fn();
    delete (window as any).location;
    window.location = { ...originalLocation, reload: reloadMock } as any;

    const deleteMock = vi.fn().mockResolvedValue(true);
    const keysMock = vi.fn().mockResolvedValue(['kraken-navigation-v1', 'kraken-vite-assets-v1']);

    (window as any).caches = {
      keys: keysMock,
      delete: deleteMock
    };

    const updateMock = vi.fn().mockResolvedValue(undefined);
    (navigator as any).serviceWorker = {
      getRegistrations: vi.fn().mockResolvedValue([{ update: updateMock }])
    };

    await forcePurgePwaCacheAndReload();

    expect(keysMock).toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalledWith('kraken-navigation-v1');
    expect(deleteMock).toHaveBeenCalledWith('kraken-vite-assets-v1');
    expect(updateMock).toHaveBeenCalled();
    expect(reloadMock).toHaveBeenCalled();
  });
});
