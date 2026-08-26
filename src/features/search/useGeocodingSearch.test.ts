import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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
    vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([{ id: '1', placeName: 'São Paulo' }]);

    const { result } = renderHook(() => useGeocodingSearch('São Paulo'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.suggestions).toHaveLength(1);
  });

  it('repassa a localização atual para searchPlaces como viés de proximidade', async () => {
    const spy = vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([]);

    renderHook(() => useGeocodingSearch('São Paulo', { lat: -23.5505, lng: -46.6333 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(spy).toHaveBeenCalledWith(
      'São Paulo',
      expect.any(String),
      { lat: -23.5505, lng: -46.6333 },
    );
  });

  it('rebusca quando a proximidade muda, mesmo com a mesma query', async () => {
    const spy = vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([]);

    const { rerender } = renderHook(
      ({ proximity }) => useGeocodingSearch('São Paulo', proximity),
      { initialProps: { proximity: null as { lat: number; lng: number } | null } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(spy).toHaveBeenCalledTimes(1);

    rerender({ proximity: { lat: -23.5505, lng: -46.6333 } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(
      'São Paulo',
      expect.any(String),
      { lat: -23.5505, lng: -46.6333 },
    );
  });

  it('resolveSuggestion usa coordenadas já conhecidas (gazetteer local) sem chamar retrievePlace', async () => {
    vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([]);
    const retrieveSpy = vi.spyOn(mapboxClient, 'retrievePlace');

    const { result } = renderHook(() => useGeocodingSearch('Plano Piloto'));

    const resolved = await result.current.resolveSuggestion({
      id: 'local-region:plano-piloto',
      placeName: 'Plano Piloto, Brasília - DF',
      coordinates: { lat: -15.7939, lng: -47.8828 },
    });

    expect(resolved).toEqual({
      id: 'local-region:plano-piloto',
      placeName: 'Plano Piloto, Brasília - DF',
      coordinates: { lat: -15.7939, lng: -47.8828 },
    });
    expect(retrieveSpy).not.toHaveBeenCalled();
  });

  it('resolveSuggestion busca as coordenadas via retrievePlace e troca o token de sessão', async () => {
    vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([{ id: '1', placeName: 'São Paulo' }]);
    const retrieveSpy = vi
      .spyOn(mapboxClient, 'retrievePlace')
      .mockResolvedValue({ lat: -23.5505, lng: -46.6333 });

    const { result } = renderHook(() => useGeocodingSearch('São Paulo'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const resolved = await result.current.resolveSuggestion({ id: '1', placeName: 'São Paulo' });

    expect(resolved).toEqual({
      id: '1',
      placeName: 'São Paulo',
      coordinates: { lat: -23.5505, lng: -46.6333 },
    });
    expect(retrieveSpy).toHaveBeenCalledWith('1', expect.any(String));
  });
});
