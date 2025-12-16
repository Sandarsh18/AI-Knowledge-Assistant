/**
 * Theme management utilities handling light and cyberpunk modes with persistence.
 */

export type ThemeName = "light" | "cyberpunk";

export interface ThemeChangeDetail {
  theme: ThemeName;
}

const STORAGE_KEY = "azure-pdf-chat-theme";
const THEMES: ThemeName[] = ["light", "cyberpunk"];

const getRoot = (): HTMLElement => document.documentElement;

const applyClasses = (theme: ThemeName): void => {
  const root = getRoot();
  THEMES.forEach((name) => root.classList.remove(`theme-${name}`));
  root.classList.add(`theme-${theme}`);

  if (theme === "cyberpunk") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
};

const notifyThemeChange = (theme: ThemeName): void => {
  const event = new CustomEvent<ThemeChangeDetail>("themechange", {
    detail: { theme }
  });
  getRoot().dispatchEvent(event);
};

export const getActiveTheme = (): ThemeName => {
  const root = getRoot();
  const fromClass = THEMES.find((name) => root.classList.contains(`theme-${name}`));
  if (fromClass) {
    return fromClass;
  }

  const stored = localStorage.getItem(STORAGE_KEY) as ThemeName | null;
  if (stored && THEMES.includes(stored)) {
    return stored;
  }

  return "light";
};

export const setTheme = (theme: ThemeName): ThemeName => {
  applyClasses(theme);
  localStorage.setItem(STORAGE_KEY, theme);
  notifyThemeChange(theme);
  return theme;
};

export const toggleTheme = (): ThemeName => {
  const current = getActiveTheme();
  const currentIndex = THEMES.indexOf(current);
  const next = THEMES[(currentIndex + 1) % THEMES.length];
  return setTheme(next);
};

export const initTheme = (): ThemeName => {
  const stored = localStorage.getItem(STORAGE_KEY) as ThemeName | null;
  if (stored && THEMES.includes(stored)) {
    return setTheme(stored);
  }

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initial = prefersDark ? "cyberpunk" : "light";
  return setTheme(initial);
};