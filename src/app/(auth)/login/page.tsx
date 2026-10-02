'use client'

import { useActionState, useState } from 'react'
import { signInWithPassword, signInWithMagicLink, type AuthState } from './actions'
import { Button } from '@/components/ui/Button'
import styles from './page.module.css'

const initialState: AuthState = {}

export default function LoginPage() {
  const [authMode, setAuthMode] = useState<'password' | 'magic'>('password')
  const [emailInput, setEmailInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')

  const [passwordState, passwordFormAction, isPasswordPending] = useActionState(
    signInWithPassword,
    initialState
  )

  const [magicState, magicFormAction, isMagicPending] = useActionState(
    signInWithMagicLink,
    initialState
  )

  const handleFillDemo = (email: string, pass: string) => {
    setEmailInput(email)
    setPasswordInput(pass)
    setAuthMode('password')
  }

  return (
    <main className={styles.container}>
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

        {/* Demo Accounts Quick-Fill Box */}
        <div className={styles.demoBox}>
          <span className={styles.demoBoxTitle}>
            🧪 Contas de Teste (Preenchimento Rápido)
          </span>

          <div className={styles.demoRow}>
            <div className={styles.demoMeta}>
              <span className={styles.demoRole}>
                🛡️ Participante (Fúria Rubro-Negra)
              </span>
              <span className={styles.demoEmail}>treinador@fantasy.com</span>
            </div>
            <button
              type="button"
              className={styles.demoFillBtn}
              onClick={() => handleFillDemo('treinador@fantasy.com', 'password123')}
            >
              Preencher
            </button>
          </div>

          <div className={styles.demoRow}>
            <div className={styles.demoMeta}>
              <span className={styles.demoRole}>
                👑 Comissário (Galácticos FC)
              </span>
              <span className={styles.demoEmail}>rspindolaa@gmail.com</span>
            </div>
            <button
              type="button"
              className={styles.demoFillBtn}
              onClick={() => handleFillDemo('rspindolaa@gmail.com', '')}
            >
              Preencher
            </button>
          </div>
        </div>

        <a href="/" className={styles.backLink}>
          ← Voltar à página inicial
        </a>
      </div>
    </main>
  )
}
