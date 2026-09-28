'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  getLeagueByInviteCode,
  joinLeagueAction,
  type JoinLeagueState,
} from './actions'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import styles from './page.module.css'

const initialState: JoinLeagueState = {}

export default function JoinLeaguePage() {
  const params = useParams()
  const code = (params.code as string)?.toUpperCase() ?? ''

  const [league, setLeague] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [state, formAction, isPending] = useActionState(
    joinLeagueAction,
    initialState
  )

  useEffect(() => {
    if (code) {
      getLeagueByInviteCode(code).then((res) => {
        setLeague(res)
        setLoading(false)
      })
    }
  }, [code])

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.notFound}>
            <p>Carregando dados da liga...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!league) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.notFound}>
            <span style={{ fontSize: '3rem' }}>❌</span>
            <h2>Liga Não Encontrada</h2>
            <p className={styles.subtitle}>
              O código de convite <strong>{code}</strong> é inválido ou expirou.
            </p>
            <Link href="/dashboard">
              <Button size="md">Voltar ao Painel</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const isFull = league.registeredTeams >= league.teamCap
  const isClosed = league.status !== 'open'

  return (
    <div className={styles.container}>
      <Link href="/dashboard" className={styles.backLink}>
        ← Voltar ao painel
      </Link>

      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.codeBadge}>{league.inviteCode}</span>
          <h1 className={styles.title}>{league.name}</h1>
          <p className={styles.subtitle}>
            Criada por <strong>{league.commissionerName}</strong>
          </p>
        </div>

        <div className={styles.details}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Modo de Pontuação</span>
            <Badge variant="default">{league.scoringMode}</Badge>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Modo de Draft</span>
            <Badge variant="default">{league.draftMode}</Badge>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Inscrições</span>
            <span className={styles.detailValue}>
              {league.registeredTeams} / {league.teamCap} times
            </span>
          </div>
        </div>

        {isClosed ? (
          <div className={styles.error}>
            Esta liga não está mais aberta para novas inscrições (status: {league.status}).
          </div>
        ) : isFull ? (
          <div className={styles.error}>
            Esta liga atingiu o limite máximo de {league.teamCap} times.
          </div>
        ) : (
          <form action={formAction} className={styles.form}>
            {state.error && <div className={styles.error}>{state.error}</div>}

            <input type="hidden" name="inviteCode" value={league.inviteCode} />

            <div className={styles.fieldGroup}>
              <label htmlFor="teamName" className={styles.label}>
                Nome do Seu Time *
              </label>
              <input
                id="teamName"
                name="teamName"
                type="text"
                placeholder="Ex: Timaço FC"
                required
                autoFocus
                className={styles.input}
              />
            </div>

            <Button type="submit" size="lg" isLoading={isPending}>
              {isPending ? 'Entrando...' : 'Confirmar e Entrar na Liga'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
