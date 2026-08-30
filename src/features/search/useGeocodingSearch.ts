import { useCallback, useEffect, useState } from 'react';
import { matchPlaceCategory } from '../../data/placeCategories';
import { searchPlaces, searchPlacesByCategory } from '../../services/geoapifyClient';
import type { Coordinates, GeocodingSuggestion, PlaceSuggestion } from '../../types';

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;
const MAX_SUGGESTIONS = 8;

// Quando a query bate com uma categoria de estabelecimento (farmácia, banco,
// academia...), busca em paralelo por categoria E por texto: a busca por
// categoria acha qualquer estabelecimento daquele tipo mesmo que a marca não
// contenha a palavra buscada no nome (ex.: "banco" também precisa achar
// Bradesco/Itaú, que não tem "banco" no nome); a busca por texto acha o
// nome/marca específico que o usuário digitou (ex.: "panificadora bonanza",
// "taguatinga shopping"), que a busca por categoria descartaria por ignorar
// tudo além da palavra-chave reconhecida.
//
// Os resultados de TEXTO vêm primeiro, e a categoria só completa o que
// sobrar até MAX_SUGGESTIONS — não o contrário. Testado na prática: com a
// categoria vindo primeiro (e ela sozinha já preenche as 8 vagas, já que
// devolve até MAX_SUGGESTIONS por conta própria), o resultado específico
// que o usuário buscou ("Panificadora Bonanza", "Taguatinga Shopping") nunca
// tinha espaço para aparecer — sumia atrás de padarias/shoppings genéricos
// mais próximos, mesmo a busca por texto tendo encontrado exatamente o nome
// buscado como resultado mais relevante.
async function search(query: string, proximity: Coordinates | null): Promise<PlaceSuggestion[]> {
  const category = matchPlaceCategory(query);
  if (!category) {
    return searchPlaces(query, proximity);
  }

  const [byText, byCategory] = await Promise.all([
    searchPlaces(query, proximity),
    searchPlacesByCategory(category, proximity),
  ]);

  const seenIds = new Set(byText.map((suggestion) => suggestion.id));
  const extra = byCategory.filter((suggestion) => !seenIds.has(suggestion.id));

  return [...byText, ...extra].slice(0, MAX_SUGGESTIONS);
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

  // Toda sugestão já chega com coordenadas — a Geoapify devolve tudo em uma
  // única chamada, sem uma segunda etapa de "retrieve" como a Search Box API
  // do Mapbox exigia.
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
