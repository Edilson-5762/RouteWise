import { useCallback, useEffect, useRef, useState } from 'react';
import { createSearchSessionToken, retrievePlace, searchPlaces } from '../../services/mapboxClient';
import type { Coordinates, GeocodingSuggestion, PlaceSuggestion } from '../../types';

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;

export function useGeocodingSearch(query: string, proximity?: Coordinates | null) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionTokenRef = useRef(createSearchSessionToken());

  useEffect(() => {
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setError(null);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);

    const timeoutId = setTimeout(() => {
      searchPlaces(query, sessionTokenRef.current, proximity)
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

  // Busca as coordenadas da sugestão escolhida (segunda etapa da Search Box
  // API) e encerra a sessão de busca atual — a próxima digitação usa um novo
  // token, como a Mapbox recomenda.
  const resolveSuggestion = useCallback(
    async (suggestion: PlaceSuggestion): Promise<GeocodingSuggestion> => {
      if (suggestion.coordinates) {
        return { id: suggestion.id, placeName: suggestion.placeName, coordinates: suggestion.coordinates };
      }
      const coordinates = await retrievePlace(suggestion.id, sessionTokenRef.current);
      sessionTokenRef.current = createSearchSessionToken();
      return { id: suggestion.id, placeName: suggestion.placeName, coordinates };
    },
    [],
  );

  return { suggestions, isLoading, error, resolveSuggestion };
}
