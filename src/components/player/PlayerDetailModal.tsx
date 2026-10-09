'use client'

import { useEffect, useState } from 'react'
import { getPlayerDetailModalData, type PlayerDetailData } from './actions'
import { Badge } from '@/components/ui/Badge'
import styles from './PlayerDetailModal.module.css'

interface PlayerDetailModalProps {
  playerId: string | null
  leagueId?: string
  round?: number
  onClose: () => void
}

export function PlayerDetailModal({
  playerId,
  leagueId,
  round,
  onClose,
}: PlayerDetailModalProps) {
  const [data, setData] = useState<PlayerDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'ROUND' | 'SCOUTS' | 'HISTORY' | 'UPCOMING'>('ROUND')

  useEffect(() => {
    if (!playerId) return

    setLoading(true)
    getPlayerDetailModalData(playerId, leagueId, round)
      .then((res) => {
        setData(res)
        if (res?.roundDetail) {
          setActiveTab('ROUND')
        } else {
          setActiveTab('SCOUTS')
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error('Error loading player modal:', err)
        setLoading(false)
      })
  }, [playerId, leagueId, round])

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!playerId) return null

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Fechar"
          title="Fechar (Esc)"
        >
          ✕
        </button>

        {loading ? (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <p>Carregando ficha técnica do atleta...</p>
          </div>
        ) : !data ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ color: 'var(--accent-red)' }}>Jogador não encontrado.</p>
          </div>
        ) : (
          <>
            {/* Header Hero */}
            <div className={styles.header}>
              <div className={styles.heroRow}>
                <div className={styles.avatarWrapper}>
                  {data.player.photoUrl ? (
                    <img
                      src={data.player.photoUrl}
                      alt={data.player.name}
                      className={styles.playerAvatar}
                    />
                  ) : (
                    <div className={styles.playerAvatarPlaceholder}>
                      {data.player.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  {data.club.logoUrl && (
                    <div className={styles.clubOverlay} title={data.club.name}>
                      <img src={data.club.logoUrl} alt={data.club.shortName} />
                    </div>
                  )}
                </div>

                <div className={styles.playerInfo}>
                  <div className={styles.playerName}>{data.player.name}</div>

                  <div className={styles.playerSubMeta}>
                    <Badge variant={data.player.position as any}>
                      {data.player.position}
                    </Badge>
                    <span className={styles.clubBadgeText}>
                      {data.club.name} ({data.club.shortName})
                    </span>
                    <span>·</span>
                    <div className={styles.ownerTag}>
                      {data.owner ? (
                        <span className={styles.ownerTagOwned}>
                          🏆 {data.owner.teamName} ({data.owner.managerName})
                        </span>
                      ) : (
                        <span className={styles.ownerTagFree}>
                          🟢 Agente Livre (Disponível)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Metrics Bar */}
              <div
                className={styles.quickStatsRow}
                style={
                  data.roundDetail
                    ? { gridTemplateColumns: 'repeat(4, 1fr)' }
                    : undefined
                }
              >
                {data.roundDetail && (
                  <div className={`${styles.statCard} ${styles.statCardHighlight}`}>
                    <span className={styles.statLabel}>Rodada {data.roundDetail.round}</span>
                    <span
                      className={`${styles.statValue} ${
                        data.roundDetail.points > 0
                          ? styles.statValuePositive
                          : data.roundDetail.points < 0
                          ? styles.statValueNegative
                          : ''
                      }`}
                    >
                      {data.roundDetail.points > 0
                        ? `+${data.roundDetail.points.toFixed(1)}`
                        : data.roundDetail.points.toFixed(1)}{' '}
                      pts
                    </span>
                  </div>
                )}
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Média Cartola</span>
                  <span
                    className={`${styles.statValue} ${
                      data.summary.avgPoints > 0 ? styles.statValuePositive : ''
                    }`}
                  >
                    {data.summary.avgPoints.toFixed(2)} pts
                  </span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Pontos Totais</span>
                  <span
                    className={`${styles.statValue} ${
                      data.summary.totalPoints > 0 ? styles.statValuePositive : ''
                    }`}
                  >
                    {data.summary.totalPoints.toFixed(1)} pts
                  </span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Partidas / Minutos</span>
                  <span className={styles.statValue}>
                    {data.summary.matchesPlayed}J · {data.summary.totalMinutes}&apos;
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className={styles.tabs}>
              {data.roundDetail && (
                <button
                  onClick={() => setActiveTab('ROUND')}
                  className={`${styles.tabBtn} ${activeTab === 'ROUND' ? styles.tabBtnActive : ''}`}
                >
                  ⚡ Rodada {data.roundDetail.round}
                </button>
              )}
              <button
                onClick={() => setActiveTab('SCOUTS')}
                className={`${styles.tabBtn} ${activeTab === 'SCOUTS' ? styles.tabBtnActive : ''}`}
              >
                📊 Scouts da Temporada
              </button>
              <button
                onClick={() => setActiveTab('HISTORY')}
                className={`${styles.tabBtn} ${activeTab === 'HISTORY' ? styles.tabBtnActive : ''}`}
              >
                📅 Histórico por Rodada ({data.history.length})
              </button>
              <button
                onClick={() => setActiveTab('UPCOMING')}
                className={`${styles.tabBtn} ${activeTab === 'UPCOMING' ? styles.tabBtnActive : ''}`}
              >
                ⚽ Próximos Jogos ({data.upcoming.length})
              </button>
            </div>

            {/* Modal Body */}
            <div className={styles.body}>
              {/* Tab: Specific Round Scouts & Breakdown */}
              {activeTab === 'ROUND' && data.roundDetail && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Match Card Hero */}
                  <div className={styles.roundHeroCard}>
                    <div className={styles.roundHeroTop}>
                      <div className={styles.roundHeroTitle}>
                        <span className={styles.roundPill}>
                          R{data.roundDetail.round}
                          {data.roundDetail.status === 'postponed' && '*'}
                        </span>
                        <span>Campeonato Brasileiro Série A 2026</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {data.roundDetail.status === 'live' && (
                          <span className={styles.miniScoutBadge} style={{ color: 'var(--accent-green)', borderColor: 'rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.12)' }}>
                            🟢 Ao Vivo
                          </span>
                        )}
                        {data.roundDetail.status === 'FT' && (
                          <span className={styles.miniScoutBadge} style={{ color: 'var(--text-secondary)' }}>
                            🏁 Finalizado
                          </span>
                        )}
                        {data.roundDetail.status === 'scheduled' && (
                          <span className={styles.miniScoutBadge} style={{ color: 'var(--text-muted)' }}>
                            📅 Agendado
                          </span>
                        )}
                        {data.roundDetail.status === 'postponed' && (
                          <span className={styles.miniScoutBadge} style={{ color: '#fbbf24', borderColor: 'rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.12)' }}>
                            ⏱️ Jogo Adiado (*)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Scoreboard Board */}
                    <div className={styles.roundMatchBoard}>
                      <div className={`${styles.matchClubCol} ${styles.matchClubColHome}`}>
                        <span className={styles.matchClubName}>{data.roundDetail.homeClub.name}</span>
                        {data.roundDetail.homeClub.logoUrl && (
                          <img
                            src={data.roundDetail.homeClub.logoUrl}
                            alt={data.roundDetail.homeClub.shortName}
                            className={styles.matchClubLogo}
                          />
                        )}
                      </div>

                      <div className={styles.matchScoreCenter}>
                        <span className={styles.matchScoreBoardText}>
                          {data.roundDetail.scoreText || 'vs'}
                        </span>
                      </div>

                      <div className={`${styles.matchClubCol} ${styles.matchClubColAway}`}>
                        {data.roundDetail.awayClub.logoUrl && (
                          <img
                            src={data.roundDetail.awayClub.logoUrl}
                            alt={data.roundDetail.awayClub.shortName}
                            className={styles.matchClubLogo}
                          />
                        )}
                        <span className={styles.matchClubName}>{data.roundDetail.awayClub.name}</span>
                      </div>
                    </div>

                    {/* Player In-Game Summary Row */}
                    <div className={styles.roundPlayerScoreRow}>
                      <div className={styles.roundPlayerMeta}>
                        <div className={styles.roundPlayerParticipation}>
                          {data.roundDetail.status === 'live' ? (
                            <span style={{ color: 'var(--accent-green)' }}>
                              🟢 {data.roundDetail.minutes > 0 ? `Em campo (${data.roundDetail.minutes} min)` : 'Jogo ao vivo'}
                            </span>
                          ) : data.roundDetail.minutes > 0 ? (
                            <span>⏱️ {data.roundDetail.minutes} min jogados</span>
                          ) : data.roundDetail.status === 'FT' ? (
                            <span style={{ color: 'var(--accent-red)' }}>⚠️ Não entrou em campo</span>
                          ) : data.roundDetail.status === 'postponed' ? (
                            <span style={{ color: '#fbbf24' }}>⏱️ Jogo Adiado pela CBF</span>
                          ) : (
                            <span>📅 Jogo ainda não iniciado</span>
                          )}
                          <span>·</span>
                          <span>{data.roundDetail.isHome ? 'Mando de Campo (Casa)' : 'Visitante (Fora)'}</span>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>
                          Pontuação na Rodada
                        </span>
                        <span
                          className={`${styles.roundPointsTotal} ${
                            data.roundDetail.points > 0
                              ? styles.statValuePositive
                              : data.roundDetail.points < 0
                              ? styles.statValueNegative
                              : ''
                          }`}
                        >
                          {data.roundDetail.points > 0
                            ? `+${data.roundDetail.points.toFixed(1)}`
                            : data.roundDetail.points.toFixed(1)}{' '}
                          <span style={{ fontSize: '1rem', fontWeight: 600 }}>pts</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Scouts Breakdown Section (Extrato de Scouts) */}
                  <div className={styles.breakdownSection}>
                    <span className={styles.sectionTitle}>
                      📋 Extrato Detalhado de Scouts (Rodada {data.roundDetail.round})
                    </span>

                    {data.roundDetail.breakdown.length > 0 ? (
                      <div className={styles.breakdownGrid}>
                        {data.roundDetail.breakdown.map((item, idx) => (
                          <div key={idx} className={styles.breakdownRow}>
                            <div className={styles.breakdownLeft}>
                              <span
                                className={`${styles.breakdownBadge} ${
                                  item.isPositive ? styles.breakdownBadgePos : styles.breakdownBadgeNeg
                                }`}
                              >
                                {item.code}
                              </span>
                              <div>
                                <div className={styles.breakdownLabel}>{item.label}</div>
                                <span className={styles.breakdownCalc}>
                                  {item.count}x ({item.unitPoints > 0 ? `+${item.unitPoints}` : item.unitPoints} pts)
                                </span>
                              </div>
                            </div>
                            <span
                              className={`${styles.breakdownTotal} ${
                                item.isPositive ? styles.statValuePositive : styles.statValueNegative
                              }`}
                            >
                              {item.totalPoints > 0 ? `+${item.totalPoints.toFixed(1)}` : item.totalPoints.toFixed(1)} pts
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.roundEmptyCard}>
                        {data.roundDetail.status === 'scheduled' ? (
                          <>
                            <span style={{ fontSize: '1.5rem' }}>📅</span>
                            <strong>Partida Agendada</strong>
                            <span>A partida ainda não começou. Os scouts e a pontuação ao vivo serão atualizados automaticamente durante o jogo.</span>
                          </>
                        ) : data.roundDetail.status === 'postponed' ? (
                          <>
                            <span style={{ fontSize: '1.5rem' }}>⏱️</span>
                            <strong>Partida Adiada pela CBF (*)</strong>
                            <span>Os scouts desta partida serão computados e atribuídos a este atleta assim que a CBF realizar o jogo adiado.</span>
                          </>
                        ) : data.roundDetail.minutes === 0 ? (
                          <>
                            <span style={{ fontSize: '1.5rem' }}>🪑</span>
                            <strong>Atleta Não Entrou em Campo</strong>
                            <span>O jogador não participou dos minutos desta partida e encerrou a rodada com 0.0 pontos.</span>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: '1.5rem' }}>⚽</span>
                            <strong>Sem Scouts Registrados</strong>
                            <span>O jogador atuou em campo, porém não acumulou scouts pontuáveis nesta rodada (0.0 pts).</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Categorized Scouts Grid for this Round */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '4px' }}>
                    <span className={styles.sectionTitle}>
                      ⚽ Scouts Ofensivos na Rodada {data.roundDetail.round}
                    </span>
                    <div className={styles.scoutsGrid}>
                      <div className={styles.scoutItem}>
                        <div className={styles.scoutTop}>
                          <span className={styles.scoutSigla}>G</span>
                          <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+8.0</span>
                        </div>
                        <span className={styles.scoutCount}>{data.roundDetail.scouts.goals}</span>
                        <span className={styles.scoutLabel}>Gols Marcados</span>
                      </div>

                      <div className={styles.scoutItem}>
                        <div className={styles.scoutTop}>
                          <span className={styles.scoutSigla}>A</span>
                          <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+4.0</span>
                        </div>
                        <span className={styles.scoutCount}>{data.roundDetail.scouts.assists}</span>
                        <span className={styles.scoutLabel}>Assistências</span>
                      </div>

                      <div className={styles.scoutItem}>
                        <div className={styles.scoutTop}>
                          <span className={styles.scoutSigla}>FD</span>
                          <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+1.2</span>
                        </div>
                        <span className={styles.scoutCount}>{data.roundDetail.scouts.shotsOnTarget}</span>
                        <span className={styles.scoutLabel}>Fin. Defendidas</span>
                      </div>

                      <div className={styles.scoutItem}>
                        <div className={styles.scoutTop}>
                          <span className={styles.scoutSigla}>FF</span>
                          <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+0.8</span>
                        </div>
                        <span className={styles.scoutCount}>{data.roundDetail.scouts.shotsOffTarget}</span>
                        <span className={styles.scoutLabel}>Fin. para Fora</span>
                      </div>

                      <div className={styles.scoutItem}>
                        <div className={styles.scoutTop}>
                          <span className={styles.scoutSigla}>FT</span>
                          <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+3.0</span>
                        </div>
                        <span className={styles.scoutCount}>{data.roundDetail.scouts.shotsOnWoodwork}</span>
                        <span className={styles.scoutLabel}>Fin. na Trave</span>
                      </div>

                      <div className={styles.scoutItem}>
                        <div className={styles.scoutTop}>
                          <span className={styles.scoutSigla}>FS</span>
                          <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+0.5</span>
                        </div>
                        <span className={styles.scoutCount}>{data.roundDetail.scouts.foulsDrawn}</span>
                        <span className={styles.scoutLabel}>Faltas Sofridas</span>
                      </div>

                      <div className={styles.scoutItem}>
                        <div className={styles.scoutTop}>
                          <span className={styles.scoutSigla}>PC</span>
                          <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+0.1</span>
                        </div>
                        <span className={styles.scoutCount}>{data.roundDetail.scouts.passesCompleted}</span>
                        <span className={styles.scoutLabel}>Passes Certos</span>
                      </div>

                      <div className={styles.scoutItem}>
                        <div className={styles.scoutTop}>
                          <span className={styles.scoutSigla}>PE</span>
                          <span className={`${styles.scoutPtsVal} ${styles.scoutPtsNegative}`}>-0.1</span>
                        </div>
                        <span className={styles.scoutCount}>{data.roundDetail.scouts.passesFailed}</span>
                        <span className={styles.scoutLabel}>Passes Errados</span>
                      </div>
                    </div>

                    <span className={styles.sectionTitle} style={{ marginTop: '8px' }}>
                      🛡️ Scouts Defensivos & Cartões na Rodada {data.roundDetail.round}
                    </span>
                    <div className={styles.scoutsGrid}>
                      <div className={styles.scoutItem}>
                        <div className={styles.scoutTop}>
                          <span className={styles.scoutSigla}>DS</span>
                          <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+1.5</span>
                        </div>
                        <span className={styles.scoutCount}>{data.roundDetail.scouts.tackles}</span>
                        <span className={styles.scoutLabel}>Desarmes Certos</span>
                      </div>

                      {(data.player.position === 'GOL' ||
                        data.player.position === 'ZAG' ||
                        data.player.position === 'LAT') && (
                        <div className={styles.scoutItem}>
                          <div className={styles.scoutTop}>
                            <span className={styles.scoutSigla}>SG</span>
                            <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+5.0</span>
                          </div>
                          <span className={styles.scoutCount}>
                            {data.roundDetail.scouts.cleanSheet ? 1 : 0}
                          </span>
                          <span className={styles.scoutLabel}>Clean Sheet (SG)</span>
                        </div>
                      )}

                      {data.player.position === 'GOL' && (
                        <>
                          <div className={styles.scoutItem}>
                            <div className={styles.scoutTop}>
                              <span className={styles.scoutSigla}>DE</span>
                              <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+1.3</span>
                            </div>
                            <span className={styles.scoutCount}>{data.roundDetail.scouts.saves}</span>
                            <span className={styles.scoutLabel}>Defesas Difíceis</span>
                          </div>

                          <div className={styles.scoutItem}>
                            <div className={styles.scoutTop}>
                              <span className={styles.scoutSigla}>DP</span>
                              <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+7.0</span>
                            </div>
                            <span className={styles.scoutCount}>{data.roundDetail.scouts.penaltySaves}</span>
                            <span className={styles.scoutLabel}>Pênaltis Salvos</span>
                          </div>
                        </>
                      )}

                      <div className={styles.scoutItem}>
                        <div className={styles.scoutTop}>
                          <span className={styles.scoutSigla}>FC</span>
                          <span className={`${styles.scoutPtsVal} ${styles.scoutPtsNegative}`}>-0.3</span>
                        </div>
                        <span className={styles.scoutCount}>{data.roundDetail.scouts.foulsCommitted}</span>
                        <span className={styles.scoutLabel}>Faltas Cometidas</span>
                      </div>

                      <div className={styles.scoutItem}>
                        <div className={styles.scoutTop}>
                          <span className={styles.scoutSigla}>CA</span>
                          <span className={`${styles.scoutPtsVal} ${styles.scoutPtsNegative}`}>-1.0</span>
                        </div>
                        <span className={styles.scoutCount}>{data.roundDetail.scouts.yellowCards}</span>
                        <span className={styles.scoutLabel}>Cartões Amarelos</span>
                      </div>

                      <div className={styles.scoutItem}>
                        <div className={styles.scoutTop}>
                          <span className={styles.scoutSigla}>CV</span>
                          <span className={`${styles.scoutPtsVal} ${styles.scoutPtsNegative}`}>-3.0</span>
                        </div>
                        <span className={styles.scoutCount}>{data.roundDetail.scouts.redCards}</span>
                        <span className={styles.scoutLabel}>Cartões Vermelhos</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* Tab 1: Season Scouts Breakdown */}
              {activeTab === 'SCOUTS' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    ⚽ Scouts Ofensivos & Ataque
                  </span>
                  <div className={styles.scoutsGrid}>
                    <div className={styles.scoutItem}>
                      <div className={styles.scoutTop}>
                        <span className={styles.scoutSigla}>G</span>
                        <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+8.0</span>
                      </div>
                      <span className={styles.scoutCount}>{data.summary.goals}</span>
                      <span className={styles.scoutLabel}>Gols Marcados</span>
                    </div>

                    <div className={styles.scoutItem}>
                      <div className={styles.scoutTop}>
                        <span className={styles.scoutSigla}>A</span>
                        <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+4.0</span>
                      </div>
                      <span className={styles.scoutCount}>{data.summary.assists}</span>
                      <span className={styles.scoutLabel}>Assistências</span>
                    </div>

                    <div className={styles.scoutItem}>
                      <div className={styles.scoutTop}>
                        <span className={styles.scoutSigla}>FD</span>
                        <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+1.2</span>
                      </div>
                      <span className={styles.scoutCount}>{data.summary.shotsOnTarget}</span>
                      <span className={styles.scoutLabel}>Fin. Defendidas</span>
                    </div>

                    <div className={styles.scoutItem}>
                      <div className={styles.scoutTop}>
                        <span className={styles.scoutSigla}>FF</span>
                        <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+0.8</span>
                      </div>
                      <span className={styles.scoutCount}>{data.summary.shotsOffTarget}</span>
                      <span className={styles.scoutLabel}>Fin. para Fora</span>
                    </div>

                    <div className={styles.scoutItem}>
                      <div className={styles.scoutTop}>
                        <span className={styles.scoutSigla}>FT</span>
                        <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+3.0</span>
                      </div>
                      <span className={styles.scoutCount}>{data.summary.shotsOnWoodwork}</span>
                      <span className={styles.scoutLabel}>Fin. na Trave</span>
                    </div>

                    <div className={styles.scoutItem}>
                      <div className={styles.scoutTop}>
                        <span className={styles.scoutSigla}>FS</span>
                        <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+0.5</span>
                      </div>
                      <span className={styles.scoutCount}>{data.summary.foulsDrawn}</span>
                      <span className={styles.scoutLabel}>Faltas Sofridas</span>
                    </div>

                    <div className={styles.scoutItem}>
                      <div className={styles.scoutTop}>
                        <span className={styles.scoutSigla}>PC</span>
                        <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+0.1</span>
                      </div>
                      <span className={styles.scoutCount}>{data.summary.passesCompleted}</span>
                      <span className={styles.scoutLabel}>Passes Completos</span>
                    </div>

                    <div className={styles.scoutItem}>
                      <div className={styles.scoutTop}>
                        <span className={styles.scoutSigla}>PE</span>
                        <span className={`${styles.scoutPtsVal} ${styles.scoutPtsNegative}`}>-0.1</span>
                      </div>
                      <span className={styles.scoutCount}>{data.summary.passesFailed}</span>
                      <span className={styles.scoutLabel}>Passes Incompletos</span>
                    </div>
                  </div>

                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '10px' }}>
                    🛡️ Scouts Defensivos & Geral
                  </span>
                  <div className={styles.scoutsGrid}>
                    <div className={styles.scoutItem}>
                      <div className={styles.scoutTop}>
                        <span className={styles.scoutSigla}>DS</span>
                        <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+1.5</span>
                      </div>
                      <span className={styles.scoutCount}>{data.summary.tackles}</span>
                      <span className={styles.scoutLabel}>Desarmes Certos</span>
                    </div>

                    {(data.player.position === 'GOL' ||
                      data.player.position === 'ZAG' ||
                      data.player.position === 'LAT') && (
                      <div className={styles.scoutItem}>
                        <div className={styles.scoutTop}>
                          <span className={styles.scoutSigla}>SG</span>
                          <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+5.0</span>
                        </div>
                        <span className={styles.scoutCount}>{data.summary.cleanSheet}</span>
                        <span className={styles.scoutLabel}>Clean Sheets (SG)</span>
                      </div>
                    )}

                    {data.player.position === 'GOL' && (
                      <>
                        <div className={styles.scoutItem}>
                          <div className={styles.scoutTop}>
                            <span className={styles.scoutSigla}>DE</span>
                            <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+1.3</span>
                          </div>
                          <span className={styles.scoutCount}>{data.summary.saves}</span>
                          <span className={styles.scoutLabel}>Defesas Difíceis</span>
                        </div>

                        <div className={styles.scoutItem}>
                          <div className={styles.scoutTop}>
                            <span className={styles.scoutSigla}>DP</span>
                            <span className={`${styles.scoutPtsVal} ${styles.scoutPtsPositive}`}>+7.0</span>
                          </div>
                          <span className={styles.scoutCount}>{data.summary.penaltySaves}</span>
                          <span className={styles.scoutLabel}>Pênaltis Salvos</span>
                        </div>
                      </>
                    )}

                    <div className={styles.scoutItem}>
                      <div className={styles.scoutTop}>
                        <span className={styles.scoutSigla}>FC</span>
                        <span className={`${styles.scoutPtsVal} ${styles.scoutPtsNegative}`}>-0.3</span>
                      </div>
                      <span className={styles.scoutCount}>{data.summary.foulsCommitted}</span>
                      <span className={styles.scoutLabel}>Faltas Cometidas</span>
                    </div>

                    <div className={styles.scoutItem}>
                      <div className={styles.scoutTop}>
                        <span className={styles.scoutSigla}>CA</span>
                        <span className={`${styles.scoutPtsVal} ${styles.scoutPtsNegative}`}>-1.0</span>
                      </div>
                      <span className={styles.scoutCount}>{data.summary.yellowCards}</span>
                      <span className={styles.scoutLabel}>Cartões Amarelos</span>
                    </div>

                    <div className={styles.scoutItem}>
                      <div className={styles.scoutTop}>
                        <span className={styles.scoutSigla}>CV</span>
                        <span className={`${styles.scoutPtsVal} ${styles.scoutPtsNegative}`}>-3.0</span>
                      </div>
                      <span className={styles.scoutCount}>{data.summary.redCards}</span>
                      <span className={styles.scoutLabel}>Cartões Vermelhos</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Round by Round History */}
              {activeTab === 'HISTORY' && (
                <div className={styles.historyList}>
                  {data.history.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
                      Nenhuma rodada finalizada para este atleta ainda.
                    </p>
                  ) : (
                    data.history.map((h) => {
                      const isPostponed = h.status === 'postponed'

                      return (
                        <div key={h.round} className={styles.historyRow}>
                          <div className={styles.historyMatchInfo}>
                            <span className={styles.roundPill}>
                              R{h.round}
                              {isPostponed && '*'}
                            </span>
                            {h.opponentClub.logoUrl && (
                              <img
                                src={h.opponentClub.logoUrl}
                                alt={h.opponentClub.shortName}
                                className={styles.opponentLogo}
                              />
                            )}
                            <div>
                              <div className={styles.opponentName}>
                                {h.isHome ? 'vs ' : '@ '}
                                {h.opponentClub.shortName} ({h.isHome ? 'Casa' : 'Fora'})
                              </div>
                              <span className={styles.matchScore}>
                                {isPostponed ? (
                                  <span style={{ color: '#fbbf24', fontWeight: 600 }}>
                                    ⏱️ Jogo Adiado (*)
                                  </span>
                                ) : (
                                  `${h.scoreText || 'Finalizado'} · ${h.minutes} min`
                                )}
                              </span>
                            </div>
                          </div>

                          <div className={styles.historyScoutsSummary}>
                            {h.scouts.goals > 0 && (
                              <span className={styles.miniScoutBadge} style={{ color: 'var(--accent-green)' }}>
                                ⚽ {h.scouts.goals}G
                              </span>
                            )}
                            {h.scouts.assists > 0 && (
                              <span className={styles.miniScoutBadge} style={{ color: 'var(--accent-blue)' }}>
                                🎯 {h.scouts.assists}A
                              </span>
                            )}
                            {h.scouts.tackles > 0 && (
                              <span className={styles.miniScoutBadge}>
                                🛡️ {h.scouts.tackles}DS
                              </span>
                            )}
                            {h.scouts.cleanSheet && (
                              <span className={styles.miniScoutBadge} style={{ color: 'var(--accent-green)' }}>
                                🧤 SG
                              </span>
                            )}
                            {h.scouts.saves > 0 && (
                              <span className={styles.miniScoutBadge}>
                                🧤 {h.scouts.saves}DE
                              </span>
                            )}
                            {h.scouts.yellowCards > 0 && (
                              <span className={styles.miniScoutBadge} style={{ color: '#fbbf24' }}>
                                🟨 {h.scouts.yellowCards}CA
                              </span>
                            )}

                            <span
                              className={styles.historyPoints}
                              style={{
                                color:
                                  h.points > 0
                                    ? 'var(--accent-green)'
                                    : h.points < 0
                                    ? 'var(--accent-red)'
                                    : 'var(--text-muted)',
                              }}
                            >
                              {h.points > 0 ? `+${h.points.toFixed(1)}` : h.points.toFixed(1)} pts
                            </span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}

              {/* Tab 3: Upcoming Série A Fixtures */}
              {activeTab === 'UPCOMING' && (
                <div className={styles.upcomingList}>
                  {data.upcoming.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
                      Nenhum jogo futuro agendado na temporada.
                    </p>
                  ) : (
                    data.upcoming.map((u) => {
                      const isPostponed = u.status === 'postponed'
                      return (
                        <div key={u.round} className={styles.upcomingRow}>
                          <div className={styles.upcomingOpponent}>
                            <span className={styles.roundPill}>
                              R{u.round}
                              {isPostponed && '*'}
                            </span>
                            {u.opponentClub.logoUrl && (
                              <img
                                src={u.opponentClub.logoUrl}
                                alt={u.opponentClub.shortName}
                                className={styles.opponentLogo}
                              />
                            )}
                            <span className={styles.opponentName}>
                              {u.isHome ? 'vs ' : '@ '}
                              {u.opponentClub.name} ({u.isHome ? 'Casa' : 'Fora'})
                            </span>
                          </div>

                          <div className={styles.upcomingMeta}>
                            {isPostponed ? (
                              <span style={{ color: '#fbbf24', fontWeight: 700 }}>
                                ⚠️ Partida Adiada (*)
                              </span>
                            ) : (
                              <span>
                                {u.kickoffAt
                                  ? new Date(u.kickoffAt).toLocaleDateString('pt-BR', {
                                      weekday: 'short',
                                      day: '2-digit',
                                      month: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : 'A definir'}
                              </span>
                            )}
                            <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                              Campeonato Brasileiro Série A
                            </span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
