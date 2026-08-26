import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useElementHeight } from './useElementHeight';

type ResizeCallback = (entries: Pick<ResizeObserverEntry, 'contentRect'>[]) => void;

function installControllableResizeObserver() {
  const instances: { node: unknown; callback: ResizeCallback }[] = [];
  class ControllableResizeObserver {
    private callback: ResizeCallback;
    constructor(callback: ResizeCallback) {
      this.callback = callback;
    }
    observe(node: unknown) {
      instances.push({ node, callback: this.callback });
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ControllableResizeObserver);
  return {
    trigger(height: number) {
      instances.forEach(({ callback }) =>
        callback([{ contentRect: { height } as DOMRectReadOnly }]),
      );
    },
  };
}

describe('useElementHeight', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('começa em 0 quando não há elemento', () => {
    const { result } = renderHook(() => useElementHeight(null));
    expect(result.current).toBe(0);
  });

  it('atualiza conforme o ResizeObserver notifica mudanças de altura', () => {
    const ro = installControllableResizeObserver();
    const node = document.createElement('div');

    const { result } = renderHook(() => useElementHeight(node));
    expect(result.current).toBe(0);

    act(() => {
      ro.trigger(120);
    });

    expect(result.current).toBe(120);
  });

  it('volta a 0 quando o elemento some (nó vira null)', () => {
    installControllableResizeObserver();
    const node = document.createElement('div');

    const { result, rerender } = renderHook(({ n }) => useElementHeight(n), {
      initialProps: { n: node as HTMLElement | null },
    });

    rerender({ n: null });

    expect(result.current).toBe(0);
  });
});
