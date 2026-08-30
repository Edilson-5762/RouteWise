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

// De quanto em quanto tempo o app re-pede a posição por conta própria. Em
// alguns aparelhos o `watchPosition` do Chrome entrega uma leitura e para de
// disparar; esse polling ativo mantém as leituras chegando.
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 12000;
// Quantas falhas seguidas do polling (sem nenhuma posição ainda) até mostrar
// o erro na tela. Antes disso o app espera — um fix de GPS "frio" leva de 30s
// a 1 min, então falhar rápido demais é o que fazia o app cair para a rede.
const POLL_FAILURES_BEFORE_ERROR = 4;

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
  const watchUpdateCountRef = useRef(0);
  const pollUpdateCountRef = useRef(0);
  const acceptedUpdateCountRef = useRef(0);
  // Falhas consecutivas do polling enquanto ainda não há nenhuma posição — só
  // depois de algumas é que o erro vai para a tela (ver POLL_FAILURES_BEFORE_ERROR).
  const pollFailuresRef = useRef(0);
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
    // Chegou posição — zera a contagem de falhas do polling.
    pollFailuresRef.current = 0;

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
      // O app agora sempre pede alta precisão e nunca cai para o modo rede.
      highAccuracyActive: true,
      rawUpdateCount: watchUpdateCountRef.current + pollUpdateCountRef.current,
      acceptedUpdateCount: acceptedUpdateCountRef.current,
      pollUpdateCount: pollUpdateCountRef.current,
    }));
  }, []);

  const reportFatalError = useCallback((error: GeolocationPositionError) => {
    lastAcceptedPositionRef.current = null;
    setState((prev) => ({
      ...prev,
      position: null,
      speedMetersPerSecond: null,
      headingDegrees: null,
      error: errorMessageForCode(error.code),
      isLoading: false,
    }));
  }, []);

  // Sempre em alta precisão, sem timeout e sem cair para o modo impreciso.
  // O fallback antigo (`enableHighAccuracy: false` após 8s de timeout) era a
  // causa do bug: num aparelho onde o primeiro fix de GPS demora, ele fixava
  // o provedor de localização da página no modo rede e daí NADA — nem o
  // polling em alta precisão — conseguia mais um fix de GPS. O Google Maps no
  // navegador não faz esse downgrade e por isso funciona no mesmo aparelho.
  const watch = useCallback(
    (onFail: (error: GeolocationPositionError) => void) => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = navigator.geolocation.watchPosition(
        (result) => applyReading(result, 'watch'),
        onFail,
        { enableHighAccuracy: true, maximumAge: 0 },
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
    const PERMISSION_DENIED = 1;
    const tick = () => {
      navigator.geolocation.getCurrentPosition(
        (result) => applyReading(result, 'poll'),
        (error) => {
          // Permissão negada é definitivo — mostra o erro na hora.
          if (error.code === PERMISSION_DENIED) {
            reportFatalError(error);
            return;
          }
          // Timeout / indisponível: se já temos uma posição, ignora (é só um
          // tick ruim). Se ainda não temos nenhuma, conta — e só depois de
          // algumas falhas seguidas mostra o erro, para dar tempo de um fix
          // de GPS frio chegar em vez de cair para a rede.
          if (lastAcceptedPositionRef.current) {
            return;
          }
          pollFailuresRef.current += 1;
          if (pollFailuresRef.current >= POLL_FAILURES_BEFORE_ERROR) {
            reportFatalError(error);
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: POLL_TIMEOUT_MS },
      );
    };
    tick();
    pollIdRef.current = setInterval(tick, POLL_INTERVAL_MS);
  }, [applyReading, reportFatalError]);

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
    pollFailuresRef.current = 0;
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      rawUpdateCount: 0,
      acceptedUpdateCount: 0,
      pollUpdateCount: 0,
    }));

    // Só a permissão negada é definitiva no watch. Timeout / indisponível são
    // ignorados aqui — o polling continua tentando (e, se realmente nada vier,
    // é ele quem mostra o erro depois de algumas falhas).
    const PERMISSION_DENIED = 1;
    watch((error) => {
      if (error.code === PERMISSION_DENIED) {
        reportFatalError(error);
      }
    });

    startPolling();
  }, [watch, startPolling, stopAll, reportFatalError]);

  useEffect(() => {
    start();
    return stopAll;
  }, [start, stopAll]);

  return { ...state, retry: start };
}
