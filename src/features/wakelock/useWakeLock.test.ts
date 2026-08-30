import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWakeLock } from './useWakeLock';

interface FakeSentinel {
  release: ReturnType<typeof vi.fn>;
}

function installWakeLock(): { request: ReturnType<typeof vi.fn>; sentinels: FakeSentinel[] } {
  const sentinels: FakeSentinel[] = [];
  const request = vi.fn(async () => {
    const sentinel: FakeSentinel = { release: vi.fn().mockResolvedValue(undefined) };
    sentinels.push(sentinel);
    return sentinel;
  });
  Object.defineProperty(globalThis.navigator, 'wakeLock', {
    value: { request },
    configurable: true,
  });
  return { request, sentinels };
}

function removeWakeLock(): void {
  Object.defineProperty(globalThis.navigator, 'wakeLock', {
    value: undefined,
    configurable: true,
  });
}

describe('useWakeLock', () => {
  beforeEach(() => {
    removeWakeLock();
  });

  afterEach(() => {
    removeWakeLock();
  });

  it('solicita a trava de tela quando habilitado', async () => {
    const { request } = installWakeLock();

    renderHook(() => useWakeLock(true));
    await Promise.resolve();

    expect(request).toHaveBeenCalledWith('screen');
  });

  it('não solicita a trava quando desabilitado', async () => {
    const { request } = installWakeLock();

    renderHook(() => useWakeLock(false));
    await Promise.resolve();

    expect(request).not.toHaveBeenCalled();
  });

  it('solta a trava quando passa de habilitado para desabilitado', async () => {
    const { sentinels } = installWakeLock();

    const { rerender } = renderHook(({ on }) => useWakeLock(on), {
      initialProps: { on: true },
    });
    await Promise.resolve();
    rerender({ on: false });
    await Promise.resolve();

    expect(sentinels[0].release).toHaveBeenCalled();
  });

  it('solta a trava ao desmontar', async () => {
    const { sentinels } = installWakeLock();

    const { unmount } = renderHook(() => useWakeLock(true));
    await Promise.resolve();
    unmount();
    await Promise.resolve();

    expect(sentinels[0].release).toHaveBeenCalled();
  });

  it('re-solicita a trava quando a aba volta a ficar visível', async () => {
    const { request } = installWakeLock();

    renderHook(() => useWakeLock(true));
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();

    expect(request).toHaveBeenCalledTimes(2);
  });

  it('não quebra quando o navegador não suporta wakeLock', async () => {
    removeWakeLock();

    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
    await Promise.resolve();
  });
});
