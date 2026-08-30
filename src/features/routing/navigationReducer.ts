import type { ArrivalSide, Coordinates, NavigationState, Route, TravelProfile } from '../../types';
import {
  bearingBetween,
  haversineDistanceMeters,
  polylineLengthMeters,
  projectOntoRoute,
  signedBearingDelta,
} from '../../utils/distance';

// Chegada pelo pino: raio pequeno, já que o critério de "fim da rota" abaixo
// cobre o caso comum de o GPS não bater exatamente no ponto do pino.
const ARRIVAL_THRESHOLD_METERS = 25;
// Chegada pelo fim da rota: quando já percorreu praticamente todo o trajeto
// (dentro de ARRIVAL_ALONG_SLACK_METERS do fim) E está de fato perto do pino
// (dentro de ARRIVAL_ALONG_MAX_METERS) — não depende de o fix cair no pino.
const ARRIVAL_ALONG_SLACK_METERS = 20;
const ARRIVAL_ALONG_MAX_METERS = 120;
// Desvio angular mínimo (em relação à direção de chegada) para chamar o destino
// de "à direita"/"à esquerda"; abaixo disso é "em frente".
const ARRIVAL_SIDE_MIN_DEGREES = 18;

const DEVIATION_THRESHOLD_METERS = 40;
// Abaixo deste valor o app considera que o usuário reencontrou a rota e sai do
// estado de desvio (parando o recálculo automático). É menor que o limite de
// desvio de propósito: a faixa entre os dois é uma zona morta que impede o
// estado de ficar oscilando quando a posição do GPS treme perto da linha.
const BACK_ON_ROUTE_THRESHOLD_METERS = 20;
// Quantos segmentos à frente/atrás do progresso atual a projeção considera.
const PROJECTION_WINDOW_BACK_SEGMENTS = 3;
const PROJECTION_WINDOW_AHEAD_SEGMENTS = 80;

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
  routeProgressIndex: 0,
  distanceToManeuverMeters: null,
  arrivalSide: 'ahead',
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
      return {
        ...state,
        route: action.route,
        status: 'routePlanned',
        currentStepIndex: 0,
        routeProgressIndex: 0,
        distanceToManeuverMeters: null,
      };

    case 'ROUTE_RECALCULATED':
      return {
        ...state,
        route: action.route,
        currentStepIndex: 0,
        routeDeviated: false,
        routeProgressIndex: 0,
        distanceToManeuverMeters: null,
      };

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
      return { ...state, status: 'navigating', routeDeviated: true, routeProgressIndex: 0 };

    case 'POSITION_UPDATED': {
      if (state.status !== 'navigating' || !state.route) {
        return { ...state, origin: action.position };
      }

      const { geometry, steps } = state.route;

      // Projeção do usuário sobre a rota, restrita a uma janela à frente do
      // progresso já registrado — assim uma rota que passa perto de si mesma
      // (ruas paralelas num grid) não "gruda" o ponto num trecho distante, o
      // que gerava desvio falso e pulos de passo.
      const projection = projectOntoRoute(action.position, geometry, {
        fromIndex: state.routeProgressIndex - PROJECTION_WINDOW_BACK_SEGMENTS,
        toIndex: state.routeProgressIndex + PROJECTION_WINDOW_AHEAD_SEGMENTS,
      });
      const routeProgressIndex = Math.max(state.routeProgressIndex, projection.segmentIndex);

      const totalGeometryMeters = polylineLengthMeters(geometry);
      const progressFraction =
        totalGeometryMeters > 0 ? projection.alongMeters / totalGeometryMeters : 0;
      // Escalado para os metros dos `steps` (a geometria é decimada, então seu
      // comprimento difere um pouco de `route.distanceMeters`).
      const alongRouteMeters = progressFraction * state.route.distanceMeters;

      // Passo atual pela distância JÁ PERCORRIDA ao longo da rota (não por uma
      // razão grosseira de índice de vértice, que fazia o banner/voz mudarem
      // muito antes da manobra). A manobra do passo i acontece no INÍCIO dele,
      // então só avançamos para i+1 depois de passar do fim do passo i.
      let stepIndex = 0;
      let stepStartMeters = 0;
      for (let i = 0; i < steps.length - 1; i++) {
        stepStartMeters += steps[i].distanceMeters;
        if (alongRouteMeters >= stepStartMeters) {
          stepIndex = i + 1;
        } else {
          break;
        }
      }
      const currentStepIndex = Math.max(stepIndex, state.currentStepIndex);

      // Metros que ainda faltam até a próxima manobra (fim do passo atual).
      let currentStepEndMeters = 0;
      for (let i = 0; i <= currentStepIndex && i < steps.length; i++) {
        currentStepEndMeters += steps[i].distanceMeters;
      }
      const distanceToManeuverMeters = Math.max(0, currentStepEndMeters - alongRouteMeters);

      // Chegada: perto do pino, OU praticamente no fim da rota E de fato na
      // região do destino (esse segundo critério não exige que o GPS bata no
      // ponto exato do pino, que costuma cair no meio da rua).
      const distanceToDestination = state.destination
        ? haversineDistanceMeters(action.position, state.destination)
        : Infinity;
      const arrived =
        distanceToDestination < ARRIVAL_THRESHOLD_METERS ||
        (distanceToDestination < ARRIVAL_ALONG_MAX_METERS &&
          alongRouteMeters >= state.route.distanceMeters - ARRIVAL_ALONG_SLACK_METERS);

      if (arrived) {
        const travelBearing = state.origin ? bearingBetween(state.origin, action.position) : null;
        const destinationBearing = state.destination
          ? bearingBetween(action.position, state.destination)
          : null;
        let arrivalSide: ArrivalSide = 'ahead';
        if (travelBearing !== null && destinationBearing !== null) {
          const relative = signedBearingDelta(travelBearing, destinationBearing);
          if (relative > ARRIVAL_SIDE_MIN_DEGREES) {
            arrivalSide = 'right';
          } else if (relative < -ARRIVAL_SIDE_MIN_DEGREES) {
            arrivalSide = 'left';
          }
        }
        return { ...state, origin: action.position, status: 'arrived', arrivalSide };
      }

      let routeDeviated = state.routeDeviated;
      if (projection.distanceMeters > DEVIATION_THRESHOLD_METERS) {
        routeDeviated = true;
      } else if (projection.distanceMeters < BACK_ON_ROUTE_THRESHOLD_METERS) {
        routeDeviated = false;
      }

      return {
        ...state,
        origin: action.position,
        currentStepIndex,
        distanceToManeuverMeters,
        routeProgressIndex,
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
