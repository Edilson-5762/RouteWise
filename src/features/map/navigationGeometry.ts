import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { Coordinates, Route } from '../../types';
import {
  bearingBetween,
  findNearestPointIndex,
  haversineDistanceMeters,
  locateAlongRoute,
  polylineLengthMeters,
  projectOntoRoute,
  type RouteProjection,
} from '../../utils/distance';

// Reexportado daqui por compatibilidade: a implementação canônica agora vive em
// `utils/distance` (também usada pelo navigationReducer, que não deve depender
// da camada de mapa).
export { bearingBetween };

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
  const upcoming = route.steps[currentStepIndex + 1];
  if (!upcoming || !isTurningManeuver(upcoming.maneuverType, upcoming.maneuverModifier)) {
    return EMPTY_POINT_COLLECTION;
  }

  const distanceToManeuver =
    distanceToManeuverMeters ??
    (currentPosition
      ? haversineDistanceMeters(currentPosition, upcoming.maneuverLocation)
      : Number.POSITIVE_INFINITY);
  if (distanceToManeuver > MANEUVER_ARROW_VISIBLE_WITHIN_METERS) {
    return EMPTY_POINT_COLLECTION;
  }

  const cornerIndex = findNearestPointIndex(upcoming.maneuverLocation, route.geometry);
  const cornerAlong = polylineLengthMeters(route.geometry.slice(0, cornerIndex + 1));

  const startLoc = locateAlongRoute(route.geometry, cornerAlong - MANEUVER_ARROW_LEAD_IN_METERS);
  const endLoc = locateAlongRoute(route.geometry, cornerAlong + MANEUVER_ARROW_LEAD_OUT_METERS);

  // A manobra já ficou para trás — some.
  if (startLoc.alongMeters >= cornerAlong && endLoc.alongMeters <= cornerAlong) {
    return EMPTY_POINT_COLLECTION;
  }
  const routeLength = polylineLengthMeters(route.geometry);
  if (cornerAlong + MANEUVER_ARROW_HIDE_PAST_METERS < 0 || cornerAlong > routeLength) {
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
      : segmentBearingAround(route.geometry, cornerIndex, 1);

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

// Projeção do veículo sobre a rota, restrita a uma janela ESTREITA em torno do
// progresso registrado. Antes a janela ia de -15 a +60 segmentos: numa rotatória
// (a rota passa rente a si mesma) um fix ruidoso "grudava" o ponto no outro lado
// do anel, e a linha/câmera davam um salto que só se acertava depois da curva.
// Com -6/+22 o ponto não tem para onde saltar; o `fromIndex` ainda recua o
// bastante para se recuperar de um fix ruim, sem alcançar um trecho anterior.
export function projectVehicleOntoRoute(
  route: Route,
  position: Coordinates,
  progressSegmentIndex: number,
): RouteProjection {
  return projectOntoRoute(position, route.geometry, {
    fromIndex: progressSegmentIndex - 6,
    toIndex: progressSegmentIndex + 22,
  });
}
