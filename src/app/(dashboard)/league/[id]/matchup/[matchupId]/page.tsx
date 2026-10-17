'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  getMatchupDetailData,
  type MatchupDetailPageData,
  type MatchupTeamDetail,
} from './actions'
import { PlayerDetailModal } from '@/components/player/PlayerDetailModal'
import { MatchupDetailsModal } from './MatchupDetailsModal'
import styles from './page.module.css'

export default function MatchupDetailPage() {
  const params = useParams()
  const leagueId = params.id as string
  const matchupId = params.matchupId as string

  const [data, setData] = useState<MatchupDetailPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false)

  // Mobile Tabs State (Switch between teams, keeping field on top and bench below)
  const [activeMobileTeam, setActiveMobileTeam] = useState<'home' | 'away'>('home')

  useEffect(() => {
    if (leagueId && matchupId) {
      getMatchupDetailData(leagueId, matchupId).then((res) => {
        setData(res)
        setLoading(false)
      })
    }
  }, [leagueId, matchupId])

  if (loading) {
    return (
      <div className={styles.container}>
        <p style={{ color: '#94a3b8', padding: '60px 0', textAlign: 'center' }}>
          Carregando Raio-X do confronto...
        </p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <h2>Confronto não encontrado</h2>
        <Link href={`/league/${leagueId}`} className={styles.backLink}>
          ← Voltar à Liga
        </Link>
      </div>
    )
  }

  const isHomeWinner = data.result === 'home'
  const isAwayWinner = data.result === 'away'

  // Helper to format player's key scout note
  const formatPlayerKeyScout = (p: any): string => {
    if (p.minutes === 0) return 'Sem minutos'
    const scouts = p.scouts || {}
    const parts: string[] = []

    if (scouts.goals && scouts.goals > 0) {
      parts.push(`${scouts.goals} ${scouts.goals === 1 ? 'gol' : 'gols'}`)
    }
    if (scouts.assists && scouts.assists > 0) {
      parts.push(`${scouts.assists} ast`)
    }
    if (scouts.cleanSheet) {
      parts.push('SG')
    }
    if (p.position === 'GOL' && scouts.saves && scouts.saves > 0) {
      parts.push(`${scouts.saves} ${scouts.saves === 1 ? 'defesa' : 'defesas'}`)
    }
    if (scouts.tackles && scouts.tackles > 0) {
      parts.push(`${scouts.tackles} ${scouts.tackles === 1 ? 'desarme' : 'desarmes'}`)
    }
    if (parts.length > 0) {
      return parts.slice(0, 2).join(' - ')
    }
    return `${p.minutes} min`
  }

  // Helper to arrange tactical lines for starting 11
  const getTacticalLines = (starters: any[]) => {
    // If a starter was subbed out, we show the subbed-in reserve in their slot on the pitch with isAutoSub = true
    const effectiveStarters = starters.map((s) => {
      if (s.subbedOut && s.subbedInBy) {
        return {
          ...s.subbedInBy,
          isAutoSub: true,
          subbedForStarter: s,
        }
      }
      return {
        ...s,
        isAutoSub: false,
        isAbsent: s.minutes === 0,
      }
    })

    const gols = effectiveStarters.filter((p) => p.position === 'GOL')
    const lats = effectiveStarters.filter((p) => p.position === 'LAT')
    const zags = effectiveStarters.filter((p) => p.position === 'ZAG')
    const mids = effectiveStarters.filter((p) => p.position === 'MEI')
    const atts = effectiveStarters.filter((p) => p.position === 'ATA')

    // Flank laterals on the sides if present
    let defs: any[] = []
    if (lats.length >= 2) {
      defs = [lats[0], ...zags, lats[1]]
    } else if (lats.length === 1) {
      defs = [lats[0], ...zags]
    } else {
      defs = [...zags]
    }

    return { gols, defs, mids, atts }
  }

  // Render a tactical player token node on the pitch
  const renderTacticalToken = (p: any, teamColor: 'home' | 'away') => {
    const isMitou = p.points >= 15.0 && !p.isCaptain && !p.isAutoSub
    const displayPts = p.isCaptain ? (p.points * 1.5).toFixed(1) : p.points.toFixed(1)
    const isAbsent = p.minutes === 0

    return (
      <div
        key={p.playerId}
        onClick={() => setSelectedPlayerId(p.playerId)}
        title={`${p.name} - Clique para ver ficha completa`}
        className={styles.tokenNode}
      >
        {/* Top Badges */}
        {p.isAutoSub && (
          <div className={styles.tokenBadgeTop}>
            <span className={styles.badgeAutoSub}>AUTO-SUB</span>
          </div>
        )}
        {p.isCaptain && (
          <div className={styles.tokenBadgeTop}>
            <span className={styles.badgeCaptain}>👑 1.5x</span>
          </div>
        )}
        {isMitou && (
          <div className={styles.tokenBadgeTop}>
            <span className={styles.badgeMitou}>🔥 MITOU</span>
          </div>
        )}
        {isAbsent && !p.isAutoSub && (
          <div className={styles.tokenBadgeTop}>
            <span className={styles.badgeAbsent}>⊘</span>
          </div>
        )}

        {/* Token Circle */}
        <div
          className={`${styles.tokenCircle} ${
            p.isCaptain
              ? styles.tokenCaptain
              : p.isAutoSub
              ? styles.tokenAutoSub
              : isMitou
              ? styles.tokenMitou
              : isAbsent
              ? styles.tokenAbsent
              : ''
          }`}
        >
          {p.photoUrl ? (
            <img
              src={p.photoUrl}
              alt={p.name}
              className={styles.tokenPhoto}
              loading="lazy"
              onError={(e) => {
                ;(e.currentTarget as HTMLElement).style.display = 'none'
                const fallback = (e.currentTarget.parentElement?.querySelector(`.${styles.tokenPhotoFallback}`) as HTMLElement | null)
                if (fallback) fallback.style.display = 'flex'
              }}
            />
          ) : null}

          <div
            className={styles.tokenPhotoFallback}
            style={{ display: p.photoUrl ? 'none' : 'flex' }}
          >
            {/* Icon based on position */}
            {p.position === 'GOL' && (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2a4 4 0 0 0-4 4v3H6a2 2 0 0 0-2 2v7a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-7a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z" />
              </svg>
            )}
            {(p.position === 'LAT' || p.position === 'ZAG') && (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            )}
            {p.position === 'MEI' && (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="9" />
                <line x1="3.6" y1="9" x2="20.4" y2="9" />
                <line x1="3.6" y1="15" x2="20.4" y2="15" />
                <path d="M11.5 3a17 17 0 0 0 0 18" />
                <path d="M12.5 3a17 17 0 0 1 0 18" />
              </svg>
            )}
            {p.position === 'ATA' && (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            )}
          </div>

          {p.clubLogoUrl && (
            <div className={styles.tokenClubBadge} title={p.clubShortName}>
              <img src={p.clubLogoUrl} alt={p.clubShortName || 'Clube'} />
            </div>
          )}

          {/* Position Pill */}
          <span
            className={`${styles.tokenPosPill} ${
              styles[`posPill${p.position}`] || ''
            }`}
          >
            {p.position}
          </span>
        </div>

        {/* Text Col */}
        <div className={styles.tokenTextCol}>
          <span className={styles.tokenName}>{p.name}</span>
          <div className={styles.tokenScoreLine}>
            {isAbsent ? (
              <span className={styles.tokenScoreZero}>0.0</span>
            ) : (
              <span
                className={
                  teamColor === 'home'
                    ? styles.tokenScorePts
                    : styles.tokenScorePtsGold
                }
              >
                {displayPts} pts
              </span>
            )}{' '}
            <span>({p.clubShortName || 'CLU'})</span>
          </div>
          <span className={styles.tokenScoutNote}>{formatPlayerKeyScout(p)}</span>
        </div>
      </div>
    )
  }

  // Render a full Tactical Field Card
  const renderFieldCard = (
    team: MatchupTeamDetail,
    isWinner: boolean,
    teamType: 'home' | 'away'
  ) => {
    const { gols, defs, mids, atts } = getTacticalLines(team.starters)

    const isHiddenOnMobile = activeMobileTeam !== teamType

    return (
      <div
        className={`${styles.fieldCard} ${
          isHiddenOnMobile ? styles.fieldCardHiddenMobile : ''
        }`}
      >
        {/* Header */}
        <div className={styles.fieldCardHeader}>
          <div className={styles.fieldHeaderLeft}>
            <span
              className={
                teamType === 'home'
                  ? styles.fieldTeamDotHome
                  : styles.fieldTeamDotAway
              }
            />
            <Link
              href={`/league/${leagueId}/team/${team.teamId}`}
              className={styles.fieldTeamLink}
            >
              <span className={styles.fieldTeamTitle}>{team.teamName}</span>
            </Link>
            <span className={styles.fieldFormationTag}>
              Esquema {team.formation}
            </span>
            {isWinner && (
              <span className={styles.fieldWinnerTag}>VENCEDOR</span>
            )}
          </div>
          <div className={styles.fieldHeaderRight}>
            <span className={styles.fieldPtsLabel}>Titulares:</span>
            <span
              className={
                teamType === 'home'
                  ? styles.fieldHeaderPtsHome
                  : styles.fieldHeaderPtsAway
              }
            >
              {team.totalPoints.toFixed(1)} pts
            </span>
          </div>
        </div>

        {/* Pitch Canvas with Markings */}
        <div className={styles.pitchCanvas}>
          {/* Pitch Lines */}
          <div className={styles.pitchMarkingTopBox} />
          <div className={styles.pitchMarkingTopGoalArea} />
          <div className={styles.pitchMarkingTopArc} />

          <div className={styles.pitchMarkingCenterLine} />
          <div className={styles.pitchMarkingCenterCircle} />
          <div className={styles.pitchMarkingCenterSpot} />

          <div className={styles.pitchMarkingBottomBox} />
          <div className={styles.pitchMarkingBottomGoalArea} />
          <div className={styles.pitchMarkingBottomArc} />

          {/* Row 1: GOL */}
          <div className={styles.pitchRow}>
            {gols.map((p) => renderTacticalToken(p, teamType))}
          </div>

          {/* Row 2: DEF */}
          <div className={styles.pitchRow}>
            {defs.map((p) => renderTacticalToken(p, teamType))}
          </div>

          {/* Row 3: MEI */}
          <div className={styles.pitchRow}>
            {mids.map((p) => renderTacticalToken(p, teamType))}
          </div>

          {/* Row 4: ATA */}
          <div className={styles.pitchRow}>
            {atts.map((p) => renderTacticalToken(p, teamType))}
          </div>
        </div>
      </div>
    )
  }

  // Render a Reserve Player Row Card
  const renderReserveCard = (p: any) => {
    const isSubbedIn = p.subbedIn
    const hasMinutes = p.minutes > 0
    const isBenched = p.matchStatus === 'benched'
    const isNotRelated = p.matchStatus === 'not_related'

    return (
      <div
        key={p.playerId}
        onClick={() => setSelectedPlayerId(p.playerId)}
        title={`${p.name} - Clique para ver ficha completa`}
        className={`${styles.reserveCard} ${
          isSubbedIn ? styles.reserveCardSubbedIn : ''
        }`}
      >
        <div className={styles.reserveLeft}>
          <div
            className={`${styles.reserveAvatarWrapper} ${
              isSubbedIn ? styles.reserveAvatarSubbed : ''
            }`}
          >
            {p.photoUrl ? (
              <img
                src={p.photoUrl}
                alt={p.name}
                className={styles.reservePhoto}
                loading="lazy"
                onError={(e) => {
                  ;(e.currentTarget as HTMLElement).style.display = 'none'
                  const fallback = (e.currentTarget.parentElement?.querySelector(`.${styles.reservePhotoFallback}`) as HTMLElement | null)
                  if (fallback) fallback.style.display = 'flex'
                }}
              />
            ) : null}

            <div
              className={styles.reservePhotoFallback}
              style={{ display: p.photoUrl ? 'none' : 'flex' }}
            >
              {p.position}
            </div>

            {p.clubLogoUrl && (
              <div className={styles.reserveClubBadge} title={p.clubShortName}>
                <img src={p.clubLogoUrl} alt={p.clubShortName || 'Clube'} />
              </div>
            )}

            <span
              className={`${styles.reservePosPill} ${
                styles[`posPill${p.position}`] || ''
              }`}
            >
              {p.position}
            </span>

            {isSubbedIn && <span className={styles.checkSubBadge}>✓</span>}
          </div>

          <div className={styles.reserveMeta}>
            <div className={styles.reserveNameRow}>
              <span className={styles.reserveName}>{p.name}</span>
              <span className={styles.reserveClubText}>
                · {p.clubShortName || 'Clube'}
              </span>

              {isSubbedIn && (
                <span className={styles.reserveTagSubbed}>
                  ✓ Auto-Sub Efetivada
                </span>
              )}
              {isBenched && !isSubbedIn && (
                <span className={styles.reserveTagBenched}>
                  Não entrou em campo
                </span>
              )}
              {isNotRelated && !isSubbedIn && (
                <span className={styles.reserveTagNotRelated}>
                  Não relacionado
                </span>
              )}
            </div>

            <div className={styles.reserveStatusDesc}>
              {isSubbedIn ? (
                <>
                  {p.clubShortName} • {p.minutes} min • Entrou na vaga de{' '}
                  <strong style={{ color: '#f1f5f9' }}>
                    {p.subbedFor?.name || 'Titular'}
                  </strong>{' '}
                  (0 min)
                </>
              ) : hasMinutes ? (
                `Jogou ${p.minutes} min • ${
                  p.points >= 10 ? 'Alta pontuação no banco' : 'Reserva direto'
                }`
              ) : isBenched ? (
                'Ficou como opção no banco e não atuou'
              ) : isNotRelated ? (
                'Atleta não relacionado para a partida'
              ) : (
                'Aguardando início do jogo'
              )}
            </div>
          </div>
        </div>

        <div className={styles.reserveRight}>
          {isSubbedIn ? (
            <>
              <span className={styles.reserveScoreAdded}>
                +{p.points.toFixed(1)} pts
              </span>
              <span className={styles.reserveScoreSubtextAdded}>
                Somados ao Placar
              </span>
            </>
          ) : (
            <>
              <span className={styles.reserveScorePts}>
                {p.minutes === 0 ? '0.0 pts' : `${p.points.toFixed(1)} pts`}
              </span>
              <span className={styles.reserveScoreSubtext}>
                {p.minutes === 0
                  ? 'Sem pontuação'
                  : 'Banco mantido'}
              </span>
            </>
          )}
        </div>
      </div>
    )
  }

  // Render a Bench Column
  const renderBenchColumn = (
    team: MatchupTeamDetail,
    teamType: 'home' | 'away'
  ) => {
    const isHiddenOnMobile = activeMobileTeam !== teamType

    return (
      <div
        className={`${styles.benchColumn} ${
          isHiddenOnMobile ? styles.benchColumnHiddenMobile : ''
        }`}
      >
        <div className={styles.benchColHeader}>
          <div className={styles.benchColTitle}>
            <span
              className={
                teamType === 'home'
                  ? styles.fieldTeamDotHome
                  : styles.fieldTeamDotAway
              }
            />
            <span>
              {team.teamName} — Reservas ({team.reserves.length})
            </span>
          </div>

          {team.substitutions.length > 0 ? (
            <span className={styles.badgeSubEffective}>
              🔄 {team.substitutions.length} Substituição(ões) Efetivada(s)
            </span>
          ) : (
            <span className={styles.badgeNoSub}>
              Nenhuma substituição necessária
            </span>
          )}
        </div>

        <div className={styles.benchList}>
          {team.reserves.map((p) => renderReserveCard(p))}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Breadcrumbs Bar */}
      <div className={styles.breadcrumbBar}>
        <div className={styles.breadcrumbLeft}>
          <Link href={`/league/${leagueId}`} className={styles.backLink}>
            ← Voltar à Liga
          </Link>
          <span className={styles.breadcrumbSep}>/</span>
          <Link href={`/league/${leagueId}`} className={styles.breadcrumbLeague}>
            {data.leagueName}
          </Link>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbRound}>
            Rodada {data.fixtureRound}
          </span>
        </div>

        <div className={styles.statusIndicatorRight}>
          <span
            className={`${styles.statusDot} ${
              data.status === 'live' ? styles.statusDotLive : ''
            }`}
          />
          <span>
            {data.status === 'completed'
              ? 'DADOS CONSOLIDADOS'
              : data.status === 'live'
              ? 'AO VIVO'
              : 'A DISPUTAR'}
          </span>
        </div>
      </div>

      {/* Scoreboard Card */}
      <div className={styles.scoreboardCard}>
        {/* Home Team */}
        <div className={styles.teamSide}>
          <div className={`${styles.teamAvatar} ${styles.avatarHome}`}>
            {data.homeTeam.teamName.slice(0, 2).toUpperCase()}
          </div>
          <div className={styles.teamMeta}>
            <div className={styles.teamNameRow}>
              <h1 className={styles.teamName}>{data.homeTeam.teamName}</h1>
              <span className={styles.formationBadge}>
                {data.homeTeam.formation}
              </span>
              {isHomeWinner && (
                <span className={styles.winnerPill}>👑 Vencedor</span>
              )}
            </div>
            <p className={styles.managerText}>
              Técnico: {data.homeTeam.managerName}
            </p>
          </div>
        </div>

        {/* Center Score */}
        <div className={styles.scoreCenter}>
          <span className={styles.roundLabel}>RODADA {data.fixtureRound}</span>
          <div className={styles.scoreNumbers}>
            <span
              className={`${styles.scoreHome} ${
                isHomeWinner ? styles.scoreWinner : ''
              }`}
            >
              {data.status === 'upcoming'
                ? '-'
                : data.homeTeam.totalPoints.toFixed(1)}
            </span>
            <span className={styles.scoreMultiply}>×</span>
            <span
              className={`${styles.scoreAway} ${
                isAwayWinner ? styles.scoreWinner : ''
              }`}
            >
              {data.status === 'upcoming'
                ? '-'
                : data.awayTeam.totalPoints.toFixed(1)}
            </span>
          </div>
          <span
            className={`${styles.statusPill} ${
              data.status === 'live'
                ? styles.statusPillLive
                : data.status === 'upcoming'
                ? styles.statusPillUpcoming
                : ''
            }`}
          >
            {data.status === 'completed'
              ? '● ENCERRADO'
              : data.status === 'live'
              ? '● AO VIVO'
              : 'A DISPUTAR'}
          </span>
        </div>

        {/* Away Team */}
        <div className={`${styles.teamSide} ${styles.teamSideRight}`}>
          <div className={`${styles.teamAvatar} ${styles.avatarAway}`}>
            {data.awayTeam.teamName.slice(0, 2).toUpperCase()}
          </div>
          <div className={`${styles.teamMeta} ${styles.teamMetaRight}`}>
            <div className={styles.teamNameRow}>
              <h1 className={styles.teamName}>{data.awayTeam.teamName}</h1>
              <span className={styles.formationBadge}>
                {data.awayTeam.formation}
              </span>
              {isAwayWinner && (
                <span className={styles.winnerPill}>👑 Vencedor</span>
              )}
            </div>
            <p className={styles.managerText}>
              Técnico: {data.awayTeam.managerName}
            </p>
          </div>
        </div>
      </div>

      {/* Action / Info Bar (No processar auto-sub, no commissioner button) */}
      <div className={styles.actionInfoBar}>
        <div className={styles.actionInfoLeft}>
          <span className={styles.actionInfoIcon}>⚙️</span>
          <span>
            <strong>Painel do Confronto:</strong> Gerencie o fechamento e scouts
            da Rodada {data.fixtureRound}.
          </span>
        </div>
        <button
          onClick={() => setIsDetailsModalOpen(true)}
          className={styles.btnDetails}
        >
          <span>ℹ️</span> Detalhes adicionais
        </button>
      </div>

      {/* Mobile Abas / Tabs Switcher de Times */}
      <div className={styles.mobileTabControls}>
        <div className={styles.tabSegment}>
          <button
            onClick={() => setActiveMobileTeam('home')}
            className={`${styles.tabBtn} ${
              activeMobileTeam === 'home' ? styles.tabBtnActiveHome : ''
            }`}
          >
            🔵 {data.homeTeam.teamName} ({data.homeTeam.totalPoints.toFixed(1)} pts)
          </button>
          <button
            onClick={() => setActiveMobileTeam('away')}
            className={`${styles.tabBtn} ${
              activeMobileTeam === 'away' ? styles.tabBtnActiveAway : ''
            }`}
          >
            🟡 {data.awayTeam.teamName} ({data.awayTeam.totalPoints.toFixed(1)} pts)
          </button>
        </div>
      </div>

      {/* Section 1: Campo Tático Comparativo */}
      <section className={styles.tacticalSection}>
        <div className={styles.tacticalHeaderBar}>
          <div className={styles.tacticalHeaderLeft}>
            <span className={styles.tacticalBadge}>
              <span>🟩</span> CAMPO TÁTICO COMPARATIVO
            </span>
            <span className={styles.tacticalSubtitle}>
              11 Titulares em Campo
            </span>
          </div>

          <div className={styles.tacticalLegend}>
            <div className={styles.legendItem}>
              <span style={{ color: '#f59e0b' }}>👑</span>
              <span>Capitão = 1.5x</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendDotGreen} />
              <span>Em Campo</span>
            </div>
            <div className={styles.legendItem}>
              <span style={{ color: '#2dd4bf' }}>⚡</span>
              <span>Auto-Sub</span>
            </div>
            <div className={styles.legendItem}>
              <span style={{ color: '#ef4444' }}>⊘</span>
              <span>Ausente/0 min</span>
            </div>
          </div>
        </div>

        {/* Tactical Pitch Grid (Home vs Away) */}
        <div className={styles.fieldsGrid}>
          {renderFieldCard(data.homeTeam, isHomeWinner, 'home')}
          {renderFieldCard(data.awayTeam, isAwayWinner, 'away')}
        </div>
      </section>

      {/* Section 2: Banco de Reservas */}
      <section className={styles.benchSectionWrapper}>
        <div className={styles.benchHeaderBar}>
          <div className={styles.benchHeaderLeft}>
            <div className={styles.benchIconBadge}>👥</div>
            <div>
              <h2 className={styles.benchTitle}>Banco de Reservas</h2>
              <p className={styles.benchSubtitle}>
                5 suplentes por equipe com critérios de substituição automática
                aplicados
              </p>
            </div>
          </div>
          <span className={styles.benchRuleBadge}>Regra: Banco Prioritário</span>
        </div>

        {/* Bench Columns Grid (Home vs Away) */}
        <div className={styles.benchGrid}>
          {renderBenchColumn(data.homeTeam, 'home')}
          {renderBenchColumn(data.awayTeam, 'away')}
        </div>
      </section>

      {/* Matchup Details Modal (Image 2) */}
      <MatchupDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        data={data}
      />

      {/* Player Detail Modal */}
      <PlayerDetailModal
        playerId={selectedPlayerId}
        leagueId={leagueId}
        round={data.fixtureRound}
        onClose={() => setSelectedPlayerId(null)}
      />
    </div>
  )
}
