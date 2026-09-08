import type { ArrivalSide, Coordinates, NavigationState, Route, TravelProfile } from '../../types';
import {
  bearingBetween,
  haversineDistanceMeters,
  polylineLengthMeters,
  projectOntoRoute,
  signedBearingDelta,
} from '../../utils/distance';

// Chegada só quando o veículo está DE FATO em cima do pino: o ícone do carro e
// o pino vermelho praticamente colados na tela. Nada de "finalizou no meio da
// rua" — enquanto não encostar, o trecho final continua guiando (linha
// tracejada + "Continue X m até o destino").
//  - <= AT_PIN: chegou, mesmo em movimento (passou por cima do pino).
//  - <= NEAR_PIN_STOPPED: chegou se PAROU ali (estacionou o mais perto que dava).
const ARRIVAL_AT_PIN_METERS = 8;
const ARRIVAL_NEAR_PIN_STOPPED_METERS = 25;
// Velocidade (m/s) abaixo da qual o veículo conta como parado. Velocidade
// desconhecida (campo ausente) também conta como parado.
const ARRIVAL_STOPPED_SPEED_MPS = 1.5;
// Quão perto do fim da rota já conta como "rota concluída" (entra no trecho
// final se o pino ainda estiver adiante).
const ARRIVAL_ALONG_SLACK_METERS = 20;
// Modo "trecho final" (tracejado do fim da rota até o pino + contagem
// "Continue X m até o destino"): liga quando a rota termina e o pino está DENTRO
// de FINAL_APPROACH_TRIGGER_METERS do fim da rota — "cheguei num lugar e o pino
// está a <= 25 m". Passou de 25 m NÃO liga (uma reta tracejada cruzando meio
// quarteirão até um pino longe engana mais do que ajuda). Abaixo de
// FINAL_APPROACH_MIN_GAP_METERS também não liga: a rota já termina no destino.
const FINAL_APPROACH_MIN_GAP_METERS = 3;
const FINAL_APPROACH_TRIGGER_METERS = 25;
// Desvio angular mínimo (em relação à direção de chegada) para chamar o destino
// de "à direita"/"à esquerda"; abaixo disso é "em frente".
const ARRIVAL_SIDE_MIN_DEGREES = 18;

// O painel de manobra e a voz medem a distância ATÉ a próxima manobra a partir
// de um ponto ANTECIPADO ~1 s à frente na velocidade do GPS — igual ao carro do
// desenho (dead-reckoning da câmera). Sem isso o painel/voz ficavam ~1 s /
// dezenas de metros atrás do carro na tela. Só o painel/voz usam este ponto
// antecipado; a detecção de desvio e de chegada seguem pela posição crua.
const PANEL_LEAD_SECONDS = 1.1;
const PANEL_LEAD_MAX_METERS = 35;

const DEVIATION_THRESHOLD_METERS = 40;
// Abaixo deste valor o app considera que o usuário reencontrou a rota e sai do
// estado de desvio (parando o recálculo automático). É menor que o limite de
// desvio de propósito: a faixa entre os dois é uma zona morta que impede o
// estado de ficar oscilando quando a posição do GPS treme perto da linha.
const BACK_ON_ROUTE_THRESHOLD_METERS = 20;
// Quantos segmentos à frente/atrás do progresso atual a projeção considera.
// O "atrás" recua bastante (não só 3) para a projeção conseguir se recuperar
// quando um fix ruim de GPS empurra o progresso à frente — senão a manobra/voz
// ficavam "atrasadas" (achando que faltava mais do que faltava).
const PROJECTION_WINDOW_BACK_SEGMENTS = 15;
const PROJECTION_WINDOW_AHEAD_SEGMENTS = 60;
// Banda de DISTÂNCIA AO LONGO da rota para a projeção (além da janela de
// segmentos): numa rotatória/retorno a geometria dobra sobre si mesma a poucos
// metros de distância, mas dezenas de metros à frente ao longo da rota — sem
// esta banda um fix ruidoso "pulava" para lá e o progresso (monotônico) travava
// no salto: a linha da rota sumia e o veículo teleportava para dentro do
// retorno/rotatória. O teto à frente acompanha a velocidade (fix a cada ~3 s no
// pior caso) com uma folga; atrás é fixo e curto.
const PROGRESS_BAND_MAX_FIX_GAP_SECONDS = 3;
const PROGRESS_BAND_AHEAD_MARGIN_METERS = 20;
const PROGRESS_BAND_MIN_AHEAD_METERS = 25;
const PROGRESS_BAND_MAX_AHEAD_METERS = 140;
const PROGRESS_BAND_BEHIND_METERS = 25;
// Quantos segmentos por tick o progresso pode RECUAR (auto-recuperação de um
// fix ruim); nunca abaixo do segmento realmente projetado.
const PROGRESS_MAX_RECEDE_SEGMENTS = 12;

export type NavigationAction =
  | { type: 'SET_ORIGIN'; origin: Coordinates }
  | { type: 'SET_DESTINATION'; destination: Coordinates }
  | { type: 'SET_TRAVEL_PROFILE'; profile: TravelProfile }
  | { type: 'ROUTE_PLANNED'; route: Route }
  | { type: 'ROUTE_RECALCULATED'; route: Route }
  | { type: 'ROUTE_DEVIATED' }
  | { type: 'START_NAVIGATION' }
  | { type: 'POSITION_UPDATED'; position: Coordinates; speedMetersPerSecond?: number | null }
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
  routeAlongMeters: 0,
  finalApproachMeters: null,
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
        routeAlongMeters: 0,
        finalApproachMeters: null,
      };

    case 'ROUTE_RECALCULATED':
      return {
        ...state,
        route: action.route,
        currentStepIndex: 0,
        routeDeviated: false,
        routeProgressIndex: 0,
        distanceToManeuverMeters: null,
        routeAlongMeters: 0,
        finalApproachMeters: null,
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
      const bandAheadMeters = Math.min(
        PROGRESS_BAND_MAX_AHEAD_METERS,
        Math.max(
          PROGRESS_BAND_MIN_AHEAD_METERS,
          Math.max(0, action.speedMetersPerSecond ?? 0) * PROGRESS_BAND_MAX_FIX_GAP_SECONDS +
            PROGRESS_BAND_AHEAD_MARGIN_METERS,
        ),
      );
      const projection = projectOntoRoute(action.position, geometry, {
        fromIndex: state.routeProgressIndex - PROJECTION_WINDOW_BACK_SEGMENTS,
        toIndex: state.routeProgressIndex + PROJECTION_WINDOW_AHEAD_SEGMENTS,
        aroundAlongMeters: state.routeAlongMeters > 0 ? state.routeAlongMeters : undefined,
        maxAheadMeters: bandAheadMeters,
        maxBehindMeters: PROGRESS_BAND_BEHIND_METERS,
      });
      // Segue o segmento projetado, mas só deixa RECUAR
      // PROGRESS_MAX_RECEDE_SEGMENTS por tick — auto-recuperação de um fix ruim
      // sem "voltar" de uma vez para um trecho anterior fisicamente próximo.
      const routeProgressIndex = Math.max(
        projection.segmentIndex,
        state.routeProgressIndex - PROGRESS_MAX_RECEDE_SEGMENTS,
      );

      const totalGeometryMeters = polylineLengthMeters(geometry);
      const progressFraction =
        totalGeometryMeters > 0 ? projection.alongMeters / totalGeometryMeters : 0;
      // Escalado para os metros dos `steps` (a geometria é decimada, então seu
      // comprimento difere um pouco de `route.distanceMeters`).
      const alongRouteMeters = progressFraction * state.route.distanceMeters;

      // Ponto ANTECIPADO para o painel/voz (ver PANEL_LEAD_SECONDS): ~1 s à
      // frente na velocidade medida, limitado. Parado (velocidade ~0) = sem
      // antecipação, então o painel não "adianta" no semáforo.
      const panelLeadMeters = Math.min(
        Math.max(0, action.speedMetersPerSecond ?? 0) * PANEL_LEAD_SECONDS,
        PANEL_LEAD_MAX_METERS,
      );
      const guidanceAlongMeters = Math.min(
        alongRouteMeters + panelLeadMeters,
        state.route.distanceMeters,
      );

      // Passo atual pela distância JÁ PERCORRIDA ao longo da rota (não por uma
      // razão grosseira de índice de vértice, que fazia o banner/voz mudarem
      // muito antes da manobra). A manobra do passo i acontece no INÍCIO dele,
      // então só avançamos para i+1 depois de passar do fim do passo i. Usa o
      // ponto antecipado para o painel trocar de passo junto com o carro.
      let stepIndex = 0;
      let stepStartMeters = 0;
      for (let i = 0; i < steps.length - 1; i++) {
        stepStartMeters += steps[i].distanceMeters;
        if (guidanceAlongMeters >= stepStartMeters) {
          stepIndex = i + 1;
        } else {
          break;
        }
      }
      const currentStepIndex = Math.max(stepIndex, state.currentStepIndex);

      // Metros que ainda faltam até a próxima manobra (fim do passo atual),
      // também a partir do ponto antecipado.
      let currentStepEndMeters = 0;
      for (let i = 0; i <= currentStepIndex && i < steps.length; i++) {
        currentStepEndMeters += steps[i].distanceMeters;
      }
      const distanceToManeuverMeters = Math.max(0, currentStepEndMeters - guidanceAlongMeters);

      // Chegada só quando o carro está DE FATO em cima do pino (ícones colados
      // na tela): <= AT_PIN em movimento, ou <= NEAR_PIN se parou ali. Não há
      // mais "chegou porque a linha azul acabou" — o trecho final guia até o
      // pino.
      const distanceToDestination = state.destination
        ? haversineDistanceMeters(action.position, state.destination)
        : Infinity;
      const stoppedOrUnknownSpeed =
        (action.speedMetersPerSecond ?? 0) <= ARRIVAL_STOPPED_SPEED_MPS;
      const arrived =
        distanceToDestination <= ARRIVAL_AT_PIN_METERS ||
        (distanceToDestination <= ARRIVAL_NEAR_PIN_STOPPED_METERS && stoppedOrUnknownSpeed);

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
        return {
          ...state,
          origin: action.position,
          status: 'arrived',
          arrivalSide,
          finalApproachMeters: null,
        };
      }

      let routeDeviated = state.routeDeviated;
      if (projection.distanceMeters > DEVIATION_THRESHOLD_METERS) {
        routeDeviated = true;
      } else if (projection.distanceMeters < BACK_ON_ROUTE_THRESHOLD_METERS) {
        routeDeviated = false;
      }

      // Trecho final: a rota (na via) acabou e o pino ficou de 3 a 25 m do fim
      // dela → segue a distância em linha reta até o pino ("Continue X m até o
      // destino" + tracejado + ícone andando pelo tracejado). Continua até
      // `arrived`. Folga > 25 m: não liga (reta tracejada longa engana).
      const routeComplete =
        alongRouteMeters >= state.route.distanceMeters - ARRIVAL_ALONG_SLACK_METERS;
      const routeEndPin =
        state.destination && geometry.length > 0
          ? haversineDistanceMeters(geometry[geometry.length - 1], state.destination)
          : 0;
      const finalApproachMeters =
        routeComplete &&
        routeEndPin >= FINAL_APPROACH_MIN_GAP_METERS &&
        routeEndPin <= FINAL_APPROACH_TRIGGER_METERS
          ? distanceToDestination
          : null;

      return {
        ...state,
        origin: action.position,
        currentStepIndex,
        distanceToManeuverMeters,
        routeProgressIndex,
        routeAlongMeters: projection.alongMeters,
        finalApproachMeters,
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
