'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  getDraftRoomData,
  submitPickAction,
  toggleDraftPauseAction,
  addToWishlistAction,
  removeFromWishlistAction,
  startDraftFromRoomAction,
  triggerAutoPickAction,
  type DraftStateData,
} from './actions'
import { createClient } from '@/lib/supabase/client'
import { formatTimerSeconds } from '@/lib/utils/format'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PlayerDetailModal } from '@/components/player/PlayerDetailModal'
import styles from './page.module.css'

export default function DraftRoomPage() {
  const params = useParams()
  const leagueId = params.id as string

  const [data, setData] = useState<DraftStateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [posFilter, setPosFilter] = useState<string>('TODOS')
  const [clubFilter, setClubFilter] = useState<string>('TODOS')
  const [isClubDropdownOpen, setIsClubDropdownOpen] = useState(false)
  const [userSelectedRound, setUserSelectedRound] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null)
  const [isPending, startTransition] = useTransition()
  const [pickError, setPickError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  const clubDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        clubDropdownRef.current &&
        !clubDropdownRef.current.contains(event.target as Node)
      ) {
        setIsClubDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!data?.turnStartedAt || data.isPaused || data.status !== 'drafting') {
      setSecondsLeft(null)
      return
    }

    const calcTime = () => {
      const startMs = new Date(data.turnStartedAt!).getTime()
      const deadlineMs = startMs + data.pickTimerSeconds * 1000
      const nowMs = Date.now()
      const diffSec = Math.max(0, Math.floor((deadlineMs - nowMs) / 1000))
      setSecondsLeft(diffSec)
    }

    calcTime()
    const timer = setInterval(calcTime, 1000)
    return () => clearInterval(timer)
  }, [data?.turnStartedAt, data?.pickTimerSeconds, data?.isPaused, data?.status])

  function formatCountdown(sec: number): string {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const loadData = () => {
    if (leagueId) {
      getDraftRoomData(leagueId).then((res) => {
        setData(res)
        setLoading(false)
      })
    }
  }

  useEffect(() => {
    loadData()

    // Supabase Realtime Subscription for live picks and pause updates
    const supabase = createClient()
    const channel = supabase
      .channel(`draft:${leagueId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'draft_picks',
          filter: `league_id=eq.${leagueId}`,
        },
        () => loadData()
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'leagues',
          filter: `id=eq.${leagueId}`,
        },
        () => loadData()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'draft_queues',
        },
        () => loadData()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [leagueId])

  const handleConfirmPick = () => {
    if (!selectedPlayer || !data) return
    setPickError(null)

    startTransition(async () => {
      try {
        await submitPickAction(leagueId, selectedPlayer.id)
        setSelectedPlayer(null)
        loadData()
      } catch (err: any) {
        setPickError(err.message || 'Erro ao fazer pick.')
      }
    })
  }

  const handleStartDraftNow = () => {
    setPickError(null)
    startTransition(async () => {
      try {
        await startDraftFromRoomAction(leagueId)
        loadData()
      } catch (err: any) {
        setPickError(err.message || 'Erro ao iniciar o draft.')
      }
    })
  }

  const handleTogglePause = () => {
    startTransition(async () => {
      try {
        await toggleDraftPauseAction(leagueId)
        loadData()
      } catch (err: any) {
        setPickError(err.message || 'Erro ao alterar pausa do draft.')
      }
    })
  }

  const handleTriggerAutoPick = () => {
    setPickError(null)
    startTransition(async () => {
      try {
        await triggerAutoPickAction(leagueId)
        loadData()
      } catch (err: any) {
        setPickError(err.message || 'Erro ao acionar auto-pick.')
      }
    })
  }

  const handleToggleWishlist = (playerId: string) => {
    if (!data?.myTeamId) return

    const isInWishlist = data.myWishlist.some((w) => w.playerId === playerId)
    startTransition(async () => {
      if (isInWishlist) {
        await removeFromWishlistAction(data.myTeamId!, playerId)
      } else {
        await addToWishlistAction(data.myTeamId!, playerId)
      }
      loadData()
    })
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <p>Carregando Sala de Draft...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <h2>Liga não encontrada</h2>
        <Link href="/dashboard">
          <Button size="md">Voltar ao Painel</Button>
        </Link>
      </div>
    )
  }

  const isCompleted = data.status === 'active' || (data.totalPicks > 0 && data.currentPick > data.totalPicks)

  const currentRound = data.totalPicks > 0
    ? Math.min(24, Math.max(1, Math.ceil(data.currentPick / (data.totalPicks / 24 || 1))))
    : 1
  const activeRound = userSelectedRound ?? currentRound
  const roundPicks = (data.allPicks || []).filter((p) => p.round === activeRound)
  const selectedClub = data.clubs?.find((c) => c.id === clubFilter)

  const filteredPlayers = data.availablePlayers.filter((p) => {
    const matchesPos = posFilter === 'TODOS' || p.position === posFilter
    const matchesClub = clubFilter === 'TODOS' || p.clubId === clubFilter
    const matchesSearch =
      search === '' ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.clubName.toLowerCase().includes(search.toLowerCase()) ||
      p.clubShortName.toLowerCase().includes(search.toLowerCase())
    return matchesPos && matchesClub && matchesSearch
  })

  const wishlistPlayerIds = new Set(data.myWishlist.map((w) => w.playerId))

  return (
    <div className={styles.container}>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.titleBox}>
          <h1 className={styles.leagueTitle}>{data.leagueName}</h1>
          <span className={styles.pickInfo}>
            {isCompleted
              ? 'Draft Concluído! 🏆'
              : data.status === 'open'
              ? `Aguardando Início do Draft · Timer por Turno: ${formatTimerSeconds(data.pickTimerSeconds)}`
              : `Pick ${data.currentPick} de ${data.totalPicks} (Rodada ${Math.ceil(
                  data.currentPick / (data.totalPicks / 24)
                )} de 24) · ${
                  data.isPaused
                    ? '⏸️ Pausado'
                    : secondsLeft !== null
                    ? `Tempo restante: ${formatCountdown(secondsLeft)}`
                    : `Timer: ${formatTimerSeconds(data.pickTimerSeconds)}`
                }`}
          </span>
        </div>

        {!isCompleted && data.status === 'drafting' && (
          <div className={styles.controlsGroup}>
            <div
              className={`${styles.turnBox} ${
                data.isMyTurn && !data.isPaused ? styles.turnBoxMyTurn : ''
              }`}
            >
              <div>
                <div className={styles.turnLabel}>Vez de Escolher:</div>
                <div className={styles.turnTeamName}>{data.currentTurnTeamName}</div>
              </div>
              {data.isMyTurn && !data.isPaused && (
                <span className={styles.turnMyBadge}>⚡ Sua Vez!</span>
              )}
              {data.isCommissioner && !data.isMyTurn && !data.isPaused && (
                <span className={styles.commissionerBadge}>
                  👑 Modo Comissário
                </span>
              )}
            </div>

            <div className={styles.controlsActionsRow}>
              {data.isPaused ? (
                <div className={styles.countdownPaused}>⏸️ Timer Pausado</div>
              ) : secondsLeft !== null ? (
                <div
                  className={`${styles.countdownBox} ${
                    secondsLeft <= 60 ? styles.countdownUrgent : ''
                  }`}
                  title="Tempo restante para esta escolha"
                >
                  <span className={styles.countdownLabel}>Tempo Restante</span>
                  <span className={styles.countdownValue}>
                    {secondsLeft === 0 ? '00:00 (Esgotado)' : formatCountdown(secondsLeft)}
                  </span>
                </div>
              ) : null}

              {data.isCommissioner && (
                <Button
                  variant={data.isPaused ? 'primary' : 'ghost'}
                  size="sm"
                  className={styles.pauseDraftBtn}
                  onClick={handleTogglePause}
                  isLoading={isPending}
                >
                  {data.isPaused ? '▶️ Retomar Draft' : '⏸️ Pausar Draft'}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Draft Not Started Banner */}
      {data.status === 'open' && (
        <div className={styles.notStartedBanner}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
              ⏳ O Draft ainda não começou
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {data.isCommissioner
                ? 'Como comissário, clique no botão ao lado para sortear a ordem dos times e iniciar o Pick #1 imediatamente.'
                : 'Aguarde o comissário da liga iniciar o sorteio das posições e abrir a primeira rodada.'}
            </div>
          </div>
          {data.isCommissioner && (
            <Button
              size="md"
              isLoading={isPending}
              onClick={handleStartDraftNow}
            >
              ⚡ Iniciar Sorteio & Começar Draft Agora
            </Button>
          )}
        </div>
      )}

      {/* Snake Upcoming Order Bar (Separated by Rounds with Full 24-Round Navigation) */}
      {data.status === 'drafting' && data.allPicks && data.allPicks.length > 0 && (
        <div className={styles.snakeBar}>
          <div className={styles.snakeBarHeader}>
            <div className={styles.snakeBarTitle}>
              <span>🔄 Grade de Escolhas (Snake)</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-gold)' }}>
                • Rodada {activeRound} de 24
              </span>
            </div>
            <div className={styles.snakeHeaderActions}>
              {activeRound !== currentRound && (
                <button
                  type="button"
                  onClick={() => setUserSelectedRound(currentRound)}
                  className={styles.currentRoundJumpBtn}
                >
                  ⚡ Ir para Rodada Atual (R{currentRound})
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowOrderModal(true)}
                className={styles.viewOrderBtn}
              >
                📋 Ordem do Sorteio
              </button>
            </div>
          </div>

          {/* Round Navigation Row */}
          <div className={styles.roundNavRow}>
            <div className={styles.roundTitleBox}>
              <button
                type="button"
                disabled={activeRound <= 1}
                onClick={() => setUserSelectedRound(Math.max(1, activeRound - 1))}
                className={styles.roundArrowBtn}
                title="Rodada anterior"
              >
                ◀ R{Math.max(1, activeRound - 1)}
              </button>
              <button
                type="button"
                disabled={activeRound >= 24}
                onClick={() => setUserSelectedRound(Math.min(24, activeRound + 1))}
                className={styles.roundArrowBtn}
                title="Próxima rodada"
              >
                R{Math.min(24, activeRound + 1)} ▶
              </button>
            </div>

            <div className={styles.roundPillsTrack}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map((r) => {
                const isActive = r === activeRound
                const isCurrent = r === currentRound
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setUserSelectedRound(r)}
                    className={`${styles.roundPill} ${isActive ? styles.roundPillActive : ''} ${
                      isCurrent && !isActive ? styles.roundPillHasCurrent : ''
                    }`}
                    title={`Rodada ${r}${isCurrent ? ' (Em andamento)' : ''}`}
                  >
                    <span>R{r}</span>
                    {isCurrent && !isActive && <span style={{ color: 'var(--accent-gold)' }}>●</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Picks for Active Round */}
          <div className={styles.snakeTrack}>
            {roundPicks.map((p) => {
              const isCurrent = p.pickNumber === data.currentPick
              const isCompleted = p.pickNumber < data.currentPick || !!p.playerName

              return (
                <div
                  key={p.pickNumber}
                  className={`${styles.snakeCard} ${
                    isCurrent ? styles.snakeCardCurrent : ''
                  } ${p.isMyTurn ? styles.snakeCardMine : ''} ${
                    isCompleted ? styles.snakeCardCompleted : ''
                  }`}
                >
                  <div className={styles.snakeCardTop}>
                    <span className={styles.snakePickNum}>Pick #{p.pickNumber}</span>
                    <span className={styles.snakeRound}>R{p.round}</span>
                  </div>
                  <div className={styles.snakeTeamName} title={p.teamName}>
                    {p.teamName}
                  </div>
                  {isCurrent ? (
                    <span className={styles.snakeCurrentTag}>
                      ● {data.isPaused ? 'Pausado' : secondsLeft !== null ? `Escolhendo (${formatCountdown(secondsLeft)})` : 'Escolhendo Agora'}
                    </span>
                  ) : p.playerName ? (
                    <div className={styles.snakePickedPlayer} title={`${p.playerName} (${p.playerPosition})`}>
                      <span>✅</span>
                      <strong>{p.playerName}</strong>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{p.playerPosition}</span>
                    </div>
                  ) : p.isMyTurn ? (
                    <span className={styles.snakeMineTag}>⭐ Seu Time</span>
                  ) : (
                    <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>Aguardando</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Paused Banner */}
      {data.isPaused && !isCompleted && (
        <div className={styles.pausedBanner}>
          <span>⏸️ O Draft está temporariamente PAUSADO pelo comissário.</span>
          <span style={{ fontSize: '0.8125rem', fontWeight: 400 }}>
            Nenhum timer ou pick automático é executado enquanto estiver pausado.
          </span>
        </div>
      )}

      {/* Expired Timer Banner */}
      {!data.isPaused && !isCompleted && data.status === 'drafting' && secondsLeft === 0 && (
        <div className={styles.expiredBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠️</span>
            <span>
              O tempo limite de escolha de <strong>{data.currentTurnTeamName}</strong> esgotou!
            </span>
          </div>
          {data.isCommissioner && (
            <Button
              size="sm"
              variant="danger"
              isLoading={isPending}
              onClick={handleTriggerAutoPick}
            >
              ⚡ Forçar Auto-Pick Agora
            </Button>
          )}
        </div>
      )}

      {isCompleted ? (
        <div
          style={{
            background: 'var(--bg-card)',
            padding: '40px',
            borderRadius: 'var(--radius-lg)',
            textAlign: 'center',
          }}
        >
          <h2>🎉 O Draft foi finalizado com sucesso!</h2>
          <p
            style={{
              color: 'var(--text-secondary)',
              marginTop: '8px',
              marginBottom: '24px',
            }}
          >
            Todos os 24 jogadores foram consolidados no elenco do seu time.
          </p>
          <Link href={`/league/${leagueId}`}>
            <Button size="lg">Voltar à Liga</Button>
          </Link>
        </div>
      ) : (
        <div className={styles.grid}>
          {/* Main Player Board */}
          <div className={styles.boardArea}>
            {/* Filters Row */}
            <div className={styles.filterRow}>
              {/* Position Filters */}
              <div className={styles.posFilters}>
                {['TODOS', 'GOL', 'LAT', 'ZAG', 'MEI', 'ATA'].map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setPosFilter(pos)}
                    className={`${styles.posBtn} ${
                      posFilter === pos ? styles.posBtnActive : ''
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>

              {/* Secondary Filters: Club Dropdown & Search */}
              <div className={styles.secondaryFilters}>
                {/* Club Dropdown Filter */}
                <div className={styles.clubDropdownContainer} ref={clubDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsClubDropdownOpen((prev) => !prev)}
                    className={`${styles.clubDropdownTrigger} ${
                      clubFilter !== 'TODOS' ? styles.clubDropdownTriggerActive : ''
                    }`}
                    title="Filtrar por Clube"
                  >
                    <div className={styles.clubSelectedContent}>
                      {selectedClub ? (
                        <>
                          {selectedClub.logoUrl && (
                            <img
                              src={selectedClub.logoUrl}
                              alt={selectedClub.name}
                              className={styles.clubCrestSmall}
                            />
                          )}
                          <span>{selectedClub.name}</span>
                        </>
                      ) : (
                        <>
                          <span>🛡️</span>
                          <span>Todos os Clubes</span>
                        </>
                      )}
                    </div>
                    <span className={styles.clubDropdownCaret}>
                      {isClubDropdownOpen ? '▲' : '▼'}
                    </span>
                  </button>

                  {isClubDropdownOpen && (
                    <div className={styles.clubDropdownMenu}>
                      <button
                        type="button"
                        onClick={() => {
                          setClubFilter('TODOS')
                          setIsClubDropdownOpen(false)
                        }}
                        className={`${styles.clubDropdownItem} ${
                          clubFilter === 'TODOS' ? styles.clubDropdownItemActive : ''
                        }`}
                      >
                        <div className={styles.clubItemLabel}>
                          <span>🛡️</span>
                          <span>Todos os Clubes</span>
                        </div>
                        {clubFilter === 'TODOS' && <span>✓</span>}
                      </button>

                      {data.clubs?.map((club) => (
                        <button
                          key={club.id}
                          type="button"
                          onClick={() => {
                            setClubFilter(club.id)
                            setIsClubDropdownOpen(false)
                          }}
                          className={`${styles.clubDropdownItem} ${
                            clubFilter === club.id ? styles.clubDropdownItemActive : ''
                          }`}
                        >
                          <div className={styles.clubItemLabel}>
                            {club.logoUrl ? (
                              <img
                                src={club.logoUrl}
                                alt={club.name}
                                className={styles.clubCrestSmall}
                                loading="lazy"
                              />
                            ) : (
                              <span>⚽</span>
                            )}
                            <span>{club.name}</span>
                          </div>
                          {clubFilter === club.id && <span>✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Search Input */}
                <input
                  type="text"
                  placeholder="🔍 Buscar jogador..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={styles.searchInput}
                />
              </div>
            </div>

            {/* Catalog Counter and Active Club Filter */}
            <div className={styles.catalogCounterRow}>
              <span>
                Exibindo <strong>{filteredPlayers.length}</strong> jogadores disponíveis
              </span>
              {clubFilter !== 'TODOS' && (
                <button
                  type="button"
                  onClick={() => setClubFilter('TODOS')}
                  className={styles.clearClubFilterBtn}
                >
                  Limpar clube: {selectedClub?.name} ✕
                </button>
              )}
            </div>

            {/* Error Message */}
            {pickError && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--accent-red)',
                  fontSize: '0.875rem',
                }}
              >
                ⚠️ {pickError}
              </div>
            )}

            {/* Selected Player Confirmation Bar */}
            {selectedPlayer && !data.isPaused && (
              data.isMyTurn ? (
                <div className={styles.confirmPickBar}>
                  <div className={styles.confirmPickPlayerInfo}>
                    {selectedPlayer.clubLogoUrl && (
                      <img
                        src={selectedPlayer.clubLogoUrl}
                        alt={selectedPlayer.clubShortName}
                        style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                      />
                    )}
                    <div>
                      <strong>Confirmar escolha: </strong>
                      {selectedPlayer.name} ({selectedPlayer.position}) —{' '}
                      {selectedPlayer.clubShortName}
                    </div>
                  </div>
                  <div className={styles.confirmPickActions}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setModalPlayerId(selectedPlayer.id)}
                    >
                      🔍 Ficha
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedPlayer(null)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      isLoading={isPending}
                      onClick={handleConfirmPick}
                    >
                      Confirmar Pick
                    </Button>
                  </div>
                </div>
              ) : data.isCommissioner ? (
                <div className={styles.confirmPickBarCommish}>
                  <div className={styles.confirmPickPlayerInfo}>
                    {selectedPlayer.clubLogoUrl && (
                      <img
                        src={selectedPlayer.clubLogoUrl}
                        alt={selectedPlayer.clubShortName}
                        style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                      />
                    )}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: 'var(--accent-gold)',
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                          }}
                        >
                          👑 Escolha Assistida pelo Comissário
                        </span>
                      </div>
                      <div style={{ fontSize: '0.9375rem' }}>
                        Escolher <strong>{selectedPlayer.name}</strong> ({selectedPlayer.position}) em nome de{' '}
                        <strong style={{ color: 'var(--accent-gold)' }}>{data.currentTurnTeamName}</strong>
                      </div>
                    </div>
                  </div>
                  <div className={styles.confirmPickActions}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setModalPlayerId(selectedPlayer.id)}
                    >
                      🔍 Ficha
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedPlayer(null)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      style={{
                        background: 'var(--accent-gold)',
                        color: '#0f172a',
                        borderColor: 'var(--accent-gold)',
                        fontWeight: 600,
                      }}
                      isLoading={isPending}
                      onClick={handleConfirmPick}
                    >
                      👑 Escolher
                    </Button>
                  </div>
                </div>
              ) : null
            )}

            {/* Players Grid (Pre-Draft High-Standard Design) */}
            <div className={styles.playerGrid}>
              {filteredPlayers.map((player) => {
                const isSelected = selectedPlayer?.id === player.id
                const inWishlist = wishlistPlayerIds.has(player.id)
                const canPick = (data.isMyTurn || data.isCommissioner) && !data.isPaused
                const isCommishPick = !data.isMyTurn && data.isCommissioner

                return (
                  <div
                    key={player.id}
                    onClick={() => {
                      if (canPick) {
                        setSelectedPlayer(player)
                      } else {
                        setModalPlayerId(player.id)
                      }
                    }}
                    className={`${styles.playerCard} ${
                      canPick ? styles.playerCardSelectable : ''
                    } ${inWishlist ? styles.playerCardInWishlist : ''}`}
                    style={
                      isSelected
                        ? {
                            borderColor: isCommishPick ? 'var(--accent-gold)' : 'var(--accent-green)',
                            background: isCommishPick ? 'rgba(245, 158, 11, 0.15)' : 'var(--accent-green-subtle)',
                            boxShadow: '0 0 16px rgba(16, 185, 129, 0.25)',
                          }
                        : {}
                    }
                  >
                    <div>
                      {/* Card Header: Position Badge + Club Info */}
                      <div className={styles.cardHeader}>
                        <Badge variant={player.position as any}>{player.position}</Badge>

                        <div className={styles.clubBadge}>
                          {player.clubLogoUrl && (
                            <img
                              src={player.clubLogoUrl}
                              alt={player.clubShortName}
                              className={styles.clubCrestHeader}
                              loading="lazy"
                            />
                          )}
                          <span className={styles.playerClub}>{player.clubShortName}</span>
                        </div>
                      </div>

                      {/* Card Body: Player Photo, Name, and Interest Badge */}
                      <div className={styles.playerBody} style={{ marginTop: '10px' }}>
                        <div className={styles.playerPhotoWrapper}>
                          {player.photoUrl ? (
                            <img
                              src={player.photoUrl}
                              alt={player.name}
                              className={styles.playerPhoto}
                              loading="lazy"
                              onError={(e) => {
                                const target = e.currentTarget
                                target.style.display = 'none'
                                if (target.parentElement) {
                                  target.parentElement.innerHTML = '👤'
                                }
                              }}
                            />
                          ) : (
                            <span className={styles.playerPhotoPlaceholder}>👤</span>
                          )}
                        </div>

                        <div className={styles.playerInfo}>
                          <div className={styles.playerName} title={player.name}>
                            {player.name}
                          </div>

                          {/* Interest Badge */}
                          {player.interestCount > 0 ? (
                            <span
                              className={styles.interestBadge}
                              title={`${player.interestCount} times têm este jogador na fila`}
                            >
                              🔥 {player.interestCount}{' '}
                              {player.interestCount === 1 ? 'time interessado' : 'times interessados'}
                            </span>
                          ) : (
                            <span className={styles.interestBadgeZero}>0 na fila</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Stats Row */}
                    <div className={styles.statsRow}>
                      <div className={styles.statItem}>
                        <span>Média:</span>
                        <strong>{player.avgPoints.toFixed(1)}</strong>
                      </div>
                      <span>•</span>
                      <div className={styles.statItem}>
                        <span>Minutos:</span>
                        <strong>{player.totalMinutes}&apos;</strong>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setModalPlayerId(player.id)
                        }}
                        className={styles.btnDetail}
                        title="Ver ficha técnica completa e scouts"
                      >
                        🔍 Ficha
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleWishlist(player.id)
                        }}
                        className={`${styles.btnWishlist} ${
                          inWishlist ? styles.btnWishlistActive : ''
                        }`}
                        title={
                          inWishlist
                            ? 'Remover da Fila de Preferência'
                            : 'Adicionar à Fila de Preferência (Auto-pick prioriza)'
                        }
                      >
                        {inWishlist ? '⭐ Na Fila' : '+ Fila'}
                      </button>

                      {canPick && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedPlayer(player)
                          }}
                          className={isCommishPick ? styles.btnPickCommish : styles.btnPickThis}
                          title={isCommishPick ? 'Escolher pelo time da vez' : 'Escolher este jogador'}
                        >
                          {isSelected ? '✓ Selecionado' : '🎯 Escolher'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Sidebar Area */}
          <div className={styles.sidebarArea}>
            {/* Minha Fila de Desejos */}
            <div className={styles.sidebarSection}>
              <h3 className={styles.sidebarTitle}>
                <span>⭐ Minha Fila ({data.myWishlist.length})</span>
              </h3>
              <div className={styles.wishlistList}>
                {data.myWishlist.length === 0 ? (
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Sua fila está vazia. Clique em &ldquo;+ Fila&rdquo; nos jogadores para
                    priorizá-los no auto-pick.
                  </span>
                ) : (
                  data.myWishlist.map((item, idx) => (
                    <div key={item.playerId} className={styles.wishlistItem}>
                      <div>
                        <span
                          style={{
                            fontWeight: 600,
                            marginRight: '6px',
                            color: 'var(--accent-gold)',
                          }}
                        >
                          #{idx + 1}
                        </span>
                        <span>{item.playerName}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Badge variant={item.position as any}>{item.position}</Badge>
                        <button
                          type="button"
                          onClick={() => handleToggleWishlist(item.playerId)}
                          className={styles.removeWishlistBtn}
                          title="Remover da fila"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Meu Elenco */}
            <div className={styles.sidebarSection}>
              <h3 className={styles.sidebarTitle}>
                Meu Elenco ({data.myRoster.length}/24)
              </h3>
              <div className={styles.rosterList}>
                {data.myRoster.length === 0 ? (
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Nenhum jogador draftado ainda.
                  </span>
                ) : (
                  data.myRoster.map((p, idx) => (
                    <div key={idx} className={styles.rosterItem}>
                      <span>{p.name}</span>
                      <Badge variant={p.position as any}>{p.position}</Badge>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Feed de Escolhas */}
            <div className={styles.sidebarSection}>
              <h3 className={styles.sidebarTitle}>Histórico de Picks</h3>
              <div className={styles.historyList}>
                {data.recentPicks.map((pick, idx) => (
                  <div key={idx} className={styles.historyItem}>
                    <span>
                      #{pick.pickNumber} {pick.teamName}: {pick.playerName}
                    </span>
                    <Badge variant={pick.position as any}>{pick.position}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Draft Order Modal */}
      {showOrderModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
          onClick={() => setShowOrderModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              maxWidth: '480px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                📋 Ordem do Sorteio (Times)
              </h3>
              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Nas rodadas ímpares (1, 3, 5...), a ordem segue do 1º ao último. Nas rodadas pares (2, 4, 6...), a ordem se inverte (formato Snake / Serpentina).
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflowY: 'auto' }}>
              {data.draftOrder.map((team) => (
                <div
                  key={team.teamId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: team.isMyTeam ? 'var(--accent-green-subtle)' : 'var(--bg-surface)',
                    border: team.isMyTeam ? '1px solid var(--accent-green)' : '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        fontWeight: 700,
                        color: 'var(--accent-gold)',
                        minWidth: '24px',
                      }}
                    >
                      #{team.order}
                    </span>
                    <span style={{ fontWeight: 600 }}>{team.teamName}</span>
                  </div>
                  {team.isMyTeam && (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: 'var(--accent-green)',
                      }}
                    >
                      (Seu Time)
                    </span>
                  )}
                </div>
              ))}
            </div>
            <Button size="md" variant="secondary" onClick={() => setShowOrderModal(false)}>
              Fechar
            </Button>
          </div>
        </div>
      )}

      {/* Player Detail Modal */}
      <PlayerDetailModal
        playerId={modalPlayerId}
        leagueId={leagueId}
        onClose={() => setModalPlayerId(null)}
      />
    </div>
  )
}
