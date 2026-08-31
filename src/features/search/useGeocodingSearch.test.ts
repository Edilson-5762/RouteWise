import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGeocodingSearch } from './useGeocodingSearch';
import * as geoapifyClient from '../../services/geoapifyClient';
import * as mapboxGeocodingClient from '../../services/mapboxGeocodingClient';

describe('useGeocodingSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Fontes extras desligadas por padrão em cada teste; quem precisa delas
    // sobrescreve o mock localmente.
    vi.spyOn(geoapifyClient, 'searchPlacesFullText').mockResolvedValue([]);
    vi.spyOn(mapboxGeocodingClient, 'searchPlacesMapbox').mockResolvedValue([]);
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

    const { rerender } = renderHook(({ proximity }) => useGeocodingSearch('São Paulo', proximity), {
      initialProps: { proximity: null as { lat: number; lng: number } | null },
    });

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

  it('mescla resultados da Geoapify e do Mapbox, intercalando as fontes e sem duplicar o mesmo lugar', async () => {
    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
      { id: 'geo-1', placeName: 'Rua 4B (Geoapify)', coordinates: { lat: -15.811, lng: -48.018 } },
      { id: 'geo-2', placeName: 'Studio Rea (Geoapify)', coordinates: { lat: -15.8125, lng: -48.02 } },
    ]);
    vi.spyOn(mapboxGeocodingClient, 'searchPlacesMapbox').mockResolvedValue([
      // Mesmo lugar que geo-2 (coordenadas ~iguais) — deve ser deduplicado.
      { id: 'mapbox:a', placeName: 'Studio Rea (Mapbox)', coordinates: { lat: -15.81251, lng: -48.02001 } },
      { id: 'mapbox:b', placeName: 'Chácara 283 (Mapbox)', coordinates: { lat: -15.813, lng: -48.017 } },
    ]);

    const { result } = renderHook(() => useGeocodingSearch('rua 4b vicente pires'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const ids = result.current.suggestions.map((s) => s.id);
    // Intercalado geoapify/mapbox: geo-1, mapbox:a, (geo-2 cai fora — mesmo
    // lugar que mapbox:a, que veio antes), mapbox:b.
    expect(ids).toEqual(['geo-1', 'mapbox:a', 'mapbox:b']);
  });

  it('quando a query bate com uma categoria, busca em paralelo por categoria e por texto', async () => {
    const categorySpy = vi
      .spyOn(geoapifyClient, 'searchPlacesByCategory')
      .mockResolvedValue([
        { id: 'cat-1', placeName: 'Farmácia Genérica', coordinates: { lat: -15.8, lng: -47.9 } },
      ]);
    const textSpy = vi
      .spyOn(geoapifyClient, 'searchPlaces')
      .mockResolvedValue([
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
        // Coordenadas distintas: estabelecimentos diferentes não colapsam na
        // deduplicação por proximidade.
        coordinates: { lat: -15.8 + i * 0.001, lng: -47.9 + i * 0.001 },
      })),
    );
    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
      { id: 'bonanza', placeName: 'Panificadora Bonanza', coordinates: { lat: -15.79, lng: -47.89 } },
    ]);

    const { result } = renderHook(() => useGeocodingSearch('panificadora bonanza'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.suggestions[0].id).toBe('bonanza');
    expect(result.current.suggestions).toHaveLength(9);
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

  it('só reporta erro quando TODAS as fontes de busca falham', async () => {
    vi.spyOn(geoapifyClient, 'searchPlaces').mockRejectedValue(new Error('geoapify fora'));
    vi.spyOn(geoapifyClient, 'searchPlacesFullText').mockRejectedValue(new Error('geoapify fora'));
    vi.spyOn(mapboxGeocodingClient, 'searchPlacesMapbox').mockRejectedValue(new Error('mapbox fora'));

    const { result } = renderHook(() => useGeocodingSearch('qualquer coisa'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.error).toBe('Não foi possível buscar endereços agora. Tente novamente.');
  });

  it('não reporta erro se pelo menos uma fonte responde', async () => {
    vi.spyOn(geoapifyClient, 'searchPlaces').mockRejectedValue(new Error('geoapify fora'));
    vi.spyOn(geoapifyClient, 'searchPlacesFullText').mockRejectedValue(new Error('geoapify fora'));
    vi.spyOn(mapboxGeocodingClient, 'searchPlacesMapbox').mockResolvedValue([
      { id: 'mapbox:x', placeName: 'Só o Mapbox respondeu', coordinates: { lat: -15.8, lng: -47.9 } },
    ]);

    const { result } = renderHook(() => useGeocodingSearch('qualquer coisa'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.suggestions.map((s) => s.id)).toEqual(['mapbox:x']);
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
