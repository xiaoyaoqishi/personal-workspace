import { useState, useEffect } from 'react';

export default function useTheme() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('notes-theme') === 'dark');
  const [compact, setCompact] = useState(() => localStorage.getItem('notes-compact') === 'true');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('notes-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    document.documentElement.setAttribute('data-compact', compact ? 'true' : 'false');
    localStorage.setItem('notes-compact', compact ? 'true' : 'false');
  }, [compact]);

  const toggleTheme = () => setIsDark(v => !v);
  const toggleCompact = () => setCompact(v => !v);

  return { isDark, toggleTheme, compact, toggleCompact };
}
