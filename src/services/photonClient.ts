import type { Coordinates, PlaceSuggestion } from '../types';
import { timeoutSignal } from '../utils/timeoutSignal';
import { DF_BOUNDING_BOX, DF_CENTER, isWithinDf } from '../data/dfBounds';

const PHOTON_URL = 'https://photon.komoot.io/api';
const MIN_TERM_LENGTH = 4;
const REQUEST_LIMIT = 10;
const MAX_SUGGESTIONS = 6;
const TIMEOUT_MS = 4000;

export class PhotonRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotonRequestError';
  }
}

interface PhotonProperties {
  name?: string;
  street?: string;
  housenumber?: string;
  district?: string;
  city?: string;
  countrycode?: string;
  osm_id?: number | string;
  osm_type?: string;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: PhotonProperties;
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

// "Nome, Rua, Nº - Bairro, Brasília - DF", pulando as partes ausentes.
// Se não veio `name`, o próprio `street` é o nome — e aí não se repete a
// rua no complemento.
function buildLabel(name: string, props: PhotonProperties): string {
  const hasName = Boolean(props.name?.trim());
  const streetAndNumber =
    props.street && props.housenumber ? `${props.street}, ${props.housenumber}` : props.street;
  const parts = [hasName ? streetAndNumber : undefined, props.district ?? props.city].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? `${name}, ${parts.join(' - ')}, Brasília - DF` : name;
}

// Busca de reforço no Photon (komoot): geocoder gratuito e sem chave, bom
// com erro de digitação. Filtrado ao retângulo do DF (bbox) e enviesado
// pela posição atual (lat/lon). O hook o chama só como segundo passe.
// Preserva a ordem do Photon (relevância + proximidade já embutidas).
export async function searchPhoton(
  query: string,
  proximity: Coordinates | null,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const term = query.trim();
  if (term.length < MIN_TERM_LENGTH) return [];
  if (signal?.aborted) return [];

  const center = proximity ?? DF_CENTER;
  // Sem `lang`: o Photon só aceita default/de/en/fr e responde 400 a `lang=pt`
  // (verificado no endpoint ao vivo) — o que zerava este segundo passe. Sem o
  // parâmetro, ele devolve o nome padrão/localizado, o que é aceitável.
  const params = new URLSearchParams({
    q: term,
    limit: String(REQUEST_LIMIT),
    lat: String(center.lat),
    lon: String(center.lng),
    bbox: `${DF_BOUNDING_BOX.west},${DF_BOUNDING_BOX.south},${DF_BOUNDING_BOX.east},${DF_BOUNDING_BOX.north}`,
  });
  const { signal: fetchSignal, cleanup } = timeoutSignal(TIMEOUT_MS, signal);

  let data: PhotonResponse;
  try {
    const response = await fetch(`${PHOTON_URL}?${params.toString()}`, { signal: fetchSignal });
    if (!response.ok) {
      throw new PhotonRequestError(`Photon respondeu ${response.status}`);
    }
    data = (await response.json()) as PhotonResponse;
  } catch (error) {
    if (signal?.aborted) return [];
    if (error instanceof PhotonRequestError) throw error;
    throw new PhotonRequestError(
      error instanceof Error ? error.message : 'Falha na consulta ao Photon',
    );
  } finally {
    cleanup();
  }

  const suggestions: PlaceSuggestion[] = [];
  (data.features ?? []).forEach((feature, index) => {
    const coords = feature.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2) return;
    const props = feature.properties ?? {};
    if (props.countrycode && props.countrycode !== 'BR') return;
    const name = props.name?.trim() || props.street?.trim();
    if (!name) return;
    const coordinates = { lat: coords[1], lng: coords[0] };
    // O `bbox` do Photon é só um viés que ele às vezes relaxa — um resultado
    // pode cair fora do DF. Filtro rígido ao retângulo aqui.
    if (!isWithinDf(coordinates)) return;
    suggestions.push({
      id: `photon:${props.osm_type ?? 'x'}:${props.osm_id ?? index}`,
      placeName: buildLabel(name, props),
      coordinates,
    });
  });
  return suggestions.slice(0, MAX_SUGGESTIONS);
}
