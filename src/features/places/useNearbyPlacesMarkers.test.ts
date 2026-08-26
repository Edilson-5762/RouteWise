import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNearbyPlacesMarkers } from './useNearbyPlacesMarkers';
import * as geoapifyClient from '../../services/geoapifyClient';
import type { Coordinates } from '../../types';

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

    renderHook(() => useNearbyPlacesMarkers({ map: map as never, enabled: true, onSelect: vi.fn() }));

    await act(async () => {
      map.__simulateMoveEnd(BASE_CENTER, 15);
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it('busca ao completar um movimento com zoom >= 16, depois do debounce', async () => {
    const spy = vi.spyOn(geoapifyClient, 'searchNearbyPlaces').mockResolvedValue([]);
    const map = createFakeMap(BASE_CENTER, 16);

    renderHook(() => useNearbyPlacesMarkers({ map: map as never, enabled: true, onSelect: vi.fn() }));

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

    renderHook(() => useNearbyPlacesMarkers({ map: map as never, enabled: true, onSelect: vi.fn() }));

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

    renderHook(() => useNearbyPlacesMarkers({ map: map as never, enabled: true, onSelect: vi.fn() }));

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
      { id: 'p1', placeName: "D'Casa Ferramentas, Rua 4", coordinates: { lat: -15.8306, lng: -48.0645 } },
      { id: 'p2', placeName: 'Farmácia Popular, Rua 4', coordinates: { lat: -15.8307, lng: -48.0646 } },
    ]);
    const map = createFakeMap(BASE_CENTER, 16);

    renderHook(() => useNearbyPlacesMarkers({ map: map as never, enabled: true, onSelect: vi.fn() }));

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
      { id: 'p1', placeName: "D'Casa Ferramentas, Rua 4", coordinates: { lat: -15.8306, lng: -48.0645 } },
    ]);
    const map = createFakeMap(BASE_CENTER, 16);

    renderHook(() => useNearbyPlacesMarkers({ map: map as never, enabled: true, onSelect: vi.fn() }));

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
      { id: 'p1', placeName: "D'Casa Ferramentas, Rua 4", coordinates: { lat: -15.8306, lng: -48.0645 } },
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

    renderHook(() => useNearbyPlacesMarkers({ map: map as never, enabled: false, onSelect: vi.fn() }));

    await act(async () => {
      map.__simulateMoveEnd(BASE_CENTER, 16);
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it('remove os marcadores e o listener ao desmontar', async () => {
    vi.spyOn(geoapifyClient, 'searchNearbyPlaces').mockResolvedValueOnce([
      { id: 'p1', placeName: "D'Casa Ferramentas, Rua 4", coordinates: { lat: -15.8306, lng: -48.0645 } },
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
});
