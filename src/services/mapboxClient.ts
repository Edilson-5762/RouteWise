import type { Coordinates, PlaceSuggestion, Route, RouteStep, TravelProfile } from '../types';
import { DF_ADMINISTRATIVE_REGIONS, type AdministrativeRegion } from '../data/dfAdministrativeRegions';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
// A antiga Geocoding API v5 (`/geocoding/v5/mapbox.places`) tem relevância
// ruim para endereços numerados e bairros informais comuns no Brasil (ex.:
// "Rua 04, Vicente Pires" em Brasília retornava ruas de "Pires do Rio - GO",
// mesmo com proximity/country configurados corretamente). A Search Box API
// (endpoint atual recomendado pela Mapbox) resolve esses mesmos endereços
// corretamente — confirmado testando os dois endpoints lado a lado com o
// mesmo texto de busca. Ela funciona em duas etapas: `suggest` retorna uma
// lista leve (sem coordenadas) e `retrieve` busca as coordenadas da opção
// escolhida pelo usuário.
const SUGGEST_BASE_URL = 'https://api.mapbox.com/search/searchbox/v1/suggest';
const RETRIEVE_BASE_URL = 'https://api.mapbox.com/search/searchbox/v1/retrieve';
const DIRECTIONS_BASE_URL = 'https://api.mapbox.com/directions/v5/mapbox';

export class MapboxRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapboxRequestError';
  }
}

/**
 * Verifica se um token do Mapbox foi configurado (via VITE_MAPBOX_TOKEN),
 * para que a aplicação possa exibir um aviso amigável em vez de disparar
 * requisições silenciosas com `access_token=undefined`.
 */
export function hasMapboxToken(): boolean {
  return typeof MAPBOX_TOKEN === 'string' && MAPBOX_TOKEN.trim().length > 0;
}

interface SuggestFeature {
  mapbox_id: string;
  full_address?: string;
  place_formatted?: string;
  name: string;
  feature_type?: string;
  context?: {
    region?: { name?: string; region_code?: string };
  };
}

interface SuggestResponse {
  suggestions: SuggestFeature[];
}

// Tipos onde `place_formatted` é só o contexto ao redor (estado, país) e
// NÃO inclui o nome do próprio lugar — ao contrário de POIs/endereços, onde
// `place_formatted`/`full_address` já são um rótulo completo por si só. Sem
// prefixar o nome aqui, uma cidade como "Tracuateua" apareceria só como
// "Pará, Brasil", sem o próprio nome da cidade.
const PLACE_LEVEL_FEATURE_TYPES = new Set(['country', 'region', 'place', 'district', 'locality']);

function buildPlaceName(suggestion: SuggestFeature): string {
  let base: string;
  if (suggestion.full_address) {
    base = suggestion.full_address;
  } else if (
    suggestion.place_formatted &&
    !PLACE_LEVEL_FEATURE_TYPES.has(suggestion.feature_type ?? '')
  ) {
    base = suggestion.place_formatted;
  } else if (suggestion.place_formatted) {
    base = `${suggestion.name}, ${suggestion.place_formatted}`;
  } else {
    base = suggestion.name;
  }

  // Garante que o estado apareça no rótulo mesmo quando a Mapbox não o
  // incluiu no texto formatado — evita ambiguidade entre cidades homônimas
  // de estados diferentes (o Brasil tem várias "Tracuateua", "Rua das
  // Flores" etc. espalhadas por UFs distintas).
  const region = suggestion.context?.region;
  const alreadyHasRegion =
    !region?.name || base.includes(region.name) || (!!region.region_code && base.includes(region.region_code));
  if (region?.name && !alreadyHasRegion) {
    base = `${base} - ${region.region_code ?? region.name}`;
  }

  return base;
}

async function fetchSuggestions(
  query: string,
  sessionToken: string,
  proximity: Coordinates | null,
  types?: string,
): Promise<PlaceSuggestion[]> {
  const proximityParam = proximity ? `&proximity=${proximity.lng},${proximity.lat}` : '';
  const typesParam = types ? `&types=${types}` : '';
  const url = `${SUGGEST_BASE_URL}?q=${encodeURIComponent(query)}&access_token=${MAPBOX_TOKEN}&session_token=${sessionToken}&language=pt&limit=5&country=br${proximityParam}${typesParam}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new MapboxRequestError(`Falha na busca de endereço: ${response.status}`);
  }

  const data = (await response.json()) as SuggestResponse;

  return data.suggestions.map((suggestion) => ({
    id: suggestion.mapbox_id,
    placeName: buildPlaceName(suggestion),
  }));
}

const MAX_SUGGESTIONS = 8;
const MIN_LOCAL_MATCH_QUERY_LENGTH = 3;

const COMBINING_DIACRITICS_PATTERN = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  'g',
);

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_PATTERN, '')
    .toLowerCase()
    .trim();
}

// Gazetteer local das Regiões Administrativas do DF (ver comentário no
// arquivo de dados para o porquê): usado para preencher um gap real de dados
// da Search Box API, que não tem essas regiões indexadas como place/
// district/locality.
function findLocalAdministrativeRegionMatches(query: string): AdministrativeRegion[] {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length < MIN_LOCAL_MATCH_QUERY_LENGTH) {
    return [];
  }
  return DF_ADMINISTRATIVE_REGIONS.filter((region) =>
    normalize(region.name).includes(normalizedQuery),
  );
}

function toLocalSuggestion(region: AdministrativeRegion): PlaceSuggestion {
  return {
    id: `local-region:${normalize(region.name).replace(/\s+/g, '-')}`,
    placeName: `${region.name}, Brasília - DF`,
    coordinates: region.coordinates,
  };
}

// Tipos de nível "lugar" (cidade/distrito/bairro/estado/país) — usados para a
// consulta `anywherePlaces` abaixo, que garante que cidades/estados distantes
// apareçam mesmo enterrados sob ruído de POIs locais (ver comentário em
// `fetchRemoteSuggestions`).
const PLACE_LEVEL_TYPES = 'place,district,locality,region,country';

async function fetchRemoteSuggestions(
  query: string,
  sessionToken: string,
  proximity: Coordinates | null,
): Promise<PlaceSuggestion[]> {
  if (!proximity) {
    return fetchSuggestions(query, sessionToken, null);
  }

  // `proximity` pesa tanto no ranking da Search Box API que ele consegue
  // esconder até uma correspondência textual exata de outra cidade (ex.:
  // alguém em Brasília digitando "Avenida Paulista, São Paulo" não via a
  // avenida de verdade nos resultados — só ruas de mesmo nome em cidades
  // próximas de Brasília).
  //
  // A consulta sem `proximity` NÃO é neutra como o nome sugere: confirmado
  // testando a API diretamente (comparando lado a lado com `proximity=ip`
  // explícito, que devolveu resultados idênticos) que a Mapbox usa o IP de
  // origem da requisição como proximidade implícita quando o parâmetro é
  // omitido. Como este app é usado majoritariamente por gente no DF, essa
  // consulta "sem viés" acaba tão enviesada para o DF quanto a consulta com
  // proximidade real — e cidades cujo nome colide com POIs/ruas locais (ex.:
  // "Salvador", "Recife", "Curitiba", que também são nomes comuns de salões,
  // ruas e condomínios em Brasília) ficam enterradas em ambas as listas,
  // mesmo sendo capitais de estado reais e bem indexadas pela Mapbox
  // (confirmado testando as 27 capitais brasileiras diretamente na API).
  //
  // Por isso rodamos uma TERCEIRA consulta em paralelo, também sem
  // `proximity` mas restrita a tipos de nível "lugar"
  // (place/district/locality/region/country): sem POIs/ruas concorrendo, ela
  // devolve a cidade/estado certo em primeiro lugar mesmo sofrendo o mesmo
  // viés de IP. A lista local vem primeiro, depois as cidades/estados
  // distantes novos, depois o restante (endereços/POIs distantes) — cada uma
  // só com as entradas que ainda não apareceram nas anteriores.
  const [nearby, anywherePlaces, anywhere] = await Promise.all([
    fetchSuggestions(query, sessionToken, proximity),
    fetchSuggestions(query, sessionToken, null, PLACE_LEVEL_TYPES),
    fetchSuggestions(query, sessionToken, null),
  ]);

  const seenIds = new Set(nearby.map((suggestion) => suggestion.id));
  const distantPlaces = anywherePlaces.filter((suggestion) => !seenIds.has(suggestion.id));
  distantPlaces.forEach((suggestion) => seenIds.add(suggestion.id));
  const distant = anywhere.filter((suggestion) => !seenIds.has(suggestion.id));

  return [...nearby, ...distantPlaces, ...distant];
}

export async function searchPlaces(
  query: string,
  sessionToken: string,
  proximity?: Coordinates | null,
): Promise<PlaceSuggestion[]> {
  const localMatches = findLocalAdministrativeRegionMatches(query);
  const remote = await fetchRemoteSuggestions(query, sessionToken, proximity ?? null);

  const isDuplicateOfLocalMatch = (suggestion: PlaceSuggestion) =>
    localMatches.some(
      (region) => normalize(suggestion.placeName.split(',')[0]) === normalize(region.name),
    );

  const dedupedRemote = remote.filter((suggestion) => !isDuplicateOfLocalMatch(suggestion));

  return [...localMatches.map(toLocalSuggestion), ...dedupedRemote].slice(0, MAX_SUGGESTIONS);
}

interface RetrieveFeature {
  geometry: { coordinates: [number, number] };
}

interface RetrieveResponse {
  features: RetrieveFeature[];
}

export async function retrievePlace(id: string, sessionToken: string): Promise<Coordinates> {
  const url = `${RETRIEVE_BASE_URL}/${id}?access_token=${MAPBOX_TOKEN}&session_token=${sessionToken}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new MapboxRequestError(`Falha ao obter localização do endereço: ${response.status}`);
  }

  const data = (await response.json()) as RetrieveResponse;
  const feature = data.features[0];

  if (!feature) {
    throw new MapboxRequestError('Endereço não encontrado');
  }

  const [lng, lat] = feature.geometry.coordinates;
  return { lng, lat };
}

/**
 * Token de sessão exigido pela Search Box API: deve se manter o mesmo ao
 * longo de uma sequência de `searchPlaces` (suggest) seguida de um
 * `retrievePlace` (retrieve), e ser trocado por um novo a cada busca nova.
 */
export function createSearchSessionToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface DirectionsManeuver {
  instruction: string;
  location: [number, number];
  type: string;
  modifier?: string;
}

interface DirectionsStep {
  maneuver: DirectionsManeuver;
  distance: number;
  duration: number;
}

interface DirectionsLeg {
  steps: DirectionsStep[];
}

interface DirectionsRoute {
  geometry: { coordinates: [number, number][] };
  legs: DirectionsLeg[];
  distance: number;
  duration: number;
}

interface DirectionsResponse {
  routes: DirectionsRoute[];
  code: string;
}

// A API de Directions do Mapbox não tem um perfil dedicado para motos;
// `driving` é o mais próximo (uso de vias veiculares), então mapeamos aqui
// mantendo `motorcycling` como perfil interno para UI, ETA e ícone distintos.
const MAPBOX_DIRECTIONS_PROFILE: Record<TravelProfile, string> = {
  driving: 'driving',
  motorcycling: 'driving',
  walking: 'walking',
  cycling: 'cycling',
};

export async function getDirections(
  origin: Coordinates,
  destination: Coordinates,
  profile: TravelProfile,
): Promise<Route> {
  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `${DIRECTIONS_BASE_URL}/${MAPBOX_DIRECTIONS_PROFILE[profile]}/${coordinates}?geometries=geojson&steps=true&overview=full&language=pt&access_token=${MAPBOX_TOKEN}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new MapboxRequestError(`Falha ao calcular rota: ${response.status}`);
  }

  const data = (await response.json()) as DirectionsResponse;

  if (data.code !== 'Ok' || data.routes.length === 0) {
    throw new MapboxRequestError('Nenhuma rota encontrada para este modo de transporte');
  }

  const mapboxRoute = data.routes[0];

  const steps: RouteStep[] = mapboxRoute.legs.flatMap((leg) =>
    leg.steps.map((step) => ({
      instruction: step.maneuver.instruction,
      distanceMeters: step.distance,
      durationSeconds: step.duration,
      maneuverLocation: { lng: step.maneuver.location[0], lat: step.maneuver.location[1] },
      maneuverType: step.maneuver.type,
      maneuverModifier: step.maneuver.modifier ?? null,
    })),
  );

  return {
    geometry: mapboxRoute.geometry.coordinates.map(([lng, lat]) => ({ lng, lat })),
    steps,
    distanceMeters: mapboxRoute.distance,
    durationSeconds: mapboxRoute.duration,
  };
}
