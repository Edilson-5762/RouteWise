import { ManeuverBanner } from './ManeuverBanner';
import { NavigationStatusBar } from './NavigationStatusBar';
import { ArrivalScreen } from './ArrivalScreen';
import { ErrorBanner } from './ErrorBanner';
import { useVoiceGuidance } from '../features/voice/useVoiceGuidance';
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
  const currentStep = state.route?.steps[state.currentStepIndex] ?? null;
  const voice = useVoiceGuidance(currentStep?.instruction ?? null, {
    enabled: state.status === 'navigating',
  });

  if (state.status === 'arrived') {
    return <ArrivalScreen placeName={placeName} onDone={onArrivalDone} />;
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
    <div className="relative flex h-screen flex-col">
      <ManeuverBanner step={currentStep} />
      {isRecalculating && (
        <p
          role="status"
          className="absolute left-1/2 top-20 z-10 -translate-x-1/2 rounded-full bg-surface px-4 py-2 text-sm font-medium text-surface-foreground shadow-lg"
        >
          Recalculando rota...
        </p>
      )}
      {!isRecalculating && routeError && (
        <div className="absolute left-1/2 top-20 z-10 w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
          <ErrorBanner message={routeError} onRetry={onRetryRecalc} />
        </div>
      )}

      {/* Espaço vazio: o mapa em si é uma camada de fundo fixa e persistente
          renderizada por App.tsx (ver comentário lá). pointer-events-none
          deixa gestos de pan/zoom passarem direto para o mapa por baixo. */}
      <div className="flex-1 pointer-events-none" />

      <NavigationStatusBar
        durationSeconds={remainingDurationSeconds}
        distanceMeters={remainingDistanceMeters}
        speedMetersPerSecond={speedMetersPerSecond}
        isVoiceSupported={voice.isSupported}
        isVoiceMuted={voice.isMuted}
        onToggleVoice={voice.toggleMute}
        onExit={onExit}
        onExitApp={onExitApp}
      />
    </div>
  );
}
