import { lazy, Suspense, useEffect, useReducer, useRef, useState } from 'react';
import { PlanningView } from './components/PlanningView';
import { NavigationView } from './components/NavigationView';
import { ErrorBanner } from './components/ErrorBanner';
import { ExitedScreen } from './components/ExitedScreen';
import { DebugPanel } from './components/DebugPanel';
import { useGeolocation } from './features/geolocation/useGeolocation';
import { useRoute } from './features/routing/useRoute';
import { useRouteRecalcOnDeviation } from './features/routing/useRouteRecalcOnDeviation';
import { useTheme } from './features/theme/useTheme';
import { navigationReducer, initialNavigationState } from './features/routing/navigationReducer';
import {
  loadNavigationSnapshot,
  saveNavigationSnapshot,
  clearNavigationSnapshot,
  type NavigationSnapshot,
} from './features/routing/navigationPersistence';
import type { GeocodingSuggestion, MapChromeInsets, NavigationState } from './types';

// Retoma uma navegação que estava em andamento quando a aba foi descartada
// (ex.: ligação longa durante o trajeto). `routeDeviated: true` reaproveita o
// recálculo por desvio para reancorar a rota na posição atual assim que o
// primeiro fix de GPS chega.
function buildInitialState(snapshot: NavigationSnapshot | null): NavigationState {
  if (!snapshot) {
    return initialNavigationState;
  }
  return {
    ...initialNavigationState,
    status: 'navigating',
    origin: snapshot.origin,
    destination: snapshot.destination,
    route: snapshot.route,
    currentStepIndex: snapshot.currentStepIndex,
    travelProfile: snapshot.travelProfile,
    routeDeviated: true,
  };
}

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
  const [restoredSnapshot] = useState(loadNavigationSnapshot);
  const [state, dispatch] = useReducer(navigationReducer, restoredSnapshot, buildInitialState);
  const geolocation = useGeolocation();
  const {
    planRoute,
    recalculateRoute,
    isLoading: isRouteLoading,
    error: routeError,
  } = useRoute(dispatch);
  const { theme, toggleTheme } = useTheme(geolocation.position);
  const [placeName, setPlaceName] = useState<string | null>(restoredSnapshot?.placeName ?? null);
  const [chromeInsets, setChromeInsets] = useState<MapChromeInsets>({ top: 0, bottom: 0 });
  const [hasExitedApp, setHasExitedApp] = useState(false);

  // Painel de diagnóstico: ligado por `?debug` na URL (navegador) ou pela flag
  // salva em localStorage. Abrir `?debug=1` grava a flag; `?debug=0` apaga —
  // assim dá para ligar pelo navegador e o app instalado (mesmo domínio, mesmo
  // localStorage) já abre com o painel, mesmo sem barra de endereço.
  const [debugEnabled] = useState(() => {
    const STORAGE_KEY = 'routewise:debug';
    try {
      const param = new URLSearchParams(window.location.search).get('debug');
      if (param !== null) {
        const on = param !== '0' && param !== 'false';
        try {
          localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
        } catch {
          // sem localStorage — a flag vale só para esta aba
        }
        return on;
      }
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

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

  // Enquanto fora da rota, tenta recalcular repetidamente até o usuário voltar
  // à rota (ver useRouteRecalcOnDeviation); desiste após algumas falhas
  // seguidas e expõe `hasGivenUp` para a UI oferecer um retry manual.
  const recalc = useRouteRecalcOnDeviation({
    deviated: state.routeDeviated,
    navigating: state.status === 'navigating',
    origin: state.origin,
    destination: state.destination,
    profile: state.travelProfile,
    recalculate: recalculateRoute,
  });

  // Snapshot da navegação em andamento — restaurado no boot por
  // buildInitialState se a aba tiver sido descartada. Limpo assim que a
  // navegação termina (chegada ou saída pelo "X").
  useEffect(() => {
    if (state.status === 'navigating') {
      saveNavigationSnapshot(state, placeName);
    } else {
      clearNavigationSnapshot();
    }
  }, [state, placeName]);

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
          currentStepIndex={state.currentStepIndex}
          routeProgressIndex={state.routeProgressIndex}
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

  const debugLayer = debugEnabled ? (
    <DebugPanel geolocation={geolocation} navState={state} />
  ) : null;

  if (hasExitedApp) {
    return <ExitedScreen onReturn={() => setHasExitedApp(false)} />;
  }

  if (geolocation.error) {
    return (
      <>
        {mapLayer}
        {debugLayer}
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
        {debugLayer}
        <NavigationView
          state={state}
          placeName={placeName}
          speedMetersPerSecond={geolocation.speedMetersPerSecond}
          isRecalculating={recalc.isRecalculating}
          routeError={recalc.hasGivenUp ? routeError : null}
          onRetryRecalc={recalc.retry}
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
      {debugLayer}
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
