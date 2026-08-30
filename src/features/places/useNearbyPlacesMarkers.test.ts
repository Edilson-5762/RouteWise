import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNearbyPlacesMarkers } from './useNearbyPlacesMarkers';
import * as geoapifyClient from '../../services/geoapifyClient';
import type { Coordinates, GeocodingSuggestion } from '../../types';

const setLngLatMock = vi.fn().mockReturnThis();
const addToMock = vi.fn().mockReturnThis();
const removeMock = vi.fn();
const markerElements: HTMLDivElement[] = [];

vi.mock('mapbox-gl', () => {
  class FakeMarker {
    element: HTMLDivElement;
    constructor(options: { element: HTMLDivElement }) {
      this.element = options.element;
      markerElements.push(options.element);
    }
    setLngLat = setLngLatMock;
    addTo = addToMock;
    remove = removeMock;
  }
  return { default: { Marker: FakeMarker } };
});

function createFakeMap(initialCenter: Coordinates, initialZoom: number) {
  let center = initialCenter;
  let zoom = initialZoom;
  const handlers: Record<string, Array<() => void>> = {};

  return {
    getCenter: () => ({ lat: center.lat, lng: center.lng }),
    getZoom: () => zoom,
    on: vi.fn((event: string, handler: () => void) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(handler);
    }),
    off: vi.fn((event: string, handler: () => void) => {
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== handler);
    }),
    // Test helper (not part of the real mapboxgl.Map API): moves the fake
    // map and fires every registered 'moveend' handler, the same way a real
    // pan/zoom/fitBounds/easeTo completing would.
    __simulateMoveEnd: (newCenter: Coordinates, newZoom: number) => {
      center = newCenter;
      zoom = newZoom;
      for (const handler of handlers['moveend'] ?? []) {
        handler();
      }
    },
  };
}

describe('useNearbyPlacesMarkers', () => {
  const BASE_CENTER: Coordinates = { lat: -15.8267, lng: -48.0654 };
  // ~1.1km ao sul do centro base — cruza o limiar de 400m que exige nova busca.
  const FAR_CENTER: Coordinates = { lat: -15.8367, lng: -48.0654 };
  // ~11m ao sul do centro base — fica dentro do raio que NÃO exige nova busca.
  const NEAR_CENTER: Coordinates = { lat: -15.8268, lng: -48.0654 };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    markerElements.length = 0;
    // mockClear() clears call history but preserves implementation, so we
    // restore the mockReturnThis() behavior each test — it's a no-op on the
    // second+ call, but ensures consistency across the test suite.
    setLngLatMock.mockClear();
    setLngLatMock.mockReturnThis();
    addToMock.mockClear();
    addToMock.mockReturnThis();
    removeMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('não busca quando o zoom está abaixo do mínimo (16)', async () => {
    const spy = vi.spyOn(geoapifyClient, 'searchNearbyPlaces').mockResolvedValue([]);
    const map = createFakeMap(BASE_CENTER, 15);

    renderHook(() =>
      useNearbyPlacesMarkers({ map: map as never, enabled: true, onSelect: vi.fn() }),
    );

    await act(async () => {
      map.__simulateMoveEnd(BASE_CENTER, 15);
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it('busca ao completar um movimento com zoom >= 16, depois do debounce', async () => {
    const spy = vi.spyOn(geoapifyClient, 'searchNearbyPlaces').mockResolvedValue([]);
    const map = createFakeMap(BASE_CENTER, 16);

    renderHook(() =>
      useNearbyPlacesMarkers({ map: map as never, enabled: true, onSelect: vi.fn() }),
    );

    await act(async () => {
      map.__simulateMoveEnd(BASE_CENTER, 16);
      await vi.advanceTimersByTimeAsync(399);
    });
    expect(spy).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(spy).toHaveBeenCalledWith(BASE_CENTER, 900);
  });

  it('não rebusca se o centro não se moveu pelo menos 400m desde a última busca', async () => {
    const spy = vi.spyOn(geoapifyClient, 'searchNearbyPlaces').mockResolvedValue([]);
    const map = createFakeMap(BASE_CENTER, 16);

    renderHook(() =>
      useNearbyPlacesMarkers({ map: map as never, enabled: true, onSelect: vi.fn() }),
    );

    await act(async () => {
      map.__simulateMoveEnd(BASE_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(spy).toHaveBeenCalledTimes(1);

    await act(async () => {
      map.__simulateMoveEnd(NEAR_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('rebusca quando o centro se move 400m ou mais desde a última busca', async () => {
    const spy = vi.spyOn(geoapifyClient, 'searchNearbyPlaces').mockResolvedValue([]);
    const map = createFakeMap(BASE_CENTER, 16);

    renderHook(() =>
      useNearbyPlacesMarkers({ map: map as never, enabled: true, onSelect: vi.fn() }),
    );

    await act(async () => {
      map.__simulateMoveEnd(BASE_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(spy).toHaveBeenCalledTimes(1);

    await act(async () => {
      map.__simulateMoveEnd(FAR_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(FAR_CENTER, 900);
  });

  it('cria um marcador por resultado, e remove todos ao receber uma nova lista', async () => {
    vi.spyOn(geoapifyClient, 'searchNearbyPlaces').mockResolvedValueOnce([
      {
        id: 'p1',
        placeName: "D'Casa Ferramentas, Rua 4",
        coordinates: { lat: -15.8306, lng: -48.0645 },
      },
      {
        id: 'p2',
        placeName: 'Farmácia Popular, Rua 4',
        coordinates: { lat: -15.8307, lng: -48.0646 },
      },
    ]);
    const map = createFakeMap(BASE_CENTER, 16);

    renderHook(() =>
      useNearbyPlacesMarkers({ map: map as never, enabled: true, onSelect: vi.fn() }),
    );

    await act(async () => {
      map.__simulateMoveEnd(BASE_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(addToMock).toHaveBeenCalledTimes(2);
    expect(markerElements).toHaveLength(2);
    expect(markerElements[0].textContent).toContain("D'Casa Ferramentas");
    expect(markerElements[1].textContent).toContain('Farmácia Popular');

    vi.spyOn(geoapifyClient, 'searchNearbyPlaces').mockResolvedValueOnce([]);

    await act(async () => {
      map.__simulateMoveEnd(FAR_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(removeMock).toHaveBeenCalledTimes(2);
  });

  it('remove os marcadores quando o zoom cai abaixo do mínimo', async () => {
    vi.spyOn(geoapifyClient, 'searchNearbyPlaces').mockResolvedValueOnce([
      {
        id: 'p1',
        placeName: "D'Casa Ferramentas, Rua 4",
        coordinates: { lat: -15.8306, lng: -48.0645 },
      },
    ]);
    const map = createFakeMap(BASE_CENTER, 16);

    renderHook(() =>
      useNearbyPlacesMarkers({ map: map as never, enabled: true, onSelect: vi.fn() }),
    );

    await act(async () => {
      map.__simulateMoveEnd(BASE_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(addToMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      map.__simulateMoveEnd(BASE_CENTER, 12);
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it('chama onSelect com a sugestão ao "clicar" no elemento de um marcador', async () => {
    vi.spyOn(geoapifyClient, 'searchNearbyPlaces').mockResolvedValueOnce([
      {
        id: 'p1',
        placeName: "D'Casa Ferramentas, Rua 4",
        coordinates: { lat: -15.8306, lng: -48.0645 },
      },
    ]);
    const map = createFakeMap(BASE_CENTER, 16);
    const onSelect = vi.fn();

    renderHook(() => useNearbyPlacesMarkers({ map: map as never, enabled: true, onSelect }));

    await act(async () => {
      map.__simulateMoveEnd(BASE_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });

    markerElements[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onSelect).toHaveBeenCalledWith({
      id: 'p1',
      placeName: "D'Casa Ferramentas, Rua 4",
      coordinates: { lat: -15.8306, lng: -48.0645 },
    });
  });

  it('não busca nem desenha nada quando enabled é false', async () => {
    const spy = vi.spyOn(geoapifyClient, 'searchNearbyPlaces').mockResolvedValue([]);
    const map = createFakeMap(BASE_CENTER, 16);

    renderHook(() =>
      useNearbyPlacesMarkers({ map: map as never, enabled: false, onSelect: vi.fn() }),
    );

    await act(async () => {
      map.__simulateMoveEnd(BASE_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(spy).not.toHaveBeenCalled();
    expect(addToMock).not.toHaveBeenCalled();
  });

  it('remove os marcadores e o listener ao desmontar', async () => {
    vi.spyOn(geoapifyClient, 'searchNearbyPlaces').mockResolvedValueOnce([
      {
        id: 'p1',
        placeName: "D'Casa Ferramentas, Rua 4",
        coordinates: { lat: -15.8306, lng: -48.0645 },
      },
    ]);
    const map = createFakeMap(BASE_CENTER, 16);

    const { unmount } = renderHook(() =>
      useNearbyPlacesMarkers({ map: map as never, enabled: true, onSelect: vi.fn() }),
    );

    await act(async () => {
      map.__simulateMoveEnd(BASE_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(addToMock).toHaveBeenCalledTimes(1);

    unmount();

    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it('retenta no próximo moveend válido se a busca falhar (distância gate não é envenenada)', async () => {
    // Primeira busca falha (erro de rede, etc.)
    let searchSpy = vi
      .spyOn(geoapifyClient, 'searchNearbyPlaces')
      .mockRejectedValueOnce(new Error('Network error'));
    const map = createFakeMap(BASE_CENTER, 16);

    renderHook(() =>
      useNearbyPlacesMarkers({ map: map as never, enabled: true, onSelect: vi.fn() }),
    );

    // Simula um moveend, a busca falha silenciosamente
    await act(async () => {
      map.__simulateMoveEnd(BASE_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(addToMock).not.toHaveBeenCalled(); // Nenhum marcador foi criado

    // Segunda busca no MESMO centro com sucesso — prova que a falha anterior
    // não foi contada como "busca completada" para fins de gating.
    searchSpy = vi.spyOn(geoapifyClient, 'searchNearbyPlaces').mockResolvedValueOnce([
      {
        id: 'p1',
        placeName: 'Farmácia Popular, Rua 4',
        coordinates: { lat: -15.8267, lng: -48.0654 },
      },
    ]);

    await act(async () => {
      map.__simulateMoveEnd(BASE_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(searchSpy).toHaveBeenCalledTimes(1); // A busca foi disparada novamente
    expect(addToMock).toHaveBeenCalledTimes(1); // Marcador foi criado
  });

  it('para de buscar por 5 minutos depois de um 429, mesmo com o centro se movendo o bastante', async () => {
    const spy = vi
      .spyOn(geoapifyClient, 'searchNearbyPlaces')
      .mockRejectedValueOnce(new geoapifyClient.GeoapifyRequestError('rate limited', 429));
    const map = createFakeMap(BASE_CENTER, 16);

    renderHook(() =>
      useNearbyPlacesMarkers({ map: map as never, enabled: true, onSelect: vi.fn() }),
    );

    await act(async () => {
      map.__simulateMoveEnd(BASE_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockResolvedValueOnce([]);

    await act(async () => {
      map.__simulateMoveEnd(FAR_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(spy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      map.__simulateMoveEnd(BASE_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('reseta o gate de distância ao limpar os marcadores, permitindo rebuscar no mesmo lugar após um ciclo de desabilitar/habilitar', async () => {
    const spy = vi.spyOn(geoapifyClient, 'searchNearbyPlaces').mockResolvedValue([]);
    const map = createFakeMap(BASE_CENTER, 16);

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useNearbyPlacesMarkers({ map: map as never, enabled, onSelect: vi.fn() }),
      { initialProps: { enabled: true } },
    );

    await act(async () => {
      map.__simulateMoveEnd(BASE_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(spy).toHaveBeenCalledTimes(1);

    rerender({ enabled: false });
    rerender({ enabled: true });

    await act(async () => {
      map.__simulateMoveEnd(BASE_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('ignora o resultado de uma busca mais antiga que resolve depois de uma busca mais nova, para não sobrescrever marcadores corretos com dados desatualizados', async () => {
    let resolveFirst!: (value: GeocodingSuggestion[]) => void;
    let resolveSecond!: (value: GeocodingSuggestion[]) => void;
    const firstPromise = new Promise<GeocodingSuggestion[]>((resolve) => {
      resolveFirst = resolve;
    });
    const secondPromise = new Promise<GeocodingSuggestion[]>((resolve) => {
      resolveSecond = resolve;
    });

    vi.spyOn(geoapifyClient, 'searchNearbyPlaces')
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    const map = createFakeMap(BASE_CENTER, 16);
    renderHook(() =>
      useNearbyPlacesMarkers({ map: map as never, enabled: true, onSelect: vi.fn() }),
    );

    await act(async () => {
      map.__simulateMoveEnd(BASE_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });

    await act(async () => {
      map.__simulateMoveEnd(FAR_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });

    // A busca mais nova (FAR_CENTER) resolve primeiro.
    await act(async () => {
      resolveSecond([{ id: 'far', placeName: 'Mercado Far', coordinates: FAR_CENTER }]);
    });
    expect(addToMock).toHaveBeenCalledTimes(1);
    expect(markerElements).toHaveLength(1);
    expect(markerElements[0].textContent).toContain('Mercado Far');

    // Só depois, a busca antiga (BASE_CENTER) resolve.
    await act(async () => {
      resolveFirst([{ id: 'base', placeName: 'Loja Base', coordinates: BASE_CENTER }]);
    });

    // O resultado desatualizado não deve mexer nos marcadores corretos.
    expect(removeMock).not.toHaveBeenCalled();
    expect(addToMock).toHaveBeenCalledTimes(1);
    expect(markerElements[0].textContent).toContain('Mercado Far');
  });
});
