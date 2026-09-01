import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { Coordinates, Route } from '../../types';
import {
  bearingBetween,
  findNearestPointIndex,
  haversineDistanceMeters,
  projectOntoRoute,
  type RouteProjection,
} from '../../utils/distance';

// Reexportado daqui por compatibilidade: a implementação canônica agora vive em
// `utils/distance` (também usada pelo navigationReducer, que não deve depender
// da camada de mapa).
export { bearingBetween };

// A partir de quantos metros da manobra a seta (chevron) sobre a linha some.
const MANEUVER_ARROW_VISIBLE_WITHIN_METERS = 180;
// Quanto da rota a seta desenha de cada lado do ponto da manobra — o bastante
// para o "L" da curva aparecer.
const MANEUVER_ARROW_BEFORE_METERS = 26;
const MANEUVER_ARROW_AFTER_METERS = 34;

// ~1 cm — dedup de pontos praticamente coincidentes.
const COINCIDENT_EPSILON_DEGREES = 1e-7;

function lineFeature(coordinates: [number, number][]): Feature<LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  };
}

const EMPTY_FEATURE_COLLECTION: FeatureCollection = { type: 'FeatureCollection', features: [] };

function dropLeadingDuplicate(coordinates: [number, number][]): [number, number][] {
  // `>= 3`: nunca reduz a linha para menos de 2 pontos.
  if (
    coordinates.length >= 3 &&
    Math.abs(coordinates[0][0] - coordinates[1][0]) < COINCIDENT_EPSILON_DEGREES &&
    Math.abs(coordinates[0][1] - coordinates[1][1]) < COINCIDENT_EPSILON_DEGREES
  ) {
    return coordinates.slice(1);
  }
  return coordinates;
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

// Linha da rota para o MODO NAVEGAÇÃO: só o que está À FRENTE, e SEMPRE colada
// na pista. Recebe a PROJEÇÃO do veículo sobre a rota já calculada pelo chamador
// (com janela restrita ao progresso real — ver `useMapboxMap`), o que evita que
// uma rota que passa perto de si mesma "grude" o ponto num trecho distante e a
// linha vire um toco. O começo da linha é o ponto projetado (em cima da rua),
// não a posição crua do GPS; o veículo é que fica sobre a linha.
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
  const forward: [number, number][] =
    ahead.length > 0 ? [snapped, ...ahead] : [snapped, coordinates[coordinates.length - 1]];

  return lineFeature(dropLeadingDuplicate(forward));
}

// Caminha ao longo da geometria a partir de `fromIndex`, acumulando distância,
// até somar ~`meters` (ou acabar a geometria). `direction` = +1 para frente,
// -1 para trás. Devolve os pontos percorridos, do mais próximo de `fromIndex`
// para o mais distante.
function walkAlong(
  geometry: Coordinates[],
  fromIndex: number,
  meters: number,
  direction: 1 | -1,
): [number, number][] {
  const points: [number, number][] = [];
  let accumulated = 0;
  let i = fromIndex;
  while (accumulated < meters) {
    const next = i + direction;
    if (next < 0 || next >= geometry.length) {
      break;
    }
    accumulated += haversineDistanceMeters(geometry[i], geometry[next]);
    points.push([geometry[next].lng, geometry[next].lat]);
    i = next;
  }
  return points;
}

// Seta que TRAÇA a curva sobre a linha da rota, do trecho antes da manobra até
// o depois — o "L" do Waze/Maps, não uma flecha reta. É desenhada como uma
// LineString curta que segue a geometria real da rua; a camada de símbolos (ver
// `useMapboxMap`) repete um "▶" ao longo dela, então as pontas acompanham a
// direção da via e dobram na esquina. 0 ou 1 feature: some quando não há
// manobra à frente (último trecho/chegada) ou quando ela ainda está longe.
export function buildManeuverArrowGeojson(
  route: Route | null,
  currentPosition: Coordinates | null,
  isNavigating: boolean,
  currentStepIndex: number,
): FeatureCollection<LineString> {
  const empty = EMPTY_FEATURE_COLLECTION as FeatureCollection<LineString>;
  if (!route || !isNavigating || !currentPosition || route.geometry.length < 2) {
    return empty;
  }

  // A manobra do passo `i` acontece no INÍCIO dele; enquanto se percorre o
  // passo `currentStepIndex`, a PRÓXIMA manobra é a do passo seguinte.
  const upcoming = route.steps[currentStepIndex + 1];
  if (!upcoming) {
    return empty;
  }

  const distanceToManeuver = haversineDistanceMeters(currentPosition, upcoming.maneuverLocation);
  if (distanceToManeuver > MANEUVER_ARROW_VISIBLE_WITHIN_METERS) {
    return empty;
  }

  // Vértice da geometria mais próximo do ponto da manobra: a curva "gira" ali.
  const cornerIndex = findNearestPointIndex(upcoming.maneuverLocation, route.geometry);
  const before = walkAlong(
    route.geometry,
    cornerIndex,
    MANEUVER_ARROW_BEFORE_METERS,
    -1,
  ).reverse();
  const after = walkAlong(route.geometry, cornerIndex, MANEUVER_ARROW_AFTER_METERS, 1);
  const corner: [number, number] = [
    route.geometry[cornerIndex].lng,
    route.geometry[cornerIndex].lat,
  ];
  const path = [...before, corner, ...after];
  if (path.length < 2) {
    return empty;
  }

  return {
    type: 'FeatureCollection',
    features: [lineFeature(path)],
  };
}

// Projeção do veículo sobre a rota, restrita a uma janela à frente do progresso
// já registrado — o mesmo cuidado do reducer, mas aqui para a camada de mapa
// (linha + câmera). Sem a janela, uma rota que passa perto de si mesma casava o
// ponto num trecho distante e a linha desenhada virava um toco.
export function projectVehicleOntoRoute(
  route: Route,
  position: Coordinates,
  progressSegmentIndex: number,
): RouteProjection {
  return projectOntoRoute(position, route.geometry, {
    fromIndex: progressSegmentIndex - 3,
    toIndex: progressSegmentIndex + 80,
  });
}
