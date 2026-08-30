import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRouteRecalcOnDeviation } from './useRouteRecalcOnDeviation';
import type { Coordinates, TravelProfile } from '../../types';

const origin: Coordinates = { lat: -23.55, lng: -46.63 };
const destination: Coordinates = { lat: -23.56, lng: -46.65 };

interface Props {
  deviated: boolean;
  navigating: boolean;
  origin: Coordinates | null;
  destination: Coordinates | null;
  profile: TravelProfile;
  recalculate: (o: Coordinates, d: Coordinates, p: TravelProfile) => Promise<boolean>;
}

function baseProps(overrides: Partial<Props> = {}): Props {
  return {
    deviated: true,
    navigating: true,
    origin,
    destination,
    profile: 'driving',
    recalculate: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// Avança o relógio falso e deixa as promises pendentes resolverem.
async function tick(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useRouteRecalcOnDeviation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('dispara um recálculo imediato ao entrar em desvio', async () => {
    const recalculate = vi.fn().mockResolvedValue(false);
    renderHook((props: Props) => useRouteRecalcOnDeviation(props), {
      initialProps: baseProps({ recalculate }),
    });

    await tick(0);

    expect(recalculate).toHaveBeenCalledTimes(1);
    expect(recalculate).toHaveBeenLastCalledWith(origin, destination, 'driving');
  });

  it('repete o recálculo em intervalo enquanto continua desviado', async () => {
    const recalculate = vi.fn().mockResolvedValue(false);
    renderHook((props: Props) => useRouteRecalcOnDeviation(props), {
      initialProps: baseProps({ recalculate }),
    });

    await tick(0);
    expect(recalculate).toHaveBeenCalledTimes(1);

    // Após a 1ª falha o próximo intervalo é 5s; depois cresce (10s, 15s, ...).
    await tick(5000);
    expect(recalculate).toHaveBeenCalledTimes(2);

    await tick(10000);
    expect(recalculate).toHaveBeenCalledTimes(3);

    await tick(15000);
    expect(recalculate).toHaveBeenCalledTimes(4);
  });

  it('para de tentar quando um recálculo tem sucesso', async () => {
    const recalculate = vi.fn().mockResolvedValue(true);
    renderHook((props: Props) => useRouteRecalcOnDeviation(props), {
      initialProps: baseProps({ recalculate }),
    });

    await tick(0);
    expect(recalculate).toHaveBeenCalledTimes(1);

    await tick(60000);
    expect(recalculate).toHaveBeenCalledTimes(1);
  });

  it('para de tentar quando deixa de estar desviado', async () => {
    const recalculate = vi.fn().mockResolvedValue(false);
    const { rerender } = renderHook((props: Props) => useRouteRecalcOnDeviation(props), {
      initialProps: baseProps({ recalculate }),
    });

    await tick(0);
    expect(recalculate).toHaveBeenCalledTimes(1);

    rerender(baseProps({ recalculate, deviated: false }));
    await tick(60000);

    expect(recalculate).toHaveBeenCalledTimes(1);
  });

  it('sempre recalcula a partir da origem mais recente', async () => {
    const recalculate = vi.fn().mockResolvedValue(false);
    const { rerender } = renderHook((props: Props) => useRouteRecalcOnDeviation(props), {
      initialProps: baseProps({ recalculate }),
    });

    await tick(0);

    const moved: Coordinates = { lat: -23.7, lng: -46.9 };
    rerender(baseProps({ recalculate, origin: moved }));
    await tick(5000);

    expect(recalculate).toHaveBeenLastCalledWith(moved, destination, 'driving');
  });

  it('desiste após 6 falhas seguidas e expõe hasGivenUp', async () => {
    const recalculate = vi.fn().mockResolvedValue(false);
    const { result } = renderHook((props: Props) => useRouteRecalcOnDeviation(props), {
      initialProps: baseProps({ recalculate }),
    });

    // 1 imediata + 5 agendadas = 6 tentativas; depois disso, desiste.
    await tick(0);
    for (let i = 0; i < 8; i++) {
      await tick(30000);
    }

    expect(recalculate).toHaveBeenCalledTimes(6);
    expect(result.current.hasGivenUp).toBe(true);
    expect(result.current.isRecalculating).toBe(false);
  });

  it('retry() zera o contador e volta a tentar após desistir', async () => {
    const recalculate = vi.fn().mockResolvedValue(false);
    const { result } = renderHook((props: Props) => useRouteRecalcOnDeviation(props), {
      initialProps: baseProps({ recalculate }),
    });

    await tick(0);
    for (let i = 0; i < 8; i++) {
      await tick(30000);
    }
    expect(recalculate).toHaveBeenCalledTimes(6);
    expect(result.current.hasGivenUp).toBe(true);

    act(() => {
      result.current.retry();
    });
    await tick(0);

    expect(result.current.hasGivenUp).toBe(false);
    expect(recalculate).toHaveBeenCalledTimes(7);
  });

  it('volta a tentar quando a aba fica visível de novo após desistir', async () => {
    const recalculate = vi.fn().mockResolvedValue(false);
    const { result } = renderHook((props: Props) => useRouteRecalcOnDeviation(props), {
      initialProps: baseProps({ recalculate }),
    });

    await tick(0);
    for (let i = 0; i < 8; i++) {
      await tick(30000);
    }
    expect(result.current.hasGivenUp).toBe(true);

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await tick(0);

    expect(result.current.hasGivenUp).toBe(false);
    expect(recalculate).toHaveBeenCalledTimes(7);
  });

  it('reseta hasGivenUp ao sair da navegação', async () => {
    const recalculate = vi.fn().mockResolvedValue(false);
    const { result, rerender } = renderHook((props: Props) => useRouteRecalcOnDeviation(props), {
      initialProps: baseProps({ recalculate }),
    });

    await tick(0);
    for (let i = 0; i < 8; i++) {
      await tick(30000);
    }
    expect(result.current.hasGivenUp).toBe(true);

    rerender(baseProps({ recalculate, navigating: false, deviated: false }));

    expect(result.current.hasGivenUp).toBe(false);
  });

  it('não dispara nada quando não está navegando', async () => {
    const recalculate = vi.fn().mockResolvedValue(false);
    renderHook((props: Props) => useRouteRecalcOnDeviation(props), {
      initialProps: baseProps({ recalculate, navigating: false }),
    });

    await tick(60000);

    expect(recalculate).not.toHaveBeenCalled();
  });
});
