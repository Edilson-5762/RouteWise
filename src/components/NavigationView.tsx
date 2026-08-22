import { MapView } from './MapView';
import { ManeuverBanner } from './ManeuverBanner';
import { NavigationStatusBar } from './NavigationStatusBar';
import { ArrivalScreen } from './ArrivalScreen';
import { useVoiceGuidance } from '../features/voice/useVoiceGuidance';
import type { NavigationState } from '../types';

interface NavigationViewProps {
  state: NavigationState;
  placeName: string | null;
  speedMetersPerSecond: number | null;
  headingDegrees: number | null;
  theme: 'light' | 'dark';
  isRecalculating: boolean;
  onExit: () => void;
  onArrivalDone: () => void;
}

export function NavigationView({
  state,
  placeName,
  speedMetersPerSecond,
  headingDegrees,
  theme,
  isRecalculating,
  onExit,
  onArrivalDone,
}: NavigationViewProps) {
  const currentStep = state.route?.steps[state.currentStepIndex] ?? null;
  const voice = useVoiceGuidance(currentStep?.instruction ?? null, {
    enabled: state.status === 'navigating',
  });

  if (state.status === 'arrived') {
    return <ArrivalScreen placeName={placeName} onDone={onArrivalDone} />;
  }

  if (!state.route || !currentStep) {
    return null;
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

      <div className="relative flex-1">
        <MapView
          origin={state.origin}
          destination={state.destination}
          route={state.route}
          isNavigating
          headingDegrees={headingDegrees}
          theme={theme}
        />
      </div>

      <NavigationStatusBar
        durationSeconds={remainingDurationSeconds}
        distanceMeters={remainingDistanceMeters}
        speedMetersPerSecond={speedMetersPerSecond}
        isVoiceSupported={voice.isSupported}
        isVoiceMuted={voice.isMuted}
        onToggleVoice={voice.toggleMute}
        onExit={onExit}
      />
    </div>
  );
}
