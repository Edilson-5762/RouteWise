import { describe, it, expect } from 'vitest';
import { navigationReducer, initialNavigationState } from './navigationReducer';
import type { Route } from '../../types';

const sampleRoute: Route = {
  geometry: [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 0, lng: 2 },
    { lat: 0, lng: 3 },
  ],
  steps: [
    {
      instruction: 'Siga em frente',
      distanceMeters: 1000,
      durationSeconds: 60,
      maneuverLocation: { lat: 0, lng: 0 },
      maneuverType: 'turn',
      maneuverModifier: null,
    },
    {
      instruction: 'Vire à direita',
      distanceMeters: 1000,
      durationSeconds: 60,
      maneuverLocation: { lat: 0, lng: 2 },
      maneuverType: 'turn',
      maneuverModifier: null,
    },
  ],
  distanceMeters: 2000,
  durationSeconds: 120,
};

describe('navigationReducer', () => {
  it('vai de idle para routePlanned quando uma rota é planejada', () => {
    const state = navigationReducer(initialNavigationState, {
      type: 'ROUTE_PLANNED',
      route: sampleRoute,
    });
    expect(state.status).toBe('routePlanned');
    expect(state.currentStepIndex).toBe(0);
  });

  it('não inicia a navegação sem uma rota planejada', () => {
    const state = navigationReducer(initialNavigationState, { type: 'START_NAVIGATION' });
    expect(state.status).toBe('idle');
  });

  it('inicia a navegação a partir de routePlanned', () => {
    const planned = navigationReducer(initialNavigationState, {
      type: 'ROUTE_PLANNED',
      route: sampleRoute,
    });
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });
    expect(navigating.status).toBe('navigating');
  });

  it('avança o passo atual conforme a posição se move ao longo da rota', () => {
    const planned = navigationReducer(initialNavigationState, {
      type: 'ROUTE_PLANNED',
      route: sampleRoute,
    });
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });

    const pertoDoDestino = navigationReducer(navigating, {
      type: 'POSITION_UPDATED',
      position: { lat: 0, lng: 2.9 },
    });

    expect(pertoDoDestino.currentStepIndex).toBe(1);
  });

  it('nunca move o índice do passo para trás', () => {
    const planned = navigationReducer(initialNavigationState, {
      type: 'ROUTE_PLANNED',
      route: sampleRoute,
    });
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });
    const avancado = navigationReducer(navigating, {
      type: 'POSITION_UPDATED',
      position: { lat: 0, lng: 2.9 },
    });
    const voltouAtras = navigationReducer(avancado, {
      type: 'POSITION_UPDATED',
      position: { lat: 0, lng: 0.1 },
    });

    expect(voltouAtras.currentStepIndex).toBe(1);
  });

  it('transiciona para arrived quando a posição fica a menos de 30m do destino', () => {
    const routeToClose: Route = {
      ...sampleRoute,
      geometry: [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.0002 },
      ],
    };
    const planned = navigationReducer(
      { ...initialNavigationState, destination: { lat: 0, lng: 0.0002 } },
      { type: 'ROUTE_PLANNED', route: routeToClose },
    );
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });

    const chegou = navigationReducer(navigating, {
      type: 'POSITION_UPDATED',
      position: { lat: 0, lng: 0.0002 },
    });

    expect(chegou.status).toBe('arrived');
  });

  it('marca routeDeviated quando a posição fica a mais de 50m da rota', () => {
    const planned = navigationReducer(initialNavigationState, {
      type: 'ROUTE_PLANNED',
      route: sampleRoute,
    });
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });

    const desviado = navigationReducer(navigating, {
      type: 'POSITION_UPDATED',
      position: { lat: 0.01, lng: 1 },
    });

    expect(desviado.routeDeviated).toBe(true);
  });

  it('limpa routeDeviated quando uma rota recalculada chega', () => {
    const planned = navigationReducer(initialNavigationState, {
      type: 'ROUTE_PLANNED',
      route: sampleRoute,
    });
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });
    const desviado = navigationReducer(navigating, {
      type: 'POSITION_UPDATED',
      position: { lat: 0.01, lng: 1 },
    });

    const recalculada = navigationReducer(desviado, {
      type: 'ROUTE_RECALCULATED',
      route: sampleRoute,
    });

    expect(recalculada.routeDeviated).toBe(false);
    expect(recalculada.route).toBe(sampleRoute);
    expect(recalculada.currentStepIndex).toBe(0);
  });

  it('RESET mantém a origem (GPS) conhecida em vez de zerá-la', () => {
    // Sem isso, sair da navegação (botão "X") zera `origin` para null; como o
    // efeito em App.tsx que repõe `origin` só reage a uma MUDANÇA de
    // referência em `geolocation.position` (não a `state.origin` em si), e o
    // hook de geolocalização mantém a mesma referência enquanto o
    // dispositivo está parado (deadband de ruído), `origin` ficava preso em
    // null indefinidamente — e sem origem, o efeito que chama `planRoute`
    // nunca dispara, então escolher um novo destino não fazia nada
    // (sintoma relatado: "depois do X, não consigo pesquisar de novo").
    const withOrigin = navigationReducer(initialNavigationState, {
      type: 'SET_ORIGIN',
      origin: { lat: -15.79, lng: -47.88 },
    });
    const planned = navigationReducer(withOrigin, { type: 'ROUTE_PLANNED', route: sampleRoute });
    const navigating = navigationReducer(planned, { type: 'START_NAVIGATION' });

    const reset = navigationReducer(navigating, { type: 'RESET' });

    expect(reset.origin).toEqual({ lat: -15.79, lng: -47.88 });
    expect(reset.destination).toBeNull();
    expect(reset.route).toBeNull();
    expect(reset.status).toBe('idle');
  });
});
