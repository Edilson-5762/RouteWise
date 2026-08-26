import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoute } from './useRoute';
import * as mapboxClient from '../../services/mapboxClient';
import type { Route } from '../../types';

describe('useRoute', () => {
  it('despacha ROUTE_PLANNED quando a requisição de rota tem sucesso', async () => {
    const fakeRoute: Route = {
      geometry: [{ lat: 0, lng: 0 }],
      steps: [],
      distanceMeters: 1000,
      durationSeconds: 60,
    };
    vi.spyOn(mapboxClient, 'getDirections').mockResolvedValue(fakeRoute);
    const dispatch = vi.fn();

    const { result } = renderHook(() => useRoute(dispatch));

    await act(async () => {
      await result.current.planRoute({ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, 'driving');
    });

    expect(dispatch).toHaveBeenCalledWith({ type: 'ROUTE_PLANNED', route: fakeRoute });
    expect(result.current.error).toBeNull();
  });

  it('define uma mensagem de erro quando a requisição de rota falha', async () => {
    vi.spyOn(mapboxClient, 'getDirections').mockRejectedValue(new Error('Nenhuma rota encontrada'));
    const dispatch = vi.fn();

    const { result } = renderHook(() => useRoute(dispatch));

    await act(async () => {
      await result.current.planRoute({ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, 'driving');
    });

    expect(result.current.error).toBe('Nenhuma rota encontrada');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('recalculateRoute despacha ROUTE_RECALCULATED em vez de ROUTE_PLANNED', async () => {
    const fakeRoute: Route = {
      geometry: [{ lat: 0, lng: 0 }],
      steps: [],
      distanceMeters: 100,
      durationSeconds: 10,
    };
    vi.spyOn(mapboxClient, 'getDirections').mockResolvedValue(fakeRoute);
    const dispatch = vi.fn();

    const { result } = renderHook(() => useRoute(dispatch));

    await act(async () => {
      await result.current.recalculateRoute({ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, 'driving');
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ROUTE_RECALCULATED' }),
    );
  });
});
