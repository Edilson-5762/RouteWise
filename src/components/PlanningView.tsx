import { useEffect, useRef, useState } from 'react';
import { Sun, Moon, LogOut } from 'lucide-react';
import { SearchBar } from './SearchBar';
import { SavedPlacesShortcuts } from './SavedPlacesShortcuts';
import { DestinationCard } from './DestinationCard';
import { ErrorBanner } from './ErrorBanner';
import { useSavedPlaces } from '../features/places/useSavedPlaces';
import { useElementHeight } from '../features/layout/useElementHeight';
import { hasMapboxToken } from '../services/mapboxClient';
import { hasGeoapifyApiKey } from '../services/geoapifyClient';
import type { GeocodingSuggestion, MapChromeInsets, NavigationState, TravelProfile } from '../types';

interface PlanningViewProps {
  state: NavigationState;
  placeName: string | null;
  routeError: string | null;
  isRouteLoading: boolean;
  onDestinationSelected: (suggestion: GeocodingSuggestion) => void;
  onTravelProfileChange: (profile: TravelProfile) => void;
  onStartNavigation: () => void;
  onCancelRoute: () => void;
  onRetryRoute: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onChromeInsetsChange: (insets: MapChromeInsets) => void;
  onExitApp: () => void;
}

export function PlanningView({
  state,
  placeName,
  routeError,
  isRouteLoading,
  onDestinationSelected,
  onTravelProfileChange,
  onStartNavigation,
  onCancelRoute,
  onRetryRoute,
  theme,
  onToggleTheme,
  onChromeInsetsChange,
  onExitApp,
}: PlanningViewProps) {
  const { places, savePlace } = useSavedPlaces();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Mede a altura real do cabeçalho (busca + banners, que variam de altura) e
  // do cartão de destino (some/aparece e muda de conteúdo) para que o mapa
  // saiba quanto espaço cada um cobre e encaixe a rota inteira no vão livre
  // entre eles — sem isso, o `fitBounds` (com um padding fixo) desenhava a
  // rota até embaixo do cartão, escondendo o trecho final atrás dele (o
  // sintoma reportado: cartão "tampando" o trajeto).
  const [headerNode, setHeaderNode] = useState<HTMLElement | null>(null);
  const [destinationCardNode, setDestinationCardNode] = useState<HTMLDivElement | null>(null);
  const headerHeight = useElementHeight(headerNode);
  const destinationCardHeight = useElementHeight(destinationCardNode);

  useEffect(() => {
    onChromeInsetsChange({ top: headerHeight, bottom: destinationCardHeight });
  }, [headerHeight, destinationCardHeight, onChromeInsetsChange]);

  const isPlaceSaved =
    state.destination !== null &&
    places.some(
      (place) =>
        place.coordinates.lat === state.destination?.lat &&
        place.coordinates.lng === state.destination?.lng,
    );

  const handleSave = () => {
    if (!state.destination || !placeName) {
      return;
    }
    const label = window.prompt('Nome para este local', placeName);
    if (label === null) {
      return;
    }
    savePlace(label, state.destination);
  };

  const handleShare = () => {
    if (!state.destination) {
      return;
    }
    const url = `https://www.google.com/maps?q=${state.destination.lat},${state.destination.lng}`;
    if (navigator.share) {
      void navigator.share({ title: placeName ?? 'Destino', url });
    } else if (navigator.clipboard) {
      void navigator.clipboard.writeText(url);
    }
  };

  return (
    // pointer-events-none na raiz (não só no vão vazio do meio, ver comentário
    // abaixo): sem isso, esta div — que cobre a tela inteira (h-screen) por
    // ser o container flex de tudo — continuava capturando cliques/arrasto em
    // QUALQUER altura da tela, mesmo onde não há nada visível por cima do
    // mapa, porque `pointer-events: none` num filho não repassa para o pai
    // que o envolve. O cabeçalho e o cartão de destino, que são realmente
    // clicáveis, precisam reativar pointer-events-auto para si.
    <div className="relative flex h-screen flex-col pointer-events-none">
      <header
        ref={setHeaderNode}
        className="pointer-events-auto z-10 space-y-3 bg-surface p-4 shadow"
      >
        {!hasMapboxToken() && (
          <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
            Token do Mapbox não configurado. Defina <code>VITE_MAPBOX_TOKEN</code> no arquivo{' '}
            <code>.env</code> para habilitar o mapa e o cálculo de rotas.
          </p>
        )}
        {!hasGeoapifyApiKey() && (
          <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
            Chave da Geoapify não configurada. Defina <code>VITE_GEOAPIFY_API_KEY</code> no arquivo{' '}
            <code>.env</code> para habilitar a busca de destinos.
          </p>
        )}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <SearchBar
              ref={searchInputRef}
              onSelect={onDestinationSelected}
              proximity={state.origin}
            />
          </div>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface text-surface-foreground shadow-sm hover:bg-primary/10"
          >
            {theme === 'dark' ? (
              <Sun size={20} aria-hidden="true" />
            ) : (
              <Moon size={20} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={onExitApp}
            aria-label="Sair da página"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface text-danger shadow-sm hover:bg-danger/10"
          >
            <LogOut size={20} aria-hidden="true" />
          </button>
        </div>
        {state.status === 'idle' && (
          <SavedPlacesShortcuts
            places={places}
            onSelect={(place) =>
              onDestinationSelected({
                id: place.id,
                placeName: place.label,
                coordinates: place.coordinates,
              })
            }
            onAddNew={() => searchInputRef.current?.focus()}
          />
        )}
        {routeError && <ErrorBanner message={routeError} onRetry={onRetryRoute} />}
        {isRouteLoading && <p className="text-sm text-muted">Calculando rota...</p>}
      </header>

      {/* Espaço vazio: o mapa em si é uma camada de fundo fixa e persistente
          renderizada por App.tsx (ver comentário lá). A raiz acima já é
          pointer-events-none, então esta div só existe para ocupar o espaço
          no fluxo flex — não precisa mais desativar pointer-events sozinha. */}
      <div className="flex-1" />

      {state.status === 'routePlanned' && state.route && placeName && (
        <div
          ref={setDestinationCardNode}
          className="pointer-events-auto border-t border-surface-foreground/10 bg-surface p-4"
        >
          <DestinationCard
            placeName={placeName}
            distanceMeters={state.route.distanceMeters}
            durationSeconds={state.route.durationSeconds}
            travelProfile={state.travelProfile}
            onTravelProfileChange={onTravelProfileChange}
            onSave={handleSave}
            onShare={handleShare}
            onStartNavigation={onStartNavigation}
            onCancel={onCancelRoute}
            isSaved={isPlaceSaved}
          />
        </div>
      )}
    </div>
  );
}
