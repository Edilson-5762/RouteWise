import { useRef } from 'react';
import { LocateFixed } from 'lucide-react';
import { useMapboxMap } from '../features/map/useMapboxMap';
import type { Coordinates, MapChromeInsets, Route, TravelProfile } from '../types';

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
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isFollowingUser, recenter } = useMapboxMap({
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

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} data-testid="map-view" className="h-full w-full" />
      {isNavigating && !isFollowingUser && (
        <button
          type="button"
          onClick={recenter}
          aria-label="Centralizar no destino"
          // bottom-20 (não bottom-4): o mapa agora é uma camada única de tela
          // cheia em App.tsx (ver comentário lá), então este botão precisa
          // subir o suficiente para não ficar embaixo da NavigationStatusBar
          // fixa no rodapé da tela de navegação.
          className="absolute bottom-20 right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
        >
          <LocateFixed size={22} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
