import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGeocodingSearch } from './useGeocodingSearch';
import * as mapboxClient from '../../services/mapboxClient';

describe('useGeocodingSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('não busca para queries com menos de 3 caracteres', () => {
    const spy = vi.spyOn(mapboxClient, 'searchPlaces');
    renderHook(() => useGeocodingSearch('Sp'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('faz debounce e retorna sugestões para uma query válida', async () => {
    vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([
      { id: '1', placeName: 'São Paulo', coordinates: { lat: -23.5505, lng: -46.6333 } },
    ]);

    const { result } = renderHook(() => useGeocodingSearch('São Paulo'));

    await vi.advanceTimersByTimeAsync(300);

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(1);
    });
  });
});
