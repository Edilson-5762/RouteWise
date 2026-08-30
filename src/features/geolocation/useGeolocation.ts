import { useCallback, useEffect, useRef, useState } from 'react';
import type { Coordinates } from '../../types';
import { haversineDistanceMeters } from '../../utils/distance';

interface GeolocationState {
  position: Coordinates | null;
  speedMetersPerSecond: number | null;
  headingDegrees: number | null;
  error: string | null;
  isLoading: boolean;
  // Campos de diagnóstico (usados pelo painel `?debug=1`): `accuracyMeters` é o
  // raio de erro da última leitura crua; `highAccuracyActive` diz se o watch
  // atual está em modo GPS ou caiu para o modo impreciso (rede); os contadores
  // separam "quantas leituras chegaram" (via watch + via polling) de "quantas
  // passaram do filtro de ruído" — é o que distingue um GPS que não atualiza de
  // um filtro rígido demais engolindo o movimento real.
  accuracyMeters: number | null;
  highAccuracyActive: boolean;
  rawUpdateCount: number;
  acceptedUpdateCount: number;
  pollUpdateCount: number;
}

// Piso de tolerância para leituras sem `accuracy` reportado (a Geolocation
// API não garante esse campo em todo navegador/dispositivo).
const MIN_POSITION_DEADBAND_METERS = 3;
// Teto do filtro de ruído. Sem isto, o filtro usava o `accuracy` cru do GPS —
// que no celular vai de 20m a (num fix de rede) 2000m — como limite de
// movimento, então qualquer deslocamento menor que essa margem era descartado
// como ruído e o puck/câmera congelavam. Com o teto, uma leitura imprecisa não
// consegue mais travar o rastreamento.
const MAX_POSITION_DEADBAND_METERS = 25;
// Acima disto o próprio GPS está dizendo que o aparelho se move — nesse caso a
// leitura é aceita na hora, sem passar pelo filtro de ruído (~2,5 km/h).
const MOVING_SPEED_THRESHOLD_MPS = 0.7;

// Tempo máximo de espera por um primeiro fix antes de desistir dessa
// tentativa (a API não define timeout por padrão, então sem isto uma
// tentativa que nunca chama sucesso nem erro deixaria o app "carregando"
// para sempre).
const HIGH_ACCURACY_TIMEOUT_MS = 8000;
const FALLBACK_TIMEOUT_MS = 15000;

// De quanto em quanto tempo o app re-pede a posição por conta própria. Em
// alguns aparelhos o `watchPosition` do Chrome entrega uma leitura e para de
// disparar; esse polling ativo mantém as leituras chegando e é o que faz o
// navegador "acordar" o GPS em vez de ficar num fix de rede.
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 10000;

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
    accuracyMeters: null,
    highAccuracyActive: true,
    rawUpdateCount: 0,
    acceptedUpdateCount: 0,
    pollUpdateCount: 0,
  });
  const watchIdRef = useRef<number | null>(null);
  const pollIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const highAccuracyActiveRef = useRef(true);
  const watchUpdateCountRef = useRef(0);
  const pollUpdateCountRef = useRef(0);
  const acceptedUpdateCountRef = useRef(0);
  // Última posição aceita (distinta da última lida): o GPS reporta
  // coordenadas levemente diferentes a cada leitura mesmo com o
  // dispositivo parado, tipicamente dentro da própria margem de erro
  // (`accuracy`) do fix — sem filtrar isso, o puck e a câmera de condução,
  // que seguem `position` por referência, reagiam a cada leitura de ruído,
  // produzindo um vaivém visível (a seta "arrastando" de um lado a outro)
  // mesmo com o veículo parado.
  const lastAcceptedPositionRef = useRef<Coordinates | null>(null);

  // Processa uma leitura vinda de qualquer fonte (watch ou polling) pelo mesmo
  // caminho: filtro de ruído -> estado.
  const applyReading = useCallback((result: GeolocationPosition, source: 'watch' | 'poll') => {
    const reading: Coordinates = {
      lat: result.coords.latitude,
      lng: result.coords.longitude,
    };
    const accuracyMeters = Number.isFinite(result.coords.accuracy) ? result.coords.accuracy : null;
    const speed = Number.isFinite(result.coords.speed) ? (result.coords.speed as number) : null;
    const deviceIsMoving = speed !== null && speed > MOVING_SPEED_THRESHOLD_MPS;

    const deadbandMeters = deviceIsMoving
      ? MIN_POSITION_DEADBAND_METERS
      : Math.min(
          Math.max(accuracyMeters ?? 0, MIN_POSITION_DEADBAND_METERS),
          MAX_POSITION_DEADBAND_METERS,
        );

    const previous = lastAcceptedPositionRef.current;
    // Mantém a mesma referência de posição (em vez de um objeto novo igual em
    // valor) quando a leitura é ruído — isso também evita reprocessamento a
    // jusante (reducer, efeitos de câmera) que dependem de `position` por
    // referência.
    const isRealMovement =
      !previous || haversineDistanceMeters(previous, reading) >= deadbandMeters;
    const position = isRealMovement ? reading : previous;
    lastAcceptedPositionRef.current = position;

    if (source === 'watch') {
      watchUpdateCountRef.current += 1;
    } else {
      pollUpdateCountRef.current += 1;
    }
    if (isRealMovement) {
      acceptedUpdateCountRef.current += 1;
    }

    setState((prev) => ({
      ...prev,
      position,
      speedMetersPerSecond: result.coords.speed ?? null,
      // `heading` é NaN (não null) quando o dispositivo está parado, por
      // definição da Geolocation API — `?? null` não pega esse caso, então sem
      // o Number.isFinite um GPS parado propagaria NaN e o puck no mapa ficaria
      // girando/piscando a cada leitura mesmo com o veículo desligado.
      headingDegrees: Number.isFinite(result.coords.heading) ? result.coords.heading : null,
      error: null,
      isLoading: false,
      accuracyMeters,
      highAccuracyActive: highAccuracyActiveRef.current,
      rawUpdateCount: watchUpdateCountRef.current + pollUpdateCountRef.current,
      acceptedUpdateCount: acceptedUpdateCountRef.current,
      pollUpdateCount: pollUpdateCountRef.current,
    }));
  }, []);

  const watch = useCallback(
    (highAccuracy: boolean, onFail: (error: GeolocationPositionError) => void) => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      highAccuracyActiveRef.current = highAccuracy;

      watchIdRef.current = navigator.geolocation.watchPosition(
        (result) => applyReading(result, 'watch'),
        onFail,
        {
          enableHighAccuracy: highAccuracy,
          timeout: highAccuracy ? HIGH_ACCURACY_TIMEOUT_MS : FALLBACK_TIMEOUT_MS,
        },
      );
    },
    [applyReading],
  );

  // Polling ativo: re-pede a posição a cada POLL_INTERVAL_MS, sempre em alta
  // precisão e sem cache. É a rede de segurança para aparelhos onde o
  // `watchPosition` entrega uma leitura e para.
  const startPolling = useCallback(() => {
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.geolocation?.getCurrentPosition !== 'function'
    ) {
      return;
    }
    if (pollIdRef.current !== null) {
      clearInterval(pollIdRef.current);
    }
    const tick = () => {
      navigator.geolocation.getCurrentPosition(
        (result) => applyReading(result, 'poll'),
        () => {
          // Erros do polling são silenciosos de propósito: um timeout ou
          // "position unavailable" pontual aqui não deve apagar a última
          // posição boa nem trocar a tela pelo banner de erro — quem trata
          // falha de verdade (permissão negada, etc.) é o `watch`.
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: POLL_TIMEOUT_MS },
      );
    };
    tick();
    pollIdRef.current = setInterval(tick, POLL_INTERVAL_MS);
  }, [applyReading]);

  const stopAll = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (pollIdRef.current !== null) {
      clearInterval(pollIdRef.current);
      pollIdRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        position: null,
        speedMetersPerSecond: null,
        headingDegrees: null,
        error: 'Seu navegador não suporta geolocalização.',
        isLoading: false,
      }));
      return;
    }

    stopAll();
    lastAcceptedPositionRef.current = null;
    watchUpdateCountRef.current = 0;
    pollUpdateCountRef.current = 0;
    acceptedUpdateCountRef.current = 0;
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      rawUpdateCount: 0,
      acceptedUpdateCount: 0,
      pollUpdateCount: 0,
    }));

    const fail = (error: GeolocationPositionError) => {
      lastAcceptedPositionRef.current = null;
      setState((prev) => ({
        ...prev,
        position: null,
        speedMetersPerSecond: null,
        headingDegrees: null,
        error: errorMessageForCode(error.code),
        isLoading: false,
        highAccuracyActive: highAccuracyActiveRef.current,
      }));
    };

    // Primeira tentativa do watch pede alta precisão (GPS). Em desktops sem
    // sensor de GPS isso frequentemente falha com POSITION_UNAVAILABLE (ou
    // estoura o timeout) mesmo com a permissão concedida — nesses casos vale
    // tentar de novo em modo impreciso (rede/Wi-Fi). Uma permissão negada
    // (code 1) não se resolve tentando de novo, então vai direto para o erro.
    const PERMISSION_DENIED = 1;
    watch(true, (error) => {
      if (error.code === PERMISSION_DENIED) {
        fail(error);
        return;
      }
      watch(false, fail);
    });

    // O polling roda em paralelo ao watch, sempre em alta precisão.
    startPolling();
  }, [watch, startPolling, stopAll]);

  useEffect(() => {
    start();
    return stopAll;
  }, [start, stopAll]);

  return { ...state, retry: start };
}
