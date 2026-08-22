import { useEffect, useReducer, useRef, useState } from 'react';
import { PlanningView } from './components/PlanningView';
import { NavigationView } from './components/NavigationView';
import { ErrorBanner } from './components/ErrorBanner';
import { useGeolocation } from './features/geolocation/useGeolocation';
import { useRoute } from './features/routing/useRoute';
import { useTheme } from './features/theme/useTheme';
import { navigationReducer, initialNavigationState } from './features/routing/navigationReducer';
import type { GeocodingSuggestion } from './types';

const DEVIATION_RECALC_DEBOUNCE_MS = 3000;

export function App() {
  const [state, dispatch] = useReducer(navigationReducer, initialNavigationState);
  const geolocation = useGeolocation();
  const { planRoute, recalculateRoute, isLoading: isRouteLoading, error: routeError } =
    useRoute(dispatch);
  const { theme } = useTheme();
  const [placeName, setPlaceName] = useState<string | null>(null);

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

  const lastRecalcAtRef = useRef(0);

  useEffect(() => {
    if (!state.routeDeviated || !state.origin || !state.destination) {
      return;
    }
    const now = Date.now();
    if (now - lastRecalcAtRef.current < DEVIATION_RECALC_DEBOUNCE_MS) {
      return;
    }
    lastRecalcAtRef.current = now;
    void recalculateRoute(state.origin, state.destination, state.travelProfile);
  }, [state.routeDeviated, state.origin, state.destination, state.travelProfile, recalculateRoute]);

  const handleDestinationSelected = (suggestion: GeocodingSuggestion) => {
    setPlaceName(suggestion.placeName);
    // Spreads into a fresh object so attemptedDestinationRef's reference
    // comparison can't collide across separate user actions, even when the
    // same place is selected twice in a row (see comment above).
    dispatch({ type: 'SET_DESTINATION', destination: { ...suggestion.coordinates } });
  };

  const handleTravelProfileChange = (profile: (typeof state)['travelProfile']) => {
    dispatch({ type: 'SET_TRAVEL_PROFILE', profile });
    if (state.origin && state.destination) {
      void planRoute(state.origin, state.destination, profile);
    }
  };

  const handleStartNavigation = () => {
    dispatch({ type: 'START_NAVIGATION' });
  };

  const handleRetryRoute = () => {
    if (state.origin && state.destination) {
      void planRoute(state.origin, state.destination, state.travelProfile);
    }
  };

  const handleExitNavigation = () => {
    dispatch({ type: 'RESET' });
    setPlaceName(null);
  };

  if (geolocation.error) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <ErrorBanner message={geolocation.error} onRetry={geolocation.retry} />
      </div>
    );
  }

  if (state.status === 'navigating' || state.status === 'arrived') {
    return (
      <NavigationView
        state={state}
        placeName={placeName}
        speedMetersPerSecond={geolocation.speedMetersPerSecond}
        headingDegrees={geolocation.headingDegrees}
        theme={theme}
        isRecalculating={state.routeDeviated && isRouteLoading}
        onExit={handleExitNavigation}
        onArrivalDone={handleExitNavigation}
      />
    );
  }

  return (
    <PlanningView
      state={state}
      placeName={placeName}
      routeError={routeError}
      isRouteLoading={isRouteLoading}
      onDestinationSelected={handleDestinationSelected}
      onTravelProfileChange={handleTravelProfileChange}
      onStartNavigation={handleStartNavigation}
      onRetryRoute={handleRetryRoute}
      theme={theme}
      headingDegrees={geolocation.headingDegrees}
    />
  );
}
