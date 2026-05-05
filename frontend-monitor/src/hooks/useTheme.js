import { useCallback, useEffect, useState } from 'react'

const THEMES = ['light', 'ink', 'tech', 'dark']

function getInitialTheme() {
  const stored = localStorage.getItem('monitor-theme')
  if (THEMES.includes(stored)) return stored
  return 'light'
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

export default function useTheme() {
  const [theme, setThemeState] = useState(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem('monitor-theme', theme)
  }, [theme])

  const setTheme = useCallback((themeName) => {
    if (THEMES.includes(themeName)) {
      setThemeState(themeName)
    }
  }, [])

  return { theme, isDark: theme === 'dark', setTheme }
}
