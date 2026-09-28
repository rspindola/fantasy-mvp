'use client'

import { useActionState } from 'react'
import { signInWithMagicLink, type AuthState } from './actions'
import { Button } from '@/components/ui/Button'
import styles from './page.module.css'

const initialState: AuthState = {}

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(
    signInWithMagicLink,
    initialState
  )

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
          Acesse com seu e-mail para criar ou entrar em uma liga.
          <br />
          Enviaremos um link mágico para você.
        </p>

        {state.success ? (
          <div className={styles.success}>
            <span className={styles.successIcon}>📨</span>
            <h2 className={styles.successTitle}>Link enviado!</h2>
            <p className={styles.successText}>
              Verifique sua caixa de entrada (e spam) e clique no link
              para acessar o Fantasy Draft 2026.
            </p>
          </div>
        ) : (
          <form action={formAction} className={styles.form}>
            {state.error && (
              <div className={styles.error}>
                <span>⚠️</span>
                {state.error}
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
                placeholder="seu@email.com"
                required
                autoComplete="email"
                autoFocus
                className={styles.input}
              />
            </div>

            <Button type="submit" size="lg" isLoading={isPending}>
              {isPending ? 'Enviando...' : 'Enviar Magic Link'}
            </Button>
          </form>
        )}

        <a href="/" className={styles.backLink}>
          ← Voltar à página inicial
        </a>
      </div>
    </main>
  )
}
