import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGeocodingSearch } from './useGeocodingSearch';
import * as geoapifyClient from '../../services/geoapifyClient';

describe('useGeocodingSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('não busca para queries com menos de 3 caracteres', () => {
    const spy = vi.spyOn(geoapifyClient, 'searchPlaces');
    renderHook(() => useGeocodingSearch('Sp'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('faz debounce e retorna sugestões para uma query que não bate com nenhuma categoria', async () => {
    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
      { id: '1', placeName: 'São Paulo', coordinates: { lat: -23.5505, lng: -46.6333 } },
    ]);

    const { result } = renderHook(() => useGeocodingSearch('São Paulo'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.suggestions).toHaveLength(1);
  });

  it('repassa a localização atual para searchPlaces como viés de proximidade', async () => {
    const spy = vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([]);

    renderHook(() => useGeocodingSearch('São Paulo', { lat: -23.5505, lng: -46.6333 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(spy).toHaveBeenCalledWith('São Paulo', { lat: -23.5505, lng: -46.6333 });
  });

  it('rebusca quando a proximidade muda, mesmo com a mesma query', async () => {
    const spy = vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([]);

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
    expect(spy).toHaveBeenLastCalledWith('São Paulo', { lat: -23.5505, lng: -46.6333 });
  });

  it('quando a query bate com uma categoria, busca em paralelo por categoria e por texto', async () => {
    const categorySpy = vi.spyOn(geoapifyClient, 'searchPlacesByCategory').mockResolvedValue([
      { id: 'cat-1', placeName: 'Farmácia Genérica', coordinates: { lat: -15.8, lng: -47.9 } },
    ]);
    const textSpy = vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
      { id: 'text-1', placeName: 'Farmácia Popular', coordinates: { lat: -15.81, lng: -47.91 } },
    ]);

    const { result } = renderHook(() => useGeocodingSearch('farmácia', { lat: -15.8, lng: -47.9 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(categorySpy).toHaveBeenCalledWith(
      expect.objectContaining({ categoryLabel: 'Farmácia' }),
      { lat: -15.8, lng: -47.9 },
    );
    expect(textSpy).toHaveBeenCalledWith('farmácia', { lat: -15.8, lng: -47.9 });
    expect(result.current.suggestions).toEqual([
      { id: 'text-1', placeName: 'Farmácia Popular', coordinates: { lat: -15.81, lng: -47.91 } },
      { id: 'cat-1', placeName: 'Farmácia Genérica', coordinates: { lat: -15.8, lng: -47.9 } },
    ]);
  });

  it('não duplica um resultado que aparece tanto na busca por categoria quanto na busca por texto', async () => {
    vi.spyOn(geoapifyClient, 'searchPlacesByCategory').mockResolvedValue([
      { id: 'compartilhado', placeName: 'Farmácia X', coordinates: { lat: -15.8, lng: -47.9 } },
    ]);
    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
      { id: 'compartilhado', placeName: 'Farmácia X', coordinates: { lat: -15.8, lng: -47.9 } },
      { id: 'text-2', placeName: 'Farmácia Y', coordinates: { lat: -15.82, lng: -47.92 } },
    ]);

    const { result } = renderHook(() => useGeocodingSearch('farmácia'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.suggestions.map((s) => s.id)).toEqual(['compartilhado', 'text-2']);
  });

  it('prioriza o resultado de texto específico, deixando a categoria só completar o restante das vagas', async () => {
    vi.spyOn(geoapifyClient, 'searchPlacesByCategory').mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({
        id: `cat-${i}`,
        placeName: `Padaria genérica ${i}`,
        coordinates: { lat: -15.8, lng: -47.9 },
      })),
    );
    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
      { id: 'bonanza', placeName: 'Panificadora Bonanza', coordinates: { lat: -15.8, lng: -47.9 } },
    ]);

    const { result } = renderHook(() => useGeocodingSearch('panificadora bonanza'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.suggestions[0].id).toBe('bonanza');
    expect(result.current.suggestions).toHaveLength(8);
  });

  it('busca só por texto (não por categoria) quando a query não corresponde a nenhuma categoria conhecida', async () => {
    const categorySpy = vi.spyOn(geoapifyClient, 'searchPlacesByCategory');
    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([]);

    renderHook(() => useGeocodingSearch('Avenida Paulista'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(categorySpy).not.toHaveBeenCalled();
  });

  it('resolveSuggestion repassa as coordenadas já presentes na sugestão, sem nova chamada de rede', async () => {
    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([]);

    const { result } = renderHook(() => useGeocodingSearch('São Paulo'));

    const resolved = await result.current.resolveSuggestion({
      id: '1',
      placeName: 'São Paulo',
      coordinates: { lat: -23.5505, lng: -46.6333 },
    });

    expect(resolved).toEqual({
      id: '1',
      placeName: 'São Paulo',
      coordinates: { lat: -23.5505, lng: -46.6333 },
    });
  });
});
