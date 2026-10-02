'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import styles from './page.module.css'

export default function CreateLeaguePage() {
  return (
    <div className={styles.container}>
      <Link href="/dashboard" className={styles.backLink}>
        ← Voltar ao painel
      </Link>

      <div className={styles.card}>
        <div style={{ textAlign: 'center', padding: '36px 16px' }}>
          <span style={{ fontSize: '3.5rem' }}>🔒</span>
          <h1 className={styles.title} style={{ marginTop: '16px' }}>
            Criação de Ligas Temporariamente Suspensa
          </h1>
          <p
            className={styles.subtitle}
            style={{ maxWidth: '540px', margin: '12px auto 28px', lineHeight: '1.6' }}
          >
            Para mantermos todas as disputas centralizadas na liga oficial em andamento, novas ligas não podem ser criadas no momento. Por favor, utilize o código de convite no painel para participar da liga existente.
          </p>
          <Link href="/dashboard">
            <Button size="lg">← Voltar ao Painel do Jogador</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
