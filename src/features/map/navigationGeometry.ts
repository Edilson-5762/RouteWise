import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { Coordinates, Route } from '../../types';
import { bearingBetween, haversineDistanceMeters, projectOntoRoute } from '../../utils/distance';

// Reexportado daqui por compatibilidade: a implementação canônica agora vive em
// `utils/distance` (também usada pelo navigationReducer, que não deve depender
// da camada de mapa).
export { bearingBetween };

// A partir de quantos metros da manobra a seta (chevron) sobre a linha some.
const MANEUVER_ARROW_VISIBLE_WITHIN_METERS = 170;

function lineFeature(coordinates: [number, number][]): Feature<LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  };
}

// ~1 cm — dedup de pontos praticamente coincidentes (ex.: o ponto projetado
// cai exatamente sobre um vértice da rota, que também seria o primeiro ponto
// "à frente").
const COINCIDENT_EPSILON_DEGREES = 1e-7;

function dropLeadingDuplicate(coordinates: [number, number][]): [number, number][] {
  // `>= 3`: nunca reduz a linha para menos de 2 pontos (colado no destino,
  // `forward` já tem só 2, ambos ~iguais — melhor manter os 2 do que virar 1).
  if (
    coordinates.length >= 3 &&
    Math.abs(coordinates[0][0] - coordinates[1][0]) < COINCIDENT_EPSILON_DEGREES &&
    Math.abs(coordinates[0][1] - coordinates[1][1]) < COINCIDENT_EPSILON_DEGREES
  ) {
    return coordinates.slice(1);
  }
  return coordinates;
}

const EMPTY_FEATURE_COLLECTION: FeatureCollection = { type: 'FeatureCollection', features: [] };

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
// na pista. O começo da linha é a PROJEÇÃO do veículo sobre a rota (o ponto
// exato em cima da rua), não a posição crua do GPS — assim a linha nunca sai da
// via nem "corta" a curva ligando o puck a um vértice adiante. O veículo é que
// anda por cima da linha; a linha segue a geometria real da rua até o destino.
export function buildNavigationRouteGeojson(
  route: Route,
  currentPosition: Coordinates | null,
): Feature<LineString> {
  const coordinates: [number, number][] = route.geometry.map((point) => [point.lng, point.lat]);
  if (!currentPosition || coordinates.length < 2) {
    return lineFeature(coordinates);
  }

  const projection = projectOntoRoute(currentPosition, route.geometry);
  const snapped: [number, number] = [projection.point.lng, projection.point.lat];
  // Vértices da rota ainda à frente do ponto projetado (o do segmento atual já
  // foi "consumido"; começa no próximo).
  const ahead = coordinates.slice(projection.segmentIndex + 1);
  const forward: [number, number][] =
    ahead.length > 0 ? [snapped, ...ahead] : [snapped, coordinates[coordinates.length - 1]];

  return lineFeature(dropLeadingDuplicate(forward));
}

// Seta branca (chevron) desenhada SOBRE a linha, no ponto da próxima manobra,
// apontando na direção em que a rota segue ali — o "traço" que o Waze/Maps
// mostram no centro da curva/rotatória. Devolve 0 ou 1 ponto: some quando não
// há manobra à frente (último trecho/chegada) ou quando ela ainda está longe.
export function buildManeuverArrowGeojson(
  route: Route | null,
  currentPosition: Coordinates | null,
  isNavigating: boolean,
  currentStepIndex: number,
): FeatureCollection<Point> {
  if (!route || !isNavigating || !currentPosition || route.geometry.length < 2) {
    return EMPTY_FEATURE_COLLECTION as FeatureCollection<Point>;
  }

  // A manobra do passo `i` acontece no INÍCIO dele; enquanto se percorre o
  // passo `currentStepIndex`, a PRÓXIMA manobra é a do passo seguinte.
  const upcoming = route.steps[currentStepIndex + 1];
  if (!upcoming) {
    return EMPTY_FEATURE_COLLECTION as FeatureCollection<Point>;
  }

  const distanceToManeuver = haversineDistanceMeters(currentPosition, upcoming.maneuverLocation);
  if (distanceToManeuver > MANEUVER_ARROW_VISIBLE_WITHIN_METERS) {
    return EMPTY_FEATURE_COLLECTION as FeatureCollection<Point>;
  }

  // Direção (azimute) da rota no ponto da manobra: a seta aponta para onde
  // seguir atravessando a curva.
  const atManeuver = projectOntoRoute(upcoming.maneuverLocation, route.geometry);
  const a = route.geometry[atManeuver.segmentIndex];
  const b = route.geometry[atManeuver.segmentIndex + 1];
  const bearing = bearingBetween(a, b);

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { bearing },
        geometry: {
          type: 'Point',
          coordinates: [upcoming.maneuverLocation.lng, upcoming.maneuverLocation.lat],
        },
      },
    ],
  };
}
