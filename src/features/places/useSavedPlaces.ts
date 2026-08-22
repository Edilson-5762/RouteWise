import { useCallback, useState } from 'react';
import type { Coordinates, SavedPlace } from '../../types';

const STORAGE_KEY = 'routewise-saved-places';

function readStoredPlaces(): SavedPlace[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedPlace[]) : [];
  } catch {
    return [];
  }
}

function persist(places: SavedPlace[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
  } catch {
    // Sem persistência disponível — os locais salvos ficam só na sessão atual.
  }
}

export function useSavedPlaces() {
  const [places, setPlaces] = useState<SavedPlace[]>(readStoredPlaces);

  const savePlace = useCallback((label: string, coordinates: Coordinates) => {
    setPlaces((current) => {
      const next = [...current, { id: crypto.randomUUID(), label, coordinates }];
      persist(next);
      return next;
    });
  }, []);

  const removePlace = useCallback((id: string) => {
    setPlaces((current) => {
      const next = current.filter((place) => place.id !== id);
      persist(next);
      return next;
    });
  }, []);

  return { places, savePlace, removePlace };
}
