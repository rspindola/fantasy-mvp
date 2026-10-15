'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { LeagueSummary } from '@/app/(dashboard)/dashboard/actions'
import { LeagueBannerUploader } from './LeagueBannerUploader'
import styles from '@/app/(dashboard)/dashboard/page.module.css'

interface LeagueGridProps {
  initialLeagues: LeagueSummary[]
}

type FilterTab = 'all' | 'commissioner' | 'draft'

export function LeagueGrid({ initialLeagues }: LeagueGridProps) {
  const [leagues, setLeagues] = useState<LeagueSummary[]>(initialLeagues)
  const [filter, setFilter] = useState<FilterTab>('all')

  const filteredLeagues = leagues.filter((league) => {
    if (filter === 'commissioner') return league.isCommissioner
    if (filter === 'draft') return league.status === 'drafting' || league.status === 'open'
    return true
  })

  function handleBannerUpdated(leagueId: string, newUrl: string) {
    setLeagues((prev) =>
      prev.map((l) => (l.id === leagueId ? { ...l, bannerImageUrl: newUrl } : l))
    )
  }

  return (
    <div className={styles.leaguesSection}>
      {/* Section Header with dynamic count and filter tabs */}
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitleGroup}>
          <h2 className={styles.sectionTitle}>Minhas Ligas</h2>
          <span className={styles.leagueCount}>
            {filteredLeagues.length} {filteredLeagues.length === 1 ? 'Liga' : 'Ligas'}
          </span>
        </div>

        <div className={styles.filterTabs}>
          <button
            type="button"
            className={`${styles.filterTab} ${filter === 'all' ? styles.filterTabActive : ''}`}
            onClick={() => setFilter('all')}
          >
            Todas
          </button>
          <button
            type="button"
            className={`${styles.filterTab} ${filter === 'commissioner' ? styles.filterTabActive : ''}`}
            onClick={() => setFilter('commissioner')}
          >
            Como Comissário
          </button>
          <button
            type="button"
            className={`${styles.filterTab} ${filter === 'draft' ? styles.filterTabActive : ''}`}
            onClick={() => setFilter('draft')}
          >
            Em Draft
          </button>
        </div>
      </div>

      {filteredLeagues.length === 0 && filter !== 'all' ? (
        <div className={styles.emptyFilteredState}>
          <p>Nenhuma liga encontrada para este filtro.</p>
          <button
            type="button"
            className={styles.resetFilterBtn}
            onClick={() => setFilter('all')}
          >
            Ver todas as ligas
          </button>
        </div>
      ) : filteredLeagues.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🏆</div>
          <h3 className={styles.emptyTitle}>Você ainda não participa de nenhuma liga</h3>
          <p className={styles.emptyText}>
            Crie sua própria liga para jogar com amigos ou insira o código de convite recebido.
          </p>
          <Link href="/league/create" className={styles.createBtn}>
            Criar Minha Primeira Liga
          </Link>
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredLeagues.map((league) => (
            <LeagueCardItem
              key={league.id}
              league={league}
              onBannerUpdated={(url) => handleBannerUpdated(league.id, url)}
            />
          ))}

          {/* "+ Criar Nova Competição" Card in grid */}
          <Link href="/league/create" className={styles.createCard} style={{ textDecoration: 'none' }}>
            <div className={styles.createIconCircle}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <div className={styles.createCardBody}>
              <p className={styles.createCardTitle}>Criar Nova Competição</p>
              <p className={styles.createCardText}>
                Configure seu próprio campeonato com regras personalizadas, draft e pontuação exclusiva.
              </p>
            </div>
            <span className={styles.createCardAction}>
              Começar agora →
            </span>
          </Link>
        </div>
      )}
    </div>
  )
}

function LeagueCardItem({
  league,
  onBannerUpdated,
}: {
  league: LeagueSummary
  onBannerUpdated: (url: string) => void
}) {
  const isFull = league.teamCount >= league.teamCap

  // Determine bottom CTA based on league status
  let ctaText = 'Acessar Liga →'
  let ctaHref = `/league/${league.id}`

  if (league.status === 'drafting') {
    ctaText = 'Entrar na Sala de Draft →'
    ctaHref = `/league/${league.id}/draft`
  } else if (league.status === 'open' && !league.teamName) {
    ctaText = 'Completar Inscrição →'
  }

  // Format Status Badge
  function renderStatusBadge(status: string) {
    if (status === 'active') {
      return <span className={styles.statusActive}>• ATIVA</span>
    }
    if (status === 'drafting') {
      return <span className={styles.statusDrafting}>DRAFT HOJE • 20H</span>
    }
    if (status === 'open') {
      return <span className={styles.statusOpen}>INSCRIÇÕES ABERTAS</span>
    }
    return <span className={styles.statusClosed}>ENCERRADA</span>
  }

  // Feature labels
  const scoringBadge = league.scoringMode === 'H2H' ? 'H2H' : 'PONTOS TOTAIS'
  const draftBadge =
    league.draftMode === 'HYBRID'
      ? 'DRAFT HYBRID'
      : league.draftMode === 'MANUAL'
      ? 'DRAFT MANUAL'
      : '100% AUTO'

  return (
    <div className={styles.card}>
      {/* Banner Area */}
      <div className={styles.cardBanner}>
        {league.bannerImageUrl ? (
          <img
            src={league.bannerImageUrl}
            alt=""
            className={styles.cardBannerImg}
          />
        ) : (
          /* Default Atmospheric Stadium Background */
          <div className={styles.defaultBannerBg}>
            <div className={styles.stadiumGlow} />
          </div>
        )}
        <div className={styles.cardBannerOverlay} />

        {/* Championship Badge top-left */}
        <div className={styles.championshipBadge}>
          {league.championshipLogoUrl ? (
            <img
              src={league.championshipLogoUrl}
              alt=""
              className={styles.championshipLogo}
              style={{ width: '18px', height: '18px', objectFit: 'contain' }}
            />
          ) : (
            <span className={styles.championshipTrophy}>🏆</span>
          )}
          <span className={styles.championshipName}>
            {league.championshipName || 'Brasileirão Série A'}
          </span>
        </div>

        {/* Status Badge top-right */}
        <div className={styles.statusBadgeWrapper}>
          {renderStatusBadge(league.status)}
        </div>

        {/* Edit banner for commissioner */}
        {league.isCommissioner && (
          <div className={styles.editBannerContainer}>
            <LeagueBannerUploader
              leagueId={league.id}
              currentBannerUrl={league.bannerImageUrl}
              onSuccess={onBannerUpdated}
            />
          </div>
        )}
      </div>

      {/* Card Body Link */}
      <Link href={ctaHref} className={styles.cardBody} style={{ textDecoration: 'none' }}>
        <div className={styles.cardMainInfo}>
          <h3 className={styles.leagueName}>{league.name}</h3>

          <div className={styles.teamMeta}>
            <span className={styles.teamLabel}>Time:</span>
            {league.teamName ? (
              <span className={styles.myTeam}>{league.teamName}</span>
            ) : (
              <span className={styles.pendingTeam}>Pendente de escalação</span>
            )}
          </div>

          <div className={styles.badges}>
            <span className={styles.featureBadge}>{scoringBadge}</span>
            <span className={styles.featureBadge}>{draftBadge}</span>
            <span className={styles.featureBadge}>CAPITÃO 1.5x</span>
          </div>
        </div>

        {/* Team count & Commissioner role */}
        <div className={styles.cardMetaRow}>
          <div className={styles.teamCountInfo}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>
              {league.teamCount} / {league.teamCap} times {isFull && <span className={styles.fullTag}>(Lotada)</span>}
            </span>
          </div>

          {league.isCommissioner ? (
            <span className={styles.commissionerBadge}>
              <span className={styles.starIcon}>⭐</span> Comissário
            </span>
          ) : (
            <span className={styles.guestBadge}>
              <span className={styles.shieldIcon}>🛡️</span> Convidado
            </span>
          )}
        </div>

        {/* Bottom CTA Action Bar */}
        <div className={styles.cardActionCta}>
          <span>{ctaText}</span>
        </div>
      </Link>
    </div>
  )
}
