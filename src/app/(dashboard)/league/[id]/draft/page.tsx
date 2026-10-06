'use client'

import { useEffect, useRef, useState, useTransition, useMemo } from 'react'
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
import { formatTimerSeconds, normalizeText } from '@/lib/utils/format'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PlayerDetailModal } from '@/components/player/PlayerDetailModal'
import styles from './page.module.css'

const RADAR_POSITIONS: {
  key: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
  label: string
  target: number
  color: string
}[] = [
  { key: 'GOL', label: 'Goleiros (GOL)', target: 2, color: '#fbbf24' },
  { key: 'LAT', label: 'Laterais (LAT)', target: 4, color: '#22d3ee' },
  { key: 'ZAG', label: 'Zagueiros (ZAG)', target: 4, color: '#38bdf8' },
  { key: 'MEI', label: 'Meias (MEI)', target: 8, color: '#34d399' },
  { key: 'ATA', label: 'Atacantes (ATA)', target: 6, color: '#fb7185' },
]

export default function DraftRoomPage() {
  const params = useParams()
  const leagueId = params.id as string

  const [data, setData] = useState<DraftStateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [showCommissionerQueuesModal, setShowCommissionerQueuesModal] = useState(false)
  const [selectedQueueTeamId, setSelectedQueueTeamId] = useState<string | null>(null)
  const [posFilter, setPosFilter] = useState<string>('TODOS')
  const [clubFilter, setClubFilter] = useState<string>('TODOS')
  const [isClubDropdownOpen, setIsClubDropdownOpen] = useState(false)
  const [userSelectedRound, setUserSelectedRound] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null)
  const [isPending, startTransition] = useTransition()
  const [pickError, setPickError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [availabilityFilter, setAvailabilityFilter] = useState<'ALL' | 'AVAILABLE' | 'PICKED'>('ALL')
  const [sortBy, setSortBy] = useState<'avg' | 'minutes' | 'name'>('avg')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const handleSort = (field: 'avg' | 'minutes' | 'name') => {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortDirection(field === 'name' ? 'asc' : 'desc')
    }
  }

  const rosterByPosition = useMemo(() => {
    const map: Record<string, { id: string; name: string; position: string }[]> = {
      GOL: [],
      LAT: [],
      ZAG: [],
      MEI: [],
      ATA: [],
    }
    for (const p of data?.myRoster || []) {
      if (map[p.position]) {
        map[p.position].push(p)
      }
    }
    return map
  }, [data?.myRoster])

  const totalDrafted = data?.myRoster?.length || 0
  const remainingRosterSlots = Math.max(0, 24 - totalDrafted)
  const defTotal =
    (rosterByPosition['LAT']?.length || 0) + (rosterByPosition['ZAG']?.length || 0)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('draft_view_mode')
      if (saved === 'grid' || saved === 'list') {
        setViewMode(saved)
      }
    } catch {}
  }, [])

  const handleToggleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode)
    try {
      localStorage.setItem('draft_view_mode', mode)
    } catch {}
  }

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

  const channelRef = useRef<any>(null)
  const reqIdRef = useRef(0)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const loadData = (silent: boolean = false) => {
    if (!leagueId) return
    const currentReqId = ++reqIdRef.current
    if (!silent && !data) {
      setLoading(true)
    }
    getDraftRoomData(leagueId)
      .then((res) => {
        if (currentReqId === reqIdRef.current) {
          setData(res)
          setLoading(false)
        }
      })
      .catch((err) => {
        console.error('[Draft] Erro ao carregar dados do draft:', err)
        if (currentReqId === reqIdRef.current) {
          setLoading(false)
        }
      })
  }

  const debouncedLoadData = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      loadData(true)
    }, 80)
  }

  // Clear selectedPlayer if they were drafted by someone else or if turn changed and not commissioner
  useEffect(() => {
    if (!selectedPlayer || !data) return
    const stillAvailable = data.availablePlayers.some((p) => p.id === selectedPlayer.id && !p.isPicked)
    const canStillPick = (data.isMyTurn || data.isCommissioner) && !data.isPaused
    if (!stillAvailable || !canStillPick) {
      setSelectedPlayer(null)
    }
  }, [data, selectedPlayer])

  useEffect(() => {
    loadData()

    // Supabase Realtime Subscription for live picks, league state, teams, and instant broadcast
    const supabase = createClient()
    const channel = supabase
      .channel(`draft:${leagueId}`)
      .on('broadcast', { event: 'draft_update' }, () => {
        debouncedLoadData()
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'draft_picks',
          filter: `league_id=eq.${leagueId}`,
        },
        () => debouncedLoadData()
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'leagues',
          filter: `id=eq.${leagueId}`,
        },
        () => debouncedLoadData()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fantasy_teams',
          filter: `league_id=eq.${leagueId}`,
        },
        () => debouncedLoadData()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'draft_queues',
        },
        () => debouncedLoadData()
      )
      .subscribe((status) => {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[Draft Realtime] Channel status:`, status)
        }
      })

    channelRef.current = channel

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [leagueId])

  // Polling fallback every 4 seconds while draft is in progress to ensure 100% sync
  useEffect(() => {
    if (data?.status !== 'drafting') return
    const interval = setInterval(() => {
      loadData(true)
    }, 4000)
    return () => clearInterval(interval)
  }, [data?.status, leagueId])

  // Group picks by round, ordered from oldest to newest (Round 1, Round 2, ...)
  const picksByRound = useMemo(() => {
    if (!data?.recentPicks || data.recentPicks.length === 0) return []
    const groups: { [round: number]: typeof data.recentPicks } = {}
    for (const pick of data.recentPicks) {
      if (!groups[pick.round]) {
        groups[pick.round] = []
      }
      groups[pick.round].push(pick)
    }
    return Object.entries(groups)
      .map(([roundStr, picks]) => [Number(roundStr), picks] as const)
      .sort(([a], [b]) => a - b)
  }, [data?.recentPicks])

  const notifyDraftUpdate = () => {
    try {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'draft_update',
        payload: { timestamp: Date.now() },
      })
    } catch {
      // Ignore broadcast send errors
    }
  }

  const handleConfirmPick = () => {
    if (!selectedPlayer || !data) return
    setPickError(null)

    startTransition(async () => {
      try {
        await submitPickAction(leagueId, selectedPlayer.id)
        setSelectedPlayer(null)
        notifyDraftUpdate()
        loadData(true)
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
        notifyDraftUpdate()
        loadData(true)
      } catch (err: any) {
        setPickError(err.message || 'Erro ao iniciar o draft.')
      }
    })
  }

  const handleTogglePause = () => {
    startTransition(async () => {
      try {
        await toggleDraftPauseAction(leagueId)
        notifyDraftUpdate()
        loadData(true)
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
        notifyDraftUpdate()
        loadData(true)
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
      notifyDraftUpdate()
      loadData(true)
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

  const availableCount = (data.availablePlayers || []).filter((p) => !p.isPicked).length
  const pickedCount = (data.availablePlayers || []).filter((p) => p.isPicked).length

  const normalizedSearch = normalizeText(search)
  const filteredPlayers = (data.availablePlayers || [])
    .filter((p) => {
      const matchesPos = posFilter === 'TODOS' || p.position === posFilter
      const matchesClub = clubFilter === 'TODOS' || p.clubId === clubFilter
      const matchesAvailability =
        availabilityFilter === 'ALL'
          ? true
          : availabilityFilter === 'AVAILABLE'
          ? !p.isPicked
          : p.isPicked
      const matchesSearch =
        !normalizedSearch ||
        normalizeText(p.name).includes(normalizedSearch) ||
        normalizeText(p.clubName).includes(normalizedSearch) ||
        normalizeText(p.clubShortName).includes(normalizedSearch)
      return matchesPos && matchesClub && matchesAvailability && matchesSearch
    })
    .sort((a, b) => {
      let comp = 0
      if (sortBy === 'avg') {
        comp = b.avgPoints - a.avgPoints
        if (comp === 0) comp = b.totalMinutes - a.totalMinutes
        if (comp === 0) comp = a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
        return sortDirection === 'desc' ? comp : -comp
      } else if (sortBy === 'minutes') {
        comp = b.totalMinutes - a.totalMinutes
        if (comp === 0) comp = b.avgPoints - a.avgPoints
        if (comp === 0) comp = a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
        return sortDirection === 'desc' ? comp : -comp
      } else {
        comp = a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
        return sortDirection === 'asc' ? comp : -comp
      }
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
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

              {data.isCommissioner && data.nextAutoPick && (
                <div
                  className={styles.nextAutoPickCard}
                  title="Jogador que será escolhido automaticamente caso o timer chegue a zero"
                >
                  <div className={styles.nextAutoPickHeaderRow}>
                    <span className={styles.nextAutoPickTitle}>
                      <span className={styles.nextAutoPickPulseDot} />
                      Se o tempo esgotar:
                    </span>
                    <span className={styles.nextAutoPickSourceBadge}>
                      {data.nextAutoPick.source === 'wishlist'
                        ? `⭐ #${data.nextAutoPick.wishlistPriority} da Fila Pré-Draft`
                        : `🤖 Auto-Pick Inteligente`}
                    </span>
                  </div>
                  <div className={styles.nextAutoPickPlayerRow}>
                    <strong className={styles.nextAutoPickPlayerName}>
                      {data.nextAutoPick.playerName}
                    </strong>
                    <Badge variant={data.nextAutoPick.position as any}>
                      {data.nextAutoPick.position}
                    </Badge>
                    {(data.nextAutoPick.clubShortName || data.nextAutoPick.clubName) && (
                      <span className={styles.nextAutoPickClubBadge}>
                        {data.nextAutoPick.clubShortName || data.nextAutoPick.clubName}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className={styles.controlsActionsRow}>
              {data.isPaused ? (
                <div className={styles.countdownPaused}>
                  ⏸️ Timer Pausado
                  {data.pausedRemainingSeconds ? (
                    <span style={{ fontSize: '0.8rem', opacity: 0.9, marginLeft: '6px' }}>
                      ({formatCountdown(data.pausedRemainingSeconds)})
                    </span>
                  ) : null}
                </div>
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
                <div className={styles.commissionerButtonsRow}>
                  <Button
                    variant="secondary"
                    size="sm"
                    className={styles.commissionerQueuesBtn}
                    onClick={() => {
                      setSelectedQueueTeamId(data.currentTurnTeamId)
                      setShowCommissionerQueuesModal(true)
                    }}
                    title="Visualizar as filas pré-draft cadastradas pelos times"
                  >
                    📋 Filas Pré-Draft
                  </Button>
                  <Button
                    variant={data.isPaused ? 'primary' : 'ghost'}
                    size="sm"
                    className={styles.pauseDraftBtn}
                    onClick={handleTogglePause}
                    isLoading={isPending}
                  >
                    {data.isPaused ? '▶️ Retomar Draft' : '⏸️ Pausar Draft'}
                  </Button>
                </div>
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
                  placeholder="🔍  Buscar jogador..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={styles.searchInput}
                />
              </div>
            </div>

            {/* Catalog Counter, Quick Availability Filter and View Mode Toggle */}
            <div className={styles.catalogCounterRow}>
              <div className={styles.catalogCounterLeft}>
                <span>
                  Exibindo <strong>{filteredPlayers.length}</strong> jogadores
                  {availabilityFilter === 'ALL' && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '6px' }}>
                      ({availableCount} disponíveis · {pickedCount} escolhidos)
                    </span>
                  )}
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

              <div className={styles.counterRightControls}>
                {/* Sort Order Filter */}
                <div className={styles.sortFilterGroup}>
                  <span className={styles.sortLabel}>Ordenar:</span>
                  <button
                    type="button"
                    onClick={() => handleSort('avg')}
                    className={`${styles.sortBtn} ${
                      sortBy === 'avg' ? styles.sortBtnActive : ''
                    }`}
                    title="Ordenar por Média de Pontos"
                  >
                    ⭐ Média {sortBy === 'avg' ? (sortDirection === 'desc' ? '↓' : '↑') : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSort('minutes')}
                    className={`${styles.sortBtn} ${
                      sortBy === 'minutes' ? styles.sortBtnActive : ''
                    }`}
                    title="Ordenar por Minutos Jogados"
                  >
                    ⏱️ Minutos {sortBy === 'minutes' ? (sortDirection === 'desc' ? '↓' : '↑') : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSort('name')}
                    className={`${styles.sortBtn} ${
                      sortBy === 'name' ? styles.sortBtnActive : ''
                    }`}
                    title="Ordenar por Ordem Alfabética"
                  >
                    🔤 A-Z {sortBy === 'name' ? (sortDirection === 'asc' ? '↓' : '↑') : ''}
                  </button>
                </div>

                {/* Availability Filter Buttons */}
                <div className={styles.availabilityFilterGroup}>
                  <button
                    type="button"
                    onClick={() => setAvailabilityFilter('ALL')}
                    className={`${styles.availBtn} ${
                      availabilityFilter === 'ALL' ? styles.availBtnActive : ''
                    }`}
                    title="Exibir todos os jogadores"
                  >
                    Todos ({data.availablePlayers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAvailabilityFilter('AVAILABLE')}
                    className={`${styles.availBtn} ${
                      availabilityFilter === 'AVAILABLE' ? styles.availBtnActive : ''
                    }`}
                    title="Exibir apenas jogadores ainda disponíveis"
                  >
                    Disponíveis ({availableCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAvailabilityFilter('PICKED')}
                    className={`${styles.availBtn} ${
                      availabilityFilter === 'PICKED' ? styles.availBtnActive : ''
                    }`}
                    title="Exibir apenas jogadores já escolhidos"
                  >
                    Escolhidos ({pickedCount})
                  </button>
                </div>

                {/* View Mode Toggle */}
                <div className={styles.viewModeToggle}>
                  <button
                    type="button"
                    onClick={() => handleToggleViewMode('grid')}
                    className={`${styles.viewModeBtn} ${
                      viewMode === 'grid' ? styles.viewModeBtnActive : ''
                    }`}
                    title="Visualização em Cards"
                  >
                    <span>🪟</span>
                    <span>Cards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleViewMode('list')}
                    className={`${styles.viewModeBtn} ${
                      viewMode === 'list' ? styles.viewModeBtnActive : ''
                    }`}
                    title="Visualização em Listagem"
                  >
                    <span>☰</span>
                    <span>Lista</span>
                  </button>
                </div>
              </div>
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

            {/* Players Grid or List Table View */}
            {viewMode === 'grid' ? (
              <div className={styles.playerGrid}>
                {filteredPlayers.map((player) => {
                  const isSelected = selectedPlayer?.id === player.id
                  const inWishlist = wishlistPlayerIds.has(player.id)
                  const canPick = (data.isMyTurn || data.isCommissioner) && !data.isPaused && !player.isPicked
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
                        player.isPicked ? styles.playerCardPicked : ''
                      } ${canPick ? styles.playerCardSelectable : ''} ${
                        inWishlist ? styles.playerCardInWishlist : ''
                      }`}
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
                        {/* Picked Indicator Banner */}
                        {player.isPicked && (
                          <div className={styles.pickedBanner}>
                            <span className={styles.pickedBannerIcon}>🔒</span>
                            <div className={styles.pickedBannerText}>
                              <span className={styles.pickedTeamName}>
                                Escolhido por {player.pickedByTeam}
                              </span>
                              <span className={styles.pickedRoundDetail}>
                                Rodada {player.pickedRound} · Pick #{player.pickedNumber}
                              </span>
                            </div>
                          </div>
                        )}

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
                            {!player.isPicked && player.interestCount > 0 ? (
                              <span
                                className={styles.interestBadge}
                                title={`${player.interestCount} times têm este jogador na fila`}
                              >
                                🔥 {player.interestCount}{' '}
                                {player.interestCount === 1 ? 'time interessado' : 'times interessados'}
                              </span>
                            ) : !player.isPicked ? (
                              <span className={styles.interestBadgeZero}>0 na fila</span>
                            ) : null}
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
                          className={player.isPicked ? styles.btnDetailFull : styles.btnDetail}
                          title="Ver ficha técnica completa e scouts"
                        >
                          🔍 Ficha
                        </button>

                        {!player.isPicked && (
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
                        )}

                        {player.isPicked ? (
                          <span
                            className={styles.btnPickedDisabled}
                            title={`Escolhido por ${player.pickedByTeam} na Rodada ${player.pickedRound}`}
                          >
                            🔒 Rodada {player.pickedRound}
                          </span>
                        ) : canPick ? (
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
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className={styles.playerTableContainer}>
                <table className={styles.playerTable}>
                  <thead>
                    <tr>
                      <th className={styles.tableColPos} style={{ width: '60px' }}>Pos</th>
                      <th
                        className={`${styles.tableColPlayer} ${styles.tableSortableTh}`}
                        onClick={() => handleSort('name')}
                        title="Clique para ordenar por nome"
                      >
                        Jogador {sortBy === 'name' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th className={styles.tableColClub}>Clube</th>
                      <th
                        className={`${styles.tableColAvg} ${styles.tableSortableTh}`}
                        style={{ textAlign: 'center', width: '75px' }}
                        onClick={() => handleSort('avg')}
                        title="Clique para ordenar por média de pontos"
                      >
                        Média {sortBy === 'avg' ? (sortDirection === 'desc' ? '▼' : '▲') : ''}
                      </th>
                      <th
                        className={`${styles.hideMobile} ${styles.tableSortableTh}`}
                        style={{ textAlign: 'center', width: '75px' }}
                        onClick={() => handleSort('minutes')}
                        title="Clique para ordenar por minutos jogados"
                      >
                        Minutos {sortBy === 'minutes' ? (sortDirection === 'desc' ? '▼' : '▲') : ''}
                      </th>
                      <th className={styles.tableColActions} style={{ textAlign: 'right', width: '160px' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlayers.map((player) => {
                      const isSelected = selectedPlayer?.id === player.id
                      const inWishlist = wishlistPlayerIds.has(player.id)
                      const canPick = (data.isMyTurn || data.isCommissioner) && !data.isPaused && !player.isPicked
                      const isCommishPick = !data.isMyTurn && data.isCommissioner

                      return (
                        <tr
                          key={player.id}
                          onClick={() => {
                            if (canPick) {
                              setSelectedPlayer(player)
                            } else {
                              setModalPlayerId(player.id)
                            }
                          }}
                          className={`${styles.playerTableRow} ${
                            player.isPicked ? styles.rowPicked : ''
                          } ${
                            canPick ? styles.playerTableRowSelectable : ''
                          } ${
                            isSelected
                              ? isCommishPick
                                ? styles.rowSelectedCommish
                                : styles.rowSelectedMine
                              : ''
                          } ${inWishlist ? styles.rowInWishlist : ''}`}
                        >
                          <td className={styles.tableColPos}>
                            <Badge variant={player.position as any}>{player.position}</Badge>
                          </td>
                          <td className={styles.tableColPlayer}>
                            <div className={styles.tablePlayerCell}>
                              <div className={styles.tablePlayerPhotoWrapper}>
                                {player.photoUrl ? (
                                  <img
                                    src={player.photoUrl}
                                    alt={player.name}
                                    className={styles.tablePlayerPhoto}
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
                                  <span className={styles.tablePlayerPhotoPlaceholder}>👤</span>
                                )}
                              </div>
                              <div className={styles.tablePlayerInfo}>
                                <div className={styles.tablePlayerNameRow}>
                                  <strong className={styles.tablePlayerName}>{player.name}</strong>
                                  {!player.isPicked && player.interestCount > 0 && (
                                    <span
                                      className={styles.tableInterestBadge}
                                      title={`${player.interestCount} times têm este jogador na fila`}
                                    >
                                      🔥 {player.interestCount}
                                    </span>
                                  )}
                                </div>
                                {player.isPicked && (
                                  <span
                                    className={styles.tablePickedBadge}
                                    title={`Escolhido por ${player.pickedByTeam} na Rodada ${player.pickedRound} (Pick #${player.pickedNumber})`}
                                  >
                                    🔒 {player.pickedByTeam} · R{player.pickedRound} (#{player.pickedNumber})
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className={styles.tableColClub}>
                            <div className={styles.tableClubCell}>
                              {player.clubLogoUrl && (
                                <img
                                    src={player.clubLogoUrl}
                                    alt={player.clubShortName}
                                    className={styles.tableClubLogo}
                                    loading="lazy"
                                  />
                              )}
                              <span>{player.clubShortName || player.clubName}</span>
                            </div>
                          </td>
                          <td className={styles.tableColAvg} style={{ textAlign: 'center' }}>
                            <strong className={styles.tableAvgPts}>{player.avgPoints.toFixed(1)}</strong>
                          </td>
                          <td
                            className={styles.hideMobile}
                            style={{ textAlign: 'center', color: 'var(--text-muted)' }}
                          >
                            {player.totalMinutes}&apos;
                          </td>
                          <td className={styles.tableColActions}>
                            <div
                              className={styles.tableActionsCell}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => setModalPlayerId(player.id)}
                                className={styles.tableBtnDetail}
                                title="Ver ficha técnica"
                              >
                                🔍 <span className={styles.tableBtnTextMobile}>Ficha</span>
                              </button>
                              {!player.isPicked && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleWishlist(player.id)}
                                  className={`${styles.tableBtnWishlist} ${
                                    inWishlist ? styles.tableBtnWishlistActive : ''
                                  }`}
                                  title={inWishlist ? 'Remover da Fila' : 'Adicionar à Fila'}
                                >
                                  {inWishlist ? '⭐ Fila' : '+ Fila'}
                                </button>
                              )}
                              {player.isPicked ? (
                                <span
                                  className={styles.tablePickedTag}
                                  title={`Escolhido por ${player.pickedByTeam} na Rodada ${player.pickedRound}`}
                                >
                                  🔒 R{player.pickedRound} ({player.pickedByTeam})
                                </span>
                              ) : canPick ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedPlayer(player)}
                                  className={
                                    isCommishPick
                                      ? styles.btnPickCommishSmall
                                      : styles.btnPickThisSmall
                                  }
                                  title={
                                    isCommishPick
                                      ? 'Escolher pelo time da vez'
                                      : 'Escolher este jogador'
                                  }
                                >
                                  {isSelected ? '✓ Selecionado' : '🎯 Escolher'}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
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

            {/* Radar de Elenco */}
            <div className={styles.radarCard}>
              <div className={styles.radarHeader}>
                <div className={styles.radarTitleGroup}>
                  <span className={styles.radarShieldIcon}>
                    <svg width="16" height="19" viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <clipPath id="radarShieldClip">
                          <path d="M12 2L3 5.5V13.5C3 19.5 7.5 24.5 12 26C16.5 24.5 21 19.5 21 13.5V5.5L12 2Z" />
                        </clipPath>
                      </defs>
                      <g clipPath="url(#radarShieldClip)">
                        <rect width="24" height="28" fill="#ffffff" />
                        <rect x="0" y="0" width="4.8" height="28" fill="#ef4444" />
                        <rect x="9.6" y="0" width="4.8" height="28" fill="#ef4444" />
                        <rect x="19.2" y="0" width="4.8" height="28" fill="#ef4444" />
                      </g>
                      <path d="M12 2L3 5.5V13.5C3 19.5 7.5 24.5 12 26C16.5 24.5 21 19.5 21 13.5V5.5L12 2Z" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
                    </svg>
                  </span>
                  <h3 className={styles.radarTitle}>
                    RADAR DE ELENCO <span className={styles.radarCountHeader}>({totalDrafted}/24)</span>
                  </h3>
                </div>
                <div className={styles.radarVacanciesBadge}>
                  {remainingRosterSlots === 0
                    ? 'ELENCO COMPLETO'
                    : `${remainingRosterSlots} ${remainingRosterSlots === 1 ? 'VAGA RESTANTE' : 'VAGAS RESTANTES'}`}
                </div>
              </div>

              <div className={styles.radarPositionsList}>
                {RADAR_POSITIONS.map((pos) => {
                  const players = rosterByPosition[pos.key] || []
                  const count = players.length
                  const pct = Math.min(100, Math.round((count / pos.target) * 100))

                  let statusBadge: React.ReactNode = null
                  if (pos.key === 'GOL') {
                    if (count === 0) {
                      statusBadge = <span className={styles.radarStatusCritical}>CRÍTICO</span>
                    } else if (count < pos.target) {
                      statusBadge = <span className={styles.radarStatusDeficit}>(-{pos.target - count})</span>
                    } else {
                      statusBadge = <span className={styles.radarStatusComplete}>OK</span>
                    }
                  } else if (pos.key === 'LAT' || pos.key === 'ZAG') {
                    const minRequired = 2
                    if (count === 0) {
                      statusBadge = <span className={styles.radarStatusPriority}>PRIORIDADE (mín 2)</span>
                    } else if (count < minRequired) {
                      statusBadge = <span className={styles.radarStatusDeficit}>(-{minRequired - count} p/ mín 2)</span>
                    } else if (defTotal >= 8) {
                      statusBadge = <span className={styles.radarStatusComplete}>OK</span>
                    } else {
                      statusBadge = <span className={styles.radarStatusDeficit}>(-{8 - defTotal} DEF)</span>
                    }
                  } else {
                    // MEI (8) & ATA (6)
                    if (count === 0) {
                      statusBadge = <span className={styles.radarStatusPriority}>PRIORIDADE</span>
                    } else if (count < pos.target) {
                      statusBadge = <span className={styles.radarStatusDeficit}>(-{pos.target - count})</span>
                    } else if (count === pos.target) {
                      statusBadge = <span className={styles.radarStatusComplete}>OK</span>
                    } else {
                      statusBadge = <span className={styles.radarStatusComplete}>(+{count - pos.target})</span>
                    }
                  }

                  return (
                    <div key={pos.key} className={styles.radarPositionRow}>
                      <div className={styles.radarPositionHeader}>
                        <span className={styles.radarPositionLabel} style={{ color: pos.color }}>
                          {pos.label}
                        </span>
                        <div className={styles.radarPositionStats}>
                          <span className={styles.radarCountFraction}>
                            {count} / {pos.target}
                          </span>
                          {statusBadge}
                        </div>
                      </div>

                      <div className={styles.radarProgressBarTrack}>
                        <div
                          className={styles.radarProgressBarFill}
                          style={{
                            width: `${pct}%`,
                            backgroundColor: pos.color,
                          }}
                        />
                      </div>

                      {count > 0 && (
                        <div className={styles.radarPlayersSubtext}>
                          <span>•</span>
                          {players.map((p, idx) => (
                            <span key={p.id || idx}>
                              <button
                                type="button"
                                className={styles.radarPlayerBtn}
                                onClick={() => setModalPlayerId(p.id)}
                                title="Ver detalhes do jogador"
                              >
                                {p.name}
                              </button>
                              {idx < players.length - 1 && ', '}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Mini indicador consolidado de Defensores (8 no total, mín. 2Z, 2L) */}
                      {pos.key === 'ZAG' && (
                        <div className={styles.radarDefSubRow}>
                          <span className={styles.radarDefSubRowText}>
                            🛡️ Total Defesa (mín. 2Z, 2L):
                          </span>
                          <span
                            className={styles.radarDefSubRowValue}
                            style={{
                              color:
                                defTotal >= 8 &&
                                (rosterByPosition['LAT']?.length || 0) >= 2 &&
                                (rosterByPosition['ZAG']?.length || 0) >= 2
                                  ? '#34d399'
                                  : defTotal > 0
                                  ? '#e2e8f0'
                                  : '#f87171',
                            }}
                          >
                            {defTotal} / 8{' '}
                            {defTotal >= 8 ? '(OK)' : `(-${8 - defTotal})`}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className={styles.radarFooter}>
                <span className={styles.radarFooterLabel}>Regra do Elenco:</span>
                <span className={styles.radarFooterValue}>2G · 8DEF (mín 2Z, 2L) · 8M · 6A</span>
              </div>
            </div>

            {/* Feed / Histórico de Escolhas por Rodada */}
            <div className={styles.sidebarSection}>
              <div className={styles.sidebarHeaderRow}>
                <h3 className={styles.sidebarTitle}>
                  Histórico de Picks ({data.recentPicks.length})
                </h3>
              </div>
              <div className={styles.historyList}>
                {picksByRound.length === 0 ? (
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Nenhuma escolha realizada ainda.
                  </span>
                ) : (
                  picksByRound.map(([roundNum, roundPicks]) => (
                    <div key={roundNum} className={styles.historyRoundGroup}>
                      <div className={styles.historyRoundHeader}>
                        <span className={styles.historyRoundTitle}>Rodada {roundNum}</span>
                        <span className={styles.historyRoundCount}>
                          {roundPicks.length} {roundPicks.length === 1 ? 'escolha' : 'escolhas'}
                        </span>
                      </div>
                      <div className={styles.historyRoundPicks}>
                        {roundPicks.map((pick) => (
                          <div key={pick.pickNumber} className={styles.historyItem}>
                            <div className={styles.historyItemLeft}>
                              <span className={styles.historyPickNum}>#{pick.pickNumber}</span>
                              <span className={styles.historyTeamName}>{pick.teamName}:</span>
                              <strong className={styles.historyPlayerName} title={pick.playerName}>
                                {pick.playerName}
                              </strong>
                              {pick.isAutoPick && (
                                <span
                                  className={styles.historyAutoBadge}
                                  title="Escolha Automática"
                                >
                                  🤖
                                </span>
                              )}
                            </div>
                            <Badge variant={pick.position as any}>{pick.position}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
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

      {/* Commissioner Pre-Draft Queues Modal */}
      {showCommissionerQueuesModal && data?.allTeamQueues && (
        <div
          className={styles.queuesModalOverlay}
          onClick={() => setShowCommissionerQueuesModal(false)}
        >
          <div
            className={styles.queuesModalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.queuesModalHeader}>
              <h3 className={styles.queuesModalTitle}>
                📋 Filas Pré-Draft dos Times
              </h3>
              <button
                type="button"
                className={styles.queuesModalCloseBtn}
                onClick={() => setShowCommissionerQueuesModal(false)}
              >
                ✕
              </button>
            </div>

            {/* Team selection tabs */}
            <div className={styles.queuesTeamTabs}>
              {data.allTeamQueues.map((t) => {
                const isSelected = (selectedQueueTeamId || data.currentTurnTeamId) === t.teamId
                const isOnClock = data.currentTurnTeamId === t.teamId
                return (
                  <button
                    key={t.teamId}
                    type="button"
                    className={`${styles.queuesTeamTab} ${
                      isSelected ? styles.queuesTeamTabActive : ''
                    } ${isOnClock && !isSelected ? styles.queuesTeamTabOnClock : ''}`}
                    onClick={() => setSelectedQueueTeamId(t.teamId)}
                  >
                    <span>{t.teamName}</span>
                    <span style={{ fontSize: '0.72rem', opacity: 0.85 }}>
                      ({t.queue.length})
                    </span>
                    {isOnClock && <span style={{ fontSize: '0.65rem' }}>⏱️ Na Vez</span>}
                  </button>
                )
              })}
            </div>

            {/* Body showing selected team's queue */}
            <div className={styles.queuesModalBody}>
              {(() => {
                const currentSelectedTeam =
                  data.allTeamQueues.find(
                    (t) => t.teamId === (selectedQueueTeamId || data.currentTurnTeamId)
                  ) || data.allTeamQueues[0]

                if (!currentSelectedTeam) return null

                const isOnClock = currentSelectedTeam.teamId === data.currentTurnTeamId

                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <strong style={{ color: '#f8fafc', fontSize: '1rem' }}>
                          {currentSelectedTeam.teamName}
                        </strong>
                        <span style={{ color: '#94a3b8', fontSize: '0.8rem', marginLeft: '8px' }}>
                          {currentSelectedTeam.queue.length} jogador(es) na fila
                        </span>
                      </div>
                      {isOnClock && data.nextAutoPick && (
                        <div style={{ fontSize: '0.75rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '3px 8px', borderRadius: '4px' }}>
                          ⏱️ Próximo se tempo esgotar: <strong>{data.nextAutoPick.playerName}</strong> ({data.nextAutoPick.position})
                        </div>
                      )}
                    </div>

                    {currentSelectedTeam.queue.length === 0 ? (
                      <div className={styles.queuesEmptyNotice}>
                        <span style={{ fontSize: '1.5rem' }}>📭</span>
                        <strong style={{ color: '#e2e8f0' }}>Nenhum jogador na fila pré-draft</strong>
                        <span>
                          Este time não configurou uma lista de preferências. Caso o tempo acabe,
                          o sistema selecionará automaticamente o jogador com maior média para a posição mais carente do elenco.
                        </span>
                      </div>
                    ) : (
                      <div className={styles.queuesList}>
                        {currentSelectedTeam.queue.map((item) => (
                          <div
                            key={item.playerId}
                            className={`${styles.queuesItem} ${
                              !item.isAvailable ? styles.queuesItemUnavailable : ''
                            }`}
                          >
                            <div className={styles.queuesItemLeft}>
                              <span className={styles.queuesPriorityBadge}>#{item.priority}</span>
                              <div className={styles.queuesPlayerInfo}>
                                <span className={styles.queuesPlayerName}>{item.playerName}</span>
                                <span className={styles.queuesPlayerSub}>
                                  {item.clubShortName || 'Clube'}
                                </span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Badge variant={item.position as any}>{item.position}</Badge>
                              {item.isAvailable ? (
                                <span className={`${styles.queuesStatusBadge} ${styles.queuesStatusAvailable}`}>
                                  🟢 Disponível
                                </span>
                              ) : (
                                <span className={`${styles.queuesStatusBadge} ${styles.queuesStatusPicked}`}>
                                  ⛔ Já Escolhido
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
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
