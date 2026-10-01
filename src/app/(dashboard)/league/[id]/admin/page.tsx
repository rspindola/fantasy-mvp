'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  getCommissionerData,
  toggleFixturePostponedAction,
  simulateFixtureMatchAction,
  closeAndAdvanceRoundAction,
  recalculatePostponedRoundAction,
  type CommissionerPageData,
  type FixtureItem,
} from './actions'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
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

  // Simulation score state for modal/input
  const [simulatingFixture, setSimulatingFixture] = useState<FixtureItem | null>(null)
  const [simHomeScore, setSimHomeScore] = useState<number>(2)
  const [simAwayScore, setSimAwayScore] = useState<number>(1)

  const reloadData = async () => {
    if (leagueId) {
      const res = await getCommissionerData(leagueId)
      setData(res)
      setLoading(false)
    }
  }

  useEffect(() => {
    reloadData()
  }, [leagueId])

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
  const postponedFixturesCount = data.currentRoundFixtures.filter((f) => f.status === 'postponed').length

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

  const handleSimulateScore = () => {
    if (!simulatingFixture) return
    setFeedback(null)
    startTransition(async () => {
      try {
        await simulateFixtureMatchAction(
          leagueId,
          simulatingFixture.id,
          Number(simHomeScore),
          Number(simAwayScore)
        )
        setFeedback({
          type: 'success',
          message: `Partida ${simulatingFixture.homeClub.shortName} ${simHomeScore} x ${simAwayScore} ${simulatingFixture.awayClub.shortName} finalizada e scouts gerados com sucesso!`,
        })
        setSimulatingFixture(null)
        await reloadData()
      } catch (err: any) {
        setFeedback({ type: 'error', message: err.message || 'Erro ao simular partida.' })
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
        </div>
      )}

      {/* Tab 1: Current Round Fixtures */}
      {activeTab === 'CURRENT' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>
                Partidas da Série A — Rodada {currentRound}
                {isCurrentRoundPostponed && <span style={{ color: '#fbbf24' }}>*</span>}
              </h2>
              <p className={styles.sectionDesc}>
                {finishedFixturesCount} de {data.currentRoundFixtures.length} partidas finalizadas
                {postponedFixturesCount > 0 && ` · ${postponedFixturesCount} partida(s) adiada(s)`}.
                Você pode adiar partidas ou simular resultados com scouts para testes.
              </p>
            </div>
          </div>

          <div className={styles.fixturesGrid}>
            {data.currentRoundFixtures.map((f) => {
              const isPostponed = f.status === 'postponed'
              const isFT = f.status === 'FT'

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
                          : isPostponed
                          ? styles.statusPostponed
                          : styles.statusScheduled
                      }`}
                    >
                      {isFT ? 'Finalizado' : isPostponed ? '⚠️ Adiado (*)' : 'Agendado'}
                    </span>
                  </div>

                  <div className={styles.fixtureTeams}>
                    <div className={styles.teamSide}>
                      {f.homeClub.logoUrl && (
                        <img
                          src={f.homeClub.logoUrl}
                          alt={f.homeClub.shortName}
                          className={styles.clubLogo}
                        />
                      )}
                      <span className={styles.clubName}>{f.homeClub.shortName}</span>
                    </div>

                    <div className={styles.scoreBox}>
                      {isFT ? (
                        <span>
                          {f.homeScore} - {f.awayScore}
                        </span>
                      ) : (
                        <span className={styles.scoreVs}>vs</span>
                      )}
                    </div>

                    <div className={`${styles.teamSide} ${styles.teamSideRight}`}>
                      <span className={styles.clubName}>{f.awayClub.shortName}</span>
                      {f.awayClub.logoUrl && (
                        <img
                          src={f.awayClub.logoUrl}
                          alt={f.awayClub.shortName}
                          className={styles.clubLogo}
                        />
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
                      {isPostponed ? '↩️ Desmarcar Adiado' : '⏱️ Marcar Adiado'}
                    </button>

                    <button
                      onClick={() => setSimulatingFixture(f)}
                      disabled={isPending}
                      className={`${styles.btnActionSm} ${styles.btnActionSimulate}`}
                      title="Simular placar e gerar scouts oficiais"
                    >
                      ⚽ {isFT ? 'Re-simular' : 'Simular Jogo'}
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
                const allFinished = group.fixtures.every((f) => f.status === 'FT')

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
                              onClick={() => setSimulatingFixture(f)}
                              disabled={isPending}
                              className={`${styles.btnActionSm} ${styles.btnActionSimulate}`}
                            >
                              ⚽ {f.status === 'FT' ? 'Editar Placar' : 'Simular Realização'}
                            </button>
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
        </div>
      )}

      {/* Mini Modal for Simulating Fixture Result */}
      {simulatingFixture && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              maxWidth: '450px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>
              ⚽ Simular Placar — {simulatingFixture.homeClub.shortName} vs{' '}
              {simulatingFixture.awayClub.shortName}
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>
              Defina o placar da partida. O sistema gerará scouts individuais de gols, assistências,
              desarmes e clean sheets para os atletas de ambos os clubes.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '16px 0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 700 }}>{simulatingFixture.homeClub.shortName}</span>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={simHomeScore}
                  onChange={(e) => setSimHomeScore(Number(e.target.value))}
                  style={{
                    width: '60px',
                    height: '48px',
                    fontSize: '1.5rem',
                    textAlign: 'center',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                  }}
                />
              </div>

              <span style={{ fontSize: '1.5rem', color: 'var(--text-muted)', fontWeight: 800 }}>X</span>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 700 }}>{simulatingFixture.awayClub.shortName}</span>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={simAwayScore}
                  onChange={(e) => setSimAwayScore(Number(e.target.value))}
                  style={{
                    width: '60px',
                    height: '48px',
                    fontSize: '1.5rem',
                    textAlign: 'center',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <Button
                variant="ghost"
                size="md"
                disabled={isPending}
                onClick={() => setSimulatingFixture(null)}
              >
                Cancelar
              </Button>
              <Button
                size="md"
                isLoading={isPending}
                disabled={isPending}
                onClick={handleSimulateScore}
              >
                Confirmar & Gerar Scouts
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
