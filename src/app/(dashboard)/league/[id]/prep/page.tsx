'use client'

import { use, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  getPrepRoomData,
  addToWishlistAction,
  removeFromWishlistAction,
  moveWishlistPriorityAction,
  type PrepRoomData,
  type PrepPlayerData,
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
  const [clubFilter, setClubFilter] = useState<string>('TODOS')
  const [isClubDropdownOpen, setIsClubDropdownOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null)
  const [pendingPlayerIds, setPendingPlayerIds] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()

  const clubDropdownRef = useRef<HTMLDivElement>(null)

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

  // Close club dropdown on outside click
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

  const handleToggleWishlist = async (playerId: string) => {
    if (!data?.myTeamId) return
    if (pendingPlayerIds.has(playerId)) return // Prevent double click!

    // Mark player as loading
    setPendingPlayerIds((prev) => new Set(prev).add(playerId))

    try {
      const isInWishlist = data.myWishlist.some((w) => w.playerId === playerId)
      if (isInWishlist) {
        await removeFromWishlistAction(data.myTeamId, playerId)
      } else {
        await addToWishlistAction(data.myTeamId, playerId)
      }
      await loadData()
    } catch (err) {
      console.error('Erro ao atualizar lista de desejos:', err)
    } finally {
      setPendingPlayerIds((prev) => {
        const next = new Set(prev)
        next.delete(playerId)
        return next
      })
    }
  }

  const handleMovePriority = (playerId: string, direction: 'UP' | 'DOWN') => {
    if (!data?.myTeamId) return
    if (pendingPlayerIds.has(playerId)) return

    setPendingPlayerIds((prev) => new Set(prev).add(playerId))

    startTransition(async () => {
      try {
        await moveWishlistPriorityAction(data.myTeamId, playerId, direction)
        await loadData()
      } catch (err) {
        console.error('Erro ao reordenar prioridade:', err)
      } finally {
        setPendingPlayerIds((prev) => {
          const next = new Set(prev)
          next.delete(playerId)
          return next
        })
      }
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

  const selectedClub = data.clubs.find((c) => c.id === clubFilter)

  const filteredPlayers = data.availablePlayers.filter((player) => {
    const matchesPos = posFilter === 'TODOS' || player.position === posFilter
    const matchesClub = clubFilter === 'TODOS' || player.clubId === clubFilter
    const matchesSearch =
      search === '' ||
      player.name.toLowerCase().includes(search.toLowerCase()) ||
      player.clubName.toLowerCase().includes(search.toLowerCase()) ||
      player.clubShortName.toLowerCase().includes(search.toLowerCase())
    return matchesPos && matchesClub && matchesSearch
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

                    {data.clubs.map((club) => (
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

          {/* Catalog Counter and Active Filters */}
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

          {/* Players Grid */}
          <div className={styles.playerGrid}>
            {filteredPlayers.map((player) => {
              const inWishlist = wishlistPlayerIds.has(player.id)
              const isPendingThis = pendingPlayerIds.has(player.id)

              return (
                <div
                  key={player.id}
                  onClick={() => setModalPlayerId(player.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setModalPlayerId(player.id)
                    }
                  }}
                  className={`${styles.playerCard} ${
                    inWishlist ? styles.playerCardInWishlist : ''
                  }`}
                  title="Clique para ver a ficha técnica e scouts do atleta"
                >
                  <div>
                    {/* Card Top: Position Badge and Club Info */}
                    <div className={styles.cardHeader}>
                      <Badge variant={player.position}>{player.position}</Badge>

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
                              // If image fails, replace with placeholder
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

                        {/* Number of teams interested */}
                        {player.interestCount > 0 ? (
                          <span
                            className={styles.interestBadge}
                            title={`${player.interestCount} ${
                              player.interestCount === 1
                                ? 'time nesta liga tem'
                                : 'times nesta liga têm'
                            } este atleta na lista de desejos`}
                          >
                            🔥 {player.interestCount}{' '}
                            {player.interestCount === 1 ? 'time interessado' : 'times interessados'}
                          </span>
                        ) : (
                          <span
                            className={styles.interestBadgeZero}
                            title="Nenhum time na liga adicionou à lista ainda"
                          >
                            0 na fila
                          </span>
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

                  {/* Actions */}
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setModalPlayerId(player.id)
                      }}
                      className={styles.btnDetail}
                      title="Ver ficha técnica, histórico e scouts"
                    >
                      🔍 Ficha
                    </button>
                    <button
                      type="button"
                      disabled={isPendingThis}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleWishlist(player.id)
                      }}
                      className={`${styles.btnWishlist} ${
                        inWishlist ? styles.btnWishlistActive : ''
                      } ${isPendingThis ? styles.btnWishlistLoading : ''}`}
                      title={
                        inWishlist
                          ? 'Remover da Lista de Desejos'
                          : 'Adicionar à Lista de Desejos'
                      }
                    >
                      {isPendingThis ? (
                        <>
                          <span className={styles.miniSpinner} />
                          <span>Salvando...</span>
                        </>
                      ) : inWishlist ? (
                        '⭐ Na Fila'
                      ) : (
                        '+ Fila'
                      )}
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
                  const isItemPending = pendingPlayerIds.has(item.playerId)

                  return (
                    <div key={item.playerId} className={styles.wishlistItem}>
                      <div
                        className={styles.wishlistItemInfo}
                        onClick={() => setModalPlayerId(item.playerId)}
                        title="Ver ficha técnica do atleta"
                      >
                        <span className={styles.priorityNumber}>#{idx + 1}</span>

                        {item.photoUrl ? (
                          <img
                            src={item.photoUrl}
                            alt={item.playerName}
                            className={styles.wishlistAvatar}
                            loading="lazy"
                          />
                        ) : null}

                        <Badge variant={item.position}>{item.position}</Badge>

                        {item.clubLogoUrl && (
                          <img
                            src={item.clubLogoUrl}
                            alt={item.clubShortName}
                            className={styles.wishlistItemClubCrest}
                          />
                        )}

                        <span className={styles.wishlistItemName} title={item.playerName}>
                          {item.playerName}
                        </span>
                      </div>

                      <div className={styles.wishlistItemActions}>
                        <button
                          type="button"
                          disabled={isFirst || isItemPending}
                          onClick={() => handleMovePriority(item.playerId, 'UP')}
                          className={styles.reorderBtn}
                          title="Subir prioridade"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={isLast || isItemPending}
                          onClick={() => handleMovePriority(item.playerId, 'DOWN')}
                          className={styles.reorderBtn}
                          title="Descer prioridade"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          disabled={isItemPending}
                          onClick={() => handleToggleWishlist(item.playerId)}
                          className={styles.removeBtn}
                          title="Remover da lista"
                        >
                          {isItemPending ? <span className={styles.miniSpinner} /> : '✕'}
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
