import { useContext } from 'react';
import { ThemeContext } from '../context/ThemeContext';

export function useThemeContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeContext must be used inside ThemeContextProvider');
  return ctx;
}
