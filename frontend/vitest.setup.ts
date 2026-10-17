import "@testing-library/jest-dom";

// Polyfill e Mock completo do localStorage para estabilidade nos testes jsdom
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    }
  };
};

const storageMock = createLocalStorageMock();
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: storageMock, writable: true });
}
Object.defineProperty(globalThis, 'localStorage', { value: storageMock, writable: true });
