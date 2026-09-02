import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGeocodingSearch } from './useGeocodingSearch';
import * as geoapifyClient from '../../services/geoapifyClient';
import * as mapboxGeocodingClient from '../../services/mapboxGeocodingClient';
import * as dfHealthUnits from '../../data/dfHealthUnits';
import * as overpassClient from '../../services/overpassClient';
import * as photonClient from '../../services/photonClient';
import type { PlaceSuggestion } from '../../types';

describe('useGeocodingSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Fontes extras desligadas por padrão em cada teste; quem precisa delas
    // sobrescreve o mock localmente.
    vi.spyOn(geoapifyClient, 'searchPlacesFullText').mockResolvedValue([]);
    vi.spyOn(mapboxGeocodingClient, 'searchPlacesMapbox').mockResolvedValue([]);
    vi.spyOn(overpassClient, 'searchDeepOsm').mockResolvedValue([]);
    vi.spyOn(photonClient, 'searchPhoton').mockResolvedValue([]);
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
      {
        id: 'geo-2',
        placeName: 'Studio Rea (Geoapify)',
        coordinates: { lat: -15.8125, lng: -48.02 },
      },
    ]);
    vi.spyOn(mapboxGeocodingClient, 'searchPlacesMapbox').mockResolvedValue([
      // Mesmo lugar que geo-2 (coordenadas ~iguais) — deve ser deduplicado.
      {
        id: 'mapbox:a',
        placeName: 'Studio Rea (Mapbox)',
        coordinates: { lat: -15.81251, lng: -48.02001 },
      },
      {
        id: 'mapbox:b',
        placeName: 'Chácara 283 (Mapbox)',
        coordinates: { lat: -15.813, lng: -48.017 },
      },
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
      {
        id: 'bonanza',
        placeName: 'Panificadora Bonanza',
        coordinates: { lat: -15.79, lng: -47.89 },
      },
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
    vi.spyOn(mapboxGeocodingClient, 'searchPlacesMapbox').mockRejectedValue(
      new Error('mapbox fora'),
    );

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
      {
        id: 'mapbox:x',
        placeName: 'Só o Mapbox respondeu',
        coordinates: { lat: -15.8, lng: -47.9 },
      },
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

  it('põe as unidades de saúde locais no topo, antes dos resultados remotos', async () => {
    vi.spyOn(dfHealthUnits, 'searchDfHealthUnits').mockReturnValue([
      {
        id: 'cnes-2',
        placeName: 'UBS 02 Guará, Brasília - DF',
        coordinates: { lat: -15.833, lng: -47.973 },
      },
    ]);
    // "UBS ..." casa com a categoria Clínica — mock para a task não fazer rede.
    vi.spyOn(geoapifyClient, 'searchPlacesByCategory').mockResolvedValue([]);
    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
      { id: 'geo-x', placeName: 'Guará, DF', coordinates: { lat: -15.82, lng: -47.98 } },
    ]);

    const { result } = renderHook(() => useGeocodingSearch('UBS 2 Guará'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.suggestions.map((s) => s.id)).toEqual(['cnes-2', 'geo-x']);
  });

  it('não duplica uma unidade local que também volta de uma fonte remota (a local vence)', async () => {
    vi.spyOn(dfHealthUnits, 'searchDfHealthUnits').mockReturnValue([
      {
        id: 'cnes-2',
        placeName: 'UBS 02 Guará (local)',
        coordinates: { lat: -15.8327, lng: -47.9732 },
      },
    ]);
    vi.spyOn(geoapifyClient, 'searchPlacesByCategory').mockResolvedValue([]);
    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
      {
        id: 'geo-dup',
        placeName: 'UBS 02 do Guará (Geoapify)',
        coordinates: { lat: -15.83271, lng: -47.97319 },
      },
    ]);

    const { result } = renderHook(() => useGeocodingSearch('UBS 2 Guará'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.suggestions.map((s) => s.id)).toEqual(['cnes-2']);
  });

  it('não reporta erro se as fontes remotas falham mas a busca local achou algo', async () => {
    vi.spyOn(dfHealthUnits, 'searchDfHealthUnits').mockReturnValue([
      {
        id: 'cnes-2',
        placeName: 'UBS 02 Guará',
        coordinates: { lat: -15.833, lng: -47.973 },
      },
    ]);
    vi.spyOn(geoapifyClient, 'searchPlaces').mockRejectedValue(new Error('geoapify fora'));
    vi.spyOn(geoapifyClient, 'searchPlacesFullText').mockRejectedValue(new Error('geoapify fora'));
    vi.spyOn(geoapifyClient, 'searchPlacesByCategory').mockRejectedValue(
      new Error('geoapify fora'),
    );
    vi.spyOn(mapboxGeocodingClient, 'searchPlacesMapbox').mockRejectedValue(
      new Error('mapbox fora'),
    );

    const { result } = renderHook(() => useGeocodingSearch('UBS 2 Guará'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.suggestions.map((s) => s.id)).toEqual(['cnes-2']);
  });

  it('query sem match local mantém o comportamento atual (só fontes remotas)', async () => {
    vi.spyOn(dfHealthUnits, 'searchDfHealthUnits').mockReturnValue([]);
    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
      { id: 'geo-1', placeName: 'São Paulo', coordinates: { lat: -23.55, lng: -46.63 } },
    ]);

    const { result } = renderHook(() => useGeocodingSearch('São Paulo'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.suggestions.map((s) => s.id)).toEqual(['geo-1']);
  });

  describe('segundo passe (busca de reforço)', () => {
    it('dispara Overpass e Photon quando o passe rápido traz menos de 3 e a query tem 4+ caracteres', async () => {
      vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
        { id: 'geo-1', placeName: 'Único rápido', coordinates: { lat: -15.8, lng: -47.9 } },
      ]);
      const osmSpy = vi.spyOn(overpassClient, 'searchDeepOsm').mockResolvedValue([
        { id: 'osm:node:1', placeName: 'Achado profundo', coordinates: { lat: -15.83, lng: -47.97 } },
      ]);
      const photonSpy = vi.spyOn(photonClient, 'searchPhoton').mockResolvedValue([]);

      const { result } = renderHook(() => useGeocodingSearch('condominio jardim'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(osmSpy).toHaveBeenCalled();
      expect(photonSpy).toHaveBeenCalled();
      expect(result.current.suggestions.map((s) => s.id)).toEqual(['geo-1', 'osm:node:1']);
      expect(result.current.error).toBeNull();
    });

    it('não dispara o segundo passe quando o passe rápido já traz 3 ou mais', async () => {
      vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
        { id: 'a', placeName: 'A', coordinates: { lat: -15.81, lng: -47.91 } },
        { id: 'b', placeName: 'B', coordinates: { lat: -15.82, lng: -47.92 } },
        { id: 'c', placeName: 'C', coordinates: { lat: -15.83, lng: -47.93 } },
      ]);
      const osmSpy = vi.spyOn(overpassClient, 'searchDeepOsm');
      const photonSpy = vi.spyOn(photonClient, 'searchPhoton');

      renderHook(() => useGeocodingSearch('alguma avenida'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(osmSpy).not.toHaveBeenCalled();
      expect(photonSpy).not.toHaveBeenCalled();
    });

    it('não dispara o segundo passe para query com menos de 4 caracteres', async () => {
      vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([]);
      const osmSpy = vi.spyOn(overpassClient, 'searchDeepOsm');

      renderHook(() => useGeocodingSearch('rua'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(osmSpy).not.toHaveBeenCalled();
    });

    it('não duplica no reforço um lugar que o passe rápido já trouxe (o rápido vence)', async () => {
      vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
        { id: 'geo-1', placeName: 'Condomínio Jardim (Geoapify)', coordinates: { lat: -15.9, lng: -48.0 } },
      ]);
      vi.spyOn(overpassClient, 'searchDeepOsm').mockResolvedValue([
        { id: 'osm:node:9', placeName: 'Condomínio Jardim (OSM)', coordinates: { lat: -15.9, lng: -48.0 } },
      ]);

      const { result } = renderHook(() => useGeocodingSearch('condominio jardim'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].id).toBe('geo-1');
    });

    it('mantém error nulo e a lista do passe rápido quando o segundo passe falha inteiro', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
        { id: 'geo-1', placeName: 'Um resultado', coordinates: { lat: -15.8, lng: -47.9 } },
      ]);
      vi.spyOn(overpassClient, 'searchDeepOsm').mockRejectedValue(new Error('overpass fora'));
      vi.spyOn(photonClient, 'searchPhoton').mockRejectedValue(new Error('photon fora'));

      const { result } = renderHook(() => useGeocodingSearch('lugar improvavel'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(result.current.error).toBeNull();
      expect(result.current.suggestions.map((s) => s.id)).toEqual(['geo-1']);
      // Silêncio na tela, mas rastro no console para diagnóstico em produção.
      expect(warnSpy).toHaveBeenCalled();
    });

    it('respeita o descanso de 3 s entre dois segundos passes', async () => {
      vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([]);
      const osmSpy = vi.spyOn(overpassClient, 'searchDeepOsm').mockResolvedValue([]);

      const { rerender } = renderHook(({ q }) => useGeocodingSearch(q), {
        initialProps: { q: 'lugar um' },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(osmSpy).toHaveBeenCalledTimes(1);

      rerender({ q: 'lugar dois' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      // Menos de 3 s depois: o 2º passe fica só ADIADO até o descanso expirar
      // (não é mais pulado de vez) — ver o teste seguinte.
      expect(osmSpy).toHaveBeenCalledTimes(1);
    });

    it('depois que o descanso de 3 s expira, a nova query recebe o segundo passe', async () => {
      vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([]);
      const osmSpy = vi.spyOn(overpassClient, 'searchDeepOsm').mockResolvedValue([]);

      const { rerender } = renderHook(({ q }) => useGeocodingSearch(q), {
        initialProps: { q: 'lugar um' },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(osmSpy).toHaveBeenCalledTimes(1);

      rerender({ q: 'lugar dois' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(osmSpy).toHaveBeenCalledTimes(1); // ainda no descanso → adiado

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(osmSpy).toHaveBeenCalledTimes(2); // descanso expirou → disparou
    });

    it('repassa a proximidade (e um AbortSignal) para o segundo passe', async () => {
      vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([]);
      const osmSpy = vi.spyOn(overpassClient, 'searchDeepOsm').mockResolvedValue([]);
      const photonSpy = vi.spyOn(photonClient, 'searchPhoton').mockResolvedValue([]);

      renderHook(() => useGeocodingSearch('lugar distante', { lat: -15.9, lng: -48.0 }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(osmSpy).toHaveBeenCalledWith(
        'lugar distante',
        { lat: -15.9, lng: -48.0 },
        expect.any(AbortSignal),
      );
      expect(photonSpy).toHaveBeenCalledWith(
        'lugar distante',
        { lat: -15.9, lng: -48.0 },
        expect.any(AbortSignal),
      );
    });

    it('aborta o segundo passe em andamento quando a query muda e ignora o resultado tardio', async () => {
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
      vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([]);
      let resolveDeep: ((v: PlaceSuggestion[]) => void) | null = null;
      vi.spyOn(overpassClient, 'searchDeepOsm').mockImplementation(
        () =>
          new Promise<PlaceSuggestion[]>((resolve) => {
            resolveDeep = resolve;
          }),
      );
      vi.spyOn(photonClient, 'searchPhoton').mockResolvedValue([]);

      const { result, rerender } = renderHook(({ q }) => useGeocodingSearch(q), {
        initialProps: { q: 'lugar antigo' },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(overpassClient.searchDeepOsm).toHaveBeenCalledTimes(1);
      // A atribuição a `resolveDeep` mora dentro do executor da Promise, então o
      // controle de fluxo do TS ainda o vê como `null` aqui; a asserção só
      // reafirma o tipo já declarado para poder chamar o resolvedor tardio.
      const staleResolve = resolveDeep as ((v: PlaceSuggestion[]) => void) | null;

      // Query abaixo do mínimo → o efeito anterior é limpo (abort) e nenhuma
      // busca nova começa.
      rerender({ q: 'ab' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(abortSpy).toHaveBeenCalled();

      await act(async () => {
        staleResolve?.([
          { id: 'osm:node:tarde', placeName: 'Tarde demais', coordinates: { lat: -15.8, lng: -47.9 } },
        ]);
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(result.current.suggestions.some((s) => s.id === 'osm:node:tarde')).toBe(false);
    });
  });
});
