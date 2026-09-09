import type { Coordinates, PlaceSuggestion } from '../types';
import { normalize } from '../utils/text';
import { haversineDistanceMeters } from '../utils/distance';

// Cadastro local de LUGARES comuns do DF (não-saúde) que os geocoders
// (Geoapify / Mapbox / Photon / Overpass) não acham ou colocam no lugar
// errado. Curado à mão a partir de coordenadas conferidas no Google Maps /
// street test. Injetado no topo do passe rápido de `useGeocodingSearch`,
// igual ao cadastro de unidades de saúde (`dfHealthUnits.ts`) — a versão
// local vence a do geocoder na deduplicação (rótulo melhor + coordenada
// exata usada como destino da navegação).
export interface DfLocalPlace {
  /** `local-*` — slug estável. */
  id: string;
  /** Rótulo pronto para a lista de sugestões. */
  displayName: string;
  /** Coordenada de DESTINO — de preferência a entrada principal, não o centro do lote. */
  coordinates: Coordinates;
  /** Nome + apelidos + termos de endereço, normalizado; casado por substring de token. */
  searchText: string;
}

export const DF_LOCAL_PLACES: DfLocalPlace[] = [
  {
    id: 'local-atacadao-dia-a-dia-vicente-pires',
    displayName: 'Atacadão Dia a Dia, Rua 4A, Vicente Pires, Brasília - DF',
    // Entrada principal (conferida em street test 2026-09-08). Fica ~94 m ao
    // norte da coordenada do endereço da Rua 4A; usar a do endereço fazia a
    // navegação encerrar 30–40 m antes da porta.
    coordinates: { lat: -15.813558, lng: -48.016237 },
    searchText:
      'atacadao dia a dia atacadao dia dia supermercado atacado vicente pires rua 4a rua 04a',
  },
  {
    id: 'local-edificio-meridien-vicente-pires',
    displayName: 'Edifício Meridien, 286, St. Hab. Vicente Pires, Brasília - DF',
    coordinates: { lat: -15.814632, lng: -48.018474 },
    searchText:
      'edificio meridien predio meridien residencial meridien vicente pires 286 setor habitacional',
  },
];

// Tokens genéricos / de ligação / de endereço: sozinhos não distinguem um
// lugar. Uma busca só com estes (ex.: "vicente pires") não aciona o cadastro.
const GENERIC_TOKENS = new Set([
  'a',
  'o',
  'e',
  'de',
  'da',
  'do',
  'dos',
  'das',
  'rua',
  'r',
  'av',
  'avenida',
  'quadra',
  'lote',
  'setor',
  'st',
  'hab',
  'habitacional',
  'condominio',
  'residencial',
  'edificio',
  'edif',
  'ed',
  'predio',
  'bloco',
  'brasilia',
  'df',
  'vicente',
  'pires',
]);

// Casa o cadastro local de lugares contra o texto digitado. Puro e síncrono —
// não faz rede, não lança. Retorna [] quando a query é vazia, ou só tem
// termos genéricos/de endereço, ou não casa com nada.
export function searchDfLocalPlaces(
  query: string,
  proximity: Coordinates | null,
  limit = 6,
): PlaceSuggestion[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const hasDistinctive = tokens.some((t) => !GENERIC_TOKENS.has(t));
  if (!hasDistinctive) return [];

  const matches = DF_LOCAL_PLACES.filter((place) =>
    tokens.every((token) => place.searchText.includes(token)),
  );

  const ranked = matches.slice().sort((a, b) => {
    if (proximity) {
      return (
        haversineDistanceMeters(proximity, a.coordinates) -
        haversineDistanceMeters(proximity, b.coordinates)
      );
    }
    if (a.searchText.length !== b.searchText.length) {
      return a.searchText.length - b.searchText.length;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  return ranked.slice(0, limit).map((place) => ({
    id: place.id,
    placeName: place.displayName,
    coordinates: place.coordinates,
  }));
}
