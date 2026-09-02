import { useCallback, useEffect, useRef, useState } from 'react';
import { matchPlaceCategory } from '../../data/placeCategories';
import {
  searchPlaces,
  searchPlacesByCategory,
  searchPlacesFullText,
} from '../../services/geoapifyClient';
import { searchPlacesMapbox } from '../../services/mapboxGeocodingClient';
import { searchDfHealthUnits } from '../../data/dfHealthUnits';
import { searchDeepOsm } from '../../services/overpassClient';
import { searchPhoton } from '../../services/photonClient';
import type { Coordinates, GeocodingSuggestion, PlaceSuggestion } from '../../types';

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;
const MAX_SUGGESTIONS = 12;
// Teto por provedor: como as fontes são consultadas em paralelo e o resultado
// só aparece quando todas respondem, uma fonte lenta/travada seguraria a busca
// inteira. Passado o teto, ela conta como "sem resposta" (lista vazia).
const PROVIDER_TIMEOUT_MS = 4000;
// Segundo passe ("busca de reforço"): quando o passe rápido traz pouco,
// consulta o OSM cru (Overpass) e o Photon em segundo plano e completa a
// lista. Só dispara com o passe rápido abaixo do piso, texto longo o
// bastante, e respeitado um descanso entre consultas (uso justo).
const DEEP_SEARCH_MIN_QUERY_LENGTH = 4;
const DEEP_SEARCH_RESULT_FLOOR = 3;
const DEEP_SEARCH_COOLDOWN_MS = 3000;

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

// Busca em duas etapas:
//  1) Passe rápido — cadastro local de unidades de saúde no topo +
//     Geoapify (/autocomplete e /search) + Mapbox + Geoapify Places por
//     categoria. Igual ao de sempre; entregue via `onFastResults` assim
//     que fica pronto.
//  2) Segundo passe (só quando o passe rápido traz < DEEP_SEARCH_RESULT_FLOOR
//     e a query tem tamanho suficiente; se o descanso ainda não passou, o
//     passe ESPERA o restante em vez de pular) — Overpass + Photon em
//     paralelo; os achados são anexados ao fim, sem duplicar.
// O segundo passe é `allSettled` e nunca relança: só o passe rápido
// produz o erro de "todas as fontes falharam".
async function search(
  query: string,
  proximity: Coordinates | null,
  signal: AbortSignal,
  lastDeepSearchAtRef: { current: number },
  onFastResults: (results: PlaceSuggestion[]) => void,
): Promise<PlaceSuggestion[]> {
  const localUnits = searchDfHealthUnits(query, proximity);
  const category = matchPlaceCategory(query);

  const tasks: Promise<PlaceSuggestion[]>[] = [
    withTimeout(searchPlaces(query, proximity), PROVIDER_TIMEOUT_MS),
    withTimeout(searchPlacesFullText(query, proximity), PROVIDER_TIMEOUT_MS),
    withTimeout(searchPlacesMapbox(query, proximity), PROVIDER_TIMEOUT_MS),
  ];
  if (category) {
    tasks.push(withTimeout(searchPlacesByCategory(category, proximity), PROVIDER_TIMEOUT_MS));
  }

  const outcomes = await Promise.allSettled(tasks);
  if (outcomes.every((outcome) => outcome.status === 'rejected') && localUnits.length === 0) {
    throw (outcomes[0] as PromiseRejectedResult).reason;
  }

  const resultOf = (index: number): PlaceSuggestion[] =>
    outcomes[index]?.status === 'fulfilled'
      ? (outcomes[index] as PromiseFulfilledResult<PlaceSuggestion[]>).value
      : [];

  const byText = dedupeByProximity(interleave([resultOf(0), resultOf(2), resultOf(1)]));
  const seen = new Set(byText.map(proximityKey));
  const byCategory = dedupeByProximity(category ? resultOf(3) : []).filter(
    (suggestion) => !seen.has(proximityKey(suggestion)),
  );

  const fastList = dedupeByProximity([...localUnits, ...byText, ...byCategory]).slice(
    0,
    MAX_SUGGESTIONS,
  );
  onFastResults(fastList);

  // Vale a pena o segundo passe? Depende só do que o passe rápido trouxe, do
  // tamanho do texto e de não estar abortado — NÃO do descanso. O descanso
  // vira espera, não desistência: o efeito só re-roda quando `query`/
  // `proximity` mudam, então pular aqui deixaria a query em que o usuário
  // realmente parou sem reforço para sempre.
  const wantsDeepPass =
    fastList.length < DEEP_SEARCH_RESULT_FLOOR &&
    query.trim().length >= DEEP_SEARCH_MIN_QUERY_LENGTH &&
    !signal.aborted;

  if (!wantsDeepPass) {
    return fastList;
  }

  // Descanso de 3 s entre consultas profundas (uso justo do Overpass
  // público): se a última começou há pouco, ESPERA o tempo que falta antes
  // de disparar, em vez de pular o passe. Um abort durante a espera encerra
  // na hora e sai sem disparar nada.
  const sinceLast = Date.now() - lastDeepSearchAtRef.current;
  if (sinceLast < DEEP_SEARCH_COOLDOWN_MS) {
    const waitMs = DEEP_SEARCH_COOLDOWN_MS - sinceLast;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, waitMs);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
    if (signal.aborted) {
      return fastList;
    }
  }

  // Arma o descanso só agora, quando o passe vai mesmo disparar: um abort no
  // passe rápido OU durante a espera acima não "gasta" o descanso.
  lastDeepSearchAtRef.current = Date.now();
  const deepOutcomes = await Promise.allSettled([
    searchDeepOsm(query, proximity, signal),
    searchPhoton(query, proximity, signal),
  ]);

  // Falha do segundo passe é silenciosa na tela (spec: nunca vira `error`),
  // mas deixamos um rastro no console para diagnosticar um reforço morto em
  // produção. Roda mesmo com o signal abortado.
  for (const outcome of deepOutcomes) {
    if (outcome.status === 'rejected') {
      console.warn('[busca de reforço] fonte falhou:', outcome.reason);
    }
  }

  if (signal.aborted) {
    return fastList;
  }

  const deepOf = (index: number): PlaceSuggestion[] =>
    deepOutcomes[index]?.status === 'fulfilled'
      ? (deepOutcomes[index] as PromiseFulfilledResult<PlaceSuggestion[]>).value
      : [];

  // `fastList` na frente: se o mesmo lugar vier dos dois, a versão do
  // passe rápido (rótulo melhor) vence na deduplicação.
  return dedupeByProximity([...fastList, ...deepOf(0), ...deepOf(1)]).slice(0, MAX_SUGGESTIONS);
}

export function useGeocodingSearch(query: string, proximity?: Coordinates | null) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Marca de quando o último segundo passe começou. Num `useRef` (não em
  // estado de módulo): vive enquanto a busca está montada — a sessão de
  // uso — e não vaza entre montagens/testes.
  const lastDeepSearchAtRef = useRef(0);

  useEffect(() => {
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setError(null);
      return;
    }

    let isCancelled = false;
    const deepController = new AbortController();
    setIsLoading(true);

    const timeoutId = setTimeout(() => {
      search(query, proximity ?? null, deepController.signal, lastDeepSearchAtRef, (fast) => {
        if (!isCancelled) {
          setSuggestions(fast);
          setError(null);
          setIsLoading(false);
        }
      })
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
      deepController.abort();
    };
  }, [query, proximity]);

  // Toda sugestão já chega com coordenadas — Geoapify, Mapbox, cadastro
  // local e o segundo passe (Overpass/Photon) devolvem tudo numa chamada.
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
