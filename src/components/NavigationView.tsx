import { useEffect, useMemo, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { ManeuverBanner } from './ManeuverBanner';
import { NavigationStatusBar } from './NavigationStatusBar';
import { ArrivalScreen } from './ArrivalScreen';
import { ErrorBanner } from './ErrorBanner';
import { CurrentRoadPill } from './CurrentRoadPill';
import { Speedometer } from './Speedometer';
import { selectGuidance } from '../features/navigation/selectGuidance';
import { useVoiceGuidance } from '../features/voice/useVoiceGuidance';
import { useWakeLock } from '../features/wakelock/useWakeLock';
import type { NavigationState } from '../types';

interface NavigationViewProps {
  state: NavigationState;
  placeName: string | null;
  speedMetersPerSecond: number | null;
  isRecalculating: boolean;
  routeError: string | null;
  onRetryRecalc: () => void;
  onExit: () => void;
  onArrivalDone: () => void;
  onExitApp: () => void;
}

export function NavigationView({
  state,
  placeName,
  speedMetersPerSecond,
  isRecalculating,
  routeError,
  onRetryRecalc,
  onExit,
  onArrivalDone,
  onExitApp,
}: NavigationViewProps) {
  // A manobra do passo `i` acontece no INÍCIO dele; enquanto se percorre o
  // passo `currentStepIndex`, o que interessa mostrar e falar é a PRÓXIMA
  // manobra (a que você ainda vai fazer), com a distância que falta até ela.
  const stepCount = state.route?.steps.length ?? 0;
  const upcomingStepIndex =
    stepCount > 0 ? Math.min(state.currentStepIndex + 1, stepCount - 1) : 0;
  const currentStep = state.route?.steps[upcomingStepIndex] ?? null;
  const currentStepInstruction = currentStep?.instruction ?? null;

  const upcomingManeuver = useMemo(
    () =>
      currentStepInstruction
        ? { instruction: currentStepInstruction, key: String(upcomingStepIndex) }
        : null,
    [currentStepInstruction, upcomingStepIndex],
  );
  // View-model do painel de manobra estilo Waze (distância, textos, faixas,
  // "Depois", via atual). Fica junto dos outros derivados, ANTES das saídas
  // antecipadas — não pode virar hook condicional.
  const guidance = useMemo(
    () => selectGuidance(state.route, state.currentStepIndex, state.distanceToManeuverMeters),
    [state.route, state.currentStepIndex, state.distanceToManeuverMeters],
  );
  const voice = useVoiceGuidance(upcomingManeuver, state.distanceToManeuverMeters, {
    enabled: state.status === 'navigating',
  });
  // Impede a tela de apagar durante o trajeto — sem isso o bloqueio automático
  // do celular corta o GPS e, com ele, a detecção de desvio e o recálculo.
  useWakeLock(state.status === 'navigating');

  // Aviso de chegada por voz — uma vez só, e respeitando o mudo da navegação.
  // O lado ("à sua direita/esquerda") vem da geometria (ver `arrivalSide` no
  // navigationReducer): direção de chegada vs. direção do pino.
  const spokeArrivalRef = useRef(false);
  useEffect(() => {
    if (state.status !== 'arrived') {
      spokeArrivalRef.current = false;
      return;
    }
    if (spokeArrivalRef.current) {
      return;
    }
    spokeArrivalRef.current = true;
    if (voice.isMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }
    const phrase =
      state.arrivalSide === 'right'
        ? 'Você chegou ao seu destino. Ele fica à sua direita.'
        : state.arrivalSide === 'left'
          ? 'Você chegou ao seu destino. Ele fica à sua esquerda.'
          : 'Você chegou ao seu destino.';
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = 'pt-BR';
    window.speechSynthesis.speak(utterance);
  }, [state.status, state.arrivalSide, voice.isMuted]);

  if (state.status === 'arrived') {
    return <ArrivalScreen placeName={placeName} side={state.arrivalSide} onDone={onArrivalDone} />;
  }

  if (!state.route || !currentStep) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <ErrorBanner message="Não foi possível carregar a navegação." onRetry={onExit} />
      </div>
    );
  }

  const remainingDistanceMeters = state.route.steps
    .slice(state.currentStepIndex)
    .reduce((total, step) => total + step.distanceMeters, 0);
  const remainingDurationSeconds =
    (remainingDistanceMeters / state.route.distanceMeters) * state.route.durationSeconds;

  return (
    // pointer-events-none na raiz (não só no vão vazio do meio, ver comentário
    // abaixo): sem isso, esta div — que cobre a tela inteira (h-screen) por
    // ser o container flex de tudo — continuava capturando cliques/arrasto em
    // QUALQUER altura da tela, mesmo onde não há nada visível por cima do
    // mapa, porque `pointer-events: none` num filho não repassa para o pai
    // que o envolve. Cada painel realmente clicável (banner de manobra,
    // avisos, barra de status) precisa reativar pointer-events-auto para si.
    <div className="relative flex h-screen flex-col pointer-events-none">
      <div className="pointer-events-auto">
        <ManeuverBanner guidance={guidance} />
      </div>
      {isRecalculating && (
        <div
          role="status"
          className="pointer-events-auto absolute left-1/2 top-24 z-20 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-2xl bg-amber-500 px-5 py-3 text-base font-bold text-white shadow-2xl ring-2 ring-amber-300"
        >
          <RefreshCw size={22} className="animate-spin" aria-hidden="true" />
          Recalculando a rota…
        </div>
      )}
      {!isRecalculating && routeError && (
        <div className="pointer-events-auto absolute left-1/2 top-20 z-10 w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
          <ErrorBanner message={routeError} onRetry={onRetryRecalc} />
        </div>
      )}

      {/* Espaço vazio: o mapa em si é uma camada de fundo fixa e persistente
          renderizada por App.tsx (ver comentário lá). A raiz acima já é
          pointer-events-none, então esta div só existe para ocupar o espaço
          no fluxo flex — não precisa mais desativar pointer-events sozinha. */}
      <div className="flex-1" />

      {/* Velocímetro (esq.) e pílula da via atual (centro), estilo Waze, logo
          acima da barra de status. O espaçador à direita mantém a pílula
          centrada mesmo sem nada do lado direito. */}
      <div className="pointer-events-none flex items-end justify-between px-3 pb-2">
        <div className="pointer-events-auto">
          <Speedometer speedMetersPerSecond={speedMetersPerSecond} />
        </div>
        <div className="pointer-events-auto">
          <CurrentRoadPill name={guidance?.currentRoadName ?? ''} />
        </div>
        <div className="w-14" aria-hidden="true" />
      </div>

      <div className="pointer-events-auto">
        <NavigationStatusBar
          durationSeconds={remainingDurationSeconds}
          distanceMeters={remainingDistanceMeters}
          isVoiceSupported={voice.isSupported}
          isVoiceMuted={voice.isMuted}
          onToggleVoice={voice.toggleMute}
          onExit={onExit}
          onExitApp={onExitApp}
        />
      </div>
    </div>
  );
}
