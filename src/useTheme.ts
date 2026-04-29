import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'wardly-theme'

function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  return null
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyThemeToDocument(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
}

function initialTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme()
}

/**
 * Light / dark theme with localStorage and system preference fallback.
 */
export function useTheme(): {
  theme: Theme
  setTheme: (t: Theme) => void
  toggleTheme: () => void
} {
  const [theme, setThemeState] = useState<Theme>(initialTheme)

  useEffect(() => {
    applyThemeToDocument(theme)
  }, [theme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (!getStoredTheme()) {
        setThemeState(getSystemTheme())
      }
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      /* ignore */
    }
    setThemeState(t)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return { theme, setTheme, toggleTheme }
}
