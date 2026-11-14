import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  urlBase64ToUint8Array,
  isPushSupported,
  forcePurgePwaCacheAndReload
} from '../pwaManager';

// Testes unitários cobrindo o ciclo de vida e a estratégia de cache do PWA (Issue #172)
describe('pwaManager Utility & Cache Purge - Ciclo de vida e estratégia de cache do PWA (Issue #172)', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
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
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: { ...originalLocation, reload: reloadMock }
    });

    const deleteMock = vi.fn().mockResolvedValue(true);
    const keysMock = vi.fn().mockResolvedValue(['kraken-navigation-v1', 'kraken-vite-assets-v1']);

    Object.defineProperty(window, 'caches', {
      writable: true,
      configurable: true,
      value: {
        keys: keysMock,
        delete: deleteMock,
        has: vi.fn(),
        match: vi.fn(),
        open: vi.fn()
      } as unknown as CacheStorage
    });

    const updateMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'serviceWorker', {
      writable: true,
      configurable: true,
      value: {
        getRegistrations: vi.fn().mockResolvedValue([{ update: updateMock }])
      } as unknown as ServiceWorkerContainer
    });

    await forcePurgePwaCacheAndReload();

    expect(keysMock).toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalledWith('kraken-navigation-v1');
    expect(deleteMock).toHaveBeenCalledWith('kraken-vite-assets-v1');
    expect(updateMock).toHaveBeenCalled();
    expect(reloadMock).toHaveBeenCalled();
  });
});
