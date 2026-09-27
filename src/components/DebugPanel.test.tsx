import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DebugPanel } from './DebugPanel';
import { initialNavigationState } from '../features/routing/navigationReducer';
import { haversineDistanceMeters } from '../utils/distance';
import type { Coordinates, NavigationState, Route } from '../types';

// O painel separa rótulo (<span>) e valor (texto solto), então `getByText`
// não acha os dois juntos por padrão — casa pelo texto INTEIRO da linha.
function getRow(label: string, value: string) {
  return screen.getByText(
    (_content, element) =>
      element?.tagName === 'DIV' && element.textContent === `${label}: ${value}`,
  );
}

function metersLabel(a: Coordinates, b: Coordinates): string {
  return `${haversineDistanceMeters(a, b).toFixed(1)} m`;
}

const baseGeolocation = {
  position: null,
  rawPosition: null,
  speedMetersPerSecond: null,
  headingDegrees: null,
  accuracyMeters: null,
  highAccuracyActive: true,
  rawUpdateCount: 0,
  acceptedUpdateCount: 0,
  pollUpdateCount: 0,
  error: null,
};

const routeWithCongestion: Route = {
  geometry: [],
  steps: [],
  distanceMeters: 1000,
  durationSeconds: 60,
  congestions: ['low', 'low', 'moderate', 'heavy', 'heavy', 'severe', 'unknown'],
};

describe('DebugPanel', () => {
  it('mostra a contagem de trânsito por nível quando a rota tem congestions', () => {
    const navState: NavigationState = { ...initialNavigationState, route: routeWithCongestion };
    render(<DebugPanel geolocation={baseGeolocation} navState={navState} />);

    expect(screen.getByText(/moderate 1/)).toBeInTheDocument();
    expect(screen.getByText(/heavy 2/)).toBeInTheDocument();
    expect(screen.getByText(/severe 1/)).toBeInTheDocument();
    expect(screen.getByText(/low 2/)).toBeInTheDocument();
    expect(screen.getByText(/total 7/)).toBeInTheDocument();
  });

  it('mostra "sem dados" quando a rota não tem congestions (perfil sem trânsito ou API não devolveu)', () => {
    const navState: NavigationState = {
      ...initialNavigationState,
      route: { geometry: [], steps: [], distanceMeters: 1000, durationSeconds: 60 },
    };
    render(<DebugPanel geolocation={baseGeolocation} navState={navState} />);

    expect(screen.getByText(/sem dados/)).toBeInTheDocument();
  });

  it('mostra "sem rota" quando ainda não há rota', () => {
    render(<DebugPanel geolocation={baseGeolocation} navState={initialNavigationState} />);
    expect(screen.getByText(/sem rota/)).toBeInTheDocument();
  });

  // Linhas pra diagnosticar por que "chegou"/o tracejado não aparecem sem
  // precisar confiar na estimativa visual do usuário ("parei a uns 5-10 m") —
  // dá pra ver a distância REAL calculada pelo app e a folga ESTÁTICA entre o
  // fim da rota e o pino (quem decide se o modo de aproximação pode ligar,
  // independente de onde o usuário está).
  it('mostra a distância crua até o pino, usando rawPosition quando disponível', () => {
    const destination = { lat: 0, lng: 0 };
    const rawPosition = { lat: 0, lng: 0.00005 }; // ~5,6 m (crua/fresca)
    const navState: NavigationState = { ...initialNavigationState, destination };
    render(
      <DebugPanel
        geolocation={{
          ...baseGeolocation,
          position: { lat: 0, lng: 0.001 }, // ~111 m (filtrada/desatualizada) — ignorada
          rawPosition,
        }}
        navState={navState}
      />,
    );

    expect(getRow('dist→pino', metersLabel(rawPosition, destination))).toBeInTheDocument();
  });

  it('mostra a folga estática entre o fim da rota e o pino', () => {
    const destination = { lat: 0, lng: 0.0002 };
    const routeEnd = { lat: 0, lng: 0.0001 };
    const navState: NavigationState = {
      ...initialNavigationState,
      destination,
      route: {
        geometry: [{ lat: 0, lng: 0 }, routeEnd],
        steps: [],
        distanceMeters: 11,
        durationSeconds: 5,
      },
    };
    render(<DebugPanel geolocation={baseGeolocation} navState={navState} />);

    expect(getRow('rota→pino', metersLabel(routeEnd, destination))).toBeInTheDocument();
  });

  it('sem destino, mostra "—" nas distâncias ao pino', () => {
    render(<DebugPanel geolocation={baseGeolocation} navState={initialNavigationState} />);
    expect(getRow('dist→pino', '—')).toBeInTheDocument();
    expect(getRow('rota→pino', '—')).toBeInTheDocument();
  });
});
