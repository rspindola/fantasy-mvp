'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getLeagueDetails, startDraftAction, type LeagueDetails } from './actions'
import { getStandingsData, type StandingsPageData } from './standings/actions'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { MarketCountdownBanner } from '@/components/league/MarketCountdownBanner'
import styles from './page.module.css'

function TeamCrest({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return <div className={styles.teamCrest}>{initials}</div>
}

function RankVariationBadge({ variation }: { variation: number }) {
  if (variation > 0) {
    return (
      <span className={styles.varUp} title={`Subiu ${variation} posição(ões)`}>
        {variation} ▲
      </span>
    )
  }
  if (variation < 0) {
    return (
      <span className={styles.varDown} title={`Caiu ${Math.abs(variation)} posição(ões)`}>
        {Math.abs(variation)} ▼
      </span>
    )
  }
  return (
    <span className={styles.varNeutral} title="Manteve a posição">
      0 ■
    </span>
  )
}

function FormDots({ form }: { form: ('W' | 'D' | 'L')[] }) {
  const totalSlots = 5
  const emptyCount = Math.max(0, totalSlots - form.length)
  const emptyDots = Array.from({ length: emptyCount }).map(() => 'NONE')
  const allDots = [...form, ...emptyDots].slice(-5)

  return (
    <div className={styles.formDotsRow}>
      {allDots.map((res, i) => (
        <span
          key={i}
          className={`${styles.formDot} ${
            res === 'W'
              ? styles.formDotWin
              : res === 'L'
              ? styles.formDotLoss
              : res === 'D'
              ? styles.formDotDraw
              : styles.formDotEmpty
          }`}
          title={
            res === 'W'
              ? 'Vitória'
              : res === 'L'
              ? 'Derrota'
              : res === 'D'
              ? 'Empate'
              : 'A disputar'
          }
        />
      ))}
    </div>
  )
}

export default function LeagueDetailsPage() {
  const params = useParams()
  const leagueId = params.id as string

  const [league, setLeague] = useState<LeagueDetails | null>(null)
  const [standingsData, setStandingsData] = useState<StandingsPageData | null>(null)
  const [selectedRound, setSelectedRound] = useState<number>(1)
  const [mobileTab, setMobileTab] = useState<'table' | 'matches'>('table')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (leagueId) {
      Promise.all([
        getLeagueDetails(leagueId),
        getStandingsData(leagueId),
      ]).then(([lRes, sRes]) => {
        setLeague(lRes)
        setStandingsData(sRes)
        if (sRes) {
          setSelectedRound(sRes.currentRound)
        }
        setLoading(false)
      })
    }
  }, [leagueId])

  const handleCopyCode = () => {
    if (league?.inviteCode) {
      navigator.clipboard.writeText(league.inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleCopyLink = () => {
    if (typeof window !== 'undefined' && league?.inviteCode) {
      const url = `${window.location.origin}/join/${league.inviteCode}`
      navigator.clipboard.writeText(url)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    }
  }

  const handleShareWhatsApp = () => {
    if (typeof window !== 'undefined' && league) {
      const url = `${window.location.origin}/join/${league.inviteCode}`
      const text = encodeURIComponent(
        `⚽ Venha jogar na minha liga "${league.name}" no Fantasy Draft Série A!\n\n` +
          `🏆 Modo: ${league.scoringMode === 'H2H' ? 'Duelos H2H' : 'Pontuação Geral'} | Draft Fechado (jogadores únicos)\n` +
          `Entre agora pelo link:\n${url}\n\n` +
          `Ou use o código de convite: *${league.inviteCode}*`
      )
      window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank')
    }
  }

  const handleStartDraft = () => {
    setError(null)
    startTransition(async () => {
      try {
        await startDraftAction(leagueId)
      } catch (err: any) {
        setError(err.message || 'Erro ao iniciar o draft.')
      }
    })
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <p>Carregando liga...</p>
      </div>
    )
  }

  if (!league) {
    return (
      <div className={styles.container}>
        <h2>Liga Não Encontrada</h2>
        <Link href="/dashboard">
          <Button size="md">Voltar ao Painel</Button>
        </Link>
      </div>
    )
  }

  const isDraftable = league.teams.length >= 2
  const isDrafting = league.status === 'drafting'
  const isActive = league.status === 'active' || league.status === 'closed'

  // Round carousel calculations
  const matchupRounds = standingsData
    ? Array.from(new Set(standingsData.allMatchups.map((m) => m.fixtureRound))).sort((a, b) => a - b)
    : []

  const minRound = matchupRounds.length > 0 ? matchupRounds[0] : (standingsData?.currentRound ?? 1)
  const maxRound = matchupRounds.length > 0 ? matchupRounds[matchupRounds.length - 1] : (standingsData?.totalRounds ?? 38)

  const filteredMatchups = standingsData
    ? standingsData.allMatchups.filter((m) => m.fixtureRound === selectedRound)
    : []

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

  const roundDateLabel = standingsData?.roundInfoMap?.[selectedRound] || `Rodada ${selectedRound}`

  return (
    <div className={styles.container}>
      <Link href="/dashboard" className={styles.backLink}>
        ← Voltar ao painel
      </Link>

      {/* Header Card */}
      <div className={styles.headerCard}>
        <div className={styles.headerTop}>
          <div className={styles.titleArea}>
            <h1 className={styles.title}>{league.name}</h1>
            {league.status === 'open' && <Badge variant="status">Inscrições Abertas</Badge>}
            {league.status === 'drafting' && <Badge variant="MEI">Em Draft</Badge>}
            {league.status === 'active' && <Badge variant="GOL">Ativa</Badge>}
            {league.status === 'closed' && <Badge variant="default">Encerrada</Badge>}
          </div>

          <div className={styles.codeBox}>
            <div className={styles.codeInfoArea}>
              <span className={styles.codeLabel}>Convite:</span>
              <span className={styles.codeText}>{league.inviteCode}</span>
            </div>
            <div className={styles.codeActionsArea}>
              <button
                onClick={handleCopyCode}
                className={styles.copyButton}
                title="Copiar código de convite"
              >
                {copied ? '✓ Copiado!' : '📋 Código'}
              </button>
              <button
                onClick={handleCopyLink}
                className={styles.copyButton}
                title="Copiar link direto de entrada"
              >
                {copiedLink ? '✓ Link Copiado!' : '🔗 Link'}
              </button>
              <button
                onClick={handleShareWhatsApp}
                className={styles.whatsappButton}
                title="Convidar amigos via WhatsApp"
              >
                💬 WhatsApp
              </button>
            </div>
          </div>
        </div>

        <div className={styles.configBadges}>
          <Badge variant="default">
            Pontuação {league.scoringMode}
            {league.scoringMode === 'H2H' &&
              ` (${league.h2hFormat === 'SINGLE_ROUND' ? 'Turno Único' : 'Ida e Volta'})`}
          </Badge>
          <Badge variant="default">Draft {league.draftMode}</Badge>
          <Badge variant="default">Timer: {league.pickTimerSeconds}s</Badge>
          <Badge variant="default">
            {league.teams.length} / {league.teamCap} times inscritos
          </Badge>
        </div>

        {/* Action Buttons */}
        <div className={styles.actionBox}>
          {error && <div className={styles.errorText}>⚠️ {error}</div>}

          {isDrafting && (
            <Link href={`/league/${league.id}/draft`}>
              <Button size="lg" style={{ width: '100%' }}>
                🚀 Ir para a Sala de Draft (Em Andamento!)
              </Button>
            </Link>
          )}

          {isActive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <Link href={`/league/${league.id}/lineup`} style={{ flex: 1, minWidth: '220px' }}>
                <Button size="lg" style={{ width: '100%' }}>
                  ⚽ Escalar Meu Time
                </Button>
              </Link>
              {league.isCommissioner && (
                <Link href={`/league/${league.id}/admin`}>
                  <Button
                    variant="secondary"
                    size="lg"
                    style={{
                      borderColor: 'rgba(234, 179, 8, 0.5)',
                      color: '#fbbf24',
                      background: 'rgba(234, 179, 8, 0.08)',
                    }}
                  >
                    👑 Painel do Comissário
                  </Button>
                </Link>
              )}
            </div>
          )}

          {league.status === 'open' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                style={{
                  background:
                    'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(16, 185, 129, 0.1) 100%)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '0.9375rem',
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span>📋 Planejamento Pré-Draft</span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        background: 'rgba(245, 158, 11, 0.2)',
                        color: 'var(--accent-gold)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: '1px solid rgba(245, 158, 11, 0.4)',
                        fontWeight: 600,
                      }}
                    >
                      Destaque
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '0.8125rem',
                      color: 'var(--text-secondary)',
                      marginTop: '4px',
                    }}
                  >
                    Consulte os scouts dos jogadores da Série A e monte sua Lista de Desejos antes do início do draft.
                  </div>
                </div>
                <Link href={`/league/${league.id}/prep`}>
                  <Button
                    variant="secondary"
                    size="md"
                    style={{
                      borderColor: 'var(--accent-gold)',
                      color: 'var(--accent-gold)',
                      fontWeight: 600,
                    }}
                  >
                    ⭐ Montar Lista de Desejos
                  </Button>
                </Link>
              </div>

              {league.isCommissioner ? (
                <Button
                  size="lg"
                  disabled={!isDraftable || isPending}
                  isLoading={isPending}
                  onClick={handleStartDraft}
                >
                  {isPending
                    ? 'Iniciando Draft...'
                    : !isDraftable
                    ? 'Aguardando pelo menos 2 times...'
                    : '⚡ Iniciar Draft Snake Agora'}
                </Button>
              ) : (
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Aguardando o comissário iniciar o draft.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Market Countdown / Status Banner */}
      {isActive && standingsData?.marketStatus && (
        <MarketCountdownBanner
          leagueId={league.id}
          isLocked={standingsData.marketStatus.isLocked}
          closingAt={standingsData.marketStatus.closingAt}
          currentRound={standingsData.marketStatus.currentRound}
        />
      )}

      {/* Main Tournament View: TABELA (Left) and JOGOS (Right) */}
      {isActive && standingsData && (
        <>
          {/* Mobile Switcher (Table vs Matches) */}
          <div className={styles.mobileTabsBar}>
            <button
              type="button"
              onClick={() => setMobileTab('table')}
              className={`${styles.mobileTabBtn} ${mobileTab === 'table' ? styles.mobileTabBtnActive : ''}`}
            >
              📊 TABELA
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('matches')}
              className={`${styles.mobileTabBtn} ${mobileTab === 'matches' ? styles.mobileTabBtnActive : ''}`}
            >
              ⚽ JOGOS ({selectedRound}ª RODADA)
            </button>
          </div>

          <div className={styles.mainGrid}>
            {/* Left Column: TABELA */}
            <div className={`${styles.tableCard} ${mobileTab !== 'table' ? styles.mobileHidden : ''}`}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>TABELA</h2>
                <span className={styles.tiebreakHint}>
                  *Desempate: <strong>PG (Pontuação Geral)</strong>
                </span>
              </div>

              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.thClassificacao}>CLASSIFICAÇÃO</th>
                      <th className={styles.thP} title="Pontos H2H (3 por vitória, 1 por empate)">P</th>
                      <th className={styles.thStat} title="Jogos disputados">J</th>
                      <th className={styles.thStat} title="Vitórias">V</th>
                      <th className={styles.thStat} title="Empates">E</th>
                      <th className={styles.thStat} title="Derrotas">D</th>
                      <th className={styles.thStat} title="Pontos Pró (GP)">GP</th>
                      <th className={styles.thStat} title="Pontos Contra (GC)">GC</th>
                      <th className={styles.thStat} title="Saldo de Pontos (SG)">SG</th>
                      <th className={styles.thPG} title="Pontuação Geral no Fantasy (Critério de Desempate)">PG*</th>
                      <th className={styles.thStat} title="Aproveitamento">%</th>
                      <th className={styles.thForm} title="Últimos 5 jogos">ÚLT. JOGOS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standingsData.standings.length === 0 ? (
                      <tr>
                        <td colSpan={12} className={styles.emptyTable}>
                          Nenhuma rodada disputada até o momento.
                        </td>
                      </tr>
                    ) : (
                      standingsData.standings.map((row) => (
                        <tr key={row.fantasyTeamId} className={styles.tableRow}>
                          {/* Classificação Cell (Sticky) */}
                          <td className={styles.tdClassificacao}>
                            <div className={styles.teamCellInner}>
                              <div className={styles.rankArea}>
                                <span
                                  className={`${styles.rankNumber} ${
                                    row.rank <= 4
                                      ? styles.rankTop
                                      : row.rank >= standingsData.standings.length - 1
                                      ? styles.rankBottom
                                      : ''
                                  }`}
                                >
                                  {row.rank}
                                </span>
                                <RankVariationBadge variation={row.rankVariation} />
                              </div>

                              <div className={styles.teamInfoArea}>
                                <TeamCrest name={row.teamName} />
                                <div className={styles.teamNameBox}>
                                  <Link
                                    href={`/league/${leagueId}/team/${row.fantasyTeamId}`}
                                    className={styles.teamLink}
                                    title="Ver time"
                                  >
                                    {row.teamName}
                                  </Link>
                                  {row.managerName && (
                                    <span className={styles.managerSubtext}>{row.managerName}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Pontos */}
                          <td className={styles.tdP}>{row.h2hPoints}</td>

                          {/* J, V, E, D */}
                          <td className={styles.tdStat}>{row.played}</td>
                          <td className={styles.tdStat}>{row.wins}</td>
                          <td className={styles.tdStat}>{row.draws}</td>
                          <td className={styles.tdStat}>{row.losses}</td>

                          {/* GP, GC, SG */}
                          <td className={styles.tdStat}>{row.pointsFor.toFixed(0)}</td>
                          <td className={styles.tdStat}>{row.pointsAgainst.toFixed(0)}</td>
                          <td
                            className={`${styles.tdStat} ${
                              row.pointDifference > 0
                                ? styles.posSg
                                : row.pointDifference < 0
                                ? styles.negSg
                                : ''
                            }`}
                          >
                            {row.pointDifference > 0 ? `+${row.pointDifference.toFixed(0)}` : row.pointDifference.toFixed(0)}
                          </td>

                          {/* PG: Pontuação Geral (Desempate) */}
                          <td className={styles.tdPG}>
                            <span className={styles.pgBadge}>{row.generalScore.toFixed(1)}</span>
                          </td>

                          {/* Aproveitamento */}
                          <td className={styles.tdStat}>{row.winRate}</td>

                          {/* Últimos Jogos */}
                          <td className={styles.tdForm}>
                            <FormDots form={row.recentForm} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Column: JOGOS */}
            <div className={`${styles.matchesCard} ${mobileTab !== 'matches' ? styles.mobileHidden : ''}`}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>JOGOS</h2>
              </div>

              {/* Carousel Header (< 29ª RODADA >) */}
              <div className={styles.carouselHeader}>
                <button
                  type="button"
                  onClick={handlePrevRound}
                  disabled={selectedRound <= minRound}
                  className={styles.carouselArrow}
                  title="Rodada anterior"
                >
                  ‹
                </button>
                <span className={styles.carouselRoundTitle}>{selectedRound}ª RODADA</span>
                <button
                  type="button"
                  onClick={handleNextRound}
                  disabled={selectedRound >= maxRound}
                  className={styles.carouselArrow}
                  title="Próxima rodada"
                >
                  ›
                </button>
              </div>

              {/* Matches List */}
              <div className={styles.matchesList}>
                {filteredMatchups.length === 0 ? (
                  <div className={styles.emptyMatches}>
                    Nenhum jogo agendado para a {selectedRound}ª rodada.
                  </div>
                ) : (
                  filteredMatchups.map((m) => {
                    const hasScore = m.homePoints !== null && m.awayPoints !== null

                    return (
                      <div key={m.id} className={styles.matchItemCard}>
                        {/* Header info / time */}
                        <div className={styles.matchItemHeader}>
                          <span>{roundDateLabel}</span>
                          {m.isPartial ? (
                            <span className={styles.partialBadge} title="Pontuação parcial em tempo real">
                              ● PARCIAL
                            </span>
                          ) : hasScore ? (
                            <span className={styles.finalBadge} title="Pontuação final consolidada">
                              ✓ FINAL
                            </span>
                          ) : null}
                        </div>

                        {/* Duelo Body */}
                        <div className={styles.duelRow}>
                          {/* Home Team */}
                          <div className={styles.duelTeamHome}>
                            <span className={styles.duelTeamName} title={m.homeTeamName}>
                              {m.homeTeamName}
                            </span>
                          </div>

                          {/* Center Score / X */}
                          <div className={styles.duelScoreBox}>
                            {hasScore ? (
                              <div className={styles.duelScoreValues}>
                                <span
                                  className={`${styles.scoreNum} ${
                                    m.homePoints! > m.awayPoints!
                                      ? styles.scoreWinner
                                      : m.homePoints! < m.awayPoints!
                                      ? styles.scoreLoser
                                      : ''
                                  }`}
                                >
                                  {m.homePoints!.toFixed(1)}
                                </span>
                                <span className={styles.scoreX}>×</span>
                                <span
                                  className={`${styles.scoreNum} ${
                                    m.awayPoints! > m.homePoints!
                                      ? styles.scoreWinner
                                      : m.awayPoints! < m.homePoints!
                                      ? styles.scoreLoser
                                      : ''
                                  }`}
                                >
                                  {m.awayPoints!.toFixed(1)}
                                </span>
                              </div>
                            ) : (
                              <div className={styles.duelScoreValues}>
                                <span className={styles.scoreEmpty}>-</span>
                                <span className={styles.scoreX}>×</span>
                                <span className={styles.scoreEmpty}>-</span>
                              </div>
                            )}
                          </div>

                          {/* Away Team */}
                          <div className={styles.duelTeamAway}>
                            <span className={styles.duelTeamName} title={m.awayTeamName}>
                              {m.awayTeamName}
                            </span>
                          </div>
                        </div>

                        {/* Fique Por Dentro CTA */}
                        <div className={styles.matchItemFooter}>
                          <Link
                            href={`/league/${leagueId}/matchup/${m.id}`}
                            className={styles.fiquePorDentroLink}
                          >
                            FIQUE POR DENTRO
                          </Link>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
