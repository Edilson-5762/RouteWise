# Marcadores de Estabelecimentos Próximos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw markers for nearby commercial/service establishments on the map, sourced from Geoapify, that appear automatically when zoomed in close and let the user tap one to set it as their destination.

**Architecture:** A new, self-contained React hook (`useNearbyPlacesMarkers`) owns a `moveend`-driven fetch/render cycle against a Mapbox map instance it's handed — debounced, distance-gated, and zoom-gated to control Geoapify API usage. It's wired into the existing `MapView` alongside (not inside) `useMapboxMap`, and reuses the app's existing destination-selection callback so no reducer changes are needed.

**Tech Stack:** React 18, TypeScript, Mapbox GL JS, Geoapify Places API, Vitest + Testing Library (existing project stack — no new dependencies).

**Spec:** `docs/superpowers/specs/2026-08-26-nearby-places-overlay-design.md`

## Global Constraints

- Zoom gate: markers only fetch/show at map zoom ≥ 16.
- Distance gate: don't refetch unless the map center moved ≥ 400m since the last completed fetch.
- Debounce: wait 400ms of no further `moveend` before fetching.
- Search radius: 900m from the current map center.
- Categories requested: `commercial,service,catering,healthcare` (Geoapify category tree), `limit=100`, `lang=pt`.
- On any fetch failure other than HTTP 429: fail silently, no UI error, retry naturally on the next qualifying `moveend`.
- On HTTP 429: stop fetching for 5 minutes before allowing another attempt.
- Marker style: small colored dot + establishment name label, distinct from the red destination pin and the user puck. No per-category icons (YAGNI, out of scope per spec).
- Tapping a marker calls the same destination-selection path the search bar already uses (`GeocodingSuggestion` shape: `{ id, placeName, coordinates }`) — no `navigationReducer` changes.

---

### Task 1: `searchNearbyPlaces` in geoapifyClient

**Files:**
- Modify: `src/services/geoapifyClient.ts`
- Test: `src/services/geoapifyClient.test.ts`

**Interfaces:**
- Produces: `searchNearbyPlaces(center: Coordinates, radiusMeters: number): Promise<PlaceSuggestion[]>` — later tasks call this from the new hook.
- Produces: `GeoapifyRequestError` now carries a `status: number` property (HTTP status code) — later tasks (Task 3) branch on `error.status === 429`.

- [ ] **Step 1: Write the failing tests**

Add to `src/services/geoapifyClient.test.ts`, after the existing `describe('searchPlaces', ...)` block (before the file's closing, i.e. as a new top-level `describe`):

```ts
describe('searchNearbyPlaces', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converte features da Geoapify em PlaceSuggestion', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              name: "D'Casa Ferramentas",
              formatted: "D'Casa Ferramentas, SHVP - Rua 4, Vicente Pires - DF, Brasil",
              lat: -15.8306,
              lon: -48.0645,
              place_id: 'place-nearby-1',
            },
          },
        ],
      }),
    });

    const results = await searchNearbyPlaces({ lat: -15.8306, lng: -48.0645 }, 900);

    expect(results).toEqual([
      {
        id: 'place-nearby-1',
        placeName: "D'Casa Ferramentas, SHVP - Rua 4, Vicente Pires - DF, Brasil",
        coordinates: { lat: -15.8306, lng: -48.0645 },
      },
    ]);
  });

  it('monta a URL com categorias amplas, raio circular, limite e idioma corretos', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });

    await searchNearbyPlaces({ lat: -15.8306, lng: -48.0645 }, 900);

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('categories=commercial%2Cservice%2Ccatering%2Chealthcare');
    expect(url).toContain('filter=circle%3A-48.0645%2C-15.8306%2C900');
    expect(url).toContain('limit=100');
    expect(url).toContain('lang=pt');
  });

  it('lança GeoapifyRequestError com o status HTTP quando a resposta não é ok', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 429 });

    await expect(searchNearbyPlaces({ lat: -15.8306, lng: -48.0645 }, 900)).rejects.toThrow(
      GeoapifyRequestError,
    );

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 429 });
    try {
      await searchNearbyPlaces({ lat: -15.8306, lng: -48.0645 }, 900);
      throw new Error('deveria ter lançado');
    } catch (error) {
      expect(error).toBeInstanceOf(GeoapifyRequestError);
      expect((error as InstanceType<typeof GeoapifyRequestError>).status).toBe(429);
    }
  });
});
```

Add `searchNearbyPlaces` to the existing import at the top of the test file:

```ts
import {
  searchPlacesByCategory,
  searchPlaces,
  searchNearbyPlaces,
  GeoapifyRequestError,
} from './geoapifyClient';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/geoapifyClient.test.ts`
Expected: FAIL — `searchNearbyPlaces` is not exported yet.

- [ ] **Step 3: Implement `searchNearbyPlaces` and the `status` field on `GeoapifyRequestError`**

In `src/services/geoapifyClient.ts`, replace the `GeoapifyRequestError` class:

```ts
export class GeoapifyRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GeoapifyRequestError';
    this.status = status;
  }
}
```

Update the two existing throw sites to pass the status:

In `searchPlacesByCategory`, replace:
```ts
  if (!response.ok) {
    throw new GeoapifyRequestError(
      `Falha na busca de ${category.categoryLabel.toLowerCase()}: ${response.status}`,
    );
  }
```
with:
```ts
  if (!response.ok) {
    throw new GeoapifyRequestError(
      `Falha na busca de ${category.categoryLabel.toLowerCase()}: ${response.status}`,
      response.status,
    );
  }
```

In `searchPlaces`, replace:
```ts
  if (!response.ok) {
    throw new GeoapifyRequestError(`Falha na busca de endereço: ${response.status}`);
  }
```
with:
```ts
  if (!response.ok) {
    throw new GeoapifyRequestError(`Falha na busca de endereço: ${response.status}`, response.status);
  }
```

Then add the new function at the end of the file:

```ts
const NEARBY_PLACES_CATEGORIES = 'commercial,service,catering,healthcare';
const NEARBY_PLACES_RESULT_LIMIT = 100;

// Busca ampla por proximidade (sem texto/categoria específica) usada pela
// camada de marcadores de estabelecimentos próximos no mapa (ver
// `useNearbyPlacesMarkers`) — preenche a lacuna de cobertura de comércio
// local que os rótulos nativos do estilo do Mapbox não têm nesta região
// (confirmado consultando a Tilequery API do Mapbox diretamente).
export async function searchNearbyPlaces(
  center: Coordinates,
  radiusMeters: number,
): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({
    categories: NEARBY_PLACES_CATEGORIES,
    filter: `circle:${center.lng},${center.lat},${radiusMeters}`,
    limit: String(NEARBY_PLACES_RESULT_LIMIT),
    lang: 'pt',
    apiKey: GEOAPIFY_API_KEY,
  });
  const response = await fetch(`${PLACES_URL}?${params.toString()}`);

  if (!response.ok) {
    throw new GeoapifyRequestError(
      `Falha ao buscar estabelecimentos próximos: ${response.status}`,
      response.status,
    );
  }

  return toSuggestions((await response.json()) as GeoapifyResponse);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/geoapifyClient.test.ts`
Expected: PASS (all tests in the file, including the pre-existing ones — the `GeoapifyRequestError` constructor change must not break them).

- [ ] **Step 5: Commit**

```bash
git add src/services/geoapifyClient.ts src/services/geoapifyClient.test.ts
git commit -m "feat: add searchNearbyPlaces to geoapifyClient for map POI overlay"
```

---

### Task 2: `useNearbyPlacesMarkers` — trigger logic, fetch, and marker rendering

**Files:**
- Create: `src/features/places/useNearbyPlacesMarkers.ts`
- Test: `src/features/places/useNearbyPlacesMarkers.test.ts`

**Interfaces:**
- Consumes: `searchNearbyPlaces(center: Coordinates, radiusMeters: number): Promise<PlaceSuggestion[]>` and `GeoapifyRequestError` from Task 1 (`../../services/geoapifyClient`).
- Consumes: `haversineDistanceMeters(a: Coordinates, b: Coordinates): number` from `../../utils/distance` (already exists, used the same way in `useGeolocation.ts`).
- Produces: `useNearbyPlacesMarkers(options: { map: mapboxgl.Map | null; enabled: boolean; onSelect: (suggestion: GeocodingSuggestion) => void }): void` — Task 4 calls this from `MapView.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/places/useNearbyPlacesMarkers.test.ts`:

```ts
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
    addToMock.mockClear();
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/places/useNearbyPlacesMarkers.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement the hook**

Create `src/features/places/useNearbyPlacesMarkers.ts`:

```ts
import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { searchNearbyPlaces } from '../../services/geoapifyClient';
import { haversineDistanceMeters } from '../../utils/distance';
import type { Coordinates, GeocodingSuggestion } from '../../types';

const MIN_ZOOM = 16;
const MIN_MOVE_METERS = 400;
const SEARCH_RADIUS_METERS = 900;
const DEBOUNCE_MS = 400;

interface UseNearbyPlacesMarkersOptions {
  map: mapboxgl.Map | null;
  enabled: boolean;
  onSelect: (suggestion: GeocodingSuggestion) => void;
}

function createMarkerElement(place: GeocodingSuggestion): HTMLDivElement {
  const element = document.createElement('div');
  element.setAttribute('data-testid', 'nearby-place-marker');
  Object.assign(element.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
  });

  const dot = document.createElement('span');
  Object.assign(dot.style, {
    width: '10px',
    height: '10px',
    borderRadius: '9999px',
    background: '#9333ea',
    boxShadow: '0 0 0 2px rgba(255,255,255,0.9)',
    flexShrink: '0',
    display: 'block',
  });
  element.appendChild(dot);

  const label = document.createElement('span');
  // Só o primeiro trecho do endereço formatado (o nome do lugar) — o
  // restante (rua, bairro, CEP) faria o rótulo competir por espaço com o
  // resto do mapa sem agregar nada que o usuário precise ver de relance.
  label.textContent = place.placeName.split(',')[0];
  Object.assign(label.style, {
    fontSize: '11px',
    fontWeight: '600',
    color: '#1f2937',
    background: 'rgba(255,255,255,0.85)',
    padding: '1px 4px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
  });
  element.appendChild(label);

  return element;
}

// Desenha marcadores de estabelecimentos próximos (farmácia, mercado, loja
// etc.) buscados na Geoapify, preenchendo a lacuna de cobertura de comércio
// local que os rótulos nativos do estilo de navegação do Mapbox têm nesta
// região (confirmado via Tilequery API — ver spec). Hook isolado de
// `useMapboxMap` de propósito: aquele hook já reúne câmera, puck, rota e
// marcador de destino, e não deveria crescer mais.
export function useNearbyPlacesMarkers({ map, enabled, onSelect }: UseNearbyPlacesMarkersOptions): void {
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const lastFetchCenterRef = useRef<Coordinates | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const clearMarkers = () => {
      for (const marker of markersRef.current) {
        marker.remove();
      }
      markersRef.current = [];
    };

    if (!map || !enabled) {
      clearMarkers();
      return;
    }

    const runSearch = async () => {
      const rawCenter = map.getCenter();
      const center: Coordinates = { lat: rawCenter.lat, lng: rawCenter.lng };
      const zoom = map.getZoom();

      if (zoom < MIN_ZOOM) {
        lastFetchCenterRef.current = null;
        clearMarkers();
        return;
      }

      const last = lastFetchCenterRef.current;
      if (last && haversineDistanceMeters(last, center) < MIN_MOVE_METERS) {
        return;
      }

      lastFetchCenterRef.current = center;

      let results: GeocodingSuggestion[];
      try {
        const suggestions = await searchNearbyPlaces(center, SEARCH_RADIUS_METERS);
        results = suggestions.filter(
          (place): place is GeocodingSuggestion => place.coordinates !== undefined,
        );
      } catch {
        // Falha silenciosa de propósito (ver spec): esta é uma camada de
        // enriquecimento visual, não um caminho crítico. A próxima busca
        // válida tenta de novo naturalmente.
        return;
      }

      clearMarkers();
      markersRef.current = results.map((place) => {
        const element = createMarkerElement(place);
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          onSelectRef.current(place);
        });
        return new mapboxgl.Marker({ element })
          .setLngLat([place.coordinates.lng, place.coordinates.lat])
          .addTo(map);
      });
    };

    const handleMoveEnd = () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void runSearch();
      }, DEBOUNCE_MS);
    };

    map.on('moveend', handleMoveEnd);

    return () => {
      map.off('moveend', handleMoveEnd);
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      clearMarkers();
    };
  }, [map, enabled]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/places/useNearbyPlacesMarkers.test.ts`
Expected: PASS (all 9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/places/useNearbyPlacesMarkers.ts src/features/places/useNearbyPlacesMarkers.test.ts
git commit -m "feat: add useNearbyPlacesMarkers hook for map POI overlay"
```

---

### Task 3: 429 backoff

**Files:**
- Modify: `src/features/places/useNearbyPlacesMarkers.ts`
- Test: `src/features/places/useNearbyPlacesMarkers.test.ts`

**Interfaces:**
- Consumes: `GeoapifyRequestError` from `../../services/geoapifyClient` (Task 1), specifically its `status` field.
- No change to the hook's public signature from Task 2.

- [ ] **Step 1: Write the failing test**

Add to `src/features/places/useNearbyPlacesMarkers.test.ts`, inside the existing `describe('useNearbyPlacesMarkers', ...)` block:

```ts
  it('para de buscar por 5 minutos depois de um 429, mesmo com o centro se movendo o bastante', async () => {
    const spy = vi
      .spyOn(geoapifyClient, 'searchNearbyPlaces')
      .mockRejectedValueOnce(new geoapifyClient.GeoapifyRequestError('rate limited', 429));
    const map = createFakeMap(BASE_CENTER, 16);

    renderHook(() => useNearbyPlacesMarkers({ map: map as never, enabled: true, onSelect: vi.fn() }));

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/places/useNearbyPlacesMarkers.test.ts`
Expected: FAIL — the second call inside the 5-minute window currently still happens (no backoff yet), so `spy` is called a 2nd time before the wait, making the middle assertion (`toHaveBeenCalledTimes(1)`) fail.

- [ ] **Step 3: Implement the backoff**

In `src/features/places/useNearbyPlacesMarkers.ts`:

Replace the existing import line:

```ts
import { searchNearbyPlaces } from '../../services/geoapifyClient';
```

with:

```ts
import { searchNearbyPlaces, GeoapifyRequestError } from '../../services/geoapifyClient';
```

Add the backoff constant next to the other constants near the top of the file:

```ts
const RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000;
```

Add a ref alongside the existing refs inside the hook:

```ts
  const rateLimitedUntilRef = useRef(0);
```

In `runSearch`, right after the zoom check and before the distance check, add the backoff guard:

```ts
      if (Date.now() < rateLimitedUntilRef.current) {
        return;
      }
```

Find the existing `catch` block in `runSearch` (it currently has no error binding, since Task 2 didn't need to inspect the error):

```ts
      } catch {
        // Falha silenciosa de propósito (ver spec): esta é uma camada de
        // enriquecimento visual, não um caminho crítico. A próxima busca
        // válida tenta de novo naturalmente.
        return;
      }
```

and replace it with a version that binds the error and detects a 429:

```ts
      } catch (error) {
        if (error instanceof GeoapifyRequestError && error.status === 429) {
          rateLimitedUntilRef.current = Date.now() + RATE_LIMIT_BACKOFF_MS;
        }
        // Falha silenciosa de propósito (ver spec): esta é uma camada de
        // enriquecimento visual, não um caminho crítico. A próxima busca
        // válida tenta de novo naturalmente.
        return;
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/places/useNearbyPlacesMarkers.test.ts`
Expected: PASS (all 10 tests, including the new one).

- [ ] **Step 5: Commit**

```bash
git add src/features/places/useNearbyPlacesMarkers.ts src/features/places/useNearbyPlacesMarkers.test.ts
git commit -m "feat: back off nearby-places fetching for 5min after a 429"
```

---

### Task 4: Wire the hook into MapView and App

**Files:**
- Modify: `src/features/map/useMapboxMap.ts`
- Modify: `src/features/map/useMapboxMap.test.ts`
- Modify: `src/components/MapView.tsx`
- Modify: `src/components/MapView.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useNearbyPlacesMarkers` from Task 2/3 (`../features/places/useNearbyPlacesMarkers`).
- Consumes: `handleDestinationSelected` already defined in `App.tsx` (`(suggestion: GeocodingSuggestion) => void`).
- Produces: `useMapboxMap` now also returns `mapInstance: mapboxgl.Map | null` alongside the existing `mapRef`, `isFollowingUser`, `recenter`.

**Why a new `mapInstance` return value is needed:** `mapRef.current` is a plain ref — mutating it does **not** trigger a React re-render. If `MapView` read `mapRef.current` directly and passed it straight into `useNearbyPlacesMarkers({ map: mapRef.current, ... })`, the very first render would capture `map: null` (the map hasn't been constructed yet — `useMapboxMap`'s map-creation effect only runs *after* that first render commits), and `useNearbyPlacesMarkers`'s effect would run once with `null` and then never re-run, because nothing tells React to re-render `MapView` with the new ref value. Exposing the map instance as real React state (set once, right when the map is constructed) makes `MapView` re-render at exactly the right moment, so `useNearbyPlacesMarkers` receives the real map on the very next render, deterministically — not by relying on GPS-driven re-renders happening to land afterward.

- [ ] **Step 1: Write the failing test for the new return value**

In `src/features/map/useMapboxMap.test.ts`, add this test inside the existing `describe(...)` block (anywhere among the other tests):

```ts
  it('expõe a instância do mapa (mapInstance) depois de criada, para consumidores que precisam de um valor reativo', () => {
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { result } = renderHook(() =>
      useMapboxMap({
        containerRef,
        origin: null,
        destination: null,
        route: null,
        isNavigating: false,
        headingDegrees: null,
        theme: 'light',
        travelProfile: 'driving',
        speedMetersPerSecond: null,
      }),
    );

    expect(result.current.mapInstance).toBe(result.current.mapRef.current);
    expect(result.current.mapInstance).not.toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/map/useMapboxMap.test.ts`
Expected: FAIL — `result.current.mapInstance` is `undefined` (the property doesn't exist yet).

- [ ] **Step 3: Add `mapInstance` state to `useMapboxMap`**

In `src/features/map/useMapboxMap.ts`, find the map-creation effect (it starts with the comment `// Usa a origem e o modo de navegação já conhecidos no primeiro mount`). It already ends with a `skipInitialStyleEffectRef.current = true;` / `styleReadyRef.current = false;` / `mapRef.current.once('style.load', ...)` block (from earlier fixes this session) — add one line after it that publishes the new instance to state. Concretely, find:

```ts
    skipInitialStyleEffectRef.current = true;
    styleReadyRef.current = false;
    mapRef.current.once('style.load', () => {
      styleReadyRef.current = true;
    });

    return () => {
```

and change it to:

```ts
    skipInitialStyleEffectRef.current = true;
    styleReadyRef.current = false;
    mapRef.current.once('style.load', () => {
      styleReadyRef.current = true;
    });
    setMapInstance(mapRef.current);

    return () => {
```

Also update that same effect's cleanup function, a few lines below, from:

```ts
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      originMarkerRef.current = null;
      destinationMarkerRef.current = null;
    };
```

to:

```ts
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      originMarkerRef.current = null;
      destinationMarkerRef.current = null;
      setMapInstance(null);
    };
```

Add the state declaration near the top of the hook, next to `const [isFollowingUser, setIsFollowingUser] = useState(true);`:

```ts
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
```

Finally, update the hook's return statement at the very end of the file, from:

```ts
  return { mapRef, isFollowingUser, recenter };
```

to:

```ts
  return { mapRef, mapInstance, isFollowingUser, recenter };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/map/useMapboxMap.test.ts`
Expected: PASS (all tests in the file, including the new one and every pre-existing one — this is a purely additive change to the return value, nothing existing should break).

- [ ] **Step 5: Commit**

```bash
git add src/features/map/useMapboxMap.ts src/features/map/useMapboxMap.test.ts
git commit -m "feat: expose reactive mapInstance from useMapboxMap"
```

- [ ] **Step 6: Write the failing test for MapView wiring**

Add to `src/components/MapView.test.tsx`, inside the existing `describe('MapView', ...)` block. First, extend the mock at the top of the file to track marker creation the way `useNearbyPlacesMarkers`'s own test does — add this line right after the existing `let movestartHandler` declaration:

```ts
const nearbyMarkerElements: HTMLDivElement[] = [];
```

Then find this in the `vi.mock('mapbox-gl', ...)` factory (the `FakeMarker` class used for the origin/destination markers inside `useMapboxMap`):

```ts
  class FakeMarker {
    setLngLat = vi.fn().mockReturnThis();
    addTo = vi.fn().mockReturnThis();
    setRotation = vi.fn().mockReturnThis();
    remove = vi.fn();
  }
```

and replace it with a version that also tracks the `element` option `useNearbyPlacesMarkers` passes (the existing origin/destination markers inside `useMapboxMap` don't pass `element` for the destination marker and pass a different shape for the origin puck, so this stays backward compatible — it only records an element when one is actually given):

```ts
  class FakeMarker {
    element?: HTMLDivElement;
    constructor(options?: { element?: HTMLDivElement }) {
      this.element = options?.element;
      if (options?.element) {
        nearbyMarkerElements.push(options.element);
      }
    }
    setLngLat = vi.fn().mockReturnThis();
    addTo = vi.fn().mockReturnThis();
    setRotation = vi.fn().mockReturnThis();
    remove = vi.fn();
  }
```

Add the import needed for the new test, near the top of the file:

```ts
import * as geoapifyClient from '../services/geoapifyClient';
```

The `FakeMap.on` mock in this file only special-cases `'movestart'` (capturing it into `movestartHandler`) — every other event, including `'moveend'`, is swallowed by the base `vi.fn()` and never invoked. `useNearbyPlacesMarkers` registers its handler via `map.on('moveend', handleMoveEnd)`, so the mock needs to capture that too, the same way it already captures `'movestart'`.

Declare a second handler variable next to the existing `let movestartHandler` declaration at the top of the file:

```ts
let moveEndHandler: (() => void) | null = null;
```

Find the `on` mock inside the `FakeMap` class:

```ts
    on = vi.fn((event: string, handler: (event: { originalEvent?: unknown }) => void) => {
      if (event === 'movestart') {
        movestartHandler = handler;
      }
    });
```

and replace it with:

```ts
    on = vi.fn((event: string, handler: () => void) => {
      if (event === 'movestart') {
        movestartHandler = handler as (event: { originalEvent?: unknown }) => void;
      }
      if (event === 'moveend') {
        moveEndHandler = handler;
      }
    });
```

The `FakeMap` also needs `getCenter` and `getZoom`, which it doesn't have yet (only `useNearbyPlacesMarkers` needs them — `useMapboxMap` itself never calls them). Add these two to the `FakeMap` class, next to `setCenter`:

```ts
    getCenter = vi.fn().mockReturnValue({ lat: -15.8267, lng: -48.0654 });
    getZoom = vi.fn().mockReturnValue(16);
```

Now add the test itself, at the end of the `describe` block:

```ts
  it('busca e desenha estabelecimentos próximos, e chama onDestinationSelected ao clicar num deles', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    nearbyMarkerElements.length = 0;
    moveEndHandler = null;
    vi.spyOn(geoapifyClient, 'searchNearbyPlaces').mockResolvedValue([
      { id: 'p1', placeName: "D'Casa Ferramentas, Rua 4", coordinates: { lat: -15.8306, lng: -48.0645 } },
    ]);
    const onDestinationSelected = vi.fn();

    render(
      <MapView
        origin={{ lat: -15.8267, lng: -48.0654 }}
        destination={null}
        route={null}
        isNavigating={false}
        headingDegrees={null}
        theme="light"
        travelProfile="driving"
        speedMetersPerSecond={null}
        onDestinationSelected={onDestinationSelected}
      />,
    );

    await act(async () => {
      moveEndHandler?.();
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(nearbyMarkerElements).toHaveLength(1);

    nearbyMarkerElements[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onDestinationSelected).toHaveBeenCalledWith({
      id: 'p1',
      placeName: "D'Casa Ferramentas, Rua 4",
      coordinates: { lat: -15.8306, lng: -48.0645 },
    });

    vi.useRealTimers();
  });
```

This test covers both the fetch-and-render wiring and the click-through to `onDestinationSelected` in one pass — the hook's own finer-grained behavior (debounce timing, distance gating, 429 backoff) is already fully covered by `useNearbyPlacesMarkers.test.ts` from Task 2/3, so this test stays focused on catching wiring mistakes (wrong prop name, hook not called, wrong callback threaded through), not re-testing the hook's internals.

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run src/components/MapView.test.tsx`
Expected: FAIL — `MapView` doesn't accept `onDestinationSelected` yet, and never calls `searchNearbyPlaces`.

- [ ] **Step 8: Wire the hook into MapView**

Read `src/components/MapView.tsx` fully first (it's short, ~65 lines). Replace its contents with:

```tsx
import { useRef } from 'react';
import { LocateFixed } from 'lucide-react';
import { useMapboxMap } from '../features/map/useMapboxMap';
import { useNearbyPlacesMarkers } from '../features/places/useNearbyPlacesMarkers';
import type { Coordinates, GeocodingSuggestion, MapChromeInsets, Route, TravelProfile } from '../types';

interface MapViewProps {
  origin: Coordinates | null;
  destination: Coordinates | null;
  route: Route | null;
  isNavigating: boolean;
  headingDegrees: number | null;
  theme: 'light' | 'dark';
  travelProfile: TravelProfile;
  speedMetersPerSecond: number | null;
  chromeInsets?: MapChromeInsets;
  onDestinationSelected: (suggestion: GeocodingSuggestion) => void;
}

export function MapView({
  origin,
  destination,
  route,
  isNavigating,
  headingDegrees,
  theme,
  travelProfile,
  speedMetersPerSecond,
  chromeInsets,
  onDestinationSelected,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { mapInstance, isFollowingUser, recenter } = useMapboxMap({
    containerRef,
    origin,
    destination,
    route,
    isNavigating,
    headingDegrees,
    theme,
    travelProfile,
    speedMetersPerSecond,
    chromeInsets,
  });

  // Sempre habilitado (planejamento, rota traçada e navegação) — ver spec
  // `docs/superpowers/specs/2026-08-26-nearby-places-overlay-design.md`.
  useNearbyPlacesMarkers({
    map: mapInstance,
    enabled: true,
    onSelect: onDestinationSelected,
  });

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} data-testid="map-view" className="h-full w-full" />
      {!isFollowingUser && (
        <button
          type="button"
          onClick={recenter}
          aria-label="Centralizar"
          // Durante a navegação, bottom-20 fixo (não bottom-4) sobe o
          // suficiente para não ficar embaixo da NavigationStatusBar fixa no
          // rodapé. Fora da navegação não há barra fixa, mas há o cartão de
          // destino, que muda de altura (ver `chromeInsets`) — usa essa altura
          // real via style em vez de uma classe fixa, senão o botão nascia
          // embaixo do cartão sempre que ele fosse alto o bastante.
          className="absolute right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
          style={isNavigating ? { bottom: '5rem' } : { bottom: (chromeInsets?.bottom ?? 0) + 16 }}
        >
          <LocateFixed size={22} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Wire `handleDestinationSelected` from App.tsx**

Read `src/App.tsx`. Find the `mapLayer` JSX (the block starting with `const mapLayer = (`), and add the new prop to the `<MapView>` element:

```tsx
  const mapLayer = (
    <div className="fixed inset-0 z-0">
      <Suspense fallback={null}>
        <MapView
          origin={state.origin}
          destination={state.destination}
          route={state.route}
          isNavigating={state.status === 'navigating'}
          headingDegrees={geolocation.headingDegrees}
          theme={theme}
          travelProfile={state.travelProfile}
          speedMetersPerSecond={geolocation.speedMetersPerSecond}
          chromeInsets={chromeInsets}
          onDestinationSelected={handleDestinationSelected}
        />
      </Suspense>
    </div>
  );
```

`handleDestinationSelected` already exists in `App.tsx` (defined above this block) and already has the exact signature `useNearbyPlacesMarkers`'s `onSelect` needs.

- [ ] **Step 10: Run tests to verify they pass**

Run: `npx vitest run src/components/MapView.test.tsx`
Expected: PASS (all tests in the file, including the pre-existing ones — the new required `onDestinationSelected` prop must be added to every `<MapView>` render already in the file, including the ones in the earlier tests in this same file. Read the file's other two `it(...)` blocks and add `onDestinationSelected={vi.fn()}` to each `<MapView>` render that's missing it.)

Run: `npx vitest run` (full suite)
Expected: PASS. `App.test.tsx` renders `<App />`, which now renders `<MapView>` with a real `handleDestinationSelected` already passed — no changes needed there. If any `App.test.tsx` test unexpectedly fails because `searchNearbyPlaces` fires and throws (its `fetch` isn't mocked in that file), that specific test needs `vi.spyOn(geoapifyClient, 'searchNearbyPlaces').mockResolvedValue([])` added to its setup (check `App.test.tsx`'s top-level `beforeEach`/mock setup first — if `geoapifyClient` isn't imported there yet, add `import * as geoapifyClient from './services/geoapifyClient';` and a default mock in `beforeEach`).

- [ ] **Step 11: Commit**

```bash
git add src/components/MapView.tsx src/components/MapView.test.tsx src/App.tsx
git commit -m "feat: wire nearby-places markers into MapView and App"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + all new tests from Tasks 1–4).

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: No errors.

- [ ] **Step 3: Lint**

Run: `npx eslint .`
Expected: No new errors (the pre-existing `react-hooks/exhaustive-deps` warning in `useMapboxMap.ts:214` is unrelated and expected to remain).

- [ ] **Step 4: Manual check in a real browser**

The dev server should already be running at `http://localhost:5174/` (start it with `npm run dev` if not). Open it, allow location access, and:
1. Wait for the map to center on your real location.
2. Zoom in close (street-block level) on a commercial-looking area.
3. Confirm small purple-dot markers with establishment names appear after ~1 second.
4. Tap one — confirm it becomes the selected destination (search bar / destination card updates) and a route is calculated.
5. Zoom back out — confirm the markers disappear.
6. Pan the map around while zoomed in — confirm new markers appear as you move into new areas, without needing to interact with anything else.

This is the step that confirms Task 1–4's code actually delivers what the spec describes, beyond what unit tests can show (real Mapbox rendering, real Geoapify data, real debounce timing).
