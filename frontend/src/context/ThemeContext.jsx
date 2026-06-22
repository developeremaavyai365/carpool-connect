import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'carpool-theme';

const ThemeContext = createContext(null);

function getSystemTheme() {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    /* ignore */
  }
  return 'system';
}

function resolveTheme(preference) {
  return preference === 'system' ? getSystemTheme() : preference;
}

function applyTheme(resolved) {
  document.documentElement.setAttribute('data-theme', resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#0a0a0a' : '#0f0f0f');
  }
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readStoredTheme);
  const resolved = useMemo(() => resolveTheme(preference), [preference]);

  useEffect(() => {
    applyTheme(resolved);
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* ignore */
    }
  }, [preference, resolved]);

  useEffect(() => {
    if (preference !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(getSystemTheme());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const setTheme = useCallback((next) => {
    if (next === 'light' || next === 'dark' || next === 'system') {
      setPreference(next);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference((prev) => {
      const current = resolveTheme(prev);
      return current === 'dark' ? 'light' : 'dark';
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, resolved, setTheme, toggleTheme, isDark: resolved === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
