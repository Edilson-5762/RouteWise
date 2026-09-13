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
    pollUpdateCount: number;
    error: string | null;
  };
  navState: NavigationState;
}

function fmt(n: number | null, digits = 0): string {
  return n == null ? '—' : n.toFixed(digits);
}

// Resumo do trânsito da rota atual — a faixa vermelha/âmbar só desenha nível
// moderate/heavy/severe (ver `CONGESTION_DRAW_LEVELS` em navigationGeometry);
// esta linha existe para diferenciar, num teste de rua, "a Directions não
// mandou dado de trânsito" de "mandou, mas era tudo low/unknown" de "mandou
// moderate+ e a camada não desenhou" — sem isso não dava pra saber qual dos
// três estava acontecendo quando o usuário reportava "a linha não apareceu".
function summarizeCongestion(route: NavigationState['route']): string {
  if (!route) {
    return 'sem rota';
  }
  const levels = route.congestions;
  if (!levels || levels.length === 0) {
    return 'sem dados';
  }
  const counts = new Map<string, number>();
  for (const level of levels) {
    counts.set(level, (counts.get(level) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([level, count]) => `${level} ${count}`);
  return `${parts.join(', ')} (total ${levels.length})`;
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
    pollUpdateCount,
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
    ['GPS bruto', `${rawUpdateCount} (poll ${pollUpdateCount})`],
    ['GPS aceito', String(acceptedUpdateCount)],
    ['speed', `${fmt(speedMetersPerSecond, 1)} m/s`],
    ['heading', fmt(headingDegrees)],
    ['pos', position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : '—'],
    ['wakeLock API', wakeLockSupported],
    ['congestion', summarizeCongestion(navState.route)],
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
