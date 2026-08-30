import { useCallback, useState } from 'react';
import type { Dispatch } from 'react';
import { getDirections } from '../../services/mapboxClient';
import type { NavigationAction } from './navigationReducer';
import type { Coordinates, TravelProfile } from '../../types';

export function useRoute(dispatch: Dispatch<NavigationAction>) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planRoute = useCallback(
    async (origin: Coordinates, destination: Coordinates, profile: TravelProfile) => {
      setIsLoading(true);
      setError(null);
      try {
        const route = await getDirections(origin, destination, profile);
        dispatch({ type: 'ROUTE_PLANNED', route });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao calcular a rota.');
      } finally {
        setIsLoading(false);
      }
    },
    [dispatch],
  );

  // Resolve para `true`/`false` (em vez de `void`) para o loop de recálculo por
  // desvio em App.tsx saber se deve continuar tentando ou parar — nunca lança.
  const recalculateRoute = useCallback(
    async (
      origin: Coordinates,
      destination: Coordinates,
      profile: TravelProfile,
    ): Promise<boolean> => {
      setIsLoading(true);
      setError(null);
      try {
        const route = await getDirections(origin, destination, profile);
        dispatch({ type: 'ROUTE_RECALCULATED', route });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao recalcular a rota.');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [dispatch],
  );

  return { planRoute, recalculateRoute, isLoading, error };
}
