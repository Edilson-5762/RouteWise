import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
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

// Trecho da rota JÁ PERCORRIDO que a linha ainda desenha, atrás do ponto
// projetado do veículo. Garante que a linha alcance o ícone fixo do veículo (e
// passe um pouco dele) mesmo enquanto a câmera está terminando de rolar — sem
// isso, a cada avanço a linha "sumia" a alguns metros à frente do veículo, e em
// curvas some de vez até passar a curva.
const NAV_LINE_BACKTRACK_METERS = 40;

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

// Caminha ao longo da geometria a partir de `fromIndex`, acumulando distância,
// até somar ~`meters` (ou acabar a geometria). `direction` = +1 para frente,
// -1 para trás. Devolve os vértices percorridos (sem o de `fromIndex`), do mais
// próximo de `fromIndex` para o mais distante.
function walkAlong(
  geometry: Coordinates[],
  fromIndex: number,
  meters: number,
  direction: 1 | -1,
): Coordinates[] {
  const points: Coordinates[] = [];
  let accumulated = 0;
  let i = fromIndex;
  while (accumulated < meters) {
    const next = i + direction;
    if (next < 0 || next >= geometry.length) {
      break;
    }
    accumulated += haversineDistanceMeters(geometry[i], geometry[next]);
    points.push(geometry[next]);
    i = next;
  }
  return points;
}

// Linha da rota para o MODO NAVEGAÇÃO. Recebe a PROJEÇÃO do veículo sobre a rota
// (calculada pelo chamador com janela restrita ao progresso — ver
// `useMapboxMap`). A linha:
//  - começa um pouco ATRÁS do ponto projetado (NAV_LINE_BACKTRACK_METERS), para
//    sempre alcançar o ícone fixo do veículo e não "sumir" nas curvas;
//  - passa pelo ponto projetado (em cima da pista) e segue a geometria real da
//    rua até o fim.
export function buildNavigationRouteGeojson(
  route: Route,
  projection: RouteProjection | null,
): Feature<LineString> {
  const coordinates: [number, number][] = route.geometry.map((point) => [point.lng, point.lat]);
  if (!projection || coordinates.length < 2) {
    return lineFeature(coordinates);
  }

  const behind = walkAlong(route.geometry, projection.segmentIndex, NAV_LINE_BACKTRACK_METERS, -1)
    .reverse()
    .map((p) => [p.lng, p.lat] as [number, number]);

  const cornerVertex: [number, number] = [
    route.geometry[projection.segmentIndex].lng,
    route.geometry[projection.segmentIndex].lat,
  ];
  const snapped: [number, number] = [projection.point.lng, projection.point.lat];
  const ahead = coordinates.slice(projection.segmentIndex + 1);

  const path = dedupeConsecutive([...behind, cornerVertex, snapped, ...ahead]);
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

// Projeção do veículo sobre a rota, restrita a uma janela em torno do progresso
// registrado. `fromIndex` recua bastante (não só 3) para a projeção conseguir
// "se recuperar" se um fix ruim de GPS tiver empurrado o progresso à frente —
// senão a linha ficava permanentemente adiantada em relação ao veículo.
export function projectVehicleOntoRoute(
  route: Route,
  position: Coordinates,
  progressSegmentIndex: number,
): RouteProjection {
  return projectOntoRoute(position, route.geometry, {
    fromIndex: progressSegmentIndex - 15,
    toIndex: progressSegmentIndex + 60,
  });
}
