import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { searchNearbyPlaces, GeoapifyRequestError } from '../../services/geoapifyClient';
import { haversineDistanceMeters } from '../../utils/distance';
import type { Coordinates, GeocodingSuggestion } from '../../types';

const MIN_ZOOM = 16;
const MIN_MOVE_METERS = 400;
const SEARCH_RADIUS_METERS = 900;
const DEBOUNCE_MS = 400;
const RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000;

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
export function useNearbyPlacesMarkers({
  map,
  enabled,
  onSelect,
}: UseNearbyPlacesMarkersOptions): void {
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const lastFetchCenterRef = useRef<Coordinates | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSelectRef = useRef(onSelect);
  const rateLimitedUntilRef = useRef(0);
  const fetchSeqRef = useRef(0);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const clearMarkers = () => {
      for (const marker of markersRef.current) {
        marker.remove();
      }
      markersRef.current = [];
      lastFetchCenterRef.current = null;
    };

    if (!map || !enabled) {
      clearMarkers();
      return;
    }

    let isCancelled = false;

    const runSearch = async () => {
      const rawCenter = map.getCenter();
      const center: Coordinates = { lat: rawCenter.lat, lng: rawCenter.lng };
      const zoom = map.getZoom();

      if (zoom < MIN_ZOOM) {
        clearMarkers();
        return;
      }

      if (Date.now() < rateLimitedUntilRef.current) {
        return;
      }

      const last = lastFetchCenterRef.current;
      if (last && haversineDistanceMeters(last, center) < MIN_MOVE_METERS) {
        return;
      }

      const fetchSeq = ++fetchSeqRef.current;

      let results: GeocodingSuggestion[];
      try {
        const suggestions = await searchNearbyPlaces(center, SEARCH_RADIUS_METERS);

        if (isCancelled || fetchSeq !== fetchSeqRef.current) {
          return;
        }

        results = suggestions.filter(
          (place): place is GeocodingSuggestion => place.coordinates !== undefined,
        );
      } catch (error) {
        if (error instanceof GeoapifyRequestError && error.status === 429) {
          rateLimitedUntilRef.current = Date.now() + RATE_LIMIT_BACKOFF_MS;
        }
        // Falha silenciosa de propósito (ver spec): esta é uma camada de
        // enriquecimento visual, não um caminho crítico. A próxima busca
        // válida tenta de novo naturalmente.
        return;
      }

      clearMarkers();
      lastFetchCenterRef.current = center;
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
      isCancelled = true;
      map.off('moveend', handleMoveEnd);
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      clearMarkers();
    };
  }, [map, enabled]);
}
