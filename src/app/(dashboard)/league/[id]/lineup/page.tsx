'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getLineupData, saveLineupAction, type LineupPageData } from './actions'
import { FORMATION_REQUIREMENTS, type Formation, type LineupSlotItem } from '@/lib/lineup/lineup-engine'
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

  const loadData = () => {
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
  }

  useEffect(() => {
    loadData()
  }, [leagueId])

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

  const posOrder: Record<string, number> = { GOL: 1, LAT: 2, ZAG: 3, MEI: 4, ATA: 5 }
  const sortedStarters = [...starters].sort(
    (a, b) => (posOrder[a.position] || 9) - (posOrder[b.position] || 9)
  )

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
          <select
            value={formation}
            disabled={data.isLocked}
            onChange={(e) => handleFormationChange(e.target.value as Formation)}
            className={styles.formationSelect}
          >
            <option value="4-3-3">Formação 4-3-3 (1G, 2L, 2Z, 3M, 3A)</option>
            <option value="4-4-2">Formação 4-4-2 (1G, 2L, 2Z, 4M, 2A)</option>
            <option value="3-5-2">Formação 3-5-2 (1G, 0L, 3Z, 5M, 2A)</option>
          </select>

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

      {/* Two Column Layout: Starters vs Roster */}
      <div className={styles.grid}>
        {/* Coluna 1: Titulares Escalados e Banco de Reservas */}
        <div className={styles.columnCard}>
          <div className={styles.columnHeader}>
            <div className={styles.columnTitle}>
              <span>⚽ Titulares Escalados ({starters.length}/11)</span>
            </div>
            <span className={styles.subHelp}>Clique no ⭐ para escolher o Capitão (1.5x)</span>
          </div>

          <div className={styles.startersList}>
            {starters.length === 0 ? (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '24px 0' }}>
                Nenhum jogador escalado. Clique em &quot;+ Titular&quot; na coluna do elenco à direita!
              </span>
            ) : (
              sortedStarters.map((starter) => {
                const player = data.roster.find((r) => r.id === starter.playerId)
                return (
                  <div
                    key={starter.playerId}
                    className={`${styles.starterRow} ${
                      starter.isCaptain ? styles.starterRowCaptain : ''
                    }`}
                  >
                    <div
                      className={styles.playerMeta}
                      onClick={() => setModalPlayerId(starter.playerId)}
                      title="Clique para ver a ficha completa do atleta"
                      style={{ cursor: 'pointer' }}
                    >
                      <PlayerAvatar name={player?.name ?? 'J'} photoUrl={player?.photoUrl ?? null} />
                      <Badge variant={starter.position as any}>
                        {starter.position}
                      </Badge>
                      <div className={styles.playerInfo}>
                        <div className={styles.playerName}>{player?.name ?? 'Jogador'}</div>
                        <ClubBadge shortName={player?.clubShortName ?? ''} logoUrl={player?.clubLogoUrl ?? null} />
                      </div>
                    </div>

                    <div className={styles.starterActions}>
                      <button
                        type="button"
                        onClick={() => handleMakeCaptain(starter.playerId)}
                        disabled={data.isLocked}
                        className={`${styles.captainBtn} ${
                          starter.isCaptain ? styles.captainBtnActive : ''
                        }`}
                        title="Tornar Capitão (Pontos x1.5)"
                      >
                        {starter.isCaptain ? '⭐ Capitão (1.5x)' : '⭐ Capitão'}
                      </button>

                      {!data.isLocked && (
                        <button
                          type="button"
                          onClick={() => handleRemoveStarter(starter.playerId)}
                          className={styles.removeBtn}
                          title="Remover dos Titulares"
                        >
                          ✕ Remover
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Banco de Reservas (5 posições) */}
          <div className={styles.reserveSection}>
            <div className={styles.reserveHeader}>
              <div className={styles.reserveTitle}>
                <span>🔄 Banco de Reservas ({reserves.length}/5)</span>
              </div>
              <span className={styles.subHelp}>1 por posição para substituição automática</span>
            </div>

            <div className={styles.reserveList}>
              {(['GOL', 'LAT', 'ZAG', 'MEI', 'ATA'] as const).map((pos) => {
                const reserveItem = reserves.find((r) => r.position === pos)
                const player = reserveItem
                  ? data.roster.find((p) => p.id === reserveItem.playerId)
                  : null

                if (reserveItem && player) {
                  return (
                    <div key={pos} className={styles.reserveRow}>
                      <div
                        className={styles.playerMeta}
                        onClick={() => setModalPlayerId(player.id)}
                        title="Clique para ver a ficha completa do atleta"
                        style={{ cursor: 'pointer' }}
                      >
                        <PlayerAvatar name={player.name} photoUrl={player.photoUrl} />
                        <Badge variant={pos}>{pos}</Badge>
                        <div className={styles.playerInfo}>
                          <div className={styles.playerName}>{player.name}</div>
                          <ClubBadge shortName={player.clubShortName} logoUrl={player.clubLogoUrl} />
                        </div>
                      </div>
                      {!data.isLocked && (
                        <button
                          type="button"
                          onClick={() => handleRemoveReserve(player.id)}
                          className={styles.removeBtn}
                          title="Remover do banco de reservas"
                        >
                          ✕ Remover
                        </button>
                      )}
                    </div>
                  )
                }

                return (
                  <div key={pos} className={styles.emptyReserveRow}>
                    <div className={styles.playerMeta}>
                      <Badge variant={pos}>{pos}</Badge>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        Nenhum reserva de {pos} selecionado
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Coluna 2: Meu Elenco Completo */}
        <div className={styles.columnCard}>
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

          {/* Roster List */}
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
                      <ClubBadge shortName={player.clubShortName} logoUrl={player.clubLogoUrl} />
                    </div>
                  </div>

                  {isStarter ? (
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-green)' }}>
                      ✓ Titular
                    </span>
                  ) : isReserve ? (
                    <div className={styles.rosterActionsGroup}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#818cf8' }}>
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

      {/* Player Detail Modal */}
      <PlayerDetailModal
        playerId={modalPlayerId}
        leagueId={leagueId}
        onClose={() => setModalPlayerId(null)}
      />
    </div>
  )
}
