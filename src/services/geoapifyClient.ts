import type { Coordinates, PlaceSuggestion } from '../types';
import type { PlaceCategoryDefinition } from '../data/placeCategories';

const GEOAPIFY_API_KEY = import.meta.env.VITE_GEOAPIFY_API_KEY;
const PLACES_URL = 'https://api.geoapify.com/v2/places';
const AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';
const SEARCH_RADIUS_METERS = 8000;
const MAX_SUGGESTIONS = 8;

// Fallback usado só quando a busca acontece sem localização atual conhecida.
// Ponto central do Plano Piloto (Brasília), já que este app é usado
// majoritariamente por gente no DF.
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

function toSuggestions(data: GeoapifyResponse): PlaceSuggestion[] {
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

  return toSuggestions((await response.json()) as GeoapifyResponse);
}

// Busca por texto livre (Geocoding/Autocomplete API): acha endereços, bairros
// e cidades (inclusive do DF, que a Search Box API do Mapbox nunca indexou
// como place/district/locality — confirmado testando "Águas Claras",
// "Taguatinga" etc. diretamente) e também estabelecimentos/marcas pelo nome
// (ex.: "Bradesco", "Smart Fit", "Panificadora Bonanza") — algo que a busca
// só por categoria não pode fazer, já que ela descarta o texto digitado e
// devolve só os mais próximos de um tipo, não um nome específico.
//
// Sem `filter=circle` aqui, de propósito: restringir por raio excluiria
// bairros/cidades legítimas mais distantes do centro padrão do que o raio de
// busca por categoria (confirmado: "Águas Claras" só aparece sem esse
// filtro — um raio de 8km a partir do Plano Piloto já a exclui). `bias`
// favorece o que está perto sem descartar o que está longe.
export async function searchPlaces(
  query: string,
  proximity: Coordinates | null,
): Promise<PlaceSuggestion[]> {
  const center = proximity ?? DEFAULT_SEARCH_CENTER;
  const params = new URLSearchParams({
    text: query,
    bias: `proximity:${center.lng},${center.lat}`,
    // Restringe ao Brasil (sem restringir por raio, ver comentário acima) —
    // sem isso, uma marca comum cujo nome também é um topônimo em outro país
    // (ex.: "Santander", cidade na Colômbia; "Bradesco" sozinho, sem cidade
    // junto, competindo com um bairro de mesmo nome no Pará) aparecia antes
    // da agência bancária de verdade no DF, mesmo com `bias=proximity`
    // apontando para cá. Confirmado testando a API diretamente: com esse
    // filtro, "santander"/"bradesco" passam a competir só com lugares do
    // Brasil, e bairros legítimos do DF (ex. "Águas Claras") continuam
    // aparecendo normalmente.
    filter: 'countrycode:br',
    limit: String(MAX_SUGGESTIONS),
    lang: 'pt',
    apiKey: GEOAPIFY_API_KEY,
  });
  const response = await fetch(`${AUTOCOMPLETE_URL}?${params.toString()}`);

  if (!response.ok) {
    throw new GeoapifyRequestError(`Falha na busca de endereço: ${response.status}`);
  }

  return toSuggestions((await response.json()) as GeoapifyResponse);
}
