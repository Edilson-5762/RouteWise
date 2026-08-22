import { useEffect, useReducer, useRef } from 'react';
import { MapView } from './components/MapView';
import { SearchBar } from './components/SearchBar';
import { RouteInstructions } from './components/RouteInstructions';
import { RouteSummary } from './components/RouteSummary';
import { ErrorBanner } from './components/ErrorBanner';
import { useGeolocation } from './features/geolocation/useGeolocation';
import { useRoute } from './features/routing/useRoute';
import { navigationReducer, initialNavigationState } from './features/routing/navigationReducer';
import type { GeocodingSuggestion } from './types';

export function App() {
  const [state, dispatch] = useReducer(navigationReducer, initialNavigationState);
  const geolocation = useGeolocation();
  const { planRoute, isLoading: isRouteLoading, error: routeError } = useRoute(dispatch);

  useEffect(() => {
    if (geolocation.position) {
      dispatch({ type: 'SET_ORIGIN', origin: geolocation.position });
    }
  }, [geolocation.position]);

  useEffect(() => {
    if (state.status === 'navigating' && geolocation.position) {
      dispatch({ type: 'POSITION_UPDATED', position: geolocation.position });
    }
  }, [geolocation.position, state.status]);

  // Plans the route once per destination selection — immediately if origin is
  // already known, or deferred until it arrives (covers picking a destination
  // before the first GPS fix). Tracks the attempted destination by reference:
  // state.destination only gets a new reference from SET_DESTINATION (once per
  // user action), while state.origin gets a new reference on every GPS tick —
  // keying off destination instead of origin avoids re-firing (and re-requesting
  // Directions) on every position update while a route is in flight or failed.
  const attemptedDestinationRef = useRef<typeof state.destination>(null);

  useEffect(() => {
    if (
      state.origin &&
      state.destination &&
      !state.route &&
      attemptedDestinationRef.current !== state.destination
    ) {
      attemptedDestinationRef.current = state.destination;
      void planRoute(state.origin, state.destination, state.travelProfile);
    }
  }, [state.origin, state.destination, state.route, state.travelProfile, planRoute]);

  const handleDestinationSelected = (suggestion: GeocodingSuggestion) => {
    dispatch({ type: 'SET_DESTINATION', destination: suggestion.coordinates });
  };

  const handleStartNavigation = () => {
    dispatch({ type: 'START_NAVIGATION' });
  };

  if (geolocation.error) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <ErrorBanner message={geolocation.error} onRetry={geolocation.retry} />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="z-10 space-y-3 bg-white p-4 shadow">
        <SearchBar onSelect={handleDestinationSelected} />
        {routeError && <ErrorBanner message={routeError} />}
        {state.route && (
          <RouteSummary
            distanceMeters={state.route.distanceMeters}
            durationSeconds={state.route.durationSeconds}
          />
        )}
        {state.status === 'routePlanned' && (
          <button
            type="button"
            onClick={handleStartNavigation}
            className="w-full rounded-lg bg-blue-600 py-2 font-semibold text-white hover:bg-blue-700"
          >
            Iniciar navegação
          </button>
        )}
        {isRouteLoading && <p className="text-sm text-slate-500">Calculando rota...</p>}
      </header>

      <div className="relative flex-1">
        <MapView origin={state.origin} destination={state.destination} route={state.route} />
      </div>

      {state.route && (
        <div className="max-h-64 overflow-y-auto border-t border-slate-200 bg-white">
          <RouteInstructions steps={state.route.steps} currentStepIndex={state.currentStepIndex} />
        </div>
      )}
    </div>
  );
}
