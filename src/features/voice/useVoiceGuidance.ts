import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'routewise-voice-muted';

function readInitialMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useVoiceGuidance(
  instruction: string | null,
  options: { enabled: boolean },
): { isSupported: boolean; isMuted: boolean; toggleMute: () => void } {
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [isMuted, setIsMuted] = useState(readInitialMuted);
  const lastSpokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupported || !options.enabled || isMuted || !instruction) {
      return;
    }
    if (lastSpokenRef.current === instruction) {
      return;
    }
    lastSpokenRef.current = instruction;

    const utterance = new SpeechSynthesisUtterance(instruction);
    utterance.lang = 'pt-BR';
    window.speechSynthesis.speak(utterance);
  }, [instruction, options.enabled, isMuted, isSupported]);

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
