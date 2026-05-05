import { useCallback, useEffect, useState } from 'react'

const THEMES = ['classic', 'ink', 'light', 'tech', 'dark']

function getInitialTheme() {
  const stored = localStorage.getItem('trading-theme')
  if (THEMES.includes(stored)) return stored
  return 'classic'
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

export default function useTheme() {
  const [theme, setThemeState] = useState(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem('trading-theme', theme)
  }, [theme])

  const setTheme = useCallback((themeName) => {
    if (THEMES.includes(themeName)) {
      setThemeState(themeName)
    }
  }, [])

  return { theme, isDark: theme === 'dark', setTheme }
}
