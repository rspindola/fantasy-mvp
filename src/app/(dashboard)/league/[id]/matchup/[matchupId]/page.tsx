'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  getMatchupDetailData,
  executeAutoSubAction,
  refreshMatchupPartialsAction,
  type MatchupDetailPageData,
  type MatchupTeamDetail,
} from './actions'
import { Badge } from '@/components/ui/Badge'
import { sortByPosition } from '@/lib/lineup/lineup-engine'
import { PlayerDetailModal } from '@/components/player/PlayerDetailModal'
import styles from './page.module.css'

export default function MatchupDetailPage() {
  const params = useParams()
  const leagueId = params.id as string
  const matchupId = params.matchupId as string

  const [data, setData] = useState<MatchupDetailPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)

  useEffect(() => {
    if (leagueId && matchupId) {
      getMatchupDetailData(leagueId, matchupId).then((res) => {
        setData(res)
        setLoading(false)
      })
    }
  }, [leagueId, matchupId])

  const handleRefreshPartials = () => {
    if (!data) return
    setActionMessage(null)
    startTransition(async () => {
      try {
        const res = await refreshMatchupPartialsAction(leagueId, data.fixtureRound)
        const updated = await getMatchupDetailData(leagueId, matchupId)
        if (updated) setData(updated)
        setActionMessage(
          `✓ Parciais atualizadas com sucesso! ${res.startedCount} partida(s) em andamento/finalizada(s) e ${res.playersUpdated} estatísticas de atletas computadas.`
        )
      } catch (err: any) {
        setActionMessage(`Erro ao atualizar parciais: ${err.message}`)
      }
    })
  }

  const handleSimulateAutoSub = () => {
    if (!data) return
    setActionMessage(null)
    startTransition(async () => {
      try {
        const res = await executeAutoSubAction(leagueId, data.fixtureRound, false)
        const updated = await getMatchupDetailData(leagueId, matchupId)
        if (updated) setData(updated)

        if (res.substitutions.length > 0) {
          setActionMessage(
            `✓ Scouts processados! ${res.substitutions.length} substituição(ões) automática(s) realizada(s) nesta rodada.`
          )
        } else {
          setActionMessage(
            `✓ Scouts atualizados com sucesso! Nenhuma substituição necessária para os times.`
          )
        }
      } catch (err: any) {
        setActionMessage(`Erro ao processar: ${err.message}`)
      }
    })
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <p style={{ color: 'var(--text-secondary)', padding: '40px 0', textAlign: 'center' }}>
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

  const allSubs = [
    ...data.homeTeam.substitutions.map((s) => ({ ...s, teamName: data.homeTeam.teamName })),
    ...data.awayTeam.substitutions.map((s) => ({ ...s, teamName: data.awayTeam.teamName })),
  ]

  const renderPlayerCard = (p: any, isBench: boolean = false) => {
    const isSubbedOut = p.subbedOut
    const isSubbedIn = p.subbedIn
    const hasPoints = p.points !== null && p.points > 0

    return (
      <div
        key={p.playerId}
        onClick={() => setSelectedPlayerId(p.playerId)}
        title="Clique para ver a ficha completa do atleta"
        style={{ cursor: 'pointer' }}
        className={`${styles.playerCard} ${
          isSubbedOut ? styles.playerCardSubbedOut : ''
        } ${isSubbedIn ? styles.playerCardSubbedIn : ''}`}
      >
        <div className={styles.playerLeft}>
          {p.photoUrl ? (
            <img src={p.photoUrl} alt={p.name} className={styles.playerAvatar} />
          ) : (
            <div className={styles.playerAvatarFallback}>
              {p.position}
            </div>
          )}

          <div className={styles.playerInfo}>
            <div className={styles.playerNameRow}>
              <span className={styles.playerName}>{p.name}</span>
              {p.isCaptain && (
                <span className={styles.captainCrown} title="Capitão (1.5x pontos)">
                  👑 Capitão
                </span>
              )}
              {isSubbedOut && (
                <span className={styles.subBadgeOut} title="Substituído pelo banco via Auto-Sub">
                  🔻 Substituído
                </span>
              )}
              {isSubbedIn && (
                <span className={styles.subBadgeIn} title="Entrou via Auto-Sub">
                  🔄 Entrou
                </span>
              )}
              {p.matchStatus === 'postponed' && (
                <span className={styles.postponedBadge} title="Partida adiada pela CBF">
                  ⏱️ Jogo Adiado
                </span>
              )}
              {p.matchStatus === 'not_related' && (
                <span className={styles.notRelatedBadge} title="Atleta não foi relacionado para a partida">
                  ❌ Não foi relacionado ao jogo
                </span>
              )}
              {p.matchStatus === 'benched' && (
                <span className={styles.benchedBadge} title="Atleta ficou no banco de reservas e não entrou em campo (0 min)">
                  ⚠️ Não entrou em campo
                </span>
              )}
            </div>

            <div className={styles.playerMetaRow}>
              <Badge variant={p.position as any}>
                {p.position}
              </Badge>
              {p.clubLogoUrl && (
                <img
                  src={p.clubLogoUrl}
                  alt={p.clubShortName || ''}
                  className={styles.clubBadgeImg}
                />
              )}
              <span>{p.clubShortName || 'Clube'}</span>
              {p.minutes > 0 ? (
                <span>· {p.minutes} min</span>
              ) : p.matchStatus === 'postponed' ? (
                <span style={{ color: '#fbbf24' }}>· Adiado (*)</span>
              ) : p.matchStatus === 'benched' ? (
                <span>· Banco (0 min)</span>
              ) : p.matchStatus === 'scheduled' ? (
                <span style={{ color: 'var(--text-muted)' }}>· A jogar</span>
              ) : (
                <span>· 0 min</span>
              )}
              {isBench && isSubbedIn && p.subbedFor && (
                <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
                  (No lugar de {p.subbedFor.name})
                </span>
              )}
              {!isBench && isSubbedOut && p.subbedInBy && (
                <span style={{ color: 'var(--accent-red)', fontWeight: 600 }}>
                  (Substituído por {p.subbedInBy.name})
                </span>
              )}
            </div>
          </div>
        </div>

        <div className={styles.playerRight}>
          <span className={hasPoints && !isSubbedOut ? styles.playerPoints : styles.playerPointsZero}>
            {isSubbedOut ? '0.0 pts' : `${p.points.toFixed(1)} pts`}
          </span>

          {p.scouts && Object.keys(p.scouts).length > 0 && (
            <span className={styles.playerScouts}>
              {p.scouts.goals ? `⚽ ${p.scouts.goals} ` : ''}
              {p.scouts.assists ? `👟 ${p.scouts.assists} ` : ''}
              {p.scouts.tackles ? `🛡️ ${p.scouts.tackles} ` : ''}
              {p.scouts.saves ? `🧤 ${p.scouts.saves} ` : ''}
              {p.scouts.cleanSheet ? `SG ` : ''}
            </span>
          )}
        </div>
      </div>
    )
  }

  const renderTeamColumn = (team: MatchupTeamDetail) => {
    return (
      <div className={styles.teamColumn}>
        <div className={styles.columnHeader}>
          <div>
            <Link
              href={`/league/${leagueId}/team/${team.teamId}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
              title="Clique para ver o elenco completo de 24 atletas"
            >
              <h2 className={styles.columnTitle} style={{ cursor: 'pointer' }}>
                {team.teamName} 📋
              </h2>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={styles.managerName}>Técnico: {team.managerName}</span>
              <Link
                href={`/league/${leagueId}/team/${team.teamId}`}
                style={{ fontSize: '0.75rem', color: 'var(--accent-green)', textDecoration: 'none', fontWeight: 600 }}
              >
                · Ver Elenco →
              </Link>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className={styles.columnScore}>{team.totalPoints.toFixed(1)} pts</span>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Esquema {team.formation} · Bônus +{team.captainBonus.toFixed(1)} pts
            </div>
          </div>
        </div>

        {/* Titulares */}
        <div className={styles.playersList}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Titulares ({team.starters.length})
          </div>
          {[...team.starters].sort(sortByPosition).map((p) => renderPlayerCard(p, false))}
        </div>

        {/* Reservas */}
        {team.reserves.length > 0 && (
          <div className={styles.benchSection}>
            <div className={styles.benchTitle}>
              <span>Banco de Reservas ({team.reserves.length})</span>
            </div>
            <div className={styles.playersList}>
              {[...team.reserves].sort(sortByPosition).map((p) => renderPlayerCard(p, true))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <Link href={`/league/${leagueId}`} className={styles.backLink}>
        ← Voltar à Liga
      </Link>

      {/* Scoreboard Card */}
      <div className={styles.scoreboardCard}>
        <div className={styles.scoreboardTop}>
          {/* Time Casa */}
          <div className={styles.teamScoreBlock}>
            <div className={styles.teamAvatar}>
              {data.homeTeam.teamName.slice(0, 2).toUpperCase()}
            </div>
            <div className={styles.teamMeta}>
              <h1 className={styles.teamName}>
                {data.homeTeam.teamName}
                {isHomeWinner && <span className={styles.winnerCrown}>👑 Vencedor</span>}
              </h1>
              <span className={styles.managerName}>Técnico: {data.homeTeam.managerName}</span>
              <span className={styles.formationBadge}>{data.homeTeam.formation}</span>
            </div>
          </div>

          {/* Placar Central */}
          <div className={styles.centerDivider}>
            <span className={styles.roundPill}>
              Rodada {data.fixtureRound}
              {data.isPostponedRound && '*'}
            </span>

            <div className={styles.scoreNumbers}>
              <span className={styles.scoreHome}>{data.homeTeam.totalPoints.toFixed(1)}</span>
              <span className={styles.scoreVs}>✕</span>
              <span className={styles.scoreAway}>{data.awayTeam.totalPoints.toFixed(1)}</span>
            </div>

            {data.status === 'live' ? (
              <span className={styles.statusBadgeLive}>
                <span className={styles.liveDot} />
                AO VIVO
              </span>
            ) : data.status === 'completed' ? (
              <span className={styles.statusBadgeDone}>
                {data.isPostponedRound ? '⚠️ APURAÇÃO PROVISÓRIA (*)' : '✓ ENCERRADO'}
              </span>
            ) : (
              <span className={styles.statusBadgeUpcoming}>
                A DISPUTAR
              </span>
            )}
          </div>

          {/* Time Fora */}
          <div className={`${styles.teamScoreBlock} ${styles.teamScoreBlockRight}`}>
            <div className={styles.teamAvatar}>
              {data.awayTeam.teamName.slice(0, 2).toUpperCase()}
            </div>
            <div className={styles.teamMeta}>
              <h1 className={styles.teamName}>
                {isAwayWinner && <span className={styles.winnerCrown}>👑 Vencedor</span>}
                {data.awayTeam.teamName}
              </h1>
              <span className={styles.managerName}>Técnico: {data.awayTeam.managerName}</span>
              <span className={styles.formationBadge}>{data.awayTeam.formation}</span>
            </div>
          </div>
        </div>

        {/* Live Round Notice Banner */}
        {data.status === 'live' && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 16px',
              fontSize: '0.8125rem',
              color: '#fca5a5',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginTop: '12px',
            }}
          >
            <span>🔴</span>
            <span>
              <strong>Parciais em Andamento:</strong> A pontuação exibida é momentânea e reflete o andamento dos jogos já iniciados. A pontuação oficial e a resolução final dos confrontos só são consolidadas ao término da rodada pelo Comissário.
            </span>
          </div>
        )}

        {/* Commissioner Actions */}
        {data.isCommissioner && (
          <div className={styles.commissionerBar}>
            <span className={styles.commissionerBarText}>
              ⚙️ <strong>Painel do Comissário:</strong>{' '}
              {data.status === 'live'
                ? 'Atualize as estatísticas parciais dos jogos iniciados ou acesse o painel completo.'
                : `Gerencie o fechamento e scouts da Rodada ${data.fixtureRound}.`}
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {data.status === 'live' ? (
                <button
                  onClick={handleRefreshPartials}
                  disabled={isPending}
                  className={styles.btnSimulate}
                >
                  {isPending ? 'Atualizando...' : '⚡ Atualizar Parciais'}
                </button>
              ) : (
                <button
                  onClick={handleSimulateAutoSub}
                  disabled={isPending}
                  className={styles.btnSimulate}
                >
                  {isPending ? 'Processando...' : '⚡ Processar Auto-Sub'}
                </button>
              )}
              <Link href={`/league/${leagueId}/admin`}>
                <button
                  className={styles.btnSimulate}
                  style={{
                    background: 'rgba(234, 179, 8, 0.15)',
                    border: '1px solid rgba(234, 179, 8, 0.4)',
                    color: '#fbbf24',
                  }}
                >
                  👑 Painel do Comissário
                </button>
              </Link>
            </div>
          </div>
        )}

        {actionMessage && (
          <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: '0.8125rem', color: 'var(--accent-green)' }}>
            {actionMessage}
          </div>
        )}

        {/* Substitutions Report Banner */}
        {allSubs.length > 0 && (
          <div className={styles.subsBanner}>
            <div className={styles.subsBannerTitle}>
              <span>🔄 Substituições Automáticas Aplicadas neste Duelo:</span>
            </div>
            <div className={styles.subsList}>
              {allSubs.map((sub, idx) => (
                <div key={idx} className={styles.subItem}>
                  <span className={styles.subTeamTag}>[{sub.teamName}]</span>
                  <span>{sub.outPlayerName} (0 min)</span>
                  <span className={styles.subArrow}>➔</span>
                  <span style={{ fontWeight: 600 }}>{sub.inPlayerName} ({sub.position})</span>
                  <span className={styles.subPtsTag}>+{sub.pointsAdded.toFixed(1)} pts somados</span>
                  {sub.captainTransferred && (
                    <span style={{ color: 'var(--accent-gold)', fontSize: '0.75rem', fontWeight: 700 }}>
                      (👑 Capitania herdada)
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Postponed Round Warning Banner */}
      {data.isPostponedRound && (
        <div
          style={{
            background: 'rgba(234, 179, 8, 0.08)',
            border: '1px solid rgba(234, 179, 8, 0.35)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 20px',
            fontSize: '0.875rem',
            color: '#fef08a',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>⭐</span>
          <div>
            <strong>Rodada com Partidas Adiadas (*):</strong> As pontuações e o resultado deste confronto
            são provisórios. Atletas com a marcação <code>⏱️ Jogo Adiado</code> terão seus scouts computados
            e este duelo será retificado retroativamente assim que as partidas pendentes forem disputadas pela CBF.
          </div>
        </div>
      )}

      {/* Side by Side Lineups */}
      <div className={styles.lineupsGrid}>
        {renderTeamColumn(data.homeTeam)}
        {renderTeamColumn(data.awayTeam)}
      </div>

      {/* Player Detail Modal */}
      <PlayerDetailModal
        playerId={selectedPlayerId}
        leagueId={leagueId}
        onClose={() => setSelectedPlayerId(null)}
      />
    </div>
  )
}
