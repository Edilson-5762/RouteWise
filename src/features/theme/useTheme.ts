import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'routewise-theme';

function readInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // localStorage indisponível (modo privado, etc.) — segue com o padrão do sistema.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Sem persistência disponível — o tema continua funcionando só na sessão atual.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
}
