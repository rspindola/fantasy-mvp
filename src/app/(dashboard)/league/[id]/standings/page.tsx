'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getStandingsData, type StandingsPageData } from './actions'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import styles from './page.module.css'

export default function StandingsPage() {
  const params = useParams()
  const leagueId = params.id as string

  const [data, setData] = useState<StandingsPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'TOTAL' | 'H2H' | 'MATCHUPS'>('TOTAL')

  useEffect(() => {
    if (leagueId) {
      getStandingsData(leagueId).then((res) => {
        if (res) {
          setData(res)
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

  return (
    <div className={styles.container}>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.titleBox}>
          <h1 className={styles.leagueTitle}>{data.leagueName} — Classificação</h1>
          <span className={styles.subTitle}>
            Rodada {data.currentRound} de 38 · Modo {data.scoringMode}
          </span>
        </div>

        <div className={styles.tabs}>
          <button
            onClick={() => setActiveTab('TOTAL')}
            className={`${styles.tabBtn} ${
              activeTab === 'TOTAL' ? styles.tabBtnActive : ''
            }`}
          >
            Tabela TOTAL
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
                Duelos da Rodada
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
                          <span className={styles.teamName}>{row.teamName}</span>
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
                        <span className={styles.teamName}>{row.teamName}</span>
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

        {/* Aba Duelos da Rodada */}
        {activeTab === 'MATCHUPS' && (
          <div className={styles.matchupsGrid}>
            {data.currentMatchups.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>
                Nenhum confronto agendado para esta rodada.
              </p>
            ) : (
              data.currentMatchups.map((m) => (
                <div key={m.id} className={styles.matchupCard}>
                  <div className={styles.matchupTeam}>
                    <span className={styles.matchupTeamName}>{m.homeTeamName}</span>
                    <span className={styles.matchupScore}>
                      {m.homePoints !== null ? `${m.homePoints} pts` : '-'}
                    </span>
                  </div>

                  <div className={styles.vsBadge}>VS</div>

                  <div className={styles.matchupTeam} style={{ textAlign: 'right' }}>
                    <span className={styles.matchupTeamName}>{m.awayTeamName}</span>
                    <span className={styles.matchupScore}>
                      {m.awayPoints !== null ? `${m.awayPoints} pts` : '-'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
