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
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PlayerDetailModal } from '@/components/player/PlayerDetailModal'
import styles from './page.module.css'

type ModalState =
  | { type: 'formation'; newFormation: Formation; removedPlayers: string[] }
  | { type: 'captain'; playerId: string; playerName: string }
  | null

/** Renders a player avatar (photo or placeholder initials) */
function PlayerAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  if (photoUrl) {
    return <img src={photoUrl} alt={name} className={styles.playerAvatar} />
  }
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return <div className={styles.playerAvatarPlaceholder}>{initials}</div>
}

/** Renders club badge + short name */
function ClubBadge({ shortName, logoUrl }: { shortName: string; logoUrl: string | null }) {
  return (
    <div className={styles.playerClubRow}>
      {logoUrl && <img src={logoUrl} alt={shortName} className={styles.clubBadge} />}
      <span className={styles.playerClub}>{shortName}</span>
    </div>
  )
}

export default function LineupPage() {
  const params = useParams()
  const leagueId = params.id as string

  const [data, setData] = useState<LineupPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [formation, setFormation] = useState<Formation>('4-3-3')
  const [starters, setStarters] = useState<LineupSlotItem[]>([])
  const [reserves, setReserves] = useState<LineupSlotItem[]>([])
  const [posFilter, setPosFilter] = useState<string>('TODOS')
  const [hideStarters, setHideStarters] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [saveMessage, setSaveMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<'lineup' | 'roster'>('lineup')

  const handleQuickAdd = (pos: string) => {
    setPosFilter(pos)
    setMobileTab('roster')
  }

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

  if (loading) {
    return (
      <div className={styles.container}>
        <p>Carregando Escalação...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <h2>Escalação não disponível</h2>
        <Link href="/dashboard">
          <Button size="md">Voltar ao Painel</Button>
        </Link>
      </div>
    )
  }

  const starterPlayerIds = new Set(starters.map((s) => s.playerId))
  const reservePlayerIds = new Set(reserves.map((r) => r.playerId))
  const reqs = FORMATION_REQUIREMENTS[formation]

  // ── Handlers ──

  const handleFormationChange = (newFormation: Formation) => {
    if (data.isLocked) return
    setSaveMessage(null)

    const newReqs = FORMATION_REQUIREMENTS[newFormation]

    // Check which starters violate the new formation
    const posCounts: Record<string, number> = { GOL: 0, LAT: 0, ZAG: 0, MEI: 0, ATA: 0 }
    const keptStarters: LineupSlotItem[] = []
    const removedNames: string[] = []

    // Sort by avgPoints DESC so we keep the best players when trimming
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
      // Confirmation needed
      setModal({ type: 'formation', newFormation, removedPlayers: removedNames })
    } else {
      // No conflict, just switch
      setFormation(newFormation)
    }
  }

  const confirmFormationChange = () => {
    if (modal?.type !== 'formation') return
    const newFormation = modal.newFormation
    const newReqs = FORMATION_REQUIREMENTS[newFormation]

    // Re-filter starters to keep only the allowed count per position
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

    // Ensure at least one captain
    if (keptStarters.length > 0 && !keptStarters.some((s) => s.isCaptain)) {
      keptStarters[0].isCaptain = true
    }

    setFormation(newFormation)
    setStarters(keptStarters)
    setModal(null)
    setSaveMessage({
      type: 'success',
      text: `Formação alterada para ${newFormation}. Jogadores incompatíveis foram removidos dos titulares.`,
    })
  }

  const handleMakeCaptain = (playerId: string) => {
    if (data.isLocked) return
    const player = data.roster.find((r) => r.id === playerId)
    setModal({ type: 'captain', playerId, playerName: player?.name ?? 'Jogador' })
  }

  const confirmCaptainChange = () => {
    if (modal?.type !== 'captain') return
    setStarters((prev) =>
      prev.map((s) => ({
        ...s,
        isCaptain: s.playerId === modal.playerId,
      }))
    )
    setModal(null)
  }

  const handleRemoveStarter = (playerId: string) => {
    if (data.isLocked) return
    setStarters((prev) => prev.filter((s) => s.playerId !== playerId))
  }

  const handleAddStarter = (player: LineupPageData['roster'][0]) => {
    if (data.isLocked) return
    setSaveMessage(null)

    if (starters.length >= 11) {
      setSaveMessage({
        type: 'error',
        text: 'A escalação já tem 11 titulares. Remova um jogador antes de escalar outro.',
      })
      return
    }

    const currentPosCount = starters.filter((s) => s.position === player.position).length
    const maxPosAllowed = reqs[player.position]

    if (currentPosCount >= maxPosAllowed) {
      setSaveMessage({
        type: 'error',
        text: `A formação ${formation} permite no máximo ${maxPosAllowed} de ${player.position}.`,
      })
      return
    }

    setReserves((prev) => prev.filter((r) => r.playerId !== player.id))

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

  const handleRemoveReserve = (playerId: string) => {
    if (data.isLocked) return
    setReserves((prev) => prev.filter((r) => r.playerId !== playerId))
  }

  const handleAddReserve = (player: LineupPageData['roster'][0]) => {
    if (data.isLocked) return
    setSaveMessage(null)

    if (starters.some((s) => s.playerId === player.id)) {
      setSaveMessage({
        type: 'error',
        text: 'Um jogador titular não pode ser escalado no banco de reservas.',
      })
      return
    }

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

  const handleSaveLineup = () => {
    if (data.isLocked) return
    setSaveMessage(null)

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

  // ── Derived Data ──

  const filteredRoster = data.roster.filter((p) => {
    if (posFilter !== 'TODOS' && p.position !== posFilter) return false
    if (hideStarters && (starterPlayerIds.has(p.id) || reservePlayerIds.has(p.id))) return false
    return true
  })

  // ── Render ──

  return (
    <div className={styles.container}>
      {/* Confirmation Modal */}
      {modal && (
        <div className={styles.modalOverlay} onClick={() => setModal(null)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            {modal.type === 'formation' && (
              <>
                <div className={styles.modalTitle}>⚠️ Alterar formação para {modal.newFormation}?</div>
                <div className={styles.modalText}>
                  Os seguintes jogadores não cabem na nova formação e serão removidos dos titulares:
                </div>
                <div className={styles.modalRemovedList}>
                  {modal.removedPlayers.map((name, i) => (
                    <div key={i}>✕ {name}</div>
                  ))}
                </div>
                <div className={styles.modalActions}>
                  <button type="button" className={styles.modalCancelBtn} onClick={() => setModal(null)}>
                    Cancelar
                  </button>
                  <button type="button" className={styles.modalWarnBtn} onClick={confirmFormationChange}>
                    Confirmar Mudança
                  </button>
                </div>
              </>
            )}
            {modal.type === 'captain' && (
              <>
                <div className={styles.modalTitle}>⭐ Definir novo Capitão?</div>
                <div className={styles.modalText}>
                  <strong>{modal.playerName}</strong> será o novo capitão e receberá <strong>1.5x</strong> nos pontos da rodada. O capitão atual será substituído.
                </div>
                <div className={styles.modalActions}>
                  <button type="button" className={styles.modalCancelBtn} onClick={() => setModal(null)}>
                    Cancelar
                  </button>
                  <button type="button" className={styles.modalConfirmBtn} onClick={confirmCaptainChange}>
                    ⭐ Confirmar Capitão
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.titleBox}>
          <h1 className={styles.leagueTitle}>{data.teamName} — Escalação</h1>
          <span className={styles.subTitle}>
            {data.leagueName} · Rodada {data.currentRound} da Série A
          </span>
        </div>

        <div className={styles.controlsGroup}>
          {!data.isLocked && (
            <Button size="md" isLoading={isPending} onClick={handleSaveLineup}>
              {isPending ? 'Salvando...' : '💾 Salvar Escalação'}
            </Button>
          )}
        </div>
      </div>

      {/* Market Status Banner */}
      {data.isLocked ? (
        <div className={styles.lockedBanner}>
          🔒 Mercado FECHADO para a Rodada {data.currentRound}. O mercado fecha 30 min antes do primeiro jogo.
        </div>
      ) : data.kickoffAt ? (
        <div className={styles.openBanner}>
          <span>🟢</span>
          <span>
            <strong>Mercado ABERTO para a Rodada {data.currentRound}</strong> · O mercado fecha às{' '}
            <strong>
              {new Date(new Date(data.kickoffAt).getTime() - 30 * 60 * 1000).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </strong>{' '}
            (30 min antes do 1º jogo às{' '}
            {new Date(data.kickoffAt).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            ).
          </span>
        </div>
      ) : null}

      {/* Formations Cards Bar (Imagem 1) */}
      <div className={styles.formationsContainer}>
        <div className={styles.formationsHeader}>
          <span className={styles.formationsTitle}>Esquema Tático</span>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            Formação selecionada: <strong style={{ color: 'var(--accent-blue)' }}>{formation}</strong>
          </span>
        </div>

        <div className={styles.formationsGrid}>
          {FORMATIONS_LIST.map((form) => {
            const isSelected = formation === form.id
            return (
              <button
                key={form.id}
                type="button"
                disabled={data.isLocked}
                onClick={() => handleFormationChange(form.id)}
                className={`${styles.formationCard} ${
                  isSelected ? styles.formationCardSelected : ''
                }`}
                title={`Esquema ${form.name}`}
              >
                <div className={styles.dotsPitch}>
                  {/* Top row: Attackers (blue) */}
                  <div className={styles.dotsRow}>
                    {Array.from({ length: form.attackers }).map((_, i) => (
                      <span key={i} className={`${styles.dot} ${styles.dotBlue}`} />
                    ))}
                  </div>
                  {/* Middle row: Midfielders (grey) */}
                  <div className={styles.dotsRow}>
                    {Array.from({ length: form.midfielders }).map((_, i) => (
                      <span key={i} className={`${styles.dot} ${styles.dotGrey}`} />
                    ))}
                  </div>
                  {/* Bottom row: Defenders (blue) */}
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

      {/* Feedback Message */}
      {saveMessage && (
        <div
          style={{
            background:
              saveMessage.type === 'error'
                ? 'rgba(239, 68, 68, 0.12)'
                : 'rgba(16, 185, 129, 0.12)',
            border: `1px solid ${
              saveMessage.type === 'error'
                ? 'var(--accent-red)'
                : 'var(--accent-green)'
            }`,
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            color:
              saveMessage.type === 'error'
                ? 'var(--accent-red)'
                : 'var(--accent-green)',
            fontSize: '0.875rem',
          }}
        >
          {saveMessage.type === 'error' ? '⚠️ ' : '✓ '}
          {saveMessage.text}
        </div>
      )}

      {/* Mobile Tab Switcher */}
      <div className={styles.mobileTabsBar}>
        <button
          type="button"
          onClick={() => setMobileTab('lineup')}
          className={`${styles.mobileTabBtn} ${
            mobileTab === 'lineup' ? styles.mobileTabBtnActive : ''
          }`}
        >
          <span>⚽ Escalação</span>
          <span className={styles.tabBadge}>{starters.length}/11</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('roster')}
          className={`${styles.mobileTabBtn} ${
            mobileTab === 'roster' ? styles.mobileTabBtnActive : ''
          }`}
        >
          <span>📋 Elenco</span>
          <span className={styles.tabBadge}>{data.roster.length}</span>
        </button>
      </div>

      {/* Two Column Layout: Starters vs Roster */}
      <div className={styles.grid}>
        {/* Coluna 1: Titulares Escalados e Banco de Reservas (Imagem 2) */}
        <div className={`${styles.columnCard} ${mobileTab !== 'lineup' ? styles.mobileHidden : ''}`}>
          <div className={styles.columnHeader}>
            <div className={styles.columnTitle}>
              <span>⚽ Titulares Escalados ({starters.length}/11)</span>
            </div>
            <span className={styles.subHelp}>Clique no ⭐ para escolher o Capitão (1.5x)</span>
          </div>

          {/* Slots de Titulares (Ordenados por posição conforme formação) */}
          <div className={styles.slotsList}>
            {(() => {
              const POS_ORDER: ('GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA')[] = ['GOL', 'LAT', 'ZAG', 'MEI', 'ATA']
              const startersByPos: Record<string, LineupSlotItem[]> = {
                GOL: starters.filter((s) => s.position === 'GOL'),
                LAT: starters.filter((s) => s.position === 'LAT'),
                ZAG: starters.filter((s) => s.position === 'ZAG'),
                MEI: starters.filter((s) => s.position === 'MEI'),
                ATA: starters.filter((s) => s.position === 'ATA'),
              }

              const slots: { pos: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; assigned?: LineupSlotItem }[] = []
              for (const pos of POS_ORDER) {
                const count = reqs[pos] || 0
                const assignedList = startersByPos[pos] || []
                for (let i = 0; i < count; i++) {
                  slots.push({ pos, assigned: assignedList[i] })
                }
              }

              return slots.map((slot, idx) => {
                const starterItem = slot.assigned
                const player = starterItem
                  ? data.roster.find((r) => r.id === starterItem.playerId)
                  : null

                return (
                  <div
                    key={`starter-slot-${slot.pos}-${idx}`}
                    className={`${styles.slotItem} ${
                      player
                        ? `${styles.slotItemFilled} ${
                            starterItem?.isCaptain ? styles.slotItemCaptain : ''
                          }`
                        : styles.slotItemEmpty
                    }`}
                  >
                    {/* Indicador de Posição (ex: GOL -) */}
                    <div className={styles.slotPosLabelArea}>
                      <span className={`${styles.posBadgeText} ${styles[`pos_${slot.pos}`]}`}>
                        {slot.pos}
                      </span>
                      <span className={styles.slotDash}>-</span>
                    </div>

                    {player ? (
                      /* Slot Preenchido */
                      <div className={styles.slotFilledContent}>
                        <div
                          className={styles.slotPlayerInfo}
                          onClick={() => setModalPlayerId(player.id)}
                          title="Clique para ver ficha completa"
                        >
                          <PlayerAvatar name={player.name} photoUrl={player.photoUrl} />
                          <div className={styles.slotPlayerText}>
                            <div className={styles.slotPlayerName}>{player.name}</div>
                            <div className={styles.slotPlayerSub}>
                              <ClubBadge shortName={player.clubShortName} logoUrl={player.clubLogoUrl} />
                              {player.opponent ? (
                                <span className={styles.opponentBadge}>
                                  {player.opponent.label}
                                </span>
                              ) : (
                                <span className={styles.noOpponentBadge}>Sem jogo</span>
                              )}
                              <span className={styles.avgPointsText}>
                                Média: {player.avgPoints.toFixed(1)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className={styles.slotActionsArea}>
                          <button
                            type="button"
                            onClick={() => handleMakeCaptain(player.id)}
                            disabled={data.isLocked}
                            className={`${styles.captainBtn} ${
                              starterItem?.isCaptain ? styles.captainBtnActive : ''
                            }`}
                            title="Tornar Capitão (Pontos x1.5)"
                          >
                            <span className={styles.captainTextDesktop}>
                              {starterItem?.isCaptain ? '⭐ Capitão (1.5x)' : '⭐ Capitão'}
                            </span>
                            <span className={styles.captainTextMobile}>
                              {starterItem?.isCaptain ? '⭐ 1.5x' : '⭐'}
                            </span>
                          </button>

                          {!data.isLocked && (
                            <button
                              type="button"
                              onClick={() => handleRemoveStarter(player.id)}
                              className={styles.removeSlotBtn}
                              title="Remover titular"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Slot Disponível / Vazio */
                      <div
                        className={styles.slotEmptyContent}
                        onClick={() => handleQuickAdd(slot.pos)}
                        title={`Clique para ver atletas de ${slot.pos} disponíveis no elenco`}
                      >
                        <span className={styles.slotEmptyHint}>Posição disponível</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleQuickAdd(slot.pos)
                          }}
                          className={styles.slotEscalarBtn}
                        >
                          + Escalar {slot.pos}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            })()}
          </div>

          {/* Divisor Banco de Reservas (Imagem 2) */}
          <div className={styles.benchDividerContainer}>
            <div className={styles.benchDividerLine} />
            <div className={styles.benchDividerText}>
              <span>BANCO DE RESERVAS</span>
              <span
                className={styles.benchHelpIcon}
                title="O banco de reservas substitui automaticamente um titular da mesma posição caso ele não entre em campo na rodada."
              >
                ?
              </span>
            </div>
            <div className={styles.benchDividerLine} />
          </div>

          {/* Slots do Banco de Reservas (GOL, LAT, ZAG, MEI, ATA) */}
          <div className={styles.slotsList}>
            {(['GOL', 'LAT', 'ZAG', 'MEI', 'ATA'] as const).map((pos) => {
              const reserveItem = reserves.find((r) => r.position === pos)
              const player = reserveItem
                ? data.roster.find((r) => r.id === reserveItem.playerId)
                : null

              return (
                <div
                  key={`bench-slot-${pos}`}
                  className={`${styles.slotItem} ${
                    player ? styles.slotItemFilled : styles.slotItemEmpty
                  }`}
                >
                  <div className={styles.slotPosLabelArea}>
                    <span className={`${styles.posBadgeText} ${styles[`pos_${pos}`]}`}>
                      {pos}
                    </span>
                    <span className={styles.slotDash}>-</span>
                  </div>

                  {player ? (
                    /* Reserva Preenchido */
                    <div className={styles.slotFilledContent}>
                      <div
                        className={styles.slotPlayerInfo}
                        onClick={() => setModalPlayerId(player.id)}
                        title="Clique para ver ficha completa"
                      >
                        <PlayerAvatar name={player.name} photoUrl={player.photoUrl} />
                        <div className={styles.slotPlayerText}>
                          <div className={styles.slotPlayerName}>{player.name}</div>
                          <div className={styles.slotPlayerSub}>
                            <ClubBadge shortName={player.clubShortName} logoUrl={player.clubLogoUrl} />
                            {player.opponent ? (
                              <span className={styles.opponentBadge}>
                                {player.opponent.label}
                              </span>
                            ) : (
                              <span className={styles.noOpponentBadge}>Sem jogo</span>
                            )}
                            <span className={styles.avgPointsText}>
                              Média: {player.avgPoints.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={styles.slotActionsArea}>
                        {!data.isLocked && (
                          <button
                            type="button"
                            onClick={() => handleRemoveReserve(player.id)}
                            className={styles.removeSlotBtn}
                            title="Remover do banco de reservas"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Reserva Disponível / Vazio */
                    <div
                      className={styles.slotEmptyContent}
                      onClick={() => handleQuickAdd(pos)}
                      title={`Clique para ver reservas de ${pos} no elenco`}
                    >
                      <span className={styles.slotEmptyHint}>Reserva disponível</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleQuickAdd(pos)
                        }}
                        className={styles.slotEscalarBtn}
                      >
                        + Escalar {pos}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Coluna 2: Meu Elenco Completo */}
        <div className={`${styles.columnCard} ${mobileTab !== 'roster' ? styles.mobileHidden : ''}`}>
          <div className={styles.columnHeader}>
            <div className={styles.columnTitle}>
              <span>📋 Meu Elenco ({data.roster.length})</span>
            </div>
          </div>

          {/* Pos Filters + Hide starters checkbox */}
          <div className={styles.filterRow}>
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
            <label className={styles.hideStartersLabel}>
              <input
                type="checkbox"
                checked={hideStarters}
                onChange={(e) => setHideStarters(e.target.checked)}
              />
              Ocultar escalados
            </label>
          </div>

          {/* Roster List com Adversário */}
          <div className={styles.rosterList}>
            {filteredRoster.map((player) => {
              const isStarter = starterPlayerIds.has(player.id)
              const isReserve = reservePlayerIds.has(player.id)

              return (
                <div
                  key={player.id}
                  className={`${styles.rosterItem} ${
                    isStarter ? styles.rosterItemStarter : ''
                  }`}
                >
                  <div
                    className={styles.playerMeta}
                    onClick={() => setModalPlayerId(player.id)}
                    title="Clique para ver a ficha completa do atleta"
                    style={{ cursor: 'pointer' }}
                  >
                    <PlayerAvatar name={player.name} photoUrl={player.photoUrl} />
                    <Badge variant={player.position as any}>{player.position}</Badge>
                    <div className={styles.playerInfo}>
                      <div className={styles.playerName}>{player.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <ClubBadge shortName={player.clubShortName} logoUrl={player.clubLogoUrl} />
                        {player.opponent ? (
                          <span className={styles.opponentBadge}>
                            {player.opponent.label}
                          </span>
                        ) : (
                          <span className={styles.noOpponentBadge}>Sem jogo</span>
                        )}
                        <span className={styles.avgPointsText}>
                          Média: {player.avgPoints.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isStarter ? (
                    <div className={styles.rosterActionsGroup}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-green)' }}>
                        ✓ Titular
                      </span>
                      {!data.isLocked && (
                        <button
                          type="button"
                          onClick={() => handleRemoveStarter(player.id)}
                          className={styles.removeBtn}
                          title="Remover titular"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ) : isReserve ? (
                    <div className={styles.rosterActionsGroup}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#818cf8' }}>
                        ✓ Reserva
                      </span>
                      {!data.isLocked && (
                        <button
                          type="button"
                          onClick={() => handleRemoveReserve(player.id)}
                          className={styles.removeBtn}
                          title="Remover do banco de reservas"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ) : (
                    !data.isLocked && (
                      <div className={styles.rosterActionsGroup}>
                        <button
                          type="button"
                          onClick={() => handleAddStarter(player)}
                          className={styles.addBtn}
                          title="Escalar como Titular"
                        >
                          + Titular
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddReserve(player)}
                          className={styles.addReserveBtn}
                          title="Escalar como Reserva"
                        >
                          + Reserva
                        </button>
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Mobile Sticky Action Bar */}
      {!data.isLocked && (
        <div className={styles.mobileStickyBar}>
          <div className={styles.mobileStickyInfo}>
            <span className={styles.mobileStickyFormation}>{formation}</span>
            <span
              className={`${styles.mobileStickyCount} ${
                starters.length === 11 ? styles.countFull : styles.countIncomplete
              }`}
            >
              {starters.length}/11 escalados
            </span>
          </div>
          <button
            type="button"
            className={styles.mobileStickySaveBtn}
            disabled={isPending}
            onClick={handleSaveLineup}
          >
            {isPending ? 'Salvando...' : '💾 Salvar'}
          </button>
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
