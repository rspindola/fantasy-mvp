'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getLineupData, saveLineupAction, type LineupPageData } from './actions'
import {
  FORMATION_REQUIREMENTS,
  FORMATIONS_LIST,
  type Formation,
  type LineupSlotItem,
} from '@/lib/lineup/lineup-engine'
import { SoccerPitch } from '@/components/lineup/SoccerPitch'
import { Button } from '@/components/ui/Button'
import { PlayerDetailModal } from '@/components/player/PlayerDetailModal'
import styles from './page.module.css'

const POSITION_NAMES: Record<string, string> = {
  GOL: 'Goleiro',
  LAT: 'Lateral',
  ZAG: 'Zagueiro',
  MEI: 'Meia',
  ATA: 'Atacante',
}

type ModalState =
  | { type: 'formation'; newFormation: Formation; removedPlayers: string[] }
  | { type: 'clear' }
  | null

type SelectionTarget = {
  type: 'starter' | 'reserve'
  position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
  slotIndex?: number
  currentPlayerId?: string
} | null

type ActionSheetTarget = {
  player: LineupPageData['roster'][0]
  starterItem: LineupSlotItem
  slotIndex: number
} | null

export default function LineupPage() {
  const params = useParams()
  const leagueId = params.id as string

  const [data, setData] = useState<LineupPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [formation, setFormation] = useState<Formation>('4-4-2')
  const [starters, setStarters] = useState<LineupSlotItem[]>([])
  const [reserves, setReserves] = useState<LineupSlotItem[]>([])
  const [benchCollapsed, setBenchCollapsed] = useState(false)

  // Selection & Actions Modals
  const [selectionTarget, setSelectionTarget] = useState<SelectionTarget>(null)
  const [selectionPosFilter, setSelectionPosFilter] = useState<string>('TODOS')
  const [selectionSearch, setSelectionSearch] = useState('')
  const [selectionShowUsed, setSelectionShowUsed] = useState(false)

  // Desktop Side Panel State
  const [panelPosFilter, setPanelPosFilter] = useState<string>('TODOS')
  const [panelSearch, setPanelSearch] = useState('')
  const [webActiveSlot, setWebActiveSlot] = useState<{
    type: 'starter' | 'reserve'
    position: string
    slotIndex?: number
    currentPlayerId?: string
  } | null>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const [now, setNow] = useState<number>(() => Date.now())

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 1024)
    checkDesktop()
    window.addEventListener('resize', checkDesktop)
    return () => window.removeEventListener('resize', checkDesktop)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const [actionSheetTarget, setActionSheetTarget] = useState<ActionSheetTarget>(null)
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [isRosterDrawerOpen, setIsRosterDrawerOpen] = useState(false)

  const [isPending, startTransition] = useTransition()
  const [saveMessage, setSaveMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  const loadData = useCallback(() => {
    if (leagueId) {
      getLineupData(leagueId).then((res) => {
        if (res) {
          setData(res)
          setFormation(res.formation)
          setStarters(
            res.starters.map((s) => ({
              playerId: s.playerId,
              position: s.position,
              isCaptain: s.isCaptain,
              isStarter: true,
            }))
          )
          setReserves(
            (res.reserves || []).map((r) => ({
              playerId: r.playerId,
              position: r.position,
              isCaptain: false,
              isStarter: false,
            }))
          )
        }
        setLoading(false)
      })
    }
  }, [leagueId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // When selection target opens, sync filter to target's position and hide used players by default
  useEffect(() => {
    if (selectionTarget) {
      setSelectionPosFilter(selectionTarget.position)
      setSelectionSearch('')
      setSelectionShowUsed(false)
    }
  }, [selectionTarget])

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
          <p>Carregando Escalação...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '16px' }}>Escalação não disponível</h2>
          <Link href="/dashboard">
            <Button size="md">Voltar ao Painel</Button>
          </Link>
        </div>
      </div>
    )
  }

  const starterPlayerIds = new Set(starters.map((s) => s.playerId))
  const reservePlayerIds = new Set(reserves.map((r) => r.playerId))
  const reqs = FORMATION_REQUIREMENTS[formation] || FORMATION_REQUIREMENTS['4-4-2']

  // ── Market Closing & Live Countdown Calculations ──
  const marketCloseTimestamp = data.kickoffAt
    ? new Date(data.kickoffAt).getTime() - 30 * 60 * 1000
    : null

  const isMarketDynamicallyLocked =
    data.isLocked || (marketCloseTimestamp !== null && now >= marketCloseTimestamp)

  // ── Formation Change ──

  const handleFormationChange = (newFormation: Formation) => {
    if (isMarketDynamicallyLocked) return
    setSaveMessage(null)

    const newReqs = FORMATION_REQUIREMENTS[newFormation]
    const posCounts: Record<string, number> = { GOL: 0, LAT: 0, ZAG: 0, MEI: 0, ATA: 0 }
    const keptStarters: LineupSlotItem[] = []
    const removedNames: string[] = []

    const sortedCurrent = [...starters].sort((a, b) => {
      const pa = data.roster.find((r) => r.id === a.playerId)
      const pb = data.roster.find((r) => r.id === b.playerId)
      return (pb?.avgPoints ?? 0) - (pa?.avgPoints ?? 0)
    })

    for (const s of sortedCurrent) {
      if (posCounts[s.position] < newReqs[s.position]) {
        posCounts[s.position]++
        keptStarters.push(s)
      } else {
        const playerName = data.roster.find((r) => r.id === s.playerId)?.name ?? 'Jogador'
        removedNames.push(`${playerName} (${s.position})`)
      }
    }

    if (removedNames.length > 0) {
      setModal({ type: 'formation', newFormation, removedPlayers: removedNames })
    } else {
      setFormation(newFormation)
    }
  }

  const confirmFormationChange = () => {
    if (modal?.type !== 'formation') return
    const newFormation = modal.newFormation
    const newReqs = FORMATION_REQUIREMENTS[newFormation]

    const posCounts: Record<string, number> = { GOL: 0, LAT: 0, ZAG: 0, MEI: 0, ATA: 0 }
    const keptStarters: LineupSlotItem[] = []
    const sortedCurrent = [...starters].sort((a, b) => {
      const pa = data.roster.find((r) => r.id === a.playerId)
      const pb = data.roster.find((r) => r.id === b.playerId)
      return (pb?.avgPoints ?? 0) - (pa?.avgPoints ?? 0)
    })

    for (const s of sortedCurrent) {
      if (posCounts[s.position] < newReqs[s.position]) {
        posCounts[s.position]++
        keptStarters.push(s)
      }
    }

    if (keptStarters.length > 0 && !keptStarters.some((s) => s.isCaptain)) {
      keptStarters[0].isCaptain = true
    }

    setFormation(newFormation)
    setStarters(keptStarters)
    setModal(null)
    setSaveMessage({
      type: 'success',
      text: `Formação alterada para ${newFormation}.`,
    })
  }

  // ── Clear Lineup Handling ──

  const handleClearLineup = () => {
    if (isMarketDynamicallyLocked) return
    if (starters.length === 0 && reserves.length === 0) return
    setModal({ type: 'clear' })
  }

  const confirmClearLineup = () => {
    setStarters([])
    setReserves([])
    setModal(null)
    setSaveMessage({
      type: 'success',
      text: 'Escalação limpa com sucesso! Todos os atletas estão disponíveis.',
    })
  }

  // ── Captain Handling ──

  const handleMakeCaptain = (playerId: string) => {
    if (isMarketDynamicallyLocked) return
    setStarters((prev) =>
      prev.map((s) => ({
        ...s,
        isCaptain: s.playerId === playerId,
      }))
    )
    setActionSheetTarget(null)
  }

  // ── Removals ──

  const handleRemoveStarter = (playerId: string) => {
    if (isMarketDynamicallyLocked) return
    setStarters((prev) => {
      const remaining = prev.filter((s) => s.playerId !== playerId)
      if (remaining.length > 0 && !remaining.some((s) => s.isCaptain)) {
        remaining[0].isCaptain = true
      }
      return remaining
    })
    setActionSheetTarget(null)
  }

  const handleRemoveReserve = (playerId: string) => {
    if (isMarketDynamicallyLocked) return
    setReserves((prev) => prev.filter((r) => r.playerId !== playerId))
  }

  // ── Unified Player Selection Execution ──

  const executePlayerSelection = (
    player: LineupPageData['roster'][0],
    target: {
      type: 'starter' | 'reserve'
      position: string
      slotIndex?: number
      currentPlayerId?: string
    }
  ): boolean => {
    if (isMarketDynamicallyLocked) return false
    const { type, currentPlayerId } = target

    if (type === 'starter') {
      // 1. Remove from reserves if they were there
      setReserves((prev) => prev.filter((r) => r.playerId !== player.id))

      // 2. If replacing an existing starter in this slot
      if (currentPlayerId) {
        setStarters((prev) => {
          const wasCaptain = prev.find((s) => s.playerId === currentPlayerId)?.isCaptain ?? false
          return prev.map((s) => {
            if (s.playerId === currentPlayerId) {
              return {
                ...s,
                playerId: player.id,
                position: player.position,
                isCaptain: wasCaptain,
              }
            }
            // If the newly selected player was in another starter slot, swap them
            if (s.playerId === player.id) {
              return {
                ...s,
                playerId: currentPlayerId,
                position: player.position,
              }
            }
            return s
          })
        })
      } else {
        // Adding into an empty slot
        if (starterPlayerIds.has(player.id)) {
          setSaveMessage({ type: 'error', text: `${player.name} já está escalado como titular.` })
          return false
        }

        const currentPosCount = starters.filter((s) => s.position === player.position).length
        const maxPosAllowed = reqs[player.position] || 0
        if (currentPosCount >= maxPosAllowed) {
          setSaveMessage({
            type: 'error',
            text: `A formação ${formation} permite no máximo ${maxPosAllowed} de ${player.position}.`,
          })
          return false
        }

        const isFirstCaptain = starters.length === 0 || !starters.some((s) => s.isCaptain)
        setStarters((prev) => [
          ...prev,
          {
            playerId: player.id,
            position: player.position,
            isCaptain: isFirstCaptain,
            isStarter: true,
          },
        ])
      }
    } else if (type === 'reserve') {
      // 1. If player was in starters, remove from starters
      if (starterPlayerIds.has(player.id)) {
        setStarters((prev) => {
          const remaining = prev.filter((s) => s.playerId !== player.id)
          if (remaining.length > 0 && !remaining.some((s) => s.isCaptain)) {
            remaining[0].isCaptain = true
          }
          return remaining
        })
      }

      // 2. Set as reserve for this position
      setReserves((prev) => [
        ...prev.filter((r) => r.position !== player.position),
        {
          playerId: player.id,
          position: player.position,
          isCaptain: false,
          isStarter: false,
        },
      ])
    }

    return true
  }

  // Mobile Selection Drawer handler
  const handleSelectPlayer = (player: LineupPageData['roster'][0]) => {
    if (!selectionTarget) return
    executePlayerSelection(player, selectionTarget)
    setSelectionTarget(null)
  }

  // Desktop Side Panel inline selection handler
  const handleSelectPlayerFromPanel = (player: LineupPageData['roster'][0]) => {
    if (!webActiveSlot) return
    const success = executePlayerSelection(player, webActiveSlot)
    if (success) {
      const pos = webActiveSlot.position
      const slotType = webActiveSlot.type === 'starter' ? 'titular' : 'reserva'
      setWebActiveSlot(null)
      setSaveMessage({
        type: 'success',
        text: `${player.name} escalado como ${slotType} (${pos})!`,
      })
    }
  }

  // ── Save Lineup ──

  const handleSaveLineup = () => {
    if (isMarketDynamicallyLocked) return
    setSaveMessage(null)

    if (starters.length !== 11) {
      setSaveMessage({
        type: 'error',
        text: `Escalação incompleta (${starters.length}/11). Preencha todas as posições antes de salvar.`,
      })
      return
    }

    startTransition(async () => {
      try {
        await saveLineupAction(
          leagueId,
          data.teamId,
          data.currentRound,
          formation,
          starters,
          reserves
        )
        setSaveMessage({ type: 'success', text: 'Escalação salva com sucesso!' })
        loadData()
      } catch (err: any) {
        setSaveMessage({ type: 'error', text: err.message || 'Erro ao salvar escalação.' })
      }
    })
  }

  // ── Filtered Roster for Selection Drawer ──

  const filteredSelectionRoster = data.roster.filter((p) => {
    if (selectionPosFilter !== 'TODOS' && p.position !== selectionPosFilter) return false
    // By default, hide players who are already in starting 11 or bench
    if (!selectionShowUsed && (starterPlayerIds.has(p.id) || reservePlayerIds.has(p.id))) {
      return false
    }
    if (selectionSearch.trim()) {
      const q = selectionSearch.toLowerCase()
      const matchName = p.name.toLowerCase().includes(q)
      const matchClub = p.clubShortName.toLowerCase().includes(q)
      if (!matchName && !matchClub) return false
    }
    return true
  })

  // ── Filtered Roster for Desktop Side Panel ──

  const filteredPanelRoster = data.roster.filter((p) => {
    if (panelPosFilter !== 'TODOS' && p.position !== panelPosFilter) return false
    if (panelSearch.trim()) {
      const q = panelSearch.toLowerCase()
      const matchName = p.name.toLowerCase().includes(q)
      const matchClub = p.clubShortName.toLowerCase().includes(q)
      if (!matchName && !matchClub) return false
    }
    return true
  })

  // ── Format closing date label (e.g. "Sáb (10/10) às 16:30", "Hoje às 16:30")
  let marketCloseLabel = '16:30'
  let countdownText: string | null = null

  if (marketCloseTimestamp) {
    const closeDate = new Date(marketCloseTimestamp)
    const today = new Date(now)
    const isToday =
      closeDate.getDate() === today.getDate() &&
      closeDate.getMonth() === today.getMonth() &&
      closeDate.getFullYear() === today.getFullYear()

    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const isTomorrow =
      closeDate.getDate() === tomorrow.getDate() &&
      closeDate.getMonth() === tomorrow.getMonth() &&
      closeDate.getFullYear() === tomorrow.getFullYear()

    const timeStr = closeDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

    if (isToday) {
      marketCloseLabel = `Hoje às ${timeStr}`
    } else if (isTomorrow) {
      marketCloseLabel = `Amanhã às ${timeStr}`
    } else {
      const weekday = closeDate.toLocaleDateString('pt-BR', { weekday: 'short' })
      const capitalWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1).replace('.', '')
      const dayMonth = closeDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      marketCloseLabel = `${capitalWeekday} (${dayMonth}) às ${timeStr}`
    }

    const diff = marketCloseTimestamp - now
    if (diff <= 0) {
      countdownText = 'Fechando...'
    } else {
      const totalSecs = Math.floor(diff / 1000)
      const days = Math.floor(totalSecs / 86400)
      const hours = Math.floor((totalSecs % 86400) / 3600)
      const minutes = Math.floor((totalSecs % 3600) / 60)
      const seconds = totalSecs % 60
      const pad = (n: number) => n.toString().padStart(2, '0')

      if (days > 0) {
        countdownText = `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`
      } else {
        countdownText = `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`
      }
    }
  }

  return (
    <div className={styles.container}>
      {/* ── Top Bar ── */}
      <div className={styles.topBar}>
        <div className={styles.titleArea}>
          <div className={styles.titleRow}>
            <h1 className={styles.teamName}>{data.teamName}</h1>
            <span className={styles.roundBadge}>RODADA {data.currentRound}</span>
          </div>
          <span className={styles.subTitle}>
            {data.leagueName} · Série A
          </span>
        </div>

        {!isMarketDynamicallyLocked && (
          <div className={styles.topActionsGroup}>
            <button
              type="button"
              className={styles.clearTopBtn}
              disabled={starters.length === 0 && reserves.length === 0}
              onClick={handleClearLineup}
              title="Limpar escalação"
            >
              <span className={styles.clearIcon}>🗑️</span>
              <span className={styles.clearBtnLabelDesktop}>Limpar</span>
            </button>

            <button
              type="button"
              className={styles.saveTopBtn}
              disabled={isPending}
              onClick={handleSaveLineup}
            >
              <span>💾</span>
              <span>{isPending ? 'Salvando...' : 'Salvar'}</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Market Status Banner ── */}
      {isMarketDynamicallyLocked ? (
        <div className={styles.marketBannerLocked}>
          <span>🔒</span>
          <span>Mercado FECHADO para a Rodada {data.currentRound}.</span>
          <span className={styles.marketRuleHint}>(fechou 30 min antes do 1º jogo)</span>
        </div>
      ) : (
        <div className={styles.marketBanner}>
          <div className={styles.marketBannerLeft}>
            <span className={styles.marketOpenBadge}>
              <span className={styles.marketOpenDot} />
              MERCADO ABERTO
            </span>
            <span className={styles.marketCloseTimeText}>
              Fecha <strong className={styles.marketCloseTimeHighlight}>{marketCloseLabel}</strong>
            </span>
          </div>

          <div className={styles.marketBannerRight}>
            {countdownText && (
              <span className={styles.marketCountdownBadge} title="Tempo restante até o fechamento do mercado">
                <span>⏱️</span>
                <span>{countdownText}</span>
              </span>
            )}
            <span className={styles.marketRuleHint}>(30 min p/ 1º jogo)</span>
          </div>
        </div>
      )}

      {/* ── Tactical Scheme (Esquema Tático) ── */}
      <div className={styles.formationsContainer}>
        <div className={styles.formationsHeader}>
          <span className={styles.formationsTitle}>ESQUEMA TÁTICO</span>
          <span className={styles.formationsActiveLabel}>{formation} (Ativo)</span>
        </div>

        <div className={styles.formationsGrid}>
          {FORMATIONS_LIST.map((form) => {
            const isSelected = formation === form.id
            return (
              <button
                key={form.id}
                type="button"
                disabled={isMarketDynamicallyLocked}
                onClick={() => handleFormationChange(form.id)}
                className={`${styles.formationCard} ${
                  isSelected ? styles.formationCardSelected : ''
                }`}
                title={`Esquema ${form.name}`}
              >
                <div className={styles.dotsPitch}>
                  {/* Top row: Attackers */}
                  <div className={styles.dotsRow}>
                    {Array.from({ length: form.attackers }).map((_, i) => (
                      <span key={i} className={`${styles.dot} ${styles.dotBlue}`} />
                    ))}
                  </div>
                  {/* Middle row: Midfielders */}
                  <div className={styles.dotsRow}>
                    {Array.from({ length: form.midfielders }).map((_, i) => (
                      <span key={i} className={`${styles.dot} ${styles.dotGrey}`} />
                    ))}
                  </div>
                  {/* Bottom row: Defenders */}
                  <div className={styles.dotsRow}>
                    {Array.from({ length: form.defenders }).map((_, i) => (
                      <span key={i} className={`${styles.dot} ${styles.dotBlue}`} />
                    ))}
                  </div>
                </div>
                <span className={styles.formationCardName}>{form.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Feedback Message ── */}
      {saveMessage && (
        <div
          className={`${styles.saveMessageBanner} ${
            saveMessage.type === 'error' ? styles.saveMessageError : styles.saveMessageSuccess
          }`}
        >
          <span>{saveMessage.type === 'error' ? '⚠️' : '✓'}</span>
          <span>{saveMessage.text}</span>
        </div>
      )}

      {/* ── Main Layout: Pitch (Left) + Desktop Roster Side Panel (Right) ── */}
      <div className={styles.mainContentGrid}>
        <div className={styles.pitchColumn}>
          {/* ── Tactical Soccer Pitch ── */}
          <SoccerPitch
            formation={formation}
            starters={starters}
            roster={data.roster}
            isLocked={isMarketDynamicallyLocked}
            onEmptySlotClick={(position, slotIndex) => {
              if (isDesktop) {
                setPanelPosFilter(position)
                setPanelSearch('')
                setWebActiveSlot({ type: 'starter', position, slotIndex })
                setSelectionTarget(null)
              } else {
                setSelectionTarget({ type: 'starter', position, slotIndex })
              }
            }}
            onFilledSlotClick={(player, starterItem, slotIndex) => {
              setActionSheetTarget({ player, starterItem, slotIndex })
            }}
          />
        </div>

        {/* ── Desktop Roster Side Panel (Hidden on mobile) ── */}
        <aside className={styles.rosterSidePanel}>
          <div className={styles.rosterPanelHeader}>
            <div className={styles.rosterPanelTitleRow}>
              <h2 className={styles.rosterPanelTitle}>
                <span>👥</span>
                <span>Meu Elenco Completo</span>
              </h2>
              <span className={styles.rosterPanelBadge}>
                {starters.length}/11 titulares
              </span>
            </div>
            <p className={styles.rosterPanelSub}>
              {data.roster.length} atletas disponíveis no seu time
            </p>
          </div>

          {/* Active Slot Selection Banner on Web */}
          {webActiveSlot && (
            <div className={styles.activeSlotBanner}>
              <div className={styles.activeSlotBannerText}>
                <span>Escalando:</span>
                <strong>
                  {webActiveSlot.position} ({webActiveSlot.type === 'starter' ? 'Titular' : 'Reserva'})
                </strong>
              </div>
              <button
                type="button"
                className={styles.activeSlotCancelBtn}
                onClick={() => setWebActiveSlot(null)}
                title="Cancelar seleção"
              >
                ✕ Cancelar
              </button>
            </div>
          )}

          <div className={styles.rosterPanelControls}>
            <div className={styles.posTabsRow}>
              {['TODOS', 'GOL', 'LAT', 'ZAG', 'MEI', 'ATA'].map((p) => (
                <button
                  key={`panel-pos-${p}`}
                  type="button"
                  className={`${styles.posTabBtn} ${
                    panelPosFilter === p ? styles.posTabBtnActive : ''
                  }`}
                  onClick={() => setPanelPosFilter(p)}
                >
                  {p}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Buscar por nome ou clube..."
              value={panelSearch}
              onChange={(e) => setPanelSearch(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          <div className={styles.rosterPanelScroll}>
            {filteredPanelRoster.map((player) => {
              const isStarter = starterPlayerIds.has(player.id)
              const isReserve = reservePlayerIds.has(player.id)
              const isMatchingSlot = Boolean(
                webActiveSlot &&
                  player.position === webActiveSlot.position &&
                  !(webActiveSlot.type === 'starter' && isStarter) &&
                  !(webActiveSlot.type === 'reserve' && isReserve)
              )

              return (
                <div
                  key={`panel-player-${player.id}`}
                  className={styles.playerRowItem}
                  onClick={() => {
                    if (webActiveSlot && isMatchingSlot) {
                      handleSelectPlayerFromPanel(player)
                    } else {
                      setModalPlayerId(player.id)
                    }
                  }}
                  style={{
                    cursor: 'pointer',
                    borderColor: isMatchingSlot ? 'rgba(16, 185, 129, 0.6)' : undefined,
                    background: isMatchingSlot ? 'rgba(16, 185, 129, 0.08)' : undefined,
                  }}
                >
                  <div className={styles.playerRowLeft}>
                    <div style={{ position: 'relative', width: 38, height: 38, flexShrink: 0 }}>
                      {player.photoUrl ? (
                        <img
                          src={player.photoUrl}
                          alt={player.name}
                          style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            objectFit: 'cover',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            background: '#1e293b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                          }}
                        >
                          {player.name
                            .split(' ')
                            .slice(0, 2)
                            .map((w) => w[0])
                            .join('')}
                        </div>
                      )}
                      <span
                        className={`${styles.reservePosTag} ${styles[`pos_${player.position}`]}`}
                      >
                        {player.position}
                      </span>
                    </div>

                    <div className={styles.playerRowMeta}>
                      <span className={styles.playerRowName}>{player.name}</span>
                      <div className={styles.playerRowSub}>
                        <span>{player.clubShortName}</span>
                        {player.opponent && <span>· {player.opponent.label}</span>}
                        <span className={styles.avgPointsText}>
                          · Média {player.avgPoints.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.playerRowAction}>
                    {webActiveSlot && isMatchingSlot ? (
                      <button
                        type="button"
                        className={styles.selectPlayerBtn}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelectPlayerFromPanel(player)
                        }}
                      >
                        Escalar
                      </button>
                    ) : isStarter ? (
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#10b981' }}>
                        ✓ Titular
                      </span>
                    ) : isReserve ? (
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#38bdf8' }}>
                        ✓ Reserva
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        Disponível
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </aside>
      </div>

      {/* ── Banco de Reservas (5 Slots, Largura Completa abaixo do Campo e Elenco) ── */}
      <div className={styles.benchSection}>
        <div className={styles.benchHeader}>
          <div className={styles.benchTitleGroup}>
            <span className={styles.benchTitle}>🪑 Banco de Reservas</span>
            <span className={styles.benchCountBadge}>
              {reserves.length}/5
            </span>
          </div>
          <button
            type="button"
            className={styles.benchToggleBtn}
            onClick={() => setBenchCollapsed((prev) => !prev)}
          >
            {benchCollapsed ? 'EXPANDIR ⌄' : 'OCULTAR ⌃'}
          </button>
        </div>

        {!benchCollapsed && (
          <div className={styles.benchGrid}>
            {(['GOL', 'LAT', 'ZAG', 'MEI', 'ATA'] as const).map((pos) => {
              const reserveItem = reserves.find((r) => r.position === pos)
              const player = reserveItem
                ? data.roster.find((r) => r.id === reserveItem.playerId)
                : null

              if (player) {
                return (
                  <div key={`bench-${pos}`} className={styles.reserveCardFilled}>
                    <div
                      className={styles.reserveCardLeft}
                      onClick={() => setModalPlayerId(player.id)}
                      title="Ver ficha completa"
                    >
                      <div className={styles.reserveAvatarWrapper}>
                        <span className={`${styles.reservePosTag} ${styles[`pos_${pos}`]}`}>
                          {pos}
                        </span>
                        {player.photoUrl ? (
                          <img
                            src={player.photoUrl}
                            alt={player.name}
                            className={styles.reserveAvatarImg}
                          />
                        ) : (
                          <div className={styles.reserveAvatarPlaceholder}>
                            {player.name
                              .split(' ')
                              .slice(0, 2)
                              .map((w) => w[0])
                              .join('')}
                          </div>
                        )}
                      </div>
                      <div className={styles.reservePlayerInfo}>
                        <span className={styles.reservePlayerName}>{player.name}</span>
                        <span className={styles.reservePlayerSub}>
                          {player.opponent ? player.opponent.label : player.clubShortName}{' '}
                          <strong className={styles.reservePoints}>
                            {player.avgPoints.toFixed(1)}
                          </strong>
                        </span>
                      </div>
                    </div>

                    {!isMarketDynamicallyLocked && (
                      <div className={styles.reserveCardActions}>
                        <button
                          type="button"
                          className={styles.reserveActionBtn}
                          onClick={() => {
                            if (isDesktop) {
                              setPanelPosFilter(pos)
                              setPanelSearch('')
                              setWebActiveSlot({
                                type: 'reserve',
                                position: pos,
                                currentPlayerId: player.id,
                              })
                              setSelectionTarget(null)
                            } else {
                              setSelectionTarget({
                                type: 'reserve',
                                position: pos,
                                currentPlayerId: player.id,
                              })
                            }
                          }}
                          title="Substituir reserva"
                        >
                          ⇅
                        </button>
                        <button
                          type="button"
                          className={`${styles.reserveActionBtn} ${styles.reserveActionBtnRemove}`}
                          onClick={() => handleRemoveReserve(player.id)}
                          title="Remover do banco"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                )
              }

              return (
                <button
                  key={`bench-empty-${pos}`}
                  type="button"
                  disabled={isMarketDynamicallyLocked}
                  className={styles.reserveCardEmpty}
                  onClick={() => {
                    if (isDesktop) {
                      setPanelPosFilter(pos)
                      setPanelSearch('')
                      setWebActiveSlot({ type: 'reserve', position: pos })
                      setSelectionTarget(null)
                    } else {
                      setSelectionTarget({ type: 'reserve', position: pos })
                    }
                  }}
                  title={`Clique para escalar reserva de ${pos}`}
                >
                  <span className={styles.reserveEmptyPos}>+ {pos}</span>
                  <span className={styles.reserveEmptyText}>Reserva</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Sticky Bottom Bar ("Meu Elenco Completo") ── */}
      <div className={styles.stickyBottomBar}>
        <div
          className={styles.stickyLeftInfo}
          onClick={() => setIsRosterDrawerOpen(true)}
        >
          <span className={styles.stickyIcon}>👥</span>
          <div className={styles.stickyTextGroup}>
            <span className={styles.stickyTitle}>Meu Elenco Completo</span>
            <span className={styles.stickySub}>
              {data.roster.length} atletas disponíveis · {starters.length}/11 titulares
            </span>
          </div>
        </div>

        <button
          type="button"
          className={styles.stickyActionBtn}
          onClick={() => setIsRosterDrawerOpen(true)}
        >
          Ver Elenco ⌃
        </button>
      </div>

      {/* ── Player Selection Modal / Drawer ("Selecionar Jogador") ── */}
      {selectionTarget && (
        <div className={styles.drawerOverlay} onClick={() => setSelectionTarget(null)}>
          <div className={styles.drawerBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerHeaderTitle}>
                <span className={`${styles.drawerPosBadge} ${styles[`pos_${selectionTarget.position}`]}`}>
                  {selectionTarget.position}
                </span>
                <div>
                  <h3 className={styles.drawerHeading}>
                    Selecionar {POSITION_NAMES[selectionTarget.position] || selectionTarget.position}{' '}
                    ({selectionTarget.type === 'starter' ? 'Titular' : 'Banco de Reservas'})
                  </h3>
                  <p className={styles.drawerSubHeading}>
                    Toque em Selecionar para escalar na vaga desejada
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={styles.drawerCloseBtn}
                onClick={() => setSelectionTarget(null)}
              >
                ✕
              </button>
            </div>

            {/* Position filter tabs + Search */}
            <div className={styles.drawerFilterArea}>
              <div className={styles.posTabsRow}>
                {['TODOS', 'GOL', 'LAT', 'ZAG', 'MEI', 'ATA'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`${styles.posTabBtn} ${
                      selectionPosFilter === p ? styles.posTabBtnActive : ''
                    }`}
                    onClick={() => setSelectionPosFilter(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className={styles.searchRow}>
                <input
                  type="text"
                  placeholder="Buscar atleta ou clube..."
                  value={selectionSearch}
                  onChange={(e) => setSelectionSearch(e.target.value)}
                  className={styles.searchInput}
                />
                <label className={styles.hideCheckLabel}>
                  <input
                    type="checkbox"
                    checked={selectionShowUsed}
                    onChange={(e) => setSelectionShowUsed(e.target.checked)}
                  />
                  Exibir escalados
                </label>
              </div>
            </div>

            {/* Player List with ONLY ONE "Selecionar" Button */}
            <div className={styles.playerListScroll}>
              {filteredSelectionRoster.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: '#94a3b8' }}>
                  Nenhum atleta encontrado para os filtros selecionados.
                </div>
              ) : (
                filteredSelectionRoster.map((player) => {
                  const isAlreadyInThisSlot =
                    selectionTarget.currentPlayerId === player.id
                  const isCurrentStarter = starterPlayerIds.has(player.id)
                  const isCurrentReserve = reservePlayerIds.has(player.id)

                  return (
                    <div key={player.id} className={styles.playerRowItem}>
                      <div
                        className={styles.playerRowLeft}
                        onClick={() => setModalPlayerId(player.id)}
                        title="Ver detalhes do atleta"
                      >
                        <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
                          {player.photoUrl ? (
                            <img
                              src={player.photoUrl}
                              alt={player.name}
                              style={{
                                width: '100%',
                                height: '100%',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: '1.5px solid rgba(255,255,255,0.15)',
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '100%',
                                height: '100%',
                                borderRadius: '50%',
                                background: '#1e293b',
                                border: '1.5px solid rgba(255,255,255,0.15)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                color: '#cbd5e1',
                              }}
                            >
                              {player.name
                                .split(' ')
                                .slice(0, 2)
                                .map((w) => w[0])
                                .join('')}
                            </div>
                          )}
                          <span
                            className={`${styles.reservePosTag} ${styles[`pos_${player.position}`]}`}
                          >
                            {player.position}
                          </span>
                        </div>

                        <div className={styles.playerRowMeta}>
                          <span className={styles.playerRowName}>{player.name}</span>
                          <div className={styles.playerRowSub}>
                            <div className={styles.playerClubRow}>
                              {player.clubLogoUrl && (
                                <img
                                  src={player.clubLogoUrl}
                                  alt={player.clubShortName}
                                  className={styles.clubBadge}
                                />
                              )}
                              <span>{player.clubShortName}</span>
                            </div>
                            {player.opponent ? (
                              <span className={styles.opponentBadge}>
                                {player.opponent.label}
                              </span>
                            ) : (
                              <span className={styles.opponentBadge}>Sem jogo</span>
                            )}
                            <span className={styles.avgPointsText}>
                              Média: {player.avgPoints.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Single Action Button */}
                      <div className={styles.playerRowAction}>
                        {isAlreadyInThisSlot ? (
                          <button
                            type="button"
                            disabled
                            className={`${styles.selectPlayerBtn} ${styles.selectPlayerBtnDisabled}`}
                          >
                            ✓ Atual
                          </button>
                        ) : isCurrentStarter && selectionTarget.type === 'starter' ? (
                          <button
                            type="button"
                            disabled
                            className={`${styles.selectPlayerBtn} ${styles.selectPlayerBtnDisabled}`}
                          >
                            ✓ Já Titular
                          </button>
                        ) : isCurrentReserve && selectionTarget.type === 'reserve' ? (
                          <button
                            type="button"
                            disabled
                            className={`${styles.selectPlayerBtn} ${styles.selectPlayerBtnDisabled}`}
                          >
                            ✓ Já no Banco
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSelectPlayer(player)}
                            className={styles.selectPlayerBtn}
                            title={`Escalar ${player.name}`}
                          >
                            {isCurrentReserve && selectionTarget.type === 'starter'
                              ? 'Selecionar (Mover)'
                              : isCurrentStarter && selectionTarget.type === 'reserve'
                              ? 'Selecionar (Mover)'
                              : 'Selecionar'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Player Action Sheet (Clicked Starter on Pitch) ── */}
      {actionSheetTarget && (
        <div className={styles.drawerOverlay} onClick={() => setActionSheetTarget(null)}>
          <div className={styles.actionSheetBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.actionSheetPlayerHeader}>
              <div className={styles.actionSheetAvatarWrapper}>
                {actionSheetTarget.player.photoUrl ? (
                  <img
                    src={actionSheetTarget.player.photoUrl}
                    alt={actionSheetTarget.player.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid rgba(255,255,255,0.2)',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      background: '#1e293b',
                      border: '2px solid rgba(255,255,255,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      color: '#ffffff',
                    }}
                  >
                    {actionSheetTarget.player.name
                      .split(' ')
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join('')}
                  </div>
                )}
                <span
                  className={`${styles.posTag} ${
                    styles[`pos_${actionSheetTarget.starterItem.position}`]
                  }`}
                >
                  {actionSheetTarget.starterItem.position}
                </span>
              </div>

              <div className={styles.actionSheetPlayerTitle}>
                <h3 className={styles.actionSheetPlayerName}>
                  {actionSheetTarget.player.name}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem', color: '#94a3b8' }}>
                  <span>{actionSheetTarget.player.clubShortName}</span>
                  {actionSheetTarget.player.opponent && (
                    <span>· {actionSheetTarget.player.opponent.label}</span>
                  )}
                  <span style={{ color: '#10b981', fontWeight: 700 }}>
                    · Média {actionSheetTarget.player.avgPoints.toFixed(1)}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.actionSheetActionsList}>
              {/* Make Captain */}
              {!actionSheetTarget.starterItem.isCaptain && !isMarketDynamicallyLocked && (
                <button
                  type="button"
                  className={`${styles.actionSheetBtn} ${styles.actionSheetBtnCaptain}`}
                  onClick={() => handleMakeCaptain(actionSheetTarget.player.id)}
                >
                  ⭐ Definir como Capitão (Pontos x1.5)
                </button>
              )}

              {/* Substitute Player */}
              {!isMarketDynamicallyLocked && (
                <button
                  type="button"
                  className={styles.actionSheetBtn}
                  onClick={() => {
                    const target = {
                      type: 'starter' as const,
                      position: actionSheetTarget.starterItem.position,
                      slotIndex: actionSheetTarget.slotIndex,
                      currentPlayerId: actionSheetTarget.player.id,
                    }
                    setActionSheetTarget(null)
                    setSelectionTarget(target)
                  }}
                >
                  🔄 Substituir por outro {actionSheetTarget.starterItem.position}
                </button>
              )}

              {/* View Full Card */}
              <button
                type="button"
                className={styles.actionSheetBtn}
                onClick={() => {
                  setModalPlayerId(actionSheetTarget.player.id)
                  setActionSheetTarget(null)
                }}
              >
                📊 Ver Detalhes e Estatísticas
              </button>

              {/* Remove from Starters */}
              {!isMarketDynamicallyLocked && (
                <button
                  type="button"
                  className={`${styles.actionSheetBtn} ${styles.actionSheetBtnRemove}`}
                  onClick={() => handleRemoveStarter(actionSheetTarget.player.id)}
                >
                  ✕ Remover da Escalação
                </button>
              )}

              <button
                type="button"
                className={styles.actionSheetCloseBtn}
                onClick={() => setActionSheetTarget(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Full Roster Drawer ("Meu Elenco Completo") ── */}
      {isRosterDrawerOpen && (
        <div className={styles.drawerOverlay} onClick={() => setIsRosterDrawerOpen(false)}>
          <div className={styles.drawerBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerHeaderTitle}>
                <span style={{ fontSize: '1.25rem' }}>👥</span>
                <div>
                  <h3 className={styles.drawerHeading}>Meu Elenco Completo</h3>
                  <p className={styles.drawerSubHeading}>
                    {data.roster.length} atletas disponíveis no seu time
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={styles.drawerCloseBtn}
                onClick={() => setIsRosterDrawerOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className={styles.drawerFilterArea}>
              <div className={styles.posTabsRow}>
                {['TODOS', 'GOL', 'LAT', 'ZAG', 'MEI', 'ATA'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`${styles.posTabBtn} ${
                      selectionPosFilter === p ? styles.posTabBtnActive : ''
                    }`}
                    onClick={() => setSelectionPosFilter(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="Buscar por nome ou clube..."
                value={selectionSearch}
                onChange={(e) => setSelectionSearch(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <div className={styles.playerListScroll}>
              {filteredSelectionRoster.map((player) => {
                const isStarter = starterPlayerIds.has(player.id)
                const isReserve = reservePlayerIds.has(player.id)

                return (
                  <div
                    key={`roster-${player.id}`}
                    className={styles.playerRowItem}
                    onClick={() => setModalPlayerId(player.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className={styles.playerRowLeft}>
                      <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
                        {player.photoUrl ? (
                          <img
                            src={player.photoUrl}
                            alt={player.name}
                            style={{
                              width: '100%',
                              height: '100%',
                              borderRadius: '50%',
                              objectFit: 'cover',
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '100%',
                              height: '100%',
                              borderRadius: '50%',
                              background: '#1e293b',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                            }}
                          >
                            {player.name
                              .split(' ')
                              .slice(0, 2)
                              .map((w) => w[0])
                              .join('')}
                          </div>
                        )}
                        <span
                          className={`${styles.reservePosTag} ${styles[`pos_${player.position}`]}`}
                        >
                          {player.position}
                        </span>
                      </div>

                      <div className={styles.playerRowMeta}>
                        <span className={styles.playerRowName}>{player.name}</span>
                        <div className={styles.playerRowSub}>
                          <span>{player.clubShortName}</span>
                          {player.opponent && <span>· {player.opponent.label}</span>}
                          <span className={styles.avgPointsText}>
                            · Média {player.avgPoints.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.playerRowAction}>
                      {isStarter ? (
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#10b981' }}>
                          ✓ Titular
                        </span>
                      ) : isReserve ? (
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#38bdf8' }}>
                          ✓ Reserva
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          Disponível
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Formation Change Modal ── */}
      {modal && modal.type === 'formation' && (
        <div className={styles.drawerOverlay} onClick={() => setModal(null)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>
              ⚠️ Alterar formação para {modal.newFormation}?
            </div>
            <div className={styles.modalText}>
              Os seguintes atletas excedem as vagas da nova formação e serão removidos dos titulares:
            </div>
            <div className={styles.modalRemovedList}>
              {modal.removedPlayers.map((name, i) => (
                <div key={i}>✕ {name}</div>
              ))}
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelBtn}
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.modalWarnBtn}
                onClick={confirmFormationChange}
              >
                Confirmar Mudança
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clear Lineup Confirmation Modal ── */}
      {modal && modal.type === 'clear' && (
        <div className={styles.drawerOverlay} onClick={() => setModal(null)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>
              🗑️ Limpar toda a escalação?
            </div>
            <div className={styles.modalText}>
              Tem certeza que deseja remover todos os <strong>{starters.length} titulares</strong> e <strong>{reserves.length} reservas</strong>? Todos os jogadores ficarão disponíveis para escalar novamente.
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelBtn}
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.modalWarnBtn}
                onClick={confirmClearLineup}
              >
                Sim, Limpar Tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Full Player Detail Modal ── */}
      <PlayerDetailModal
        playerId={modalPlayerId}
        leagueId={leagueId}
        round={data.currentRound}
        onClose={() => setModalPlayerId(null)}
      />
    </div>
  )
}
