'use client'

import React, { useEffect, useState } from 'react'
import styles from './ThemeToggle.module.css'

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    try {
      const currentAttr = document.documentElement.getAttribute('data-theme') as 'light' | 'dark' | null
      const stored = localStorage.getItem('theme') as 'light' | 'dark' | null

      let resolvedTheme: 'light' | 'dark' = 'dark'
      if (currentAttr === 'light' || currentAttr === 'dark') {
        resolvedTheme = currentAttr
      } else if (stored === 'light' || stored === 'dark') {
        resolvedTheme = stored
      } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        resolvedTheme = prefersDark ? 'dark' : 'light'
      }

      setTheme(resolvedTheme)
      document.documentElement.setAttribute('data-theme', resolvedTheme)
    } catch {
      // Safe fallback
    } finally {
      setMounted(true)
    }
  }, [])

  const toggleTheme = () => {
    const currentAttr = document.documentElement.getAttribute('data-theme') as 'light' | 'dark' | null
    const current = (currentAttr === 'dark' || currentAttr === 'light') ? currentAttr : theme
    const nextTheme: 'light' | 'dark' = current === 'dark' ? 'light' : 'dark'

    setTheme(nextTheme)
    document.documentElement.setAttribute('data-theme', nextTheme)
    try {
      localStorage.setItem('theme', nextTheme)
    } catch {
      // safe fallback
    }
  }

  if (!mounted) {
    return (
      <button
        type="button"
        className={styles.themeToggleBtn}
        aria-label="Alternar tema"
        disabled
      >
        <span style={{ opacity: 0 }}>🌙</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={styles.themeToggleBtn}
      title={theme === 'dark' ? 'Mudar para tema Claro' : 'Mudar para tema Escuro'}
      aria-label="Alternar tema claro/escuro"
    >
      {theme === 'dark' ? (
        // Sun icon: switches to Light
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        // Moon icon: switches to Dark
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}
