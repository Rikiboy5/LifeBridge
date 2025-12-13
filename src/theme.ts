export type Theme = "light" | "dark";

const THEME_KEY = "lifebridge-theme";

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(THEME_KEY);
  return raw === "light" || raw === "dark" ? raw : null;
}

export function getPreferredTheme(): Theme {
  if (typeof window === "undefined") return "light";

  const stored = getStoredTheme();
  if (stored) return stored;

  // systémová preferencia
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;

  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  localStorage.setItem(THEME_KEY, theme);
}

/**
 * Zavolaj čo najskôr (napr. v main.tsx),
 * aby sa téma nastavila ešte pred renderom Reactu
 * a neblikalo svetlé → tmavé.
 */
export function initTheme() {
  const theme = getPreferredTheme();
  applyTheme(theme);
}