import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Coordinates, Route } from '../../types';
import type { Feature, LineString } from 'geojson';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const ROUTE_SOURCE_ID = 'route-source';
const ROUTE_LAYER_ID = 'route-layer';
const DAY_STYLE = 'mapbox://styles/mapbox/navigation-day-v1';
const NIGHT_STYLE = 'mapbox://styles/mapbox/navigation-night-v1';

interface UseMapboxMapOptions {
  containerRef: RefObject<HTMLDivElement>;
  origin: Coordinates | null;
  destination: Coordinates | null;
  route: Route | null;
  isNavigating: boolean;
  headingDegrees: number | null;
  theme: 'light' | 'dark';
}

export function useMapboxMap({
  containerRef,
  origin,
  destination,
  route,
  isNavigating,
  headingDegrees,
  theme,
}: UseMapboxMapOptions) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const originMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const destinationMarkerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: theme === 'dark' ? NIGHT_STYLE : DAY_STYLE,
      center: [-46.6333, -23.5505],
      zoom: 12,
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      originMarkerRef.current = null;
      destinationMarkerRef.current = null;
    };
  }, [containerRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin) {
      return;
    }

    if (!originMarkerRef.current) {
      originMarkerRef.current = new mapboxgl.Marker({ color: '#2563eb' })
        .setLngLat([origin.lng, origin.lat])
        .addTo(map);
    } else {
      originMarkerRef.current.setLngLat([origin.lng, origin.lat]);
    }

    if (!isNavigating) {
      map.setCenter([origin.lng, origin.lat]);
    }
  }, [origin, isNavigating]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !destination) {
      return;
    }

    if (!destinationMarkerRef.current) {
      destinationMarkerRef.current = new mapboxgl.Marker({ color: '#dc2626' })
        .setLngLat([destination.lng, destination.lat])
        .addTo(map);
    } else {
      destinationMarkerRef.current.setLngLat([destination.lng, destination.lat]);
    }
  }, [destination]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (!route) {
      const clearRoute = () => {
        if (map.getSource(ROUTE_SOURCE_ID)) {
          if (map.getLayer(ROUTE_LAYER_ID)) {
            map.removeLayer(ROUTE_LAYER_ID);
          }
          map.removeSource(ROUTE_SOURCE_ID);
        }
      };

      if (map.isStyleLoaded()) {
        clearRoute();
      } else {
        map.once('load', clearRoute);
      }
      return;
    }

    const geojson: Feature<LineString> = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: route.geometry.map((point) => [point.lng, point.lat]),
      },
    };

    const applyRoute = () => {
      const source = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData(geojson);
      } else {
        map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: geojson });
        map.addLayer({
          id: ROUTE_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#2563eb', 'line-width': 5 },
        });
      }

      if (route.geometry.length > 0) {
        const [first, ...rest] = route.geometry;
        const bounds = rest.reduce(
          (acc, point) => acc.extend([point.lng, point.lat]),
          new mapboxgl.LngLatBounds([first.lng, first.lat], [first.lng, first.lat]),
        );
        map.fitBounds(bounds, { padding: 48 });
      }
    };

    if (map.isStyleLoaded()) {
      applyRoute();
    } else {
      map.once('load', applyRoute);
    }
  }, [route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    map.setStyle(theme === 'dark' ? NIGHT_STYLE : DAY_STYLE);
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin) {
      return;
    }

    if (isNavigating) {
      map.easeTo({
        center: [origin.lng, origin.lat],
        zoom: 17,
        pitch: 60,
        bearing: headingDegrees ?? map.getBearing(),
        duration: 500,
      });
    } else {
      map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
    }
  }, [origin, isNavigating, headingDegrees]);

  return mapRef;
}
