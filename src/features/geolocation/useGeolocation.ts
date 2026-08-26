import { useCallback, useEffect, useRef, useState } from 'react';
import type { Coordinates } from '../../types';
import { haversineDistanceMeters } from '../../utils/distance';

interface GeolocationState {
  position: Coordinates | null;
  speedMetersPerSecond: number | null;
  headingDegrees: number | null;
  error: string | null;
  isLoading: boolean;
}

// Piso de tolerância para leituras sem `accuracy` reportado (a Geolocation
// API não garante esse campo em todo navegador/dispositivo).
const MIN_POSITION_DEADBAND_METERS = 3;

// Tempo máximo de espera por um primeiro fix antes de desistir dessa
// tentativa (a API não define timeout por padrão, então sem isto uma
// tentativa que nunca chama sucesso nem erro deixaria o app "carregando"
// para sempre).
const HIGH_ACCURACY_TIMEOUT_MS = 8000;
const FALLBACK_TIMEOUT_MS = 15000;

function errorMessageForCode(code: number): string {
  // code 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
  // (constantes da própria GeolocationPositionError).
  switch (code) {
    case 1:
      return 'Você negou o acesso à localização. Permita o acesso nas configurações do navegador e tente novamente.';
    case 3:
      return 'A localização demorou demais para responder. Tente novamente.';
    default:
      return 'Não foi possível determinar sua localização. Verifique se o serviço de localização do sistema está ativado e tente novamente.';
  }
}

export function useGeolocation(): GeolocationState & { retry: () => void } {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    speedMetersPerSecond: null,
    headingDegrees: null,
    error: null,
    isLoading: true,
  });
  const watchIdRef = useRef<number | null>(null);
  // Última posição aceita (distinta da última lida): o GPS reporta
  // coordenadas levemente diferentes a cada leitura mesmo com o
  // dispositivo parado, tipicamente dentro da própria margem de erro
  // (`accuracy`) do fix — sem filtrar isso, o puck e a câmera de condução,
  // que seguem `position` por referência, reagiam a cada leitura de ruído,
  // produzindo um vaivém visível (a seta "arrastando" de um lado a outro)
  // mesmo com o veículo parado.
  const lastAcceptedPositionRef = useRef<Coordinates | null>(null);

  const watch = useCallback(
    (highAccuracy: boolean, onFail: (error: GeolocationPositionError) => void) => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      watchIdRef.current = navigator.geolocation.watchPosition(
        (result) => {
          const reading: Coordinates = {
            lat: result.coords.latitude,
            lng: result.coords.longitude,
          };
          const deadbandMeters = Math.max(
            Number.isFinite(result.coords.accuracy) ? result.coords.accuracy : 0,
            MIN_POSITION_DEADBAND_METERS,
          );
          const previous = lastAcceptedPositionRef.current;
          // Mantém a mesma referência de posição (em vez de um objeto novo
          // igual em valor) quando a leitura é ruído — isso também evita
          // reprocessamento a jusante (reducer, efeitos de câmera) que
          // dependem de `position` por referência.
          const position =
            previous && haversineDistanceMeters(previous, reading) < deadbandMeters
              ? previous
              : reading;
          lastAcceptedPositionRef.current = position;

          setState({
            position,
            speedMetersPerSecond: result.coords.speed ?? null,
            // `heading` é NaN (não null) quando o dispositivo está parado, por
            // definição da Geolocation API — `?? null` não pega esse caso, então
            // sem o Number.isFinite um GPS parado propagaria NaN e o puck no mapa
            // ficaria girando/piscando a cada leitura mesmo com o veículo desligado.
            headingDegrees: Number.isFinite(result.coords.heading) ? result.coords.heading : null,
            error: null,
            isLoading: false,
          });
        },
        onFail,
        {
          enableHighAccuracy: highAccuracy,
          timeout: highAccuracy ? HIGH_ACCURACY_TIMEOUT_MS : FALLBACK_TIMEOUT_MS,
        },
      );
    },
    [],
  );

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setState({
        position: null,
        speedMetersPerSecond: null,
        headingDegrees: null,
        error: 'Seu navegador não suporta geolocalização.',
        isLoading: false,
      });
      return;
    }

    lastAcceptedPositionRef.current = null;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    const fail = (error: GeolocationPositionError) => {
      lastAcceptedPositionRef.current = null;
      setState({
        position: null,
        speedMetersPerSecond: null,
        headingDegrees: null,
        error: errorMessageForCode(error.code),
        isLoading: false,
      });
    };

    // Primeira tentativa pede alta precisão (GPS). Em desktops/notebooks sem
    // sensor de GPS isso frequentemente falha com POSITION_UNAVAILABLE (ou
    // estoura o timeout) mesmo com a permissão concedida — nesses casos vale
    // tentar de novo em modo impreciso (rede/Wi-Fi), que costuma funcionar
    // onde a alta precisão não funciona. Uma permissão negada (code 1) não
    // se resolve tentando de novo, então esse caso vai direto para o erro
    // final.
    const PERMISSION_DENIED = 1;
    watch(true, (error) => {
      if (error.code === PERMISSION_DENIED) {
        fail(error);
        return;
      }
      watch(false, fail);
    });
  }, [watch]);

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
