import { useCallback, useEffect, useState } from 'react'

function getInitialTheme() {
  const stored = localStorage.getItem('lk-theme')
  if (stored === 'dark' || stored === 'light') return stored
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
  const [theme, setTheme] = useState(getInitialTheme)
  const [compact, setCompact] = useState(getInitialCompact)

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem('lk-theme', theme)
  }, [theme])

  useEffect(() => {
    applyCompact(compact)
    localStorage.setItem('lk-compact', compact ? 'true' : 'false')
  }, [compact])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const toggleCompact = useCallback(() => {
    setCompact((c) => !c)
  }, [])

  return { theme, isDark: theme === 'dark', toggleTheme, compact, toggleCompact }
}
