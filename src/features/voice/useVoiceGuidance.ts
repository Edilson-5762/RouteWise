import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'routewise-voice-muted';

// A instrução é anunciada em dois momentos, por DISTÂNCIA até a manobra (não
// quando o passo muda — que era tarde demais, já em cima da curva):
//  - ~180 m: aviso antecipado ("Em 180 metros, vire à esquerda");
//  - ~45 m: a ordem em si ("Vire à esquerda").
const FAR_THRESHOLD_METERS = 180;
const NEAR_THRESHOLD_METERS = 45;

function readInitialMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function lowerFirst(text: string): string {
  return text.length > 0 ? text[0].toLowerCase() + text.slice(1) : text;
}

function speak(phrase: string): void {
  const utterance = new SpeechSynthesisUtterance(phrase);
  utterance.lang = 'pt-BR';
  window.speechSynthesis.speak(utterance);
}

export interface UpcomingManeuver {
  /** Texto falado, ex.: "Vire à esquerda na Rua 4B". */
  instruction: string;
  /** Identificador estável da manobra (ex.: índice do passo) — quando muda,
   *  os avisos são rearmados para a nova manobra. */
  key: string;
}

export function useVoiceGuidance(
  maneuver: UpcomingManeuver | null,
  distanceToManeuverMeters: number | null,
  options: { enabled: boolean },
): { isSupported: boolean; isMuted: boolean; toggleMute: () => void } {
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [isMuted, setIsMuted] = useState(readInitialMuted);
  // Quais avisos já saíram para a manobra atual.
  const announcedRef = useRef<{ key: string; far: boolean; near: boolean }>({
    key: '',
    far: false,
    near: false,
  });

  useEffect(() => {
    if (
      !isSupported ||
      !options.enabled ||
      isMuted ||
      !maneuver ||
      distanceToManeuverMeters == null
    ) {
      return;
    }

    // Manobra nova: rearma os dois avisos.
    if (announcedRef.current.key !== maneuver.key) {
      announcedRef.current = { key: maneuver.key, far: false, near: false };
    }
    const announced = announcedRef.current;

    if (!announced.near && distanceToManeuverMeters <= NEAR_THRESHOLD_METERS) {
      announced.near = true;
      // Se entrou já dentro do limite "perto" (ex.: manobras encadeadas),
      // pula o "em X metros" — ele não faz mais sentido.
      announced.far = true;
      speak(maneuver.instruction);
      return;
    }

    if (!announced.far && distanceToManeuverMeters <= FAR_THRESHOLD_METERS) {
      announced.far = true;
      const rounded = Math.max(10, Math.round(distanceToManeuverMeters / 10) * 10);
      speak(`Em ${rounded} metros, ${lowerFirst(maneuver.instruction)}`);
    }
  }, [maneuver, distanceToManeuverMeters, options.enabled, isMuted, isSupported]);

  const toggleMute = useCallback(() => {
    setIsMuted((current) => {
      const next = !current;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Sem persistência disponível — a preferência de mudo vale só pra sessão atual.
      }
      return next;
    });
  }, []);

  return { isSupported, isMuted, toggleMute };
}
