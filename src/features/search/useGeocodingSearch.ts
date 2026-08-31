import { useCallback, useEffect, useState } from 'react';
import { matchPlaceCategory } from '../../data/placeCategories';
import {
  searchPlaces,
  searchPlacesByCategory,
  searchPlacesFullText,
} from '../../services/geoapifyClient';
import { searchPlacesMapbox } from '../../services/mapboxGeocodingClient';
import type { Coordinates, GeocodingSuggestion, PlaceSuggestion } from '../../types';

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;
const MAX_SUGGESTIONS = 12;
// Teto por provedor: como as fontes são consultadas em paralelo e o resultado
// só aparece quando todas respondem, uma fonte lenta/travada seguraria a busca
// inteira. Passado o teto, ela conta como "sem resposta" (lista vazia).
const PROVIDER_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('geocoder-timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

// O mesmo lugar vindo de provedores diferentes (Geoapify x Mapbox) tem ids
// distintos, mas coordenadas quase iguais. ~4 casas decimais ≈ 11 m — junta as
// duplicatas sem colapsar dois estabelecimentos vizinhos de verdade.
function proximityKey(suggestion: PlaceSuggestion): string {
  const coords = suggestion.coordinates;
  return coords
    ? `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`
    : suggestion.placeName.trim().toLowerCase();
}

function dedupeByProximity(suggestions: PlaceSuggestion[]): PlaceSuggestion[] {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = proximityKey(suggestion);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// Intercala as listas das fontes (round-robin), preservando a ordem dentro de
// cada uma — assim um bom resultado da 2ª fonte aparece logo no topo em vez de
// ficar preso atrás da fila inteira da 1ª.
function interleave(lists: PlaceSuggestion[][]): PlaceSuggestion[] {
  const merged: PlaceSuggestion[] = [];
  const longest = lists.reduce((max, list) => Math.max(max, list.length), 0);
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      if (i < list.length) {
        merged.push(list[i]);
      }
    }
  }
  return merged;
}

// Busca em várias fontes ao mesmo tempo e mescla:
//  - Geoapify /autocomplete + Geoapify /search + Mapbox geocoder → busca por
//    TEXTO (o nome/endereço específico que a pessoa digitou);
//  - Geoapify Places por categoria → só quando a query bate com um tipo de
//    estabelecimento (farmácia, banco, academia...), e só para COMPLETAR as
//    vagas que sobrarem — um "Bradesco" digitado tem que vir antes de uma
//    agência genérica mais próxima.
// Uma fonte fora do ar não derruba a busca: só é erro se TODAS falharem.
async function search(query: string, proximity: Coordinates | null): Promise<PlaceSuggestion[]> {
  const category = matchPlaceCategory(query);

  // Só as fontes que a gente de fato tentou entram na conta de "tudo falhou" —
  // sem um placeholder resolvido escondendo uma queda geral de rede.
  const tasks: Promise<PlaceSuggestion[]>[] = [
    withTimeout(searchPlaces(query, proximity), PROVIDER_TIMEOUT_MS),
    withTimeout(searchPlacesFullText(query, proximity), PROVIDER_TIMEOUT_MS),
    withTimeout(searchPlacesMapbox(query, proximity), PROVIDER_TIMEOUT_MS),
  ];
  if (category) {
    tasks.push(withTimeout(searchPlacesByCategory(category, proximity), PROVIDER_TIMEOUT_MS));
  }

  const outcomes = await Promise.allSettled(tasks);
  if (outcomes.every((outcome) => outcome.status === 'rejected')) {
    throw (outcomes[0] as PromiseRejectedResult).reason;
  }

  const resultOf = (index: number): PlaceSuggestion[] =>
    outcomes[index]?.status === 'fulfilled'
      ? (outcomes[index] as PromiseFulfilledResult<PlaceSuggestion[]>).value
      : [];

  const byText = dedupeByProximity(
    interleave([resultOf(0), resultOf(2), resultOf(1)]),
  );
  const seen = new Set(byText.map(proximityKey));
  const byCategory = dedupeByProximity(category ? resultOf(3) : []).filter(
    (suggestion) => !seen.has(proximityKey(suggestion)),
  );

  return [...byText, ...byCategory].slice(0, MAX_SUGGESTIONS);
}

export function useGeocodingSearch(query: string, proximity?: Coordinates | null) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setError(null);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);

    const timeoutId = setTimeout(() => {
      search(query, proximity ?? null)
        .then((results) => {
          if (!isCancelled) {
            setSuggestions(results);
            setError(null);
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setError('Não foi possível buscar endereços agora. Tente novamente.');
            setSuggestions([]);
          }
        })
        .finally(() => {
          if (!isCancelled) {
            setIsLoading(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [query, proximity]);

  // Toda sugestão já chega com coordenadas — tanto a Geoapify quanto o
  // geocoder clássico do Mapbox devolvem tudo em uma única chamada, sem uma
  // segunda etapa de "retrieve".
  const resolveSuggestion = useCallback(
    async (suggestion: PlaceSuggestion): Promise<GeocodingSuggestion> => {
      return {
        id: suggestion.id,
        placeName: suggestion.placeName,
        coordinates: suggestion.coordinates as Coordinates,
      };
    },
    [],
  );

  return { suggestions, isLoading, error, resolveSuggestion };
}
