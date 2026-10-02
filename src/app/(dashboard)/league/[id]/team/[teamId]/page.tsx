'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getTeamRosterData, type TeamRosterPageData, type TeamRosterPlayer } from './actions'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PlayerDetailModal } from '@/components/player/PlayerDetailModal'
import styles from './page.module.css'

const POSITION_SECTIONS: Array<{
  key: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
  title: string
  icon: string
}> = [
  { key: 'GOL', title: 'Goleiros', icon: '🧤' },
  { key: 'LAT', title: 'Laterais', icon: '🛡️' },
  { key: 'ZAG', title: 'Zagueiros', icon: '🧱' },
  { key: 'MEI', title: 'Meio-Campistas', icon: '🪄' },
  { key: 'ATA', title: 'Atacantes', icon: '⚡' },
]

export default function TeamRosterPage() {
  const params = useParams()
  const leagueId = params.id as string
  const teamId = params.teamId as string

  const [data, setData] = useState<TeamRosterPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPosition, setSelectedPosition] = useState<'ALL' | 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'>('ALL')
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)

  useEffect(() => {
    if (leagueId && teamId) {
      getTeamRosterData(leagueId, teamId).then((res) => {
        if (res) {
          setData(res)
        }
        setLoading(false)
      })
    }
  }, [leagueId, teamId])

  if (loading) {
    return (
      <div className={styles.container}>
        <p style={{ color: 'var(--text-secondary)' }}>Carregando elenco do time...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <h2>Time não encontrado</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          O time selecionado não faz parte desta liga.
        </p>
        <Link href={`/league/${leagueId}/standings`}>
          <Button size="md">Voltar à Classificação</Button>
        </Link>
      </div>
    )
  }

  const renderPlayerCard = (p: TeamRosterPlayer) => {
    return (
      <div
        key={p.id}
        className={styles.playerCard}
        onClick={() => setSelectedPlayerId(p.id)}
        title="Clique para ver a ficha completa e histórico de scouts"
      >
        <span className={styles.inspectHint}>🔍 Ficha</span>

        <div className={styles.playerTopRow}>
          <div className={styles.photoWrapper}>
            {p.photoUrl ? (
              <img
                src={p.photoUrl}
                alt={p.name}
                className={styles.playerPhoto}
                loading="lazy"
              />
            ) : (
              <div className={styles.photoPlaceholder}>⚽</div>
            )}
          </div>

          <div className={styles.playerInfo}>
            <span className={styles.playerName}>{p.name}</span>
            <div className={styles.playerClubRow}>
              <Badge variant={p.position}>{p.position}</Badge>
              {p.club?.logoUrl && (
                <img
                  src={p.club.logoUrl}
                  alt={p.club.shortName}
                  className={styles.clubLogo}
                />
              )}
              <span>{p.club?.shortName ?? 'Clube'}</span>
            </div>
          </div>
        </div>

        <div className={styles.playerBottomRow}>
          <div className={styles.statsPills}>
            <span className={styles.statBadge}>
              Média: <strong className={styles.statAvg}>{p.avgPoints.toFixed(1)}</strong>
            </span>
            <span className={styles.statBadge}>
              {p.totalMinutes} min
            </span>
          </div>

          {p.nextMatch && (
            <div className={styles.nextMatchBadge}>
              <span>R{p.nextMatch.round}:</span>
              <span>vs {p.nextMatch.opponentShort} ({p.nextMatch.isHome ? 'C' : 'F'})</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  const filteredSections = POSITION_SECTIONS.filter(
    (sec) => selectedPosition === 'ALL' || selectedPosition === sec.key
  )

  return (
    <div className={styles.container}>
      <Link href={`/league/${leagueId}/standings`} className={styles.backLink}>
        ← Voltar à Classificação
      </Link>

      {/* Hero Header Card */}
      <div className={styles.headerCard}>
        <div className={styles.headerTop}>
          <div className={styles.teamMainInfo}>
            <div className={styles.teamAvatar}>🛡️</div>
            <div className={styles.teamTitles}>
              <div className={styles.teamNameRow}>
                <h1 className={styles.teamName}>{data.teamName}</h1>
                {data.isMyTeam ? (
                  <span className={styles.badgeMyTeam}>Seu Time</span>
                ) : (
                  <span className={styles.badgeOpponent}>Adversário</span>
                )}
                {data.isCommissioner && (
                  <span className={styles.badgeCommissioner}>👑 Comissário</span>
                )}
              </div>
              <span className={styles.managerText}>
                Técnico: <strong>{data.coachName}</strong> · Liga:{' '}
                <Link href={`/league/${leagueId}`} className={styles.leagueNameLink}>
                  {data.leagueName}
                </Link>
              </span>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className={styles.statsRow}>
          {data.rank && (
            <div className={styles.statBox}>
              <span className={styles.statLabel}>Posição</span>
              <span className={styles.statValue}>#{data.rank}</span>
            </div>
          )}

          {data.scoringMode === 'H2H' && data.h2hRecord && (
            <>
              <div className={styles.statBox}>
                <span className={styles.statLabel}>Pontos H2H</span>
                <span className={`${styles.statValue} ${styles.statValueGreen}`}>
                  {data.h2hRecord.h2hPoints} pts
                </span>
              </div>
              <div className={styles.statBox}>
                <span className={styles.statLabel}>Campanha H2H</span>
                <span className={styles.statValue}>
                  {data.h2hRecord.wins}V {data.h2hRecord.draws}E {data.h2hRecord.losses}D
                </span>
              </div>
            </>
          )}

          {data.totalPoints !== undefined && (
            <div className={styles.statBox}>
              <span className={styles.statLabel}>Pontos Pró</span>
              <span className={styles.statValue}>{data.totalPoints.toFixed(1)}</span>
            </div>
          )}

          <div className={styles.statBox}>
            <span className={styles.statLabel}>Elenco Total</span>
            <span className={styles.statValue}>{data.players.length} atletas</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className={styles.filterBar}>
        <button
          type="button"
          className={`${styles.filterBtn} ${selectedPosition === 'ALL' ? styles.filterBtnActive : ''}`}
          onClick={() => setSelectedPosition('ALL')}
        >
          Todos ({data.players.length})
        </button>
        {POSITION_SECTIONS.map((sec) => (
          <button
            key={sec.key}
            type="button"
            className={`${styles.filterBtn} ${selectedPosition === sec.key ? styles.filterBtnActive : ''}`}
            onClick={() => setSelectedPosition(sec.key)}
          >
            {sec.icon} {sec.title} ({data.countsByPosition[sec.key] || 0})
          </button>
        ))}
      </div>

      {/* Position Section Blocks */}
      {filteredSections.map((sec) => {
        const posPlayers = data.players
          .filter((p) => p.position === sec.key)
          .sort((a, b) => b.avgPoints - a.avgPoints)

        if (posPlayers.length === 0) return null

        return (
          <section key={sec.key} className={styles.positionSection}>
            <div className={styles.positionHeader}>
              <h2 className={styles.positionTitle}>
                <span>{sec.icon}</span>
                <span>{sec.title}</span>
              </h2>
              <span className={styles.positionCount}>
                {posPlayers.length} jogador{posPlayers.length !== 1 ? 'es' : ''}
              </span>
            </div>

            <div className={styles.playersGrid}>
              {posPlayers.map(renderPlayerCard)}
            </div>
          </section>
        )
      })}

      {/* Modal de Ficha Completa do Jogador */}
      {selectedPlayerId && (
        <PlayerDetailModal
          playerId={selectedPlayerId}
          leagueId={leagueId}
          onClose={() => setSelectedPlayerId(null)}
        />
      )}
    </div>
  )
}
