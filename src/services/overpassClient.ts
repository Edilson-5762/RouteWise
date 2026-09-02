import type { Coordinates, PlaceSuggestion } from '../types';
import { normalize } from '../utils/text';
import { haversineDistanceMeters } from '../utils/distance';
import { timeoutSignal } from '../utils/timeoutSignal';
import { DF_CENTER } from '../data/dfBounds';
import { buildOverpassQuery, toAccentInsensitivePattern } from './overpassQuery';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const MIN_TERM_LENGTH = 4;
const MAX_SUGGESTIONS = 6;
const TIMEOUT_MS = 6000;

// Ordem de preferência para o rótulo quando um elemento casou por um
// campo de nome que não é o `name` principal.
const NAME_TAGS_IN_ORDER = [
  'name',
  'official_name',
  'brand',
  'name:pt',
  'alt_name',
  'short_name',
] as const;

export class OverpassRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverpassRequestError';
  }
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

function pickName(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null;
  for (const key of NAME_TAGS_IN_ORDER) {
    const value = tags[key]?.trim();
    if (value) return value;
  }
  return null;
}

// "Nome, Rua, Nº - Bairro, Brasília - DF", pulando as partes que o OSM não
// tiver. Sem nenhuma parte de endereço, o rótulo é só o nome.
function buildLabel(name: string, tags: Record<string, string>): string {
  const streetAndNumber =
    tags['addr:street'] && tags['addr:housenumber']
      ? `${tags['addr:street']}, ${tags['addr:housenumber']}`
      : tags['addr:street'];
  const parts = [streetAndNumber, tags['addr:suburb'] ?? tags['addr:district']].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? `${name}, ${parts.join(' - ')}, Brasília - DF` : name;
}

// Busca de reforço no OSM cru (Overpass API): dentro do retângulo do DF,
// casa o texto digitado contra vários campos de nome do lugar (nome
// oficial, nome antigo, apelido, marca...). Pública e sem chave. Lenta
// (1–3 s) e com uso justo — o hook a chama só como segundo passe. Pura,
// não guarda estado.
export async function searchDeepOsm(
  query: string,
  proximity: Coordinates | null,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const term = normalize(query);
  if (term.length < MIN_TERM_LENGTH) return [];
  if (signal?.aborted) return [];

  const ql = buildOverpassQuery(toAccentInsensitivePattern(term));
  const { signal: fetchSignal, cleanup } = timeoutSignal(TIMEOUT_MS, signal);

  let data: OverpassResponse;
  try {
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(ql)}`,
      signal: fetchSignal,
    });
    if (!response.ok) {
      throw new OverpassRequestError(`Overpass respondeu ${response.status}`);
    }
    data = (await response.json()) as OverpassResponse;
  } catch (error) {
    if (signal?.aborted) return [];
    if (error instanceof OverpassRequestError) throw error;
    throw new OverpassRequestError(
      error instanceof Error ? error.message : 'Falha na consulta ao Overpass',
    );
  } finally {
    cleanup();
  }

  const center = proximity ?? DF_CENTER;
  return (data.elements ?? [])
    .map((element): { suggestion: PlaceSuggestion; distance: number } | null => {
      const coordinates = elementCoordinates(element);
      const name = pickName(element.tags);
      if (!coordinates || !name) return null;
      return {
        suggestion: {
          id: `osm:${element.type}:${element.id}`,
          placeName: buildLabel(name, element.tags ?? {}),
          coordinates,
        } satisfies PlaceSuggestion,
        distance: haversineDistanceMeters(center, coordinates),
      };
    })
    .filter((entry): entry is { suggestion: PlaceSuggestion; distance: number } => entry !== null)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => entry.suggestion);
}
