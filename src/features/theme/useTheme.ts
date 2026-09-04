import { useCallback, useEffect, useState } from 'react';
import type { Coordinates } from '../../types';
import { isNight } from '../../utils/sunPosition';
import { DF_CENTER } from '../../data/dfBounds';

type Theme = 'light' | 'dark';

// De quanto em quanto tempo reconfere sol x horário — não precisa de mais
// que isso para escurecer "ao vivo" durante uma viagem ao anoitecer.
const RECHECK_INTERVAL_MS = 60_000;

function computeAutoTheme(coordinates: Coordinates | null): Theme {
  return isNight(new Date(), coordinates ?? DF_CENTER) ? 'dark' : 'light';
}

// Segue o sol na coordenada atual (estilo Waze): sem GPS ainda, usa o
// centro do DF como palpite. O botão de tema força uma escolha manual, mas
// só para esta instância — sem persistência, a próxima abertura do app
// volta a seguir o sol.
export function useTheme(coordinates: Coordinates | null = null): {
  theme: Theme;
  toggleTheme: () => void;
} {
  const [autoTheme, setAutoTheme] = useState<Theme>(() => computeAutoTheme(coordinates));
  const [manualOverride, setManualOverride] = useState<Theme | null>(null);

  useEffect(() => {
    setAutoTheme(computeAutoTheme(coordinates));
    const id = setInterval(() => {
      setAutoTheme(computeAutoTheme(coordinates));
    }, RECHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [coordinates]);

  const theme = manualOverride ?? autoTheme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setManualOverride(theme === 'dark' ? 'light' : 'dark');
  }, [theme]);

  return { theme, toggleTheme };
}
