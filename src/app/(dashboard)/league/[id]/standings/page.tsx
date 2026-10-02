'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getStandingsData, type StandingsPageData, type MatchupItem } from './actions'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import styles from './page.module.css'

export default function StandingsPage() {
  const params = useParams()
  const leagueId = params.id as string

  const [data, setData] = useState<StandingsPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'TOTAL' | 'H2H' | 'MATCHUPS'>('TOTAL')
  const [selectedRound, setSelectedRound] = useState<number>(1)
  const [viewAllRounds, setViewAllRounds] = useState(false)

  useEffect(() => {
    if (leagueId) {
      getStandingsData(leagueId).then((res) => {
        if (res) {
          setData(res)
          setSelectedRound(res.currentRound)
          if (res.scoringMode === 'H2H') {
            setActiveTab('H2H')
          }
        }
        setLoading(false)
      })
    }
  }, [leagueId])

  if (loading) {
    return (
      <div className={styles.container}>
        <p>Carregando Classificação...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <h2>Classificação não encontrada</h2>
        <Link href="/dashboard">
          <Button size="md">Voltar ao Painel</Button>
        </Link>
      </div>
    )
  }

  // Get all unique rounds present in matchups, sorted
  const matchupRounds = Array.from(
    new Set(data.allMatchups.map((m) => m.fixtureRound))
  ).sort((a, b) => a - b)

  const minRound = matchupRounds.length > 0 ? matchupRounds[0] : data.currentRound
  const maxRound = matchupRounds.length > 0 ? matchupRounds[matchupRounds.length - 1] : data.totalRounds

  const filteredMatchups = data.allMatchups.filter(
    (m) => m.fixtureRound === selectedRound
  )

  const handlePrevRound = () => {
    const currentIndex = matchupRounds.indexOf(selectedRound)
    if (currentIndex > 0) {
      setSelectedRound(matchupRounds[currentIndex - 1])
    }
  }

  const handleNextRound = () => {
    const currentIndex = matchupRounds.indexOf(selectedRound)
    if (currentIndex !== -1 && currentIndex < matchupRounds.length - 1) {
      setSelectedRound(matchupRounds[currentIndex + 1])
    }
  }

  const renderMatchupCard = (m: MatchupItem) => {
    const hasScores = m.homePoints !== null && m.awayPoints !== null
    const isHomeWinner = hasScores && (m.homePoints! > m.awayPoints! || m.result === 'home')
    const isAwayWinner = hasScores && (m.awayPoints! > m.homePoints! || m.result === 'away')
    const isDraw = hasScores && m.homePoints === m.awayPoints

    return (
      <Link
        key={m.id}
        href={`/league/${leagueId}/matchup/${m.id}`}
        className={styles.matchupCardLink}
      >
        <div className={styles.matchupCard}>
          <div className={styles.matchupBody}>
            <div className={styles.matchupTeam}>
              <span
                className={`${styles.matchupTeamName} ${isHomeWinner ? styles.winnerName : ''}`}
              >
                {isHomeWinner && '👑 '}
                {m.homeTeamName}
              </span>
              <span className={hasScores ? styles.matchupScore : styles.matchupScorePending}>
                {m.homePoints !== null ? `${m.homePoints} pts` : 'A disputar'}
              </span>
            </div>

            <div className={styles.vsBadge}>
              {isDraw ? 'EMPATE' : 'VS'}
            </div>

            <div className={styles.matchupTeam} style={{ textAlign: 'right' }}>
              <span
                className={`${styles.matchupTeamName} ${isAwayWinner ? styles.winnerName : ''}`}
              >
                {m.awayTeamName}
                {isAwayWinner && ' 👑'}
              </span>
              <span className={hasScores ? styles.matchupScore : styles.matchupScorePending}>
                {m.awayPoints !== null ? `${m.awayPoints} pts` : 'A disputar'}
              </span>
            </div>
          </div>

          <div className={styles.matchupFooter}>
            <span>🔍 Raio-X do Duelo · Ver Escalações</span>
          </div>
        </div>
      </Link>
    )
  }

  return (
    <div className={styles.container}>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.titleBox}>
          <h1 className={styles.leagueTitle}>{data.leagueName} — Classificação</h1>
          <span className={styles.subTitle}>
            Rodada {data.currentRound}
            {data.postponedRounds?.includes(data.currentRound) && '*'} de {data.totalRounds} · Modo{' '}
            {data.scoringMode}
            {data.scoringMode === 'H2H' &&
              ` (${data.h2hFormat === 'SINGLE_ROUND' ? 'Turno Único' : 'Ida e Volta'} · Final na R${data.finalRound})`}
          </span>
        </div>

        <div className={styles.tabs}>
          <button
            onClick={() => setActiveTab('TOTAL')}
            className={`${styles.tabBtn} ${
              activeTab === 'TOTAL' ? styles.tabBtnActive : ''
            }`}
          >
            Tabela Geral (Pontos)
          </button>

          {data.scoringMode === 'H2H' && (
            <>
              <button
                onClick={() => setActiveTab('H2H')}
                className={`${styles.tabBtn} ${
                  activeTab === 'H2H' ? styles.tabBtnActive : ''
                }`}
              >
                Tabela H2H
              </button>
              <button
                onClick={() => setActiveTab('MATCHUPS')}
                className={`${styles.tabBtn} ${
                  activeTab === 'MATCHUPS' ? styles.tabBtnActive : ''
                }`}
              >
                Confrontos & Calendário
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.card}>
        {/* Aba Tabela TOTAL */}
        {activeTab === 'TOTAL' && (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>Pos</th>
                  <th>Time</th>
                  <th style={{ textAlign: 'right' }}>Rodadas Vencidas</th>
                  <th style={{ textAlign: 'right' }}>Bônus Capitão</th>
                  <th style={{ textAlign: 'right' }}>Pontos Totais</th>
                </tr>
              </thead>
              <tbody>
                {data.totalStandings.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      Nenhuma rodada finalizada até o momento.
                    </td>
                  </tr>
                ) : (
                  data.totalStandings.map((row) => (
                    <tr key={row.fantasyTeamId}>
                      <td>
                        <span
                          className={`${styles.rankBadge} ${
                            row.rank === 1
                              ? styles.rank1
                              : row.rank === 2
                              ? styles.rank2
                              : row.rank === 3
                              ? styles.rank3
                              : ''
                          }`}
                        >
                          {row.rank}
                        </span>
                      </td>
                      <td>
                        <div className={styles.teamCell}>
                          <Link
                            href={`/league/${leagueId}/team/${row.fantasyTeamId}`}
                            className={styles.teamLink}
                            title="Ver elenco completo de 24 atletas"
                          >
                            {row.teamName} 🛡️
                          </Link>
                          <span className={styles.managerName}>Técnico: {row.managerName}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{row.roundsWon}</td>
                      <td style={{ textAlign: 'right', color: 'var(--accent-gold)' }}>
                        +{row.totalCaptainBonus} pts
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 700,
                          fontSize: '1rem',
                          color: 'var(--accent-green)',
                        }}
                      >
                        {row.cumulativePoints} pts
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Aba Tabela H2H */}
        {activeTab === 'H2H' && (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>Pos</th>
                  <th>Time</th>
                  <th style={{ textAlign: 'center' }}>V</th>
                  <th style={{ textAlign: 'center' }}>E</th>
                  <th style={{ textAlign: 'center' }}>D</th>
                  <th style={{ textAlign: 'right' }}>Pró</th>
                  <th style={{ textAlign: 'right' }}>Contra</th>
                  <th style={{ textAlign: 'right' }}>Saldo</th>
                  <th style={{ textAlign: 'right' }}>Pts H2H</th>
                </tr>
              </thead>
              <tbody>
                {data.h2hStandings.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      Nenhum confronto H2H realizado ainda.
                    </td>
                  </tr>
                ) : (
                  data.h2hStandings.map((row) => (
                    <tr key={row.fantasyTeamId}>
                      <td>
                        <span
                          className={`${styles.rankBadge} ${
                            row.rank === 1
                              ? styles.rank1
                              : row.rank === 2
                              ? styles.rank2
                              : row.rank === 3
                              ? styles.rank3
                              : ''
                          }`}
                        >
                          {row.rank}
                        </span>
                      </td>
                      <td>
                        <Link
                          href={`/league/${leagueId}/team/${row.fantasyTeamId}`}
                          className={styles.teamLink}
                          title="Ver elenco completo de 24 atletas"
                        >
                          {row.teamName} 🛡️
                        </Link>
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--accent-green)' }}>{row.wins}</td>
                      <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{row.draws}</td>
                      <td style={{ textAlign: 'center', color: 'var(--accent-red)' }}>{row.losses}</td>
                      <td style={{ textAlign: 'right' }}>{row.pointsFor}</td>
                      <td style={{ textAlign: 'right' }}>{row.pointsAgainst}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {row.pointDifference > 0 ? `+${row.pointDifference}` : row.pointDifference}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 700,
                          fontSize: '1rem',
                          color: 'var(--accent-green)',
                        }}
                      >
                        {row.h2hPoints} pts
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Aba Confrontos & Calendário (Duelos H2H) */}
        {activeTab === 'MATCHUPS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Navigation Header */}
            <div className={styles.matchupsNav}>
              <div className={styles.matchupsNavTop}>
                {/* Switcher */}
                <div className={styles.roundSwitcher}>
                  <button
                    onClick={handlePrevRound}
                    disabled={selectedRound <= minRound}
                    className={styles.navArrowBtn}
                    title="Rodada anterior"
                  >
                    ◀
                  </button>

                  <div className={styles.roundTitleArea}>
                    <span className={styles.roundTitle}>
                      Rodada {selectedRound}
                      {data.postponedRounds?.includes(selectedRound) && (
                        <span style={{ color: '#fbbf24', marginLeft: '2px' }}>*</span>
                      )}
                    </span>
                    <span
                      className={`${styles.roundStatusTag} ${
                        selectedRound < data.currentRound
                          ? styles.statusCompleted
                          : selectedRound === data.currentRound
                          ? styles.statusCurrent
                          : styles.statusUpcoming
                      }`}
                    >
                      {selectedRound < data.currentRound
                        ? data.postponedRounds?.includes(selectedRound)
                          ? '⚠️ Apuração Provisória (*)'
                          : '✓ Finalizada'
                        : selectedRound === data.currentRound
                        ? data.postponedRounds?.includes(selectedRound)
                          ? '🔥 Rodada Atual (*)'
                          : '🔥 Rodada Atual'
                        : '⏳ A Disputar'}
                    </span>
                  </div>

                  <button
                    onClick={handleNextRound}
                    disabled={selectedRound >= maxRound}
                    className={styles.navArrowBtn}
                    title="Próxima rodada"
                  >
                    ▶
                  </button>
                </div>

                {/* View Mode Toggle */}
                <button
                  onClick={() => setViewAllRounds(!viewAllRounds)}
                  className={`${styles.viewToggleBtn} ${
                    viewAllRounds ? styles.viewToggleBtnActive : ''
                  }`}
                >
                  {viewAllRounds
                    ? '🎯 Ver Rodada Selecionada'
                    : '📅 Ver Todas as Rodadas (Calendário Completo)'}
                </button>
              </div>

              {/* Informative banner if selected round has postponed matches */}
              {!viewAllRounds && data.postponedRounds?.includes(selectedRound) && (
                <div
                  style={{
                    background: 'rgba(234, 179, 8, 0.08)',
                    border: '1px solid rgba(234, 179, 8, 0.3)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 14px',
                    fontSize: '0.8125rem',
                    color: '#fef08a',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginTop: '8px',
                  }}
                >
                  <span>⭐</span>
                  <span>
                    <strong>Rodada com partidas adiadas (*):</strong> Esta rodada possui jogos adiados
                    pela CBF. A apuração é provisória e os pontos serão atualizados retroativamente após
                    a realização das partidas pendentes.
                  </span>
                </div>
              )}

              {/* Round Pills Quick Jump */}
              {!viewAllRounds && matchupRounds.length > 1 && (
                <div className={styles.roundPillsScroll}>
                  {matchupRounds.map((r) => {
                    const isCurrent = r === data.currentRound
                    const isSelected = r === selectedRound
                    const isPostponed = data.postponedRounds?.includes(r)
                    return (
                      <button
                        key={r}
                        onClick={() => setSelectedRound(r)}
                        className={`${styles.roundPill} ${
                          isSelected ? styles.roundPillActive : ''
                        }`}
                      >
                        {isCurrent && <span className={styles.roundPillCurrentIndicator} />}
                        R{r}
                        {isPostponed && '*'}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Matchups Content */}
            {data.allMatchups.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>
                Nenhum confronto agendado para esta liga.
              </p>
            ) : viewAllRounds ? (
              /* Full Schedule View (All rounds from first to last) */
              <div className={styles.allRoundsList}>
                {matchupRounds.map((r) => {
                  const roundMatches = data.allMatchups.filter(
                    (m) => m.fixtureRound === r
                  )
                  const isCurrent = r === data.currentRound
                  const isCompleted = r < data.currentRound
                  const isPostponed = data.postponedRounds?.includes(r)

                  return (
                    <div key={r} className={styles.roundSection}>
                      <div className={styles.roundSectionHeader}>
                        <span className={styles.roundSectionTitle}>
                          Rodada {r}
                          {isPostponed && '*'} de {data.finalRound}
                          {isCurrent && (
                            <Badge variant="MEI">Rodada Atual</Badge>
                          )}
                          {isPostponed && (
                            <span
                              style={{
                                fontSize: '0.6875rem',
                                padding: '2px 8px',
                                borderRadius: '9999px',
                                background: 'rgba(234, 179, 8, 0.2)',
                                color: '#fbbf24',
                                border: '1px solid rgba(234, 179, 8, 0.4)',
                                fontWeight: 700,
                              }}
                            >
                              ⭐ Jogos Adiados (*)
                            </span>
                          )}
                          {isCompleted && !isPostponed && (
                            <span
                              className={`${styles.roundStatusTag} ${styles.statusCompleted}`}
                            >
                              Finalizada
                            </span>
                          )}
                          {!isCurrent && !isCompleted && (
                            <span
                              className={`${styles.roundStatusTag} ${styles.statusUpcoming}`}
                            >
                              A Disputar
                            </span>
                          )}
                        </span>
                      </div>

                      <div className={styles.matchupsGrid}>
                        {roundMatches.map((m) => renderMatchupCard(m))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              /* Single Round Focus View */
              <div className={styles.matchupsGrid}>
                {filteredMatchups.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>
                    Nenhum confronto agendado para a rodada {selectedRound}.
                  </p>
                ) : (
                  filteredMatchups.map((m) => renderMatchupCard(m))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
