import { useCallback, useEffect, useRef, useState } from 'react';
import type { Coordinates, TravelProfile } from '../../types';

// Enquanto o usuário está fora da rota, tenta recalcular repetidamente — a cada
// ~5s — até uma rota nova ser aceita ou ele reencontrar a rota (o reducer
// limpa `deviated` nos dois casos). A cada falha de rede/API o intervalo cresce
// um pouco; após 6 falhas seguidas o hook desiste e expõe `hasGivenUp` para a
// UI mostrar um erro com botão de "tentar de novo" (`retry`).
const RETRY_BASE_MS = 3000;
const RETRY_MAX_MS = 20000;
const MAX_CONSECUTIVE_FAILURES = 6;

interface Params {
  deviated: boolean;
  navigating: boolean;
  origin: Coordinates | null;
  destination: Coordinates | null;
  profile: TravelProfile;
  recalculate: (
    origin: Coordinates,
    destination: Coordinates,
    profile: TravelProfile,
  ) => Promise<boolean>;
}

interface Result {
  isRecalculating: boolean;
  hasGivenUp: boolean;
  retry: () => void;
}

export function useRouteRecalcOnDeviation({
  deviated,
  navigating,
  origin,
  destination,
  profile,
  recalculate,
}: Params): Result {
  // `origin` muda de referência a cada tick de GPS; guardá-la num ref (em vez de
  // deixá-la nas deps do efeito) mantém o intervalo num ritmo fixo de 5s em vez
  // de reiniciar a cada nova posição — e ainda garante que cada tentativa parte
  // da posição mais recente.
  const originRef = useRef(origin);
  originRef.current = origin;

  const failuresRef = useRef(0);
  const inFlightRef = useRef(false);
  const [hasGivenUp, setHasGivenUp] = useState(false);

  const active = deviated && navigating && destination != null && !hasGivenUp;

  const retry = useCallback(() => {
    failuresRef.current = 0;
    setHasGivenUp(false);
  }, []);

  // Sair da navegação encerra o episódio: sem isso, `hasGivenUp` de uma
  // navegação anterior sobreviveria e bloquearia o recálculo da próxima.
  useEffect(() => {
    if (!navigating) {
      failuresRef.current = 0;
      setHasGivenUp(false);
    }
  }, [navigating]);

  // Voltar do segundo plano (ex.: fim de uma ligação durante o trajeto) zera as
  // falhas acumuladas enquanto a rede estava suspensa e recomeça as tentativas.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        retry();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [retry]);

  useEffect(() => {
    if (!active || destination == null) {
      failuresRef.current = 0;
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleNext = () => {
      if (cancelled) return;
      const delay = Math.min(RETRY_BASE_MS * Math.max(failuresRef.current, 1), RETRY_MAX_MS);
      timer = setTimeout(run, delay);
    };

    const run = async () => {
      if (cancelled) return;
      const from = originRef.current;
      if (from == null || inFlightRef.current) {
        scheduleNext();
        return;
      }

      inFlightRef.current = true;
      let succeeded = false;
      try {
        succeeded = await recalculate(from, destination, profile);
      } finally {
        inFlightRef.current = false;
      }
      if (cancelled) return;

      if (succeeded) {
        failuresRef.current = 0;
        return;
      }

      failuresRef.current += 1;
      if (failuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
        setHasGivenUp(true);
        return;
      }
      scheduleNext();
    };

    void run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, destination, profile, recalculate]);

  return {
    isRecalculating: deviated && navigating && !hasGivenUp,
    hasGivenUp,
    retry,
  };
}
