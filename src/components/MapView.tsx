import { useRef } from 'react';
import { useMapboxMap } from '../features/map/useMapboxMap';
import type { Coordinates, Route } from '../types';

interface MapViewProps {
  origin: Coordinates | null;
  destination: Coordinates | null;
  route: Route | null;
}

export function MapView({ origin, destination, route }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useMapboxMap({ containerRef, origin, destination, route });

  return <div ref={containerRef} data-testid="map-view" className="h-full w-full" />;
}
