import type { NavigationState } from '../types';

// Sobreposição de diagnóstico, visível só com `?debug=1` na URL (ver App.tsx).
// Serve para ler no próprio celular o que o GPS está entregando e por onde o
// fluxo de navegação está preso — NÃO faz parte da UI normal do app.
interface DebugPanelProps {
  geolocation: {
    position: { lat: number; lng: number } | null;
    speedMetersPerSecond: number | null;
    headingDegrees: number | null;
    accuracyMeters: number | null;
    highAccuracyActive: boolean;
    rawUpdateCount: number;
    acceptedUpdateCount: number;
    error: string | null;
  };
  navState: NavigationState;
}

function fmt(n: number | null, digits = 0): string {
  return n == null ? '—' : n.toFixed(digits);
}

export function DebugPanel({ geolocation, navState }: DebugPanelProps) {
  const {
    position,
    speedMetersPerSecond,
    headingDegrees,
    accuracyMeters,
    highAccuracyActive,
    rawUpdateCount,
    acceptedUpdateCount,
    error,
  } = geolocation;

  const wakeLockSupported =
    typeof navigator !== 'undefined' && 'wakeLock' in navigator ? 'sim' : 'NÃO';

  const rows: [string, string][] = [
    ['status', navState.status],
    ['deviated', String(navState.routeDeviated)],
    ['step', String(navState.currentStepIndex)],
    ['geo.error', error ? 'SIM' : 'não'],
    ['accuracy', `${fmt(accuracyMeters)} m`],
    ['hiAccuracy', highAccuracyActive ? 'sim' : 'NÃO (rede)'],
    ['GPS bruto', String(rawUpdateCount)],
    ['GPS aceito', String(acceptedUpdateCount)],
    ['speed', `${fmt(speedMetersPerSecond, 1)} m/s`],
    ['heading', fmt(headingDegrees)],
    ['pos', position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : '—'],
    ['wakeLock API', wakeLockSupported],
  ];

  return (
    <div
      role="status"
      aria-label="Painel de diagnóstico"
      className="pointer-events-none fixed left-1 top-1 z-50 rounded bg-black/80 px-2 py-1 font-mono text-[10px] leading-tight text-white"
    >
      {rows.map(([label, value]) => (
        <div key={label}>
          <span className="text-white/60">{label}:</span> {value}
        </div>
      ))}
    </div>
  );
}
