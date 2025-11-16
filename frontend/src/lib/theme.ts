// Purpose: Handle theme persistence and runtime toggling between light and dark modes.
const STORAGE_KEY = 'azure-pdf-chat-theme'

type ThemeMode = 'light' | 'dark'

const applyTheme = (theme: ThemeMode) => {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  root.style.setProperty('color-scheme', theme)
}

export const initTheme = () => {
  if (typeof window === 'undefined') {
    return
  }

  const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches

  const initial: ThemeMode = stored ?? (prefersDark ? 'dark' : 'light')
  applyTheme(initial)
}

export const setTheme = (theme: ThemeMode) => {
  if (typeof window === 'undefined') {
    return
  }
  applyTheme(theme)
  window.localStorage.setItem(STORAGE_KEY, theme)
}

export const toggleTheme = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'light'
  }
  const next: ThemeMode = document.documentElement.classList.contains('dark') ? 'light' : 'dark'
  setTheme(next)
  return next
}

export const getCurrentTheme = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'light'
  }
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}
