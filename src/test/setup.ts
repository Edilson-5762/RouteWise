import '@testing-library/jest-dom/vitest';

// jsdom não implementa ResizeObserver. Um stub inerte basta para os
// componentes que só o usam para medir layout (ver `useElementHeight`) —
// testes que precisam controlar as notificações de tamanho instalam seu
// próprio mock local com `vi.stubGlobal('ResizeObserver', ...)`.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
