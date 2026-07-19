/*
 * theme.ts — light/dark mode. The mode is stored on <html data-theme>, which
 * flips the token overrides in style.css. Persisted to localStorage; first
 * visit follows the OS preference.
 */
import { reactive } from 'vue';

type Mode = 'dark' | 'light';
const KEY = 'xpitch-theme';

function initial(): Mode {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage blocked */
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export const theme = reactive({ mode: initial() as Mode });

export function applyTheme(): void {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', theme.mode);
}

export function toggleTheme(): void {
  theme.mode = theme.mode === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(KEY, theme.mode);
  } catch {
    /* storage blocked */
  }
  applyTheme();
}
