import type { Coordinates, PlaceSuggestion } from '../types';
import type { OsmTag, PlaceCategoryDefinition } from '../data/placeCategories';
import { haversineDistanceMeters } from '../utils/distance';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const SEARCH_RADIUS_METERS = 8000;
// A Overpass API não ordena resultados por distância — `out N` devolve os
// N primeiros na ordem interna do servidor (por tipo de elemento, depois ID
// OSM), não os N mais próximos. Este limite precisa ser bem maior que
// MAX_SUGGESTIONS porque é o tamanho do pool de candidatos onde o cliente
// vai executar a ordenação por distância e só então cortar em
// MAX_SUGGESTIONS. Um valor pequeno aqui faz o corte acontecer no lugar
// errado (no servidor, antes de qualquer cálculo de distância).
const OVERPASS_ELEMENT_LIMIT = 200;
const MAX_SUGGESTIONS = 8;

// Fallback usado só quando a busca por categoria acontece sem localização
// atual conhecida — evita uma query Overpass sem `around` (que devolveria
// estabelecimentos do mundo inteiro). Mesmo ponto usado como centro do DF em
// `data/dfAdministrativeRegions.ts` (Plano Piloto).
const DEFAULT_SEARCH_CENTER: Coordinates = { lat: -15.7939, lng: -47.8828 };

export class OverpassRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverpassRequestError';
  }
}

function buildTagFilter(tag: OsmTag): string {
  return tag.value ? `["${tag.key}"="${tag.value}"]` : `["${tag.key}"]`;
}

function buildOverpassQuery(tag: OsmTag, center: Coordinates, radiusMeters: number): string {
  const filter = buildTagFilter(tag);
  const around = `(around:${radiusMeters},${center.lat},${center.lng})`;
  return `[out:json][timeout:10];(node${filter}${around};way${filter}${around};);out center ${OVERPASS_ELEMENT_LIMIT};`;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

function elementCoordinates(element: OverpassElement): Coordinates | null {
  if (typeof element.lat === 'number' && typeof element.lon === 'number') {
    return { lat: element.lat, lng: element.lon };
  }
  if (element.center) {
    return { lat: element.center.lat, lng: element.center.lon };
  }
  return null;
}

// Anexa rua/número/bairro ao nome quando o OSM tiver esses dados — sem eles,
// o rótulo cai para só o nome do estabelecimento (ainda assim útil, já que
// o usuário reconhece o nome do lugar que buscou).
function buildOverpassPlaceLabel(tags: Record<string, string>): string {
  const streetAndNumber =
    tags['addr:street'] && tags['addr:housenumber']
      ? `${tags['addr:street']}, ${tags['addr:housenumber']}`
      : tags['addr:street'];
  const addressParts = [streetAndNumber, tags['addr:suburb']].filter(
    (part): part is string => Boolean(part),
  );
  return addressParts.length > 0 ? `${tags.name}, ${addressParts.join(', ')}` : tags.name;
}

interface RankedSuggestion {
  suggestion: PlaceSuggestion;
  distanceMeters: number;
}

export async function searchPlacesByCategory(
  category: PlaceCategoryDefinition,
  proximity: Coordinates | null,
): Promise<PlaceSuggestion[]> {
  const center = proximity ?? DEFAULT_SEARCH_CENTER;
  const query = buildOverpassQuery(category.osmTag, center, SEARCH_RADIUS_METERS);
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new OverpassRequestError(
      `Falha na busca de ${category.categoryLabel.toLowerCase()}: ${response.status}`,
    );
  }

  const data = (await response.json()) as OverpassResponse;

  const ranked: RankedSuggestion[] = data.elements
    .map((element): RankedSuggestion | null => {
      const coordinates = elementCoordinates(element);
      const name = element.tags?.name;
      if (!coordinates || !name) {
        return null;
      }
      return {
        suggestion: {
          id: `osm-${element.type}-${element.id}`,
          placeName: buildOverpassPlaceLabel({ ...element.tags, name }),
          coordinates,
        },
        distanceMeters: haversineDistanceMeters(center, coordinates),
      };
    })
    .filter((entry): entry is RankedSuggestion => entry !== null);

  ranked.sort((a, b) => a.distanceMeters - b.distanceMeters);

  return ranked.slice(0, MAX_SUGGESTIONS).map((entry) => entry.suggestion);
}
