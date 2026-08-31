import type { Coordinates, PlaceSuggestion } from '../types';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const GEOCODING_BASE_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const MAX_RESULTS = 10;

export class MapboxGeocodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapboxGeocodingError';
  }
}

/**
 * O geocoder do Mapbox usa o mesmo token do mapa/rotas (VITE_MAPBOX_TOKEN).
 * Exposto para o orquestrador de busca poder simplesmente pular esta fonte
 * quando não houver token, em vez de disparar uma requisição inválida.
 */
export function hasMapboxToken(): boolean {
  return typeof MAPBOX_TOKEN === 'string' && MAPBOX_TOKEN.trim().length > 0;
}

interface MapboxGeocodingFeature {
  id: string;
  place_name: string;
  center: [number, number];
}

interface MapboxGeocodingResponse {
  features: MapboxGeocodingFeature[];
}

// Segunda fonte de busca de endereços/estabelecimentos, usada EM CONJUNTO com
// a Geoapify (ver `useGeocodingSearch`). Cobre endereço de rua e ponto
// comercial com um acerto melhor para digitação incompleta/errada — onde a
// base OpenStreetMap da Geoapify costuma falhar nesta região. Usa o geocoder
// "clássico" (v5), que já devolve coordenadas na própria resposta (uma
// chamada só), sem a etapa de "retrieve" da Search Box API.
export async function searchPlacesMapbox(
  query: string,
  proximity: Coordinates | null,
): Promise<PlaceSuggestion[]> {
  if (!hasMapboxToken()) {
    return [];
  }

  const params = new URLSearchParams({
    country: 'br',
    language: 'pt',
    limit: String(MAX_RESULTS),
    // Endereço, estabelecimento, cidade e bairro — sem país/região/CEP, que
    // seriam ruído para um destino de navegação.
    types: 'address,poi,place,locality,neighborhood',
    autocomplete: 'true',
    access_token: MAPBOX_TOKEN as string,
  });
  if (proximity) {
    params.set('proximity', `${proximity.lng},${proximity.lat}`);
  }

  const response = await fetch(
    `${GEOCODING_BASE_URL}/${encodeURIComponent(query)}.json?${params.toString()}`,
  );

  if (!response.ok) {
    throw new MapboxGeocodingError(`Falha na busca de endereço (Mapbox): ${response.status}`);
  }

  const data = (await response.json()) as MapboxGeocodingResponse;

  return data.features
    .filter((feature) => Array.isArray(feature.center) && feature.center.length === 2)
    .map((feature) => ({
      // Prefixo para o id nunca colidir com o `place_id` da Geoapify quando as
      // duas fontes são mescladas.
      id: `mapbox:${feature.id}`,
      placeName: feature.place_name,
      coordinates: { lat: feature.center[1], lng: feature.center[0] },
    }));
}
