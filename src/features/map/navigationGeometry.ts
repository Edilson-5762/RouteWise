import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { CongestionLevel, Coordinates, Route } from '../../types';
import {
  bearingBetween,
  findNearestPointIndex,
  foldClampAheadMeters,
  haversineDistanceMeters,
  locateAlongRoute,
  polylineLengthMeters,
  projectOntoRoute,
  type RouteProjection,
} from '../../utils/distance';

// Reexportado daqui por compatibilidade: a implementação canônica agora vive em
// `utils/distance` (também usada pelo navigationReducer, que não deve depender
// da camada de mapa).
export { bearingBetween, foldClampAheadMeters };

// Trecho da rota JÁ PERCORRIDO que a linha ainda desenha, atrás do ponto
// projetado do veículo — só o suficiente para a linha encostar no ícone fixo do
// carro, sem deixar "rastro" para trás. (Era 40 m, o que marcava um pedaço
// grande da rua atrás do veículo; a linha não some mais nas curvas porque a
// projeção agora não salta — ver janela estreita em projectVehicleOntoRoute.)
const NAV_LINE_BACKTRACK_METERS = 6;

// A seta de manobra (linha branca + ponta) sobre a linha azul aparece já a esta
// distância da manobra e acompanha até passar dela — reforça "vire por aqui".
const MANEUVER_ARROW_VISIBLE_WITHIN_METERS = 150;
// Quanto da rota, ANTES e DEPOIS do ponto da manobra, a linha branca cobre — é o
// que dá a ela o "formato da curva".
const MANEUVER_ARROW_LEAD_IN_METERS = 34;
const MANEUVER_ARROW_LEAD_OUT_METERS = 26;
// Depois que a manobra ficou este tanto para trás, a seta some.
const MANEUVER_ARROW_HIDE_PAST_METERS = 22;
// Recuo, a partir da ponta, para tirar o azimute da PONTA da seta (direção de
// saída da curva).
const MANEUVER_ARROW_HEAD_BEARING_BACK_METERS = 8;
// Distância mínima de segmento para tirar um azimute confiável (evita ruído de
// vértices coincidentes).
const MIN_SEGMENT_METERS_FOR_BEARING = 3;

// Tipos de manobra que ganham a seta branca em cima da linha: curvas,
// rotatórias, bifurcações, entradas/saídas de via — ou seja, tudo que faz o
// condutor mudar de direção. Seguir reto / partir / chegar não ganham.
const ARROW_TURNING_MANEUVER_TYPES = new Set([
  'turn',
  'roundabout',
  'rotary',
  'roundabout turn',
  'exit roundabout',
  'exit rotary',
  'fork',
  'merge',
  'on ramp',
  'off ramp',
  'end of road',
]);

// Tipos de manobra de ENTRADA em rotatória (não a saída). Quando o passo atual
// — ou o próximo — é um destes, a seta traça o balão INTEIRO (entrada→saída) e
// fica na tela até o índice passar do balão, em vez de trocar de alvo para a
// "próxima manobra" no meio do balão (o `currentStepIndex` avança ~1 s antes da
// entrada, pela antecipação do reducer, e a seta sumia bem na hora H).
const ROUNDABOUT_ENTER_MANEUVER_TYPES = new Set(['roundabout', 'rotary', 'roundabout turn']);

function isTurningManeuver(maneuverType: string, maneuverModifier: string | null): boolean {
  const type = (maneuverType ?? '').toLowerCase();
  if (ARROW_TURNING_MANEUVER_TYPES.has(type)) {
    return true;
  }
  // "continue"/"new name"/"notification" só contam quando trazem um modificador
  // de curva de verdade (ex.: "slight left") — reto não.
  if (type === 'continue' || type === 'new name' || type === 'notification') {
    const modifier = (maneuverModifier ?? '').toLowerCase();
    return modifier !== '' && modifier !== 'straight';
  }
  return false;
}

// ~1 cm — dedup de pontos praticamente coincidentes.
const COINCIDENT_EPSILON_DEGREES = 1e-7;

function lineFeature(coordinates: [number, number][]): Feature<LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  };
}

const EMPTY_POINT_COLLECTION: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

function dedupeConsecutive(coordinates: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const c of coordinates) {
    const last = out[out.length - 1];
    if (
      !last ||
      Math.abs(last[0] - c[0]) >= COINCIDENT_EPSILON_DEGREES ||
      Math.abs(last[1] - c[1]) >= COINCIDENT_EPSILON_DEGREES
    ) {
      out.push(c);
    }
  }
  return out;
}

// Linha da rota para o MODO PLANEJAMENTO: mostra o trajeto inteiro e emenda a
// origem real do usuário no começo (a Directions API "gruda" a origem na via
// mais próxima; sem a emenda a linha nasce na pista com o puck flutuando ao
// lado). Durante a navegação NÃO se usa isto — ver buildNavigationRouteGeojson.
export function buildRouteGeojson(
  route: Route,
  connectorOrigin: Coordinates | null,
): Feature<LineString> {
  const coordinates: [number, number][] = route.geometry.map((point) => [point.lng, point.lat]);
  const [firstLng, firstLat] = coordinates[0] ?? [];
  const isAlreadyAtOrigin =
    connectorOrigin !== null &&
    firstLng === connectorOrigin.lng &&
    firstLat === connectorOrigin.lat;

  if (connectorOrigin && !isAlreadyAtOrigin) {
    coordinates.unshift([connectorOrigin.lng, connectorOrigin.lat]);
  }

  return lineFeature(coordinates);
}

// Folga (fim-da-rota→pino) em que o tracejado faz sentido: de 3 m (abaixo é um
// "pontinho" degenerado) a 25 m (acima, uma reta longa cruzando o quarteirão
// engana). Precisa bater com FINAL_APPROACH_MIN_GAP_METERS/_TRIGGER_METERS no
// reducer — quem de fato liga/desliga o modo é `active` (finalApproachMeters).
export const DESTINATION_CONNECTOR_MIN_GAP_METERS = 3;
export const DESTINATION_CONNECTOR_MAX_GAP_METERS = 25;

// "Trecho final": a Directions termina na via, mas o pino pode ficar dezenas de
// metros adentro (rampa, estacionamento, dentro do quarteirão). Este é um
// segmento reto do FIM da geometria da rota até o pino, desenhado tracejado —
// "continue daqui até o destino". Só aparece quando `active` (o app está no modo
// de aproximação: rota concluída + usuário a <= 25 m do pino). Vazio também sem
// rota/pino ou com folga pequena demais para valer um traço.
export function buildDestinationConnectorGeojson(
  route: Route | null,
  destination: Coordinates | null,
  active = true,
): FeatureCollection {
  if (!active || !route || !destination || route.geometry.length === 0) {
    return EMPTY_POINT_COLLECTION;
  }
  const end = route.geometry[route.geometry.length - 1];
  const gap = haversineDistanceMeters(end, destination);
  if (gap < DESTINATION_CONNECTOR_MIN_GAP_METERS || gap > DESTINATION_CONNECTOR_MAX_GAP_METERS) {
    return EMPTY_POINT_COLLECTION;
  }
  return {
    type: 'FeatureCollection',
    features: [
      lineFeature([
        [end.lng, end.lat],
        [destination.lng, destination.lat],
      ]),
    ],
  };
}

// Linha da rota para o MODO NAVEGAÇÃO. Recebe a PROJEÇÃO do veículo sobre a rota
// (calculada pelo chamador com janela restrita ao progresso — ver
// `useMapboxMap`). A linha:
//  - começa NAV_LINE_BACKTRACK_METERS atrás do ponto do veículo, seguindo a
//    geometria real da rua (sem cortar em diagonal) — só o suficiente para a
//    linha encostar no ícone fixo do carro, sem deixar rastro para trás;
//  - passa pelo ponto do veículo (em cima da pista) e segue a geometria real
//    da rua até o fim.
export function buildNavigationRouteGeojson(
  route: Route,
  projection: RouteProjection | null,
): Feature<LineString> {
  const coordinates: [number, number][] = route.geometry.map((point) => [point.lng, point.lat]);
  if (!projection || coordinates.length < 2) {
    return lineFeature(coordinates);
  }

  const snapped: [number, number] = [projection.point.lng, projection.point.lat];
  const ahead = coordinates.slice(projection.segmentIndex + 1);

  // Cauda curta atrás do veículo: recua NAV_LINE_BACKTRACK_METERS ao longo da
  // rota a partir do ponto projetado e inclui todos os vértices entre esse
  // ponto e o veículo — assim a cauda acompanha a curva em vez de cortar reto
  // de um vértice ao ponto projetado.
  const tailStartMeters = Math.max(0, projection.alongMeters - NAV_LINE_BACKTRACK_METERS);
  const tail = locateAlongRoute(route.geometry, tailStartMeters);
  const behindVertices = coordinates.slice(tail.segmentIndex + 1, projection.segmentIndex + 1);

  const path = dedupeConsecutive([
    [tail.point.lng, tail.point.lat],
    ...behindVertices,
    snapped,
    ...ahead,
  ]);
  return lineFeature(path.length >= 2 ? path : [snapped, coordinates[coordinates.length - 1]]);
}

function segmentBearingAround(geometry: Coordinates[], index: number, direction: 1 | -1): number {
  let i = index;
  let acc = 0;
  while (i + direction >= 0 && i + direction < geometry.length) {
    const next = i + direction;
    acc += haversineDistanceMeters(geometry[i], geometry[next]);
    if (acc >= MIN_SEGMENT_METERS_FOR_BEARING) {
      return direction === 1
        ? bearingBetween(geometry[index], geometry[next])
        : bearingBetween(geometry[next], geometry[index]);
    }
    i = next;
  }
  // Rota curta demais para os dois lados — usa o que der.
  const fallback = Math.min(Math.max(index + direction, 0), geometry.length - 1);
  return direction === 1
    ? bearingBetween(geometry[index], geometry[fallback])
    : bearingBetween(geometry[fallback], geometry[index]);
}

// Seta branca EM CIMA da linha azul, no formato da curva/rotatória/desvio: uma
// LineString que traça a geometria real da rota de MANEUVER_ARROW_LEAD_IN_METERS
// antes da manobra até MANEUVER_ARROW_LEAD_OUT_METERS depois (role: 'shape'),
// mais um Point na ponta com o azimute de SAÍDA para a cabeça da seta
// (role: 'head'). Aparece já a MANEUVER_ARROW_VISIBLE_WITHIN_METERS da manobra e
// some quando ela passou. `distanceToManeuverMeters` vem do estado (já
// antecipado — ver navigationReducer); sem ele, cai na distância crua.
export function buildManeuverArrowGeojson(
  route: Route | null,
  isNavigating: boolean,
  currentStepIndex: number,
  distanceToManeuverMeters: number | null,
  currentPosition?: Coordinates | null,
): FeatureCollection {
  if (!route || !isNavigating || route.geometry.length < 2) {
    return EMPTY_POINT_COLLECTION;
  }

  // A manobra do passo `i` acontece no INÍCIO dele; enquanto se percorre o
  // passo `currentStepIndex`, a PRÓXIMA manobra é a do passo seguinte.
  const currentStep = route.steps[currentStepIndex];
  const nextStep = route.steps[currentStepIndex + 1];

  const distanceToManeuver =
    distanceToManeuverMeters ??
    (currentPosition && nextStep
      ? haversineDistanceMeters(currentPosition, nextStep.maneuverLocation)
      : Number.POSITIVE_INFINITY);

  const geometryLength = polylineLengthMeters(route.geometry);
  const alongOf = (p: Coordinates) =>
    polylineLengthMeters(route.geometry.slice(0, findNearestPointIndex(p, route.geometry) + 1));

  // Índice do passo de rotatória em jogo: o atual (percorrendo o balão) ou o
  // próximo (chegando nele). -1 = não há balão envolvido → caminho normal.
  const roundaboutStepIndex = ROUNDABOUT_ENTER_MANEUVER_TYPES.has(
    (currentStep?.maneuverType ?? '').toLowerCase(),
  )
    ? currentStepIndex
    : ROUNDABOUT_ENTER_MANEUVER_TYPES.has((nextStep?.maneuverType ?? '').toLowerCase())
      ? currentStepIndex + 1
      : -1;

  let arrowStartAlong: number;
  let arrowEndAlong: number;
  let headCornerIndex: number;

  if (roundaboutStepIndex >= 0) {
    // Balão: traça da ENTRADA à SAÍDA (+ lead in/out). Percorrendo-o, fica
    // sempre na tela; ainda se aproximando, respeita o teto de visibilidade.
    const enterLoc = route.steps[roundaboutStepIndex].maneuverLocation;
    const exitLoc = route.steps[roundaboutStepIndex + 1]?.maneuverLocation ?? enterLoc;
    const enterAlong = alongOf(enterLoc);
    const exitAlong = Math.max(alongOf(exitLoc), enterAlong + MIN_SEGMENT_METERS_FOR_BEARING);
    const approaching = roundaboutStepIndex === currentStepIndex + 1;
    if (approaching && distanceToManeuver > MANEUVER_ARROW_VISIBLE_WITHIN_METERS) {
      return EMPTY_POINT_COLLECTION;
    }
    arrowStartAlong = enterAlong - MANEUVER_ARROW_LEAD_IN_METERS;
    arrowEndAlong = exitAlong + MANEUVER_ARROW_LEAD_OUT_METERS;
    headCornerIndex = findNearestPointIndex(exitLoc, route.geometry);
  } else {
    if (!nextStep || !isTurningManeuver(nextStep.maneuverType, nextStep.maneuverModifier)) {
      return EMPTY_POINT_COLLECTION;
    }
    if (distanceToManeuver > MANEUVER_ARROW_VISIBLE_WITHIN_METERS) {
      return EMPTY_POINT_COLLECTION;
    }
    const cornerIndex = findNearestPointIndex(nextStep.maneuverLocation, route.geometry);
    const cornerAlong = polylineLengthMeters(route.geometry.slice(0, cornerIndex + 1));
    arrowStartAlong = cornerAlong - MANEUVER_ARROW_LEAD_IN_METERS;
    arrowEndAlong = cornerAlong + MANEUVER_ARROW_LEAD_OUT_METERS;
    headCornerIndex = cornerIndex;
  }

  const startLoc = locateAlongRoute(route.geometry, arrowStartAlong);
  const endLoc = locateAlongRoute(route.geometry, arrowEndAlong);

  // Janela degenerada / manobra já ficou para trás (além do fim da rota) — some.
  if (
    startLoc.alongMeters >= endLoc.alongMeters ||
    arrowEndAlong + MANEUVER_ARROW_HIDE_PAST_METERS < 0 ||
    arrowStartAlong > geometryLength
  ) {
    return EMPTY_POINT_COLLECTION;
  }

  const coordinates: [number, number][] = route.geometry.map((p) => [p.lng, p.lat]);
  const midVertices = coordinates.slice(startLoc.segmentIndex + 1, endLoc.segmentIndex + 1);
  const shape = dedupeConsecutive([
    [startLoc.point.lng, startLoc.point.lat],
    ...midVertices,
    [endLoc.point.lng, endLoc.point.lat],
  ]);
  if (shape.length < 2) {
    return EMPTY_POINT_COLLECTION;
  }

  // Azimute da PONTA da seta = direção de saída da curva (de um pouco antes da
  // ponta até a ponta).
  const headTailLoc = locateAlongRoute(
    route.geometry,
    endLoc.alongMeters - MANEUVER_ARROW_HEAD_BEARING_BACK_METERS,
  );
  const headBearing =
    haversineDistanceMeters(headTailLoc.point, endLoc.point) >= MIN_SEGMENT_METERS_FOR_BEARING
      ? bearingBetween(headTailLoc.point, endLoc.point)
      : segmentBearingAround(route.geometry, headCornerIndex, 1);

  const shapeFeature: Feature<LineString> = {
    type: 'Feature',
    properties: { role: 'shape' },
    geometry: { type: 'LineString', coordinates: shape },
  };
  const headFeature: Feature<Point> = {
    type: 'Feature',
    properties: { role: 'head', bearing: headBearing },
    geometry: { type: 'Point', coordinates: [endLoc.point.lng, endLoc.point.lat] },
  };

  return { type: 'FeatureCollection', features: [shapeFeature, headFeature] };
}

// Níveis de trânsito que ganham faixa colorida por cima da rota. "low" e
// "unknown" (fluxo normal / sem dado) não desenham nada — a linha azul basta.
const CONGESTION_DRAW_LEVELS = new Set<CongestionLevel>(['moderate', 'heavy', 'severe']);

// Faixa colorida SOBRE a linha azul marcando trânsito lento/parado, no estilo
// Waze/Google Maps. Recebe `route.congestions` (um nível por segmento da
// geometria) e emite uma LineString por trecho contíguo de mesmo nível
// desenhável. Durante a navegação, `projection` corta tudo que já ficou para
// trás — a faixa começa exatamente no veículo. Sem dados de trânsito (a pé, ou
// trecho sem cobertura) volta vazia e a camada não desenha nada.
export function buildCongestionGeojson(
  route: Route | null,
  projection?: RouteProjection | null,
): FeatureCollection {
  const levels = route?.congestions;
  if (!route || !levels || levels.length === 0 || route.geometry.length < 2) {
    return EMPTY_POINT_COLLECTION;
  }

  const coords: [number, number][] = route.geometry.map((p) => [p.lng, p.lat]);
  // Segmento `i` liga coords[i] a coords[i+1]. Na navegação começamos no
  // segmento em que o veículo está projetado; no planejamento, do início.
  const startSegment = projection ? Math.max(0, projection.segmentIndex) : 0;

  const features: Feature<LineString>[] = [];
  let run: [number, number][] = [];
  let runLevel: CongestionLevel | null = null;

  const flush = () => {
    if (run.length >= 2 && runLevel) {
      features.push({
        type: 'Feature',
        properties: { level: runLevel },
        geometry: { type: 'LineString', coordinates: run },
      });
    }
    run = [];
    runLevel = null;
  };

  const lastSegment = Math.min(coords.length - 1, levels.length);
  for (let i = startSegment; i < lastSegment; i += 1) {
    const level = levels[i];
    if (!CONGESTION_DRAW_LEVELS.has(level)) {
      flush();
      continue;
    }
    if (runLevel !== level) {
      flush();
      // O primeiro trecho desenhado na navegação começa no ponto projetado do
      // veículo (em cima da pista), não no vértice anterior atrás dele.
      const from: [number, number] =
        i === startSegment && projection ? [projection.point.lng, projection.point.lat] : coords[i];
      run = [from];
      runLevel = level;
    }
    run.push(coords[i + 1]);
  }
  flush();

  return features.length > 0 ? { type: 'FeatureCollection', features } : EMPTY_POINT_COLLECTION;
}

// Projeção do veículo sobre a rota, restrita a uma janela ESTREITA em torno do
// progresso registrado. Antes a janela ia de -15 a +60 segmentos: numa rotatória
// (a rota passa rente a si mesma) um fix ruidoso "grudava" o ponto no outro lado
// do anel, e a linha/câmera davam um salto que só se acertava depois da curva.
// Com -6/+22 o ponto não tem para onde saltar; o `fromIndex` ainda recua o
// bastante para se recuperar de um fix ruim, sem alcançar um trecho anterior.
// `around` (metros já percorridos ao longo da geometria) + `maxAheadMeters`
// reforçam isso por DISTÂNCIA e não por contagem de segmentos — numa rotatória
// os segmentos são curtos e +22 deles ainda alcançava o outro lado do anel.
export function projectVehicleOntoRoute(
  route: Route,
  position: Coordinates,
  progressSegmentIndex: number,
  band?: { around?: number | null; maxAheadMeters?: number; maxBehindMeters?: number },
): RouteProjection {
  return projectOntoRoute(position, route.geometry, {
    fromIndex: progressSegmentIndex - 6,
    toIndex: progressSegmentIndex + 22,
    aroundAlongMeters: band?.around ?? undefined,
    maxAheadMeters: band?.maxAheadMeters,
    maxBehindMeters: band?.maxBehindMeters,
  });
}
