'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  getCommissionerData,
  toggleFixturePostponedAction,
  closeAndAdvanceRoundAction,
  recalculatePostponedRoundAction,
  generateRoundPartialsAction,
  getRoundTopScorersAction,
  sendMarketClosingAlertAction,
  syncRoundScheduleAction,
  type CommissionerPageData,
  type RoundTopScorer,
} from './actions'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PlayerDetailModal } from '@/components/player/PlayerDetailModal'
import styles from './page.module.css'

export default function CommissionerAdminPage() {
  const params = useParams()
  const leagueId = params.id as string

  const [data, setData] = useState<CommissionerPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'CURRENT' | 'POSTPONED' | 'ADVANCE'>('CURRENT')
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [summaryReport, setSummaryReport] = useState<any | null>(null)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [modalRound, setModalRound] = useState<number | undefined>(undefined)
  const [topScorersRound, setTopScorersRound] = useState<number>(29)
  const [topScorersList, setTopScorersList] = useState<RoundTopScorer[]>([])
  const [loadingTopScorers, setLoadingTopScorers] = useState(false)

  const reloadData = useCallback(async () => {
    if (leagueId) {
      const res = await getCommissionerData(leagueId)
      setData(res)
      if (res) {
        setTopScorersRound(res.topScorersRound)
        setTopScorersList(res.topScorers || [])
      }
      setLoading(false)
    }
  }, [leagueId])

  useEffect(() => {
    reloadData()
  }, [reloadData])

  if (loading) {
    return (
      <div className={styles.container}>
        <p>Carregando Painel do Comissário...</p>
      </div>
    )
  }

  if (!data || !data.isCommissioner) {
    return (
      <div className={styles.container}>
        <h2>Acesso Restrito ao Comissário</h2>
        <p>Você precisa ser o comissário desta liga para acessar esta área.</p>
        <Link href={`/league/${leagueId}`}>
          <Button size="md">Voltar à Liga</Button>
        </Link>
      </div>
    )
  }

  const currentRound = data.season.currentRound
  const isCurrentRoundPostponed = data.currentRoundFixtures.some((f) => f.status === 'postponed')
  const finishedFixturesCount = data.currentRoundFixtures.filter((f) => f.status === 'FT').length
  const liveFixturesCount = data.currentRoundFixtures.filter((f) => f.status === 'live').length
  const postponedFixturesCount = data.currentRoundFixtures.filter((f) => f.status === 'postponed').length
  const scheduledFixturesCount = data.currentRoundFixtures.filter((f) => f.status === 'scheduled').length

  const handleGeneratePartials = () => {
    setFeedback(null)
    setSummaryReport(null)
    startTransition(async () => {
      try {
        const res = await generateRoundPartialsAction(leagueId, currentRound)
        setFeedback({
          type: 'success',
          message: `⚡ Parciais da Rodada ${currentRound} geradas com sucesso! ${res.startedCount} partida(s) iniciada(s) atualizada(s) (${res.liveCount} ao vivo, ${res.finishedCount} finalizada(s)). As ${res.scheduledCount} partida(s) futura(s) continuam agendadas. A pontuação oficial da liga e classificação só serão fechadas na aba "Fechamento & Avanço".`,
        })
        await reloadData()
      } catch (err: any) {
        setFeedback({ type: 'error', message: err.message || 'Erro ao gerar parciais.' })
      }
    })
  }

  const handleSendMarketAlert = () => {
    if (
      !confirm(
        'Deseja enviar a notificação no WhatsApp de fechamento do mercado para todos os participantes da liga com telefone cadastrado?'
      )
    ) {
      return
    }
    setFeedback(null)
    startTransition(async () => {
      try {
        const res = await sendMarketClosingAlertAction(leagueId)
        setFeedback({
          type: 'success',
          message: `📢 Aviso de mercado disparado! ${res.sentCount} enviado(s), ${res.skippedCount} sem telefone cadastrado, ${res.failedCount} com falha. Horário informado: "${res.marketCloseLabel}".`,
        })
      } catch (err: any) {
        setFeedback({ type: 'error', message: err.message || 'Erro ao enviar aviso de mercado.' })
      }
    })
  }

  const handleSyncSchedule = () => {
    setFeedback(null)
    startTransition(async () => {
      try {
        const res = await syncRoundScheduleAction(leagueId, currentRound)
        setFeedback({
          type: 'success',
          message: `🗓️ Agenda da Rodada ${currentRound} sincronizada com sucesso! (${res.updatedCount} partida(s) atualizada(s)).`,
        })
        await reloadData()
      } catch (err: any) {
        setFeedback({ type: 'error', message: err.message || 'Erro ao sincronizar agenda.' })
      }
    })
  }

  const handleTogglePostponed = (fixtureId: string, currentStatus: string) => {
    const isCurrentlyPostponed = currentStatus === 'postponed'
    setFeedback(null)
    startTransition(async () => {
      try {
        await toggleFixturePostponedAction(leagueId, fixtureId, !isCurrentlyPostponed)
        setFeedback({
          type: 'success',
          message: !isCurrentlyPostponed
            ? 'Partida marcada como ADIADA. A rodada agora possui a marcação (*).'
            : 'Partida restaurada para AGENDADA.',
        })
        await reloadData()
      } catch (err: any) {
        setFeedback({ type: 'error', message: err.message || 'Erro ao alterar partida.' })
      }
    })
  }

  const handleCloseAndAdvance = () => {
    setFeedback(null)
    setSummaryReport(null)
    startTransition(async () => {
      try {
        const report = await closeAndAdvanceRoundAction(leagueId, currentRound)
        setSummaryReport(report)
        setFeedback({
          type: 'success',
          message: isCurrentRoundPostponed
            ? `Rodada ${currentRound}* encerrada provisoriamente com sucesso! Campeonato avançou para a Rodada ${report.newRound}.`
            : `Rodada ${currentRound} consolidada com sucesso! Campeonato avançou para a Rodada ${report.newRound}.`,
        })
        await reloadData()
      } catch (err: any) {
        setFeedback({ type: 'error', message: err.message || 'Erro ao fechar rodada.' })
      }
    })
  }

  const handleRecalculateRound = (roundNumber: number) => {
    setFeedback(null)
    setSummaryReport(null)
    startTransition(async () => {
      try {
        const report = await recalculatePostponedRoundAction(leagueId, roundNumber)
        setSummaryReport(report)
        setFeedback({
          type: 'success',
          message: `Rodada ${roundNumber} recalculada retroativamente com sucesso! Duelos H2H e classificação atualizados.`,
        })
        await reloadData()
      } catch (err: any) {
        setFeedback({ type: 'error', message: err.message || 'Erro ao recalcular rodada.' })
      }
    })
  }

  const handleSelectTopScorersRound = async (roundNum: number) => {
    setTopScorersRound(roundNum)
    setLoadingTopScorers(true)
    try {
      const scorers = await getRoundTopScorersAction(leagueId, roundNum)
      setTopScorersList(scorers)
    } catch (e) {
      console.error('Error fetching top scorers for round:', e)
    } finally {
      setLoadingTopScorers(false)
    }
  }

  const renderTopScorersList = (scorers: RoundTopScorer[], roundNum?: number) => {
    if (!scorers || scorers.length === 0) {
      return (
        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Nenhum scout registrado para esta rodada ainda.
        </div>
      )
    }

    return (
      <div className={styles.topScorersGrid}>
        {scorers.map((s) => {
          const isPodium1 = s.rank === 1
          const isPodium2 = s.rank === 2
          const isPodium3 = s.rank === 3

          const cardClass = `${styles.topScorerCard} ${
            isPodium1
              ? styles.topScorerCardPodium1
              : isPodium2
              ? styles.topScorerCardPodium2
              : isPodium3
              ? styles.topScorerCardPodium3
              : ''
          }`

          const rankClass = `${styles.rankBadge} ${
            isPodium1
              ? styles.rankGold
              : isPodium2
              ? styles.rankSilver
              : isPodium3
              ? styles.rankBronze
              : styles.rankDefault
          }`

          return (
            <div
              key={s.playerId}
              className={cardClass}
              onClick={() => {
                setModalRound(roundNum)
                setSelectedPlayerId(s.playerId)
              }}
              title="Clique para ver os scouts detalhados do atleta"
            >
              <div className={styles.topScorerLeft}>
                <div className={rankClass}>
                  {isPodium1 ? '🥇' : isPodium2 ? '🥈' : isPodium3 ? '🥉' : `#${s.rank}`}
                </div>

                <div className={styles.topScorerAvatarBox}>
                  {s.photoUrl ? (
                    <img src={s.photoUrl} alt={s.name} className={styles.topScorerPhoto} />
                  ) : (
                    <div className={styles.topScorerPhotoFallback}>
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  {s.clubLogoUrl && (
                    <img src={s.clubLogoUrl} alt={s.clubShortName} className={styles.topScorerCrest} />
                  )}
                </div>

                <div className={styles.topScorerInfo}>
                  <div className={styles.topScorerNameRow}>
                    <span className={styles.topScorerName}>{s.name}</span>
                    <Badge variant={s.position as any}>
                      {s.position}
                    </Badge>
                  </div>

                  <div className={styles.topScorerMeta}>
                    <span>{s.clubShortName || s.clubName}</span>
                    <span>•</span>
                    {s.fantasyTeamName ? (
                      <span className={styles.teamOwnerBadge} title={`Escalado por ${s.fantasyTeamName}`}>
                        🛡️ {s.fantasyTeamName}
                      </span>
                    ) : (
                      <span className={styles.teamFreeBadge}>Livre</span>
                    )}
                  </div>

                  <div className={styles.topScorerPills}>
                    {s.goals > 0 && (
                      <span className={styles.statHighlightPill}>
                        ⚽ {s.goals} {s.goals > 1 ? 'gols' : 'gol'}
                      </span>
                    )}
                    {s.assists > 0 && (
                      <span className={styles.statHighlightPill}>
                        🎯 {s.assists} {s.assists > 1 ? 'ast' : 'ast'}
                      </span>
                    )}
                    {s.cleanSheet && (s.position === 'ZAG' || s.position === 'LAT' || s.position === 'GOL') && (
                      <span className={styles.statHighlightPill}>🛡️ SG</span>
                    )}
                    {s.saves > 0 && s.position === 'GOL' && (
                      <span className={styles.statHighlightPill}>🧤 {s.saves} def</span>
                    )}
                    {s.tackles > 0 && (
                      <span className={styles.statHighlightPill}>⚔️ {s.tackles} des</span>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.topScorerScore}>
                <span className={styles.topScorerPoints}>
                  {s.points >= 0 ? `+${s.points.toFixed(1)}` : s.points.toFixed(1)}
                </span>
                <span className={styles.topScorerMinutes}>{s.minutes}&apos; jogados</span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <Link href={`/league/${leagueId}`} className={styles.backLink}>
        ← Voltar à liga
      </Link>

      {/* Header */}
      <div className={styles.headerCard}>
        <div className={styles.headerTop}>
          <div className={styles.titleArea}>
            <span className={styles.badgeCommissioner}>👑 Painel do Comissário</span>
            <h1 className={styles.title}>Gestão da Liga — {data.league.name}</h1>
            <p className={styles.subtitle}>
              Controle o andamento das rodadas reais da Série A, gerencie partidas adiadas marcadas com (*),
              efetue fechamentos provisórios e recalcule pontuações retroativas com integridade.
            </p>
          </div>

          <div className={styles.configBadges}>
            <Badge variant="MEI">
              Rodada Atual: {currentRound}
              {isCurrentRoundPostponed ? '*' : ''}
            </Badge>
            <Badge variant="default">{data.league.teamCount} Times</Badge>
            <Badge variant="default">Modo {data.league.scoringMode}</Badge>
            {data.postponedRounds.length > 0 && (
              <Badge variant="status">
                ⭐ {data.postponedRounds.length} Rodada(s) com *
              </Badge>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className={styles.tabs}>
          <button
            onClick={() => setActiveTab('CURRENT')}
            className={`${styles.tabBtn} ${activeTab === 'CURRENT' ? styles.tabBtnActive : ''}`}
          >
            ⚽ Jogos da Rodada {currentRound}
            {isCurrentRoundPostponed && <span className={styles.tabBadge}>*</span>}
          </button>

          <button
            onClick={() => setActiveTab('POSTPONED')}
            className={`${styles.tabBtn} ${activeTab === 'POSTPONED' ? styles.tabBtnActive : ''}`}
          >
            ⏱️ Rodadas Adiadas com Asterisco (*)
            {data.postponedRounds.length > 0 && (
              <span className={styles.tabBadge}>{data.postponedRounds.length}</span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('ADVANCE')}
            className={`${styles.tabBtn} ${activeTab === 'ADVANCE' ? styles.tabBtnActive : ''}`}
          >
            ⚡ Fechamento & Avanço de Rodada
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          style={{
            background:
              feedback.type === 'success' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${
              feedback.type === 'success' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'
            }`,
            color: feedback.type === 'success' ? 'var(--accent-green)' : 'var(--accent-red)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 20px',
            fontSize: '0.9375rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span>{feedback.type === 'success' ? '✅' : '⚠️'}</span>
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Summary Report from Recalculate / Close */}
      {summaryReport && (
        <div className={styles.summaryModal}>
          <div className={styles.summaryTitle}>
            <span>📊 Relatório de Apuração da Rodada {summaryReport.fixtureRound}</span>
          </div>

          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            {summaryReport.teamsProcessed} times processados. {summaryReport.substitutions.length}{' '}
            substituição(ões) automática(s) computada(s).
          </p>

          {summaryReport.substitutions.length > 0 && (
            <div className={styles.summaryList}>
              <strong style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Substituições Automáticas Aplicadas:
              </strong>
              {summaryReport.substitutions.map((s: any, idx: number) => (
                <div key={idx} className={styles.summaryItem}>
                  <span>
                    <strong>[{s.teamName}]</strong> {s.outPlayerName} (0 min) ➔ {s.inPlayerName} ({s.position})
                  </span>
                  <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>
                    +{s.pointsAdded.toFixed(1)} pts
                  </span>
                </div>
              ))}
            </div>
          )}

          {summaryReport.matchupResults && summaryReport.matchupResults.length > 0 && (
            <div className={styles.summaryList} style={{ marginTop: '8px' }}>
              <strong style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Resultados dos Confrontos H2H:
              </strong>
              {summaryReport.matchupResults.map((m: any, idx: number) => (
                <div key={idx} className={styles.summaryItem}>
                  <span>
                    {m.homeTeamName} ({m.homePoints.toFixed(1)} pts) vs {m.awayTeamName} ({m.awayPoints.toFixed(1)} pts)
                  </span>
                  <span style={{ fontWeight: 700 }}>
                    {m.winner === 'draw'
                      ? 'Empate'
                      : m.winner === 'home'
                      ? `Vitória de ${m.homeTeamName}`
                      : `Vitória de ${m.awayTeamName}`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {summaryReport.topScorers && summaryReport.topScorers.length > 0 && (
            <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <strong style={{ fontSize: '0.9375rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🏆 Top 10 Maiores Pontuadores da Rodada {summaryReport.fixtureRound}
                </strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Clique no atleta para ver o extrato de scouts
                </span>
              </div>
              {renderTopScorersList(summaryReport.topScorers, summaryReport.fixtureRound)}
            </div>
          )}
        </div>
      )}

      {/* Tab 1: Current Round Fixtures */}
      {activeTab === 'CURRENT' && (
        <div className={styles.section}>
          <div
            className={styles.sectionHeader}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div style={{ flex: 1, minWidth: '280px' }}>
              <h2 className={styles.sectionTitle}>
                Partidas da Série A — Rodada {currentRound}
                {isCurrentRoundPostponed && <span style={{ color: '#fbbf24' }}>*</span>}
              </h2>
              <p className={styles.sectionDesc}>
                {finishedFixturesCount} finalizada(s) · {liveFixturesCount} em andamento / ao vivo · {scheduledFixturesCount} agendada(s)
                {postponedFixturesCount > 0 && ` · ${postponedFixturesCount} partida(s) adiada(s)`}.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Button
                  size="md"
                  variant="secondary"
                  isLoading={isPending}
                  disabled={isPending}
                  onClick={handleSyncSchedule}
                  title="Atualiza datas e horários oficiais das partidas diretamente da CBF / API-Football"
                >
                  🗓️ Sincronizar Agenda
                </Button>
                <Button
                  size="md"
                  variant="secondary"
                  isLoading={isPending}
                  disabled={isPending}
                  onClick={handleSendMarketAlert}
                  title="Envia WhatsApp para todos os participantes avisando o fechamento do mercado"
                >
                  📢 Avisar Fechamento (WhatsApp)
                </Button>
                <Button
                  size="md"
                  isLoading={isPending}
                  disabled={isPending}
                  onClick={handleGeneratePartials}
                >
                  ⚡ Gerar / Atualizar Parciais
                </Button>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right', maxWidth: '380px' }}>
                Dispare avisos no WhatsApp aos gestores ou atualize os scouts em tempo real das partidas em andamento.
              </span>
            </div>
          </div>

          <div className={styles.fixturesGrid}>
            {data.currentRoundFixtures.map((f) => {
              const isPostponed = f.status === 'postponed'
              const isFT = f.status === 'FT'
              const isLive = f.status === 'live'

              return (
                <div
                  key={f.id}
                  className={`${styles.fixtureCard} ${isPostponed ? styles.fixtureCardPostponed : ''}`}
                >
                  <div className={styles.fixtureCardTop}>
                    <span>
                      {f.kickoffAt
                        ? new Date(f.kickoffAt).toLocaleDateString('pt-BR', {
                            weekday: 'short',
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'A definir'}
                    </span>
                    <span
                      className={`${styles.fixtureStatusBadge} ${
                        isFT
                          ? styles.statusFT
                          : isLive
                          ? styles.statusLive
                          : isPostponed
                          ? styles.statusPostponed
                          : styles.statusScheduled
                      }`}
                    >
                      {isFT ? 'Finalizado' : isLive ? '🔴 Ao Vivo' : isPostponed ? '⚠️ Adiado (*)' : 'Agendado'}
                    </span>
                  </div>

                  <div className={styles.fixtureTeams}>
                    <div className={styles.teamSide}>
                      {f.homeClub?.logoUrl ? (
                        <img
                          src={f.homeClub.logoUrl}
                          alt={f.homeClub.shortName || f.homeClub.name}
                          className={styles.clubLogo}
                        />
                      ) : (
                        <div className={styles.clubLogoFallback}>
                          {(f.homeClub?.shortName || f.homeClub?.name || 'CAS').slice(0, 3).toUpperCase()}
                        </div>
                      )}
                      <span className={styles.clubName}>
                        {f.homeClub?.name || f.homeClub?.shortName || 'Time da Casa'}
                      </span>
                    </div>

                    <div className={styles.scoreBox}>
                      {isFT || isLive ? (
                        <span style={isLive ? { color: '#f87171', fontWeight: 800 } : undefined}>
                          {f.homeScore ?? 0} x {f.awayScore ?? 0}
                        </span>
                      ) : (
                        <span className={styles.scoreVs}>0 x 0</span>
                      )}
                    </div>

                    <div className={`${styles.teamSide} ${styles.teamSideRight}`}>
                      <span className={styles.clubName}>
                        {f.awayClub?.name || f.awayClub?.shortName || 'Time Visitante'}
                      </span>
                      {f.awayClub?.logoUrl ? (
                        <img
                          src={f.awayClub.logoUrl}
                          alt={f.awayClub.shortName || f.awayClub.name}
                          className={styles.clubLogo}
                        />
                      ) : (
                        <div className={styles.clubLogoFallback}>
                          {(f.awayClub?.shortName || f.awayClub?.name || 'VIS').slice(0, 3).toUpperCase()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={styles.fixtureActions}>
                    <button
                      onClick={() => handleTogglePostponed(f.id, f.status)}
                      disabled={isPending}
                      className={`${styles.btnActionSm} ${styles.btnActionPostpone}`}
                      title={isPostponed ? 'Restaurar para agendado' : 'Marcar como jogo adiado'}
                    >
                      {isPostponed ? '↩️ Desmarcar' : '⏱️ Adiado'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Postponed Rounds Management (*) */}
      {activeTab === 'POSTPONED' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>
                ⏱️ Central de Rodadas com Jogos Adiados (Símbolo *)
              </h2>
              <p className={styles.sectionDesc}>
                Gerenciamento de rodadas que contêm partidas atrasadas ou em aberto.
                Assim que as partidas adiadas forem disputadas e finalizadas, você pode
                acionar o recálculo retroativo para atualizar os pontos e a classificação da liga.
              </p>
            </div>
          </div>

          {data.postponedFixturesByRound.length === 0 ? (
            <div className={styles.postponedBanner}>
              <span className={styles.postponedRoundTitle}>
                ✅ Nenhuma rodada com partidas adiadas no momento
              </span>
              <p className={styles.sectionDesc}>
                Todas as rodadas disputadas até agora tiveram seus jogos finalizados sem adiamentos.
                Para testar este fluxo, você pode marcar um jogo como &quot;Adiado&quot; na aba de Jogos da Rodada.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {data.postponedFixturesByRound.map((group) => {
                return (
                  <div key={group.round} className={styles.postponedRoundCard}>
                    <div className={styles.postponedBannerHeader}>
                      <span className={styles.postponedRoundTitle}>
                        ⭐ Rodada {group.round}* — {group.fixtures.length} Partida(s) Adiada(s)
                      </span>
                      <Badge variant="status">
                        {group.hasScoresCalculated
                          ? 'Apuração Provisória Fechada'
                          : 'Rodada em Andamento'}
                      </Badge>
                    </div>

                    <div className={styles.postponedMatchesList}>
                      {group.fixtures.map((f) => (
                        <div key={f.id} className={styles.postponedMatchItem}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span className={styles.matchClubs}>
                              {f.homeClub.name} vs {f.awayClub.name}
                            </span>
                            <span
                              className={`${styles.fixtureStatusBadge} ${
                                f.status === 'FT' ? styles.statusFT : styles.statusPostponed
                              }`}
                            >
                              {f.status === 'FT'
                                ? `Concluído (${f.homeScore} x ${f.awayScore})`
                                : 'Aguardando Realização'}
                            </span>
                          </div>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => handleTogglePostponed(f.id, f.status)}
                              disabled={isPending}
                              className={`${styles.btnActionSm}`}
                            >
                              ↩️ Cancelar Adiado
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className={styles.recalcBox}>
                      <div className={styles.recalcDesc}>
                        <strong>Ação do Comissário:</strong> Quando os jogos adiados forem disputados,
                        clique abaixo para computar os scouts, reavaliar o Auto-Sub dos times e
                        retificar a tabela de classificação da liga retroativamente.
                      </div>

                      <Button
                        size="md"
                        isLoading={isPending}
                        disabled={isPending}
                        onClick={() => handleRecalculateRound(group.round)}
                      >
                        🔄 Recalcular Rodada {group.round}*
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Advance / Close Round */}
      {activeTab === 'ADVANCE' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>⚡ Fechamento & Avanço da Rodada {currentRound}</h2>
              <p className={styles.sectionDesc}>
                Execute o fechamento dos confrontos H2H, acione as substituições automáticas dos times
                e avance o campeonato para a próxima rodada da Série A.
              </p>
            </div>
          </div>

          <div className={styles.advanceBox}>
            <div className={styles.advanceHeader}>
              <span className={styles.advanceTitle}>Status Atual da Rodada {currentRound}</span>
              <div className={styles.advanceStats}>
                <span>
                  <strong>{finishedFixturesCount}</strong> / {data.currentRoundFixtures.length} jogos
                  concluídos
                </span>
                {postponedFixturesCount > 0 && (
                  <span style={{ color: '#fbbf24', fontWeight: 600 }}>
                    ⭐ {postponedFixturesCount} jogo(s) adiado(s)
                  </span>
                )}
              </div>
            </div>

            {isCurrentRoundPostponed ? (
              <div className={styles.advanceWarning}>
                <strong>⚠️ Fechamento Provisório com Asterisco (*):</strong>
                <p style={{ marginTop: '6px', margin: 0 }}>
                  A Rodada {currentRound} possui {postponedFixturesCount} partida(s) adiada(s). Ao
                  fechar a rodada agora, a apuração será <em>provisória</em> e receberá a marcação{' '}
                  <strong>Rodada {currentRound}*</strong>.
                </p>
                <p style={{ marginTop: '6px', margin: 0 }}>
                  O campeonato avançará para a <strong>Rodada {currentRound + 1}</strong> e o mercado
                  será liberado normalmente para os técnicos escalarem. Quando os jogos adiados
                  ocorrerem, você poderá efetuar o <strong>Recálculo Retroativo</strong> na aba de
                  Rodadas Adiadas.
                </p>
              </div>
            ) : (
              <div
                style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  borderLeft: '4px solid #22c55e',
                  padding: '12px 16px',
                  borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                  fontSize: '0.875rem',
                  color: '#86efac',
                }}
              >
                <strong>✅ Todos os jogos prontos:</strong>
                <p style={{ marginTop: '4px', margin: 0 }}>
                  A rodada não possui partidas adiadas. O fechamento será 100% definitivo e sem
                  asterisco.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <Button
                size="lg"
                isLoading={isPending}
                disabled={isPending}
                onClick={handleCloseAndAdvance}
              >
                {isCurrentRoundPostponed
                  ? `⚡ Fechamento Provisório & Avançar (Marca Rodada ${currentRound}*)`
                  : `⚡ Consolidar Rodada & Avançar para R${currentRound + 1}`}
              </Button>
            </div>
          </div>

          {/* Top 10 Scorers of the Round Card */}
          <div className={styles.topScorersSection}>
            <div className={styles.topScorersHeader}>
              <div>
                <span className={styles.topScorersTitle}>
                  🌟 Top 10 Maiores Pontuadores da Rodada {topScorersRound}
                </span>
                <span className={styles.topScorersSub}>
                  Atletas com maior pontuação oficial Cartola. Clique em um jogador para ver seus scouts detalhados.
                </span>
              </div>

              {/* Round Toggle */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Ver Rodada:
                </span>
                {Array.from(new Set([topScorersRound, currentRound, Math.max(1, currentRound - 1)]))
                  .sort((a, b) => b - a)
                  .map((rnd) => (
                    <button
                      key={rnd}
                      onClick={() => handleSelectTopScorersRound(rnd)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid',
                        borderColor: topScorersRound === rnd ? 'var(--accent-green)' : 'var(--border-subtle)',
                        background: topScorersRound === rnd ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                        color: topScorersRound === rnd ? 'var(--accent-green)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      R{rnd}
                    </button>
                  ))}
              </div>
            </div>

            {loadingTopScorers ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '24px' }}>
                Carregando maiores pontuadores...
              </p>
            ) : (
              renderTopScorersList(topScorersList, topScorersRound)
            )}
          </div>
        </div>
      )}

      {/* Player Detail Modal */}
      {selectedPlayerId && (
        <PlayerDetailModal
          playerId={selectedPlayerId}
          leagueId={leagueId}
          round={modalRound}
          onClose={() => {
            setSelectedPlayerId(null)
            setModalRound(undefined)
          }}
        />
      )}
    </div>
  )
}
