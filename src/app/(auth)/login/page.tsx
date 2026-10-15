'use client'

import { Suspense, useActionState, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { signInWithPassword, signInWithMagicLink, type AuthState } from './actions'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { Button } from '@/components/ui/Button'
import styles from './page.module.css'

const initialState: AuthState = {}

function LoginFormContent() {
  const [authMode, setAuthMode] = useState<'password' | 'magic'>('password')
  const [emailInput, setEmailInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')

  const searchParams = useSearchParams()
  const redirectTarget = searchParams.get('redirect') || searchParams.get('next') || ''
  const isJoinFlow = redirectTarget.includes('/join/')

  const [passwordState, passwordFormAction, isPasswordPending] = useActionState(
    signInWithPassword,
    initialState
  )

  const [magicState, magicFormAction, isMagicPending] = useActionState(
    signInWithMagicLink,
    initialState
  )

  return (
    <main className={styles.container}>
      <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 10 }}>
        <ThemeToggle />
      </div>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>⚽</span>
          <h1 className={styles.logoText}>
            Fantasy Draft <span>2026</span>
          </h1>
        </div>

        <p className={styles.description}>
          Acesse com seu e-mail e senha para gerenciar seu time e suas ligas.
        </p>

        {isJoinFlow && (
          <div className={styles.leagueNotice}>
            <span>🏆</span>
            <span>Faça login para entrar diretamente na liga!</span>
          </div>
        )}

        {/* Tab Toggle */}
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tabBtn} ${authMode === 'password' ? styles.tabBtnActive : ''}`}
            onClick={() => setAuthMode('password')}
          >
            🔑 E-mail e Senha
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${authMode === 'magic' ? styles.tabBtnActive : ''}`}
            onClick={() => setAuthMode('magic')}
          >
            ✨ Magic Link
          </button>
        </div>

        {authMode === 'password' ? (
          <form action={passwordFormAction} className={styles.form}>
            {/* Preserva rota de destino após o login */}
            <input type="hidden" name="redirectTo" value={redirectTarget} />

            {passwordState.error && (
              <div className={styles.error}>
                <span>⚠️</span>
                {passwordState.error}
              </div>
            )}

            <div className={styles.inputGroup}>
              <label htmlFor="email" className={styles.label}>
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="seu@email.com"
                required
                autoComplete="email"
                autoFocus
                className={styles.input}
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="password" className={styles.label}>
                Senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className={styles.input}
              />
            </div>

            <Button type="submit" size="lg" isLoading={isPasswordPending}>
              {isPasswordPending ? 'Entrando...' : 'Entrar no Fantasy'}
            </Button>
          </form>
        ) : magicState.success ? (
          <div className={styles.success}>
            <span className={styles.successIcon}>📨</span>
            <h2 className={styles.successTitle}>Link enviado!</h2>
            <p className={styles.successText}>
              Verifique sua caixa de entrada (e spam) e clique no link
              para acessar o Fantasy Draft 2026.
            </p>
          </div>
        ) : (
          <form action={magicFormAction} className={styles.form}>
            {/* Preserva rota de destino após o magic link */}
            <input type="hidden" name="redirectTo" value={redirectTarget} />

            {magicState.error && (
              <div className={styles.error}>
                <span>⚠️</span>
                {magicState.error}
              </div>
            )}

            <div className={styles.inputGroup}>
              <label htmlFor="email-magic" className={styles.label}>
                E-mail
              </label>
              <input
                id="email-magic"
                name="email"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="seu@email.com"
                required
                autoComplete="email"
                autoFocus
                className={styles.input}
              />
            </div>

            <Button type="submit" size="lg" isLoading={isMagicPending}>
              {isMagicPending ? 'Enviando...' : 'Enviar Magic Link'}
            </Button>
          </form>
        )}

        <Link href="/" className={styles.backLink}>
          ← Voltar à página inicial
        </Link>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className={styles.container}><div className={styles.card}><p>Carregando...</p></div></main>}>
      <LoginFormContent />
    </Suspense>
  )
}
