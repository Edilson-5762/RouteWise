import type { Coordinates, NavigationState } from '../types';
import { haversineDistanceMeters } from '../utils/distance';

// Sobreposição de diagnóstico, visível só com `?debug=1` na URL (ver App.tsx).
// Serve para ler no próprio celular o que o GPS está entregando e por onde o
// fluxo de navegação está preso — NÃO faz parte da UI normal do app.
interface DebugPanelProps {
  geolocation: {
    position: Coordinates | null;
    // Leitura crua do GPS (sem o deadband de ruído) — ver useGeolocation. É o
    // que decide "dist→pino" abaixo, igual o reducer decide a chegada.
    rawPosition: Coordinates | null;
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

// "dist→pino": distância REAL (rawPosition quando disponível, senão position)
// até `destination` — o mesmo cálculo que o reducer usa pra decidir "cheguei".
// "rota→pino": folga ESTÁTICA entre o fim da geometria da rota e o pino — quem
// decide se o modo de aproximação (tracejado + "Continue X m") PODE ligar,
// independente de onde o usuário está (se essa folga já nasce > 25 m, o
// tracejado nunca vai aparecer nesse destino, não importa o quão perto o
// usuário chegue). Separar os dois evita depender da estimativa visual do
// usuário ("parei a uns 5-10 m") pra saber qual das duas travas está agindo.
function distanceToPin(position: Coordinates | null, destination: Coordinates | null): string {
  if (!position || !destination) {
    return '—';
  }
  return `${fmt(haversineDistanceMeters(position, destination), 1)} m`;
}

function routeEndToPin(route: NavigationState['route'], destination: Coordinates | null): string {
  if (!route || route.geometry.length === 0 || !destination) {
    return '—';
  }
  return `${fmt(haversineDistanceMeters(route.geometry[route.geometry.length - 1], destination), 1)} m`;
}

export function DebugPanel({ geolocation, navState }: DebugPanelProps) {
  const {
    position,
    rawPosition,
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
    ['rawPos', rawPosition ? `${rawPosition.lat.toFixed(5)}, ${rawPosition.lng.toFixed(5)}` : '—'],
    [
      'destino',
      navState.destination
        ? `${navState.destination.lat.toFixed(5)}, ${navState.destination.lng.toFixed(5)}`
        : '—',
    ],
    ['dist→pino', distanceToPin(rawPosition ?? position, navState.destination)],
    ['rota→pino', routeEndToPin(navState.route, navState.destination)],
    ['finalApproach', `${fmt(navState.finalApproachMeters, 1)} m`],
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
