import { useEffect, useState } from 'react';
import { searchPlaces } from '../../services/mapboxClient';
import type { GeocodingSuggestion } from '../../types';

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;

export function useGeocodingSearch(query: string) {
  const [suggestions, setSuggestions] = useState<GeocodingSuggestion[]>([]);
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
      searchPlaces(query)
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
  }, [query]);

  return { suggestions, isLoading, error };
}
