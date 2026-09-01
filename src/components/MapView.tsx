import { useRef } from 'react';
import { LocateFixed } from 'lucide-react';
import { useMapboxMap } from '../features/map/useMapboxMap';
import { useNearbyPlacesMarkers } from '../features/places/useNearbyPlacesMarkers';
import { NAV_PUCK_VERTICAL_OFFSET_RATIO, NAV_VEHICLE_ICON_PX } from '../features/map/navConstants';
import { getPuckIconMarkup } from '../utils/vehicleAvatar';
import { formatSpeedKmh } from '../utils/format';
import type {
  Coordinates,
  GeocodingSuggestion,
  MapChromeInsets,
  Route,
  TravelProfile,
} from '../types';

interface MapViewProps {
  origin: Coordinates | null;
  destination: Coordinates | null;
  route: Route | null;
  isNavigating: boolean;
  currentStepIndex?: number;
  routeProgressIndex?: number;
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
  currentStepIndex,
  routeProgressIndex,
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
    currentStepIndex,
    routeProgressIndex,
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

  // O avatar é desenhado a 46px fixos; tira o tamanho embutido para ele
  // preencher o container maior do ícone fixo da navegação (ver abaixo).
  const navVehicleMarkup = getPuckIconMarkup(travelProfile).replace(
    /\swidth="\d+"\s+height="\d+"/,
    ' width="100%" height="100%"',
  );

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} data-testid="map-view" className="h-full w-full" />

      {/* Veículo da navegação: um ícone FIXO na tela, na mesma posição vertical
          em que a câmera centraliza o ponto do veículo projetado sobre a rota
          (NAV_PUCK_VERTICAL_OFFSET_RATIO). Como não é um marcador do mapa, ele
          não se move na tela — o mapa é que rola por baixo, sem os "coices"
          para frente. Aponta sempre para cima porque a câmera já gira o mapa
          para a direção da rua à frente (visão "atrás do veículo" do Waze). */}
      {isNavigating && (
        <div
          data-testid="nav-vehicle"
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 z-[5] flex flex-col items-center"
          style={{
            top: `${(0.5 + NAV_PUCK_VERTICAL_OFFSET_RATIO) * 100}%`,
            transform: 'translate(-50%, -50%)',
            filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.55))',
          }}
        >
          <div
            className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold leading-none text-white shadow"
            style={{ marginBottom: -6, zIndex: 1 }}
          >
            {formatSpeedKmh(speedMetersPerSecond)}
          </div>
          <div
            style={{ width: NAV_VEHICLE_ICON_PX, height: NAV_VEHICLE_ICON_PX }}
            dangerouslySetInnerHTML={{ __html: navVehicleMarkup }}
          />
        </div>
      )}

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
