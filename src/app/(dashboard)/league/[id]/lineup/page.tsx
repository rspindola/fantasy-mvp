'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getLineupData, saveLineupAction, type LineupPageData } from './actions'
import { SoccerPitch, type PitchPlayerSlot } from '@/components/lineup/SoccerPitch'
import type { Formation, LineupSlotItem } from '@/lib/lineup/lineup-engine'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import styles from './page.module.css'

export default function LineupPage() {
  const params = useParams()
  const leagueId = params.id as string

  const [data, setData] = useState<LineupPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [formation, setFormation] = useState<Formation>('4-3-3')
  const [starters, setStarters] = useState<LineupSlotItem[]>([])
  const [isPending, startTransition] = useTransition()
  const [saveMessage, setSaveMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  const loadData = () => {
    if (leagueId) {
      getLineupData(leagueId).then((res) => {
        if (res) {
          setData(res)
          setFormation(res.formation)
          setStarters(
            res.starters.map((s) => ({
              playerId: s.playerId,
              position: s.position,
              isCaptain: s.isCaptain,
              isStarter: true,
            }))
          )
        }
        setLoading(false)
      })
    }
  }

  useEffect(() => {
    loadData()
  }, [leagueId])

  if (loading) {
    return (
      <div className={styles.container}>
        <p>Carregando Escalação...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <h2>Escalação não disponível</h2>
        <Link href="/dashboard">
          <Button size="md">Voltar ao Painel</Button>
        </Link>
      </div>
    )
  }

  const starterPlayerIds = new Set(starters.map((s) => s.playerId))
  const benchPlayers = data.roster.filter((p) => !starterPlayerIds.has(p.id))

  const pitchStarters: PitchPlayerSlot[] = starters.map((s) => {
    const p = data.roster.find((r) => r.id === s.playerId)
    return {
      playerId: s.playerId,
      name: p?.name ?? 'Jogador',
      position: s.position,
      clubShortName: p?.clubShortName ?? '',
      isCaptain: s.isCaptain,
    }
  })

  const handleMakeCaptain = (playerId: string) => {
    if (data.isLocked) return
    setStarters((prev) =>
      prev.map((s) => ({
        ...s,
        isCaptain: s.playerId === playerId,
      }))
    )
  }

  const handleSwapWithBench = (starterPlayerId: string, benchPlayerId: string) => {
    if (data.isLocked) return
    const starter = starters.find((s) => s.playerId === starterPlayerId)
    const benchPlayer = data.roster.find((r) => r.id === benchPlayerId)
    if (!starter || !benchPlayer) return

    // Position check
    if (starter.position !== benchPlayer.position) {
      setSaveMessage({
        type: 'error',
        text: `Substituição permitida apenas para jogadores da mesma posição (${starter.position}).`,
      })
      return
    }

    setStarters((prev) =>
      prev.map((s) =>
        s.playerId === starterPlayerId
          ? { ...s, playerId: benchPlayer.id, position: benchPlayer.position }
          : s
      )
    )
    setSaveMessage(null)
  }

  const handleSaveLineup = () => {
    if (data.isLocked) return
    setSaveMessage(null)

    startTransition(async () => {
      try {
        await saveLineupAction(
          leagueId,
          data.teamId,
          data.currentRound,
          formation,
          starters
        )
        setSaveMessage({ type: 'success', text: 'Escalação salva com sucesso!' })
        loadData()
      } catch (err: any) {
        setSaveMessage({ type: 'error', text: err.message || 'Erro ao salvar escalação.' })
      }
    })
  }

  return (
    <div className={styles.container}>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.titleBox}>
          <h1 className={styles.leagueTitle}>{data.teamName} — Escalação</h1>
          <span className={styles.subTitle}>
            {data.leagueName} · Rodada {data.currentRound} da Série A
          </span>
        </div>

        <div className={styles.controlsGroup}>
          <select
            value={formation}
            disabled={data.isLocked}
            onChange={(e) => setFormation(e.target.value as Formation)}
            className={styles.formationSelect}
          >
            <option value="4-3-3">Formação 4-3-3</option>
            <option value="4-4-2">Formação 4-4-2</option>
            <option value="3-5-2">Formação 3-5-2</option>
          </select>

          {!data.isLocked && (
            <Button size="md" isLoading={isPending} onClick={handleSaveLineup}>
              {isPending ? 'Salvando...' : '💾 Salvar Escalação'}
            </Button>
          )}
        </div>
      </div>

      {/* Locked Banner */}
      {data.isLocked && (
        <div className={styles.lockedBanner}>
          🔒 Mercado FECHADO para a Rodada {data.currentRound}. A escalação não pode mais ser alterada.
        </div>
      )}

      {/* Feedback Message */}
      {saveMessage && (
        <div
          style={{
            background:
              saveMessage.type === 'error'
                ? 'rgba(239, 68, 68, 0.12)'
                : 'rgba(16, 185, 129, 0.12)',
            border: `1px solid ${
              saveMessage.type === 'error'
                ? 'var(--accent-red)'
                : 'var(--accent-green)'
            }`,
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            color:
              saveMessage.type === 'error'
                ? 'var(--accent-red)'
                : 'var(--accent-green)',
            fontSize: '0.875rem',
          }}
        >
          {saveMessage.type === 'error' ? '⚠️ ' : '✓ '}
          {saveMessage.text}
        </div>
      )}

      {/* Grid: Soccer Pitch + Bench Roster */}
      <div className={styles.grid}>
        {/* Campo Visual */}
        <div className={styles.pitchArea}>
          <div className={styles.pitchTitle}>
            <span>Titulares ({starters.length}/11)</span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Clique em um titular para tornar Capitão (⭐ ×1.5)
            </span>
          </div>

          <SoccerPitch
            formation={formation}
            starters={pitchStarters}
            onSlotClick={(slot) => handleMakeCaptain(slot.playerId)}
          />
        </div>

        {/* Banco de Reservas */}
        <div className={styles.sidebarArea}>
          <div className={styles.sidebarSection}>
            <h3 className={styles.sidebarTitle}>
              Banco de Reservas ({benchPlayers.length})
            </h3>

            <div className={styles.benchList}>
              {benchPlayers.length === 0 ? (
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  Todos os jogadores do elenco estão escalados como titulares.
                </span>
              ) : (
                benchPlayers.map((player) => (
                  <div key={player.id} className={styles.benchItem}>
                    <div className={styles.benchInfo}>
                      <span className={styles.benchName}>{player.name}</span>
                      <span className={styles.benchClub}>{player.clubShortName}</span>
                    </div>

                    <div className={styles.benchActions}>
                      <Badge variant={player.position as any}>{player.position}</Badge>
                      {!data.isLocked && (
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) {
                              handleSwapWithBench(e.target.value, player.id)
                            }
                          }}
                          style={{
                            background: 'var(--bg-main)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-medium)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.75rem',
                            padding: '4px',
                          }}
                        >
                          <option value="" disabled>
                            Substituir...
                          </option>
                          {starters
                            .filter((s) => s.position === player.position)
                            .map((s) => {
                              const p = data.roster.find((r) => r.id === s.playerId)
                              return (
                                <option key={s.playerId} value={s.playerId}>
                                  por {p?.name}
                                </option>
                              )
                            })}
                        </select>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
