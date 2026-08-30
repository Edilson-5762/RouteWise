import type { Coordinates, NavigationState, Route, TravelProfile } from '../../types';

// Guarda o essencial de uma navegação em andamento em sessionStorage, para
// retomá-la se o sistema descartar a aba enquanto ela está em segundo plano —
// o caso clássico é uma ligação longa durante o trajeto: ao voltar, o PWA
// recarrega do zero e sem isso cairia na tela inicial, perdendo a rota.
//
// sessionStorage (e não localStorage) de propósito: o snapshot só faz sentido
// dentro da mesma "sessão de aba"; não queremos retomar amanhã uma navegação
// de hoje. O limite de idade é uma segunda linha de defesa contra isso.

const STORAGE_KEY = 'routewise-nav-snapshot';
const MAX_AGE_MS = 30 * 60 * 1000;

export interface NavigationSnapshot {
  placeName: string | null;
  origin: Coordinates;
  destination: Coordinates;
  route: Route;
  currentStepIndex: number;
  travelProfile: TravelProfile;
}

interface StoredSnapshot extends NavigationSnapshot {
  savedAt: number;
}

export function saveNavigationSnapshot(state: NavigationState, placeName: string | null): void {
  if (state.status !== 'navigating' || !state.route || !state.origin || !state.destination) {
    return;
  }

  const snapshot: StoredSnapshot = {
    savedAt: Date.now(),
    placeName,
    origin: state.origin,
    destination: state.destination,
    route: state.route,
    currentStepIndex: state.currentStepIndex,
    travelProfile: state.travelProfile,
  };

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Sem storage disponível (aba privada, cota estourada) — retomar após um
    // descarte da aba simplesmente não vai funcionar nesta sessão.
  }
}

export function loadNavigationSnapshot(): NavigationSnapshot | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSnapshot>;
    if (
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > MAX_AGE_MS ||
      !parsed.route ||
      !parsed.origin ||
      !parsed.destination ||
      !parsed.travelProfile
    ) {
      return null;
    }
    return {
      placeName: parsed.placeName ?? null,
      origin: parsed.origin,
      destination: parsed.destination,
      route: parsed.route,
      currentStepIndex: parsed.currentStepIndex ?? 0,
      travelProfile: parsed.travelProfile,
    };
  } catch {
    return null;
  }
}

export function clearNavigationSnapshot(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nada a fazer — sem storage, não há o que limpar.
  }
}
