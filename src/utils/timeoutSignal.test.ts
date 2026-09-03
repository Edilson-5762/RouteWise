import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { timeoutSignal } from './timeoutSignal';

describe('timeoutSignal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('aborta sozinho depois do tempo dado', () => {
    const { signal } = timeoutSignal(1000);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(signal.aborted).toBe(true);
  });

  it('aborta quando o signal externo aborta', () => {
    const external = new AbortController();
    const { signal } = timeoutSignal(1000, external.signal);
    external.abort();
    expect(signal.aborted).toBe(true);
  });

  it('já nasce abortado se o signal externo já estava abortado', () => {
    const external = new AbortController();
    external.abort();
    const { signal } = timeoutSignal(1000, external.signal);
    expect(signal.aborted).toBe(true);
  });

  it('cleanup impede o abort tardio por tempo', () => {
    const { signal, cleanup } = timeoutSignal(1000);
    cleanup();
    vi.advanceTimersByTime(5000);
    expect(signal.aborted).toBe(false);
  });
});
