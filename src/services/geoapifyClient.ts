import type { Coordinates, PlaceSuggestion } from '../types';
import type { PlaceCategoryDefinition } from '../data/placeCategories';

const GEOAPIFY_API_KEY = import.meta.env.VITE_GEOAPIFY_API_KEY;
const PLACES_URL = 'https://api.geoapify.com/v2/places';
const SEARCH_RADIUS_METERS = 8000;
const MAX_SUGGESTIONS = 8;

// Fallback usado só quando a busca por categoria acontece sem localização
// atual conhecida — mesmo ponto usado como centro do DF em
// `data/dfAdministrativeRegions.ts` (Plano Piloto).
const DEFAULT_SEARCH_CENTER: Coordinates = { lat: -15.7939, lng: -47.8828 };

export class GeoapifyRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeoapifyRequestError';
  }
}

/**
 * Verifica se uma chave da Geoapify foi configurada (via
 * VITE_GEOAPIFY_API_KEY), para que a aplicação possa exibir um aviso
 * amigável em vez de disparar requisições silenciosas com `apiKey=undefined`.
 */
export function hasGeoapifyApiKey(): boolean {
  return typeof GEOAPIFY_API_KEY === 'string' && GEOAPIFY_API_KEY.trim().length > 0;
}

interface GeoapifyFeature {
  properties: {
    name?: string;
    formatted?: string;
    lat: number;
    lon: number;
    place_id: string;
  };
}

interface GeoapifyResponse {
  features: GeoapifyFeature[];
}

// A Geoapify já devolve os resultados dentro do raio pedido (`filter=circle`)
// ordenados por proximidade (`bias=proximity`) e limitados no servidor
// (`limit`) — ao contrário da Overpass (OSM), que não ordena por distância
// no servidor e exigia reordenar e cortar no cliente. Confirmado testando a
// API diretamente: os 5 primeiros resultados para uma busca de farmácia no
// Plano Piloto vieram em ordem crescente de distância (242m, 628m, 670m...).
export async function searchPlacesByCategory(
  category: PlaceCategoryDefinition,
  proximity: Coordinates | null,
): Promise<PlaceSuggestion[]> {
  const center = proximity ?? DEFAULT_SEARCH_CENTER;
  const params = new URLSearchParams({
    categories: category.geoapifyCategory,
    filter: `circle:${center.lng},${center.lat},${SEARCH_RADIUS_METERS}`,
    bias: `proximity:${center.lng},${center.lat}`,
    limit: String(MAX_SUGGESTIONS),
    lang: 'pt',
    apiKey: GEOAPIFY_API_KEY,
  });
  const response = await fetch(`${PLACES_URL}?${params.toString()}`);

  if (!response.ok) {
    throw new GeoapifyRequestError(
      `Falha na busca de ${category.categoryLabel.toLowerCase()}: ${response.status}`,
    );
  }

  const data = (await response.json()) as GeoapifyResponse;

  // `formatted` já vem como "Nome, Rua, Bairro, Cidade - UF, CEP, País" —
  // pronto para uso direto como rótulo, sem precisar montar o endereço
  // manualmente como era necessário com a Overpass.
  return data.features
    .filter((feature) => feature.properties.formatted)
    .map((feature) => ({
      id: feature.properties.place_id,
      placeName: feature.properties.formatted as string,
      coordinates: { lat: feature.properties.lat, lng: feature.properties.lon },
    }));
}
