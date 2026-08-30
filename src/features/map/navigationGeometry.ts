import type { Feature, LineString } from 'geojson';
import type { Coordinates, Route } from '../../types';
import { bearingBetween, findNearestPointIndex } from '../../utils/distance';

// Reexportado daqui por compatibilidade: a implementação canônica agora vive em
// `utils/distance` (também usada pelo navigationReducer, que não deve depender
// da camada de mapa).
export { bearingBetween };

function lineFeature(coordinates: [number, number][]): Feature<LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  };
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

// Linha da rota para o MODO NAVEGAÇÃO: só o que está À FRENTE. Começa exatamente
// na posição atual do veículo e vai até o destino — o trecho já percorrido some
// a cada avanço, à la Waze/Maps. Sem emenda diagonal ("facão"): o primeiro
// ponto é o próprio puck, não o início parado da rota.
export function buildNavigationRouteGeojson(
  route: Route,
  currentPosition: Coordinates | null,
): Feature<LineString> {
  const coordinates: [number, number][] = route.geometry.map((point) => [point.lng, point.lat]);
  if (!currentPosition || coordinates.length < 2) {
    return lineFeature(coordinates);
  }

  const nearestIndex = findNearestPointIndex(currentPosition, route.geometry);
  // Garante pelo menos 2 pontos na linha, mesmo colado no destino.
  const startIndex = Math.min(nearestIndex, route.geometry.length - 2);
  const ahead = coordinates.slice(startIndex);
  ahead[0] = [currentPosition.lng, currentPosition.lat];

  return lineFeature(ahead);
}

