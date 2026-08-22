import { useCallback, useEffect, useRef, useState } from 'react';
import type { Coordinates } from '../../types';

interface GeolocationState {
  position: Coordinates | null;
  error: string | null;
  isLoading: boolean;
}

export function useGeolocation(): GeolocationState & { retry: () => void } {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    error: null,
    isLoading: true,
  });
  const watchIdRef = useRef<number | null>(null);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setState({
        position: null,
        error: 'Seu navegador não suporta geolocalização.',
        isLoading: false,
      });
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    watchIdRef.current = navigator.geolocation.watchPosition(
      (result) => {
        setState({
          position: { lat: result.coords.latitude, lng: result.coords.longitude },
          error: null,
          isLoading: false,
        });
      },
      () => {
        setState({
          position: null,
          error: 'Não foi possível acessar sua localização. Permita o acesso e tente novamente.',
          isLoading: false,
        });
      },
      { enableHighAccuracy: true },
    );
  }, []);

  useEffect(() => {
    startWatching();
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [startWatching]);

  return { ...state, retry: startWatching };
}
