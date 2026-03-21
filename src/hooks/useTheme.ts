import { useEffect, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

export type ThemeMode = 'light' | 'dark';

function getSystemTheme(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useLocalStorage<ThemeMode>('cp-theme', getSystemTheme());

  const applyTheme = useCallback((mode: ThemeMode) => {
    document.documentElement.classList.toggle('dark', mode === 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', mode === 'dark' ? '#0a0a0a' : '#ffffff');
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, [setTheme]);

  return { theme, toggleTheme };
}
