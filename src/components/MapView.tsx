import { useRef } from 'react';
import { useMapboxMap } from '../features/map/useMapboxMap';
import type { Coordinates, Route } from '../types';

interface MapViewProps {
  origin: Coordinates | null;
  destination: Coordinates | null;
  route: Route | null;
  isNavigating: boolean;
  headingDegrees: number | null;
  theme: 'light' | 'dark';
}

export function MapView({
  origin,
  destination,
  route,
  isNavigating,
  headingDegrees,
  theme,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useMapboxMap({ containerRef, origin, destination, route, isNavigating, headingDegrees, theme });

  return <div ref={containerRef} data-testid="map-view" className="h-full w-full" />;
}
