'use client'

import { use, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  getPrepRoomData,
  addToWishlistAction,
  removeFromWishlistAction,
  moveWishlistPriorityAction,
  type PrepRoomData,
} from './actions'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PlayerDetailModal } from '@/components/player/PlayerDetailModal'
import styles from './page.module.css'

export default function PreDraftPrepPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: leagueId } = use(params)
  const [data, setData] = useState<PrepRoomData | null>(null)
  const [loading, setLoading] = useState(true)
  const [posFilter, setPosFilter] = useState<string>('TODOS')
  const [search, setSearch] = useState('')
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const loadData = async () => {
    try {
      const res = await getPrepRoomData(leagueId)
      setData(res)
    } catch (err) {
      console.error('Erro ao carregar pré-draft:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [leagueId])

  const handleToggleWishlist = (playerId: string) => {
    if (!data?.myTeamId) return

    const isInWishlist = data.myWishlist.some((w) => w.playerId === playerId)
    startTransition(async () => {
      if (isInWishlist) {
        await removeFromWishlistAction(data.myTeamId, playerId)
      } else {
        await addToWishlistAction(data.myTeamId, playerId)
      }
      await loadData()
    })
  }

  const handleMovePriority = (playerId: string, direction: 'UP' | 'DOWN') => {
    if (!data?.myTeamId) return

    startTransition(async () => {
      await moveWishlistPriorityAction(data.myTeamId, playerId, direction)
      await loadData()
    })
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.topBar}>
          <Link href={`/league/${leagueId}`} className={styles.backLink}>
            ← Voltar para a Liga
          </Link>
        </div>
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          Carregando Planejamento Pré-Draft...
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <div className={styles.topBar}>
          <Link href={`/league/${leagueId}`} className={styles.backLink}>
            ← Voltar para a Liga
          </Link>
        </div>
        <div className={styles.headerCard}>
          <h2>Liga ou time não encontrado</h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            Você precisa estar inscrito com um time nesta liga para planejar o draft.
          </p>
          <div style={{ marginTop: '16px' }}>
            <Link href={`/league/${leagueId}`}>
              <Button size="md">Ir para a Liga</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const wishlistPlayerIds = new Set(data.myWishlist.map((w) => w.playerId))

  const filteredPlayers = data.availablePlayers.filter((player) => {
    const matchesPos = posFilter === 'TODOS' || player.position === posFilter
    const matchesSearch =
      search === '' ||
      player.name.toLowerCase().includes(search.toLowerCase()) ||
      player.clubName.toLowerCase().includes(search.toLowerCase()) ||
      player.clubShortName.toLowerCase().includes(search.toLowerCase())
    return matchesPos && matchesSearch
  })

  return (
    <div className={styles.container}>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <Link href={`/league/${leagueId}`} className={styles.backLink}>
          ← Voltar para a Liga {data.leagueName}
        </Link>
      </div>

      {/* Header Card */}
      <div className={styles.headerCard}>
        <div className={styles.titleRow}>
          <h1 className={styles.pageTitle}>
            <span>📋 Planejamento Pré-Draft</span>
          </h1>
          <span className={styles.teamBadge}>
            Time: <strong>{data.myTeamName}</strong>
          </span>
        </div>
        <p className={styles.pageSubtitle}>
          Pesquise todos os jogadores da Série A, analise estatísticas e defina a ordem da sua{' '}
          <strong>Lista de Desejos</strong> antes do início do draft.
        </p>

        {/* Info Banner */}
        <div className={styles.infoBanner}>
          <div className={styles.infoBannerIcon}>💡</div>
          <div>
            <strong>Como funciona sua lista no Draft:</strong> Os jogadores que você favoritar aqui
            ficarão salvos para a sala de draft. Caso você esteja ausente na sua vez ou o comissário faça
            uma escolha assistida para você, o sistema priorizará automaticamente os jogadores da sua fila de desejos, do #1 em diante!
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className={styles.grid}>
        {/* Board Area */}
        <div className={styles.boardArea}>
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

            {/* Search Input */}
            <input
              type="text"
              placeholder="🔍 Buscar jogador ou clube..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Exibindo <strong>{filteredPlayers.length}</strong> jogadores disponíveis no catálogo
          </div>

          {/* Players Grid */}
          <div className={styles.playerGrid}>
            {filteredPlayers.map((player) => {
              const inWishlist = wishlistPlayerIds.has(player.id)

              return (
                <div
                  key={player.id}
                  className={`${styles.playerCard} ${
                    inWishlist ? styles.playerCardInWishlist : ''
                  }`}
                >
                  <div>
                    <div className={styles.cardHeader}>
                      <Badge variant={player.position}>{player.position}</Badge>
                      <span className={styles.playerClub}>{player.clubShortName}</span>
                    </div>

                    <div style={{ marginTop: '8px' }}>
                      <div className={styles.playerName} title={player.name}>
                        {player.name}
                      </div>
                    </div>
                  </div>

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

                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      onClick={() => setModalPlayerId(player.id)}
                      className={styles.btnDetail}
                      title="Ver ficha técnica, histórico e scouts"
                    >
                      🔍 Ficha
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleToggleWishlist(player.id)}
                      className={`${styles.btnWishlist} ${
                        inWishlist ? styles.btnWishlistActive : ''
                      }`}
                      title={
                        inWishlist
                          ? 'Remover da Lista de Desejos'
                          : 'Adicionar à Lista de Desejos'
                      }
                    >
                      {inWishlist ? '⭐ Na Fila' : '+ Fila'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sidebar Area: My Wishlist */}
        <div className={styles.sidebarArea}>
          <div className={styles.wishlistCard}>
            <div className={styles.wishlistHeader}>
              <h2 className={styles.wishlistTitle}>
                <span>⭐ Minha Lista de Desejos</span>
              </h2>
              <span className={styles.wishlistCounter}>
                {data.myWishlist.length} {data.myWishlist.length === 1 ? 'atleta' : 'atletas'}
              </span>
            </div>

            {data.myWishlist.length === 0 ? (
              <div className={styles.emptyState}>
                Sua lista ainda está vazia!
                <br />
                Clique em <strong>+ Fila</strong> nos jogadores ao lado para priorizá-los na ordem que desejar.
              </div>
            ) : (
              <div className={styles.wishlistList}>
                {data.myWishlist.map((item, idx) => {
                  const isFirst = idx === 0
                  const isLast = idx === data.myWishlist.length - 1

                  return (
                    <div key={item.playerId} className={styles.wishlistItem}>
                      <div className={styles.wishlistItemInfo}>
                        <span className={styles.priorityNumber}>#{idx + 1}</span>
                        <Badge variant={item.position}>{item.position}</Badge>
                        <span className={styles.wishlistItemName} title={item.playerName}>
                          {item.playerName}
                        </span>
                      </div>

                      <div className={styles.wishlistItemActions}>
                        <button
                          type="button"
                          disabled={isFirst || isPending}
                          onClick={() => handleMovePriority(item.playerId, 'UP')}
                          className={styles.reorderBtn}
                          title="Subir prioridade"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={isLast || isPending}
                          onClick={() => handleMovePriority(item.playerId, 'DOWN')}
                          className={styles.reorderBtn}
                          title="Descer prioridade"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleToggleWishlist(item.playerId)}
                          className={styles.removeBtn}
                          title="Remover da lista"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Player Detail Modal */}
      {modalPlayerId && (
        <PlayerDetailModal
          playerId={modalPlayerId}
          leagueId={leagueId}
          onClose={() => setModalPlayerId(null)}
        />
      )}
    </div>
  )
}
