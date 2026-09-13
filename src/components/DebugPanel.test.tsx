import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DebugPanel } from './DebugPanel';
import { initialNavigationState } from '../features/routing/navigationReducer';
import type { NavigationState, Route } from '../types';

const baseGeolocation = {
  position: null,
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
});
