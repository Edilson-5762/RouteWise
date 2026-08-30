import type { Coordinates, NavigationState, Route, TravelProfile } from '../../types';
import { findNearestPointIndex, haversineDistanceMeters } from '../../utils/distance';

const ARRIVAL_THRESHOLD_METERS = 30;
const DEVIATION_THRESHOLD_METERS = 50;
// Abaixo deste valor o app considera que o usuário reencontrou a rota e sai do
// estado de desvio (parando o recálculo automático). É menor que o limite de
// desvio de propósito: a faixa entre os dois é uma zona morta que impede o
// estado de ficar oscilando quando a posição do GPS treme perto da linha.
const BACK_ON_ROUTE_THRESHOLD_METERS = 25;

export type NavigationAction =
  | { type: 'SET_ORIGIN'; origin: Coordinates }
  | { type: 'SET_DESTINATION'; destination: Coordinates }
  | { type: 'SET_TRAVEL_PROFILE'; profile: TravelProfile }
  | { type: 'ROUTE_PLANNED'; route: Route }
  | { type: 'ROUTE_RECALCULATED'; route: Route }
  | { type: 'ROUTE_DEVIATED' }
  | { type: 'START_NAVIGATION' }
  | { type: 'POSITION_UPDATED'; position: Coordinates }
  | { type: 'RESET' };

export const initialNavigationState: NavigationState = {
  status: 'idle',
  origin: null,
  destination: null,
  route: null,
  currentStepIndex: 0,
  travelProfile: 'driving',
  routeDeviated: false,
};

export function navigationReducer(
  state: NavigationState,
  action: NavigationAction,
): NavigationState {
  switch (action.type) {
    case 'SET_ORIGIN':
      return { ...state, origin: action.origin };

    case 'SET_DESTINATION':
      return { ...state, destination: action.destination, status: 'idle', route: null };

    case 'SET_TRAVEL_PROFILE':
      return { ...state, travelProfile: action.profile };

    case 'ROUTE_PLANNED':
      return { ...state, route: action.route, status: 'routePlanned', currentStepIndex: 0 };

    case 'ROUTE_RECALCULATED':
      return { ...state, route: action.route, currentStepIndex: 0, routeDeviated: false };

    case 'ROUTE_DEVIATED':
      return { ...state, routeDeviated: true };

    case 'START_NAVIGATION':
      if (state.status !== 'routePlanned' || !state.route) {
        return state;
      }
      // `state.route` foi calculado a partir do fix de GPS de quando o
      // destino foi escolhido, que já pode estar um pouco desatualizado
      // (usuário se moveu enquanto olhava o cartão de destino, ou o fix
      // inicial tinha imprecisão) — sem isso a seta e a linha nasciam um
      // pouco à frente/atrás do veículo em vez de exatamente na posição
      // atual. Forçar routeDeviated aqui reaproveita o mecanismo de
      // recálculo por desvio (já testado) para buscar uma rota fresca a
      // partir da posição atual assim que a navegação começa.
      return { ...state, status: 'navigating', routeDeviated: true };

    case 'POSITION_UPDATED': {
      if (state.status !== 'navigating' || !state.route) {
        return { ...state, origin: action.position };
      }

      if (
        state.destination &&
        haversineDistanceMeters(action.position, state.destination) < ARRIVAL_THRESHOLD_METERS
      ) {
        return { ...state, origin: action.position, status: 'arrived' };
      }

      const nearestIndex = findNearestPointIndex(action.position, state.route.geometry);
      const distanceToRoute = haversineDistanceMeters(
        action.position,
        state.route.geometry[nearestIndex],
      );
      const stepCount = state.route.steps.length;
      const progressRatio = nearestIndex / Math.max(state.route.geometry.length - 1, 1);
      const nextStepIndex = Math.min(Math.floor(progressRatio * stepCount), stepCount - 1);

      let routeDeviated = state.routeDeviated;
      if (distanceToRoute > DEVIATION_THRESHOLD_METERS) {
        routeDeviated = true;
      } else if (distanceToRoute < BACK_ON_ROUTE_THRESHOLD_METERS) {
        routeDeviated = false;
      }

      return {
        ...state,
        origin: action.position,
        currentStepIndex: Math.max(nextStepIndex, state.currentStepIndex),
        routeDeviated,
      };
    }

    case 'RESET':
      // Mantém `origin` (posição de GPS já conhecida) em vez de zerá-la: o
      // efeito em App.tsx que repõe `origin` a partir do GPS só reage a uma
      // MUDANÇA de referência em `geolocation.position`, e essa referência
      // fica parada enquanto o dispositivo não se move (deadband de ruído em
      // useGeolocation). Zerar `origin` aqui a deixava presa em `null` até o
      // próximo movimento real — sem origem, o efeito que dispara
      // `planRoute` nunca roda, então escolher um novo destino após sair da
      // navegação não fazia nada.
      return { ...initialNavigationState, origin: state.origin };

    default:
      return state;
  }
}
