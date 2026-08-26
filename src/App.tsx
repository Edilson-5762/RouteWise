import { lazy, Suspense, useEffect, useReducer, useRef, useState } from 'react';
import { PlanningView } from './components/PlanningView';
import { NavigationView } from './components/NavigationView';
import { ErrorBanner } from './components/ErrorBanner';
import { ExitedScreen } from './components/ExitedScreen';
import { useGeolocation } from './features/geolocation/useGeolocation';
import { useRoute } from './features/routing/useRoute';
import { useTheme } from './features/theme/useTheme';
import { navigationReducer, initialNavigationState } from './features/routing/navigationReducer';
import type { GeocodingSuggestion, MapChromeInsets } from './types';

// mapbox-gl é uma dependência pesada (~500KB+ minificado); carregá-la só
// quando o mapa entra em tela evita bloquear o primeiro paint com JS que
// ainda não é necessário para mostrar a busca/tema/atalhos.
//
// Uma única instância de MapView vive aqui, sempre montada como camada de
// fundo em tela cheia — em vez de dentro de PlanningView/NavigationView.
// PlanningView e NavigationView antes montavam cada uma o seu próprio
// <MapView>, então toda troca de tela destruía e recriava o mapa Mapbox do
// zero (novo contexto WebGL, novo carregamento de estilo/tiles), o que
// deixava a abertura de cada tela perceptivelmente lenta e fazia a câmera
// nascer no centro padrão antes de animar até a posição real. PlanningView
// e NavigationView agora só desenham a UI por cima, com um espaço vazio e
// "clicável através" (pointer-events-none) onde o mapa aparece por baixo.
const MapView = lazy(() =>
  import('./components/MapView').then((module) => ({ default: module.MapView })),
);

export function App() {
  const [state, dispatch] = useReducer(navigationReducer, initialNavigationState);
  const geolocation = useGeolocation();
  const { planRoute, recalculateRoute, isLoading: isRouteLoading, error: routeError } =
    useRoute(dispatch);
  const { theme, toggleTheme } = useTheme();
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [chromeInsets, setChromeInsets] = useState<MapChromeInsets>({ top: 0, bottom: 0 });
  const [hasExitedApp, setHasExitedApp] = useState(false);

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

  // Attempts a route recalculation at most once per deviation episode, mirroring
  // attemptedDestinationRef above. state.routeDeviated stays true after a failed
  // recalculateRoute call (it's only cleared by a successful ROUTE_RECALCULATED),
  // so without this guard the effect would keep firing every render forever on
  // failure. Resetting the ref whenever the guard condition is false (not
  // deviated / not navigating / missing origin or destination) means the *next*
  // deviation episode always gets its own fresh attempt.
  const attemptedRecalcRef = useRef(false);

  useEffect(() => {
    if (
      !state.routeDeviated ||
      state.status !== 'navigating' ||
      !state.origin ||
      !state.destination
    ) {
      attemptedRecalcRef.current = false;
      return;
    }
    if (attemptedRecalcRef.current) {
      return;
    }
    attemptedRecalcRef.current = true;
    void recalculateRoute(state.origin, state.destination, state.travelProfile);
  }, [
    state.routeDeviated,
    state.status,
    state.origin,
    state.destination,
    state.travelProfile,
    recalculateRoute,
  ]);

  const handleRetryRecalc = () => {
    attemptedRecalcRef.current = false;
  };

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

  // Mesma limpeza de "sair da navegação" (RESET mantém `origin`, ver
  // navigationReducer.ts), só que disparada a partir do cartão de destino
  // ainda na tela de planejamento — permite cancelar a rota já calculada e
  // voltar para uma busca em branco sem precisar escolher outro destino só
  // para substituir o atual.
  const handleCancelRoute = () => {
    dispatch({ type: 'RESET' });
    setPlaceName(null);
  };

  // Navegadores só permitem `window.close()` fechar uma aba que o próprio
  // script abriu (ex.: via `window.open`); numa aba digitada/aberta pelo
  // usuário diretamente, a chamada é ignorada silenciosamente, sem erro. Como
  // não há como saber de dentro da página se o fechamento realmente
  // aconteceu, o fallback é: se a página ainda estiver rodando pouco depois
  // (ou seja, `window.close()` não funcionou), mostra a tela de despedida em
  // vez de deixar o botão parecer quebrado sem nenhum retorno visível.
  const handleExitApp = () => {
    window.close();
    window.setTimeout(() => setHasExitedApp(true), 300);
  };

  // Sempre montado, numa camada de fundo fixa em tela cheia (ver comentário
  // do MapView acima) — as telas por cima têm um espaço vazio e
  // "clicável através" no lugar onde o mapa aparece, para que gestos de
  // pan/zoom cheguem até ele.
  const mapLayer = (
    <div className="fixed inset-0 z-0">
      <Suspense fallback={null}>
        <MapView
          origin={state.origin}
          destination={state.destination}
          route={state.route}
          isNavigating={state.status === 'navigating'}
          headingDegrees={geolocation.headingDegrees}
          theme={theme}
          travelProfile={state.travelProfile}
          speedMetersPerSecond={geolocation.speedMetersPerSecond}
          chromeInsets={chromeInsets}
          onDestinationSelected={handleDestinationSelected}
        />
      </Suspense>
    </div>
  );

  if (hasExitedApp) {
    return <ExitedScreen onReturn={() => setHasExitedApp(false)} />;
  }

  if (geolocation.error) {
    return (
      <>
        {mapLayer}
        <div className="relative flex h-screen items-center justify-center p-6">
          <ErrorBanner message={geolocation.error} onRetry={geolocation.retry} />
        </div>
      </>
    );
  }

  if (state.status === 'navigating' || state.status === 'arrived') {
    return (
      <>
        {mapLayer}
        <NavigationView
          state={state}
          placeName={placeName}
          speedMetersPerSecond={geolocation.speedMetersPerSecond}
          isRecalculating={state.routeDeviated && isRouteLoading}
          routeError={state.routeDeviated && !isRouteLoading ? routeError : null}
          onRetryRecalc={handleRetryRecalc}
          onExit={handleExitNavigation}
          onArrivalDone={handleExitNavigation}
          onExitApp={handleExitApp}
        />
      </>
    );
  }

  return (
    <>
      {mapLayer}
      <PlanningView
        state={state}
        placeName={placeName}
        routeError={routeError}
        isRouteLoading={isRouteLoading}
        onDestinationSelected={handleDestinationSelected}
        onTravelProfileChange={handleTravelProfileChange}
        onStartNavigation={handleStartNavigation}
        onCancelRoute={handleCancelRoute}
        onRetryRoute={handleRetryRoute}
        theme={theme}
        onToggleTheme={toggleTheme}
        onChromeInsetsChange={setChromeInsets}
        onExitApp={handleExitApp}
      />
    </>
  );
}
