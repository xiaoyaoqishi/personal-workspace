import { useCallback, useEffect, useState } from 'react'

const THEMES = ['light', 'ink', 'tech', 'dark']

function getInitialTheme() {
  const stored = localStorage.getItem('lk-theme')
  if (THEMES.includes(stored)) return stored
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

function getInitialCompact() {
  const stored = localStorage.getItem('lk-compact')
  return stored === 'true'
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

function applyCompact(compact) {
  document.documentElement.setAttribute('data-compact', compact ? 'true' : 'false')
}

export default function useTheme() {
  const [theme, setThemeState] = useState(getInitialTheme)
  const [compact, setCompact] = useState(getInitialCompact)

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem('lk-theme', theme)
  }, [theme])

  useEffect(() => {
    applyCompact(compact)
    localStorage.setItem('lk-compact', compact ? 'true' : 'false')
  }, [compact])

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const index = THEMES.indexOf(current)
      return THEMES[(index + 1) % THEMES.length]
    })
  }, [])

  const setTheme = useCallback((themeName) => {
    if (THEMES.includes(themeName)) {
      setThemeState(themeName)
    }
  }, [])

  const toggleCompact = useCallback(() => {
    setCompact((c) => !c)
  }, [])

  return { theme, isDark: theme === 'dark', cycleTheme, setTheme, compact, toggleCompact }
}
