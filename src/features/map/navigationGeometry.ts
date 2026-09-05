import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { Coordinates, Route } from '../../types';
import {
  bearingBetween,
  findNearestPointIndex,
  haversineDistanceMeters,
  locateAlongRoute,
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

// A seta da manobra só aparece quando o veículo está BEM em cima da curva.
const MANEUVER_ARROW_VISIBLE_WITHIN_METERS = 55;
// Distância mínima de segmento para tirar um azimute confiável (evita ruído de
// vértices coincidentes).
const MIN_SEGMENT_METERS_FOR_BEARING = 3;

// ~1 cm — dedup de pontos praticamente coincidentes.
const COINCIDENT_EPSILON_DEGREES = 1e-7;

function lineFeature(coordinates: [number, number][]): Feature<LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  };
}

const EMPTY_POINT_COLLECTION: FeatureCollection<Point> = {
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

function turnGlyphFor(modifier: string | null): string {
  const m = (modifier ?? '').toLowerCase();
  if (m.includes('left')) return m.includes('u') ? '⮌' : '↰';
  if (m.includes('right')) return '↱';
  if (m === 'uturn') return '⮌';
  return '↑';
}

// UMA seta em cima da curva, apontando para onde virar — aparece só quando o
// veículo já está BEM perto da manobra (MANEUVER_ARROW_VISIBLE_WITHIN_METERS) e
// some assim que o passo avança. É um Point; a camada de símbolos (ver
// `useMapboxMap`) desenha um único glifo de curva girado para a direção de
// CHEGADA na manobra (`bearing`), então "↰"/"↱" ficam alinhados com a rua em
// que o veículo está e a ponta indica o lado.
export function buildManeuverArrowGeojson(
  route: Route | null,
  currentPosition: Coordinates | null,
  isNavigating: boolean,
  currentStepIndex: number,
): FeatureCollection<Point> {
  if (!route || !isNavigating || !currentPosition || route.geometry.length < 2) {
    return EMPTY_POINT_COLLECTION;
  }

  // A manobra do passo `i` acontece no INÍCIO dele; enquanto se percorre o
  // passo `currentStepIndex`, a PRÓXIMA manobra é a do passo seguinte.
  const upcoming = route.steps[currentStepIndex + 1];
  if (!upcoming) {
    return EMPTY_POINT_COLLECTION;
  }

  const distanceToManeuver = haversineDistanceMeters(currentPosition, upcoming.maneuverLocation);
  if (distanceToManeuver > MANEUVER_ARROW_VISIBLE_WITHIN_METERS) {
    return EMPTY_POINT_COLLECTION;
  }

  const cornerIndex = findNearestPointIndex(upcoming.maneuverLocation, route.geometry);
  // Azimute de CHEGADA na curva (direção da rua antes de virar).
  const bearing = segmentBearingAround(route.geometry, cornerIndex, -1);

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          bearing,
          glyph: turnGlyphFor(upcoming.maneuverModifier),
        },
        geometry: {
          type: 'Point',
          coordinates: [upcoming.maneuverLocation.lng, upcoming.maneuverLocation.lat],
        },
      },
    ],
  };
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
