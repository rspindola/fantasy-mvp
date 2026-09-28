'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  getDraftRoomData,
  submitPickAction,
  toggleDraftPauseAction,
  addToWishlistAction,
  removeFromWishlistAction,
  type DraftStateData,
} from './actions'
import { createClient } from '@/lib/supabase/client'
import { formatTimerSeconds } from '@/lib/utils/format'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import styles from './page.module.css'

export default function DraftRoomPage() {
  const params = useParams()
  const leagueId = params.id as string

  const [data, setData] = useState<DraftStateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [posFilter, setPosFilter] = useState<string>('TODOS')
  const [search, setSearch] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null)
  const [isPending, startTransition] = useTransition()
  const [pickError, setPickError] = useState<string | null>(null)

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

  const isCompleted = data.status === 'active' || data.currentPick > data.totalPicks

  const filteredPlayers = data.availablePlayers.filter((p) => {
    const matchesPos = posFilter === 'TODOS' || p.position === posFilter
    const matchesSearch =
      search === '' || p.name.toLowerCase().includes(search.toLowerCase())
    return matchesPos && matchesSearch
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
              : `Pick ${data.currentPick} de ${data.totalPicks} (Rodada ${Math.ceil(
                  data.currentPick / (data.totalPicks / 24)
                )} de 24) · Timer: ${formatTimerSeconds(data.pickTimerSeconds)}`}
          </span>
        </div>

        {!isCompleted && (
          <div className={styles.controlsGroup}>
            {data.isCommissioner && (
              <Button
                variant={data.isPaused ? 'primary' : 'ghost'}
                size="sm"
                onClick={handleTogglePause}
                isLoading={isPending}
              >
                {data.isPaused ? '▶️ Retomar Draft' : '⏸️ Pausar Draft'}
              </Button>
            )}

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
            </div>
          </div>
        )}
      </div>

      {/* Paused Banner */}
      {data.isPaused && !isCompleted && (
        <div className={styles.pausedBanner}>
          <span>⏸️ O Draft está temporariamente PAUSADO pelo comissário.</span>
          <span style={{ fontSize: '0.8125rem', fontWeight: 400 }}>
            Nenhum timer ou pick automático é executado enquanto estiver pausado.
          </span>
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
            {/* Filters */}
            <div className={styles.filterRow}>
              <div className={styles.posFilters}>
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
              </div>

              <input
                type="text"
                placeholder="🔍 Buscar jogador..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={styles.searchInput}
              />
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
            {selectedPlayer && data.isMyTurn && !data.isPaused && (
              <div
                style={{
                  background: 'var(--accent-green-subtle)',
                  border: '1px solid var(--border-accent)',
                  padding: '12px 20px',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <strong>Confirmar escolha: </strong>
                  {selectedPlayer.name} ({selectedPlayer.position}) —{' '}
                  {selectedPlayer.clubShortName}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
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
            )}

            {/* Players Grid */}
            <div className={styles.playerGrid}>
              {filteredPlayers.map((player) => {
                const isSelected = selectedPlayer?.id === player.id
                const inWishlist = wishlistPlayerIds.has(player.id)
                const canPick = data.isMyTurn && !data.isPaused

                return (
                  <div
                    key={player.id}
                    onClick={() => {
                      if (canPick) setSelectedPlayer(player)
                    }}
                    className={`${styles.playerCard} ${
                      canPick ? styles.playerCardSelectable : ''
                    }`}
                    style={
                      isSelected
                        ? {
                            borderColor: 'var(--accent-green)',
                            background: 'var(--accent-green-subtle)',
                          }
                        : {}
                    }
                  >
                    <div className={styles.playerCardHeader}>
                      <Badge variant={player.position as any}>
                        {player.position}
                      </Badge>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleWishlist(player.id)
                        }}
                        className={`${styles.wishlistBtn} ${
                          inWishlist ? styles.wishlistBtnActive : ''
                        }`}
                        title={
                          inWishlist
                            ? "Remover da Fila de Preferência"
                            : "Adicionar à Fila de Preferência (Auto-pick prioriza)"
                        }
                      >
                        {inWishlist ? '⭐ Na Fila' : '+ Fila'}
                      </button>
                    </div>

                    <div className={styles.playerName}>{player.name}</div>

                    <div className={styles.playerFooter}>
                      <span className={styles.playerClub}>
                        {player.clubShortName}
                      </span>
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
                    Sua fila está vazia. Clique em "+ Fila" nos jogadores para
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
    </div>
  )
}
