import { createContext, useCallback, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'nrl-theme-mode';

interface ThemeContextValue {
  mode: 'light' | 'dark';
  toggleMode: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeContextProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' ? 'dark' : 'light';
  });

  const toggleMode = useCallback(() => {
    setMode(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
