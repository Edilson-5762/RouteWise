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
