'use client'

import React from 'react'
import type { Formation, LineupSlotItem } from '@/lib/lineup/lineup-engine'
import { FORMATION_REQUIREMENTS } from '@/lib/lineup/lineup-engine'
import type { LineupPageData } from '@/app/(dashboard)/league/[id]/lineup/actions'
import styles from './SoccerPitch.module.css'

export interface SoccerPitchProps {
  formation: Formation
  starters: LineupSlotItem[]
  roster: LineupPageData['roster']
  isLocked: boolean
  onEmptySlotClick: (position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA', slotIndex: number) => void
  onFilledSlotClick: (
    player: LineupPageData['roster'][0],
    starterItem: LineupSlotItem,
    slotIndex: number
  ) => void
}

/** Renders individual player card or empty placeholder on the tactical pitch */
function PitchPlayerCard({
  player,
  starterItem,
  position,
  isLocked,
  onEmptyClick,
  onFilledClick,
}: {
  player: LineupPageData['roster'][0] | null
  starterItem?: LineupSlotItem
  position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
  isLocked: boolean
  onEmptyClick: () => void
  onFilledClick: () => void
}) {
  if (!player) {
    return (
      <button
        type="button"
        disabled={isLocked}
        onClick={onEmptyClick}
        className={styles.emptySlot}
        title={`Clique para escalar ${position}`}
      >
        <div className={styles.emptySlotCircle}>
          <span className={styles.plusIcon}>+</span>
          <span className={styles.emptySlotPos}>{position}</span>
        </div>
        <span className={styles.emptySlotLabel}>Escalar</span>
      </button>
    )
  }

  const isCaptain = starterItem?.isCaptain ?? false

  return (
    <button
      type="button"
      onClick={onFilledClick}
      className={`${styles.playerCard} ${isCaptain ? styles.playerCardCaptain : ''}`}
      title={`${player.name} (${position}) · Toque para opções`}
    >
      <div className={styles.avatarWrapper}>
        {/* Captain badge overlay */}
        {isCaptain && (
          <div className={styles.captainBadge}>
            <span className={styles.captainStar}>★</span>
            <span className={styles.captainText}>C 1.5X</span>
          </div>
        )}

        {/* Position tag */}
        <span className={`${styles.posTag} ${styles[`pos_${position}`]}`}>
          {position}
        </span>

        {/* Player Avatar */}
        {player.photoUrl ? (
          <img
            src={player.photoUrl}
            alt={player.name}
            className={`${styles.avatarImg} ${isCaptain ? styles.avatarCaptain : ''}`}
          />
        ) : (
          <div className={`${styles.avatarPlaceholder} ${isCaptain ? styles.avatarCaptain : ''}`}>
            {player.name
              .split(' ')
              .slice(0, 2)
              .map((w) => w[0])
              .join('')
              .toUpperCase()}
          </div>
        )}

        {/* Club Badge */}
        <div className={styles.clubBadgeWrapper}>
          {player.clubLogoUrl ? (
            <img src={player.clubLogoUrl} alt={player.clubShortName} className={styles.clubLogo} />
          ) : (
            <span className={styles.clubTextBadge}>{player.clubShortName}</span>
          )}
        </div>
      </div>

      {/* Player Name */}
      <span className={`${styles.playerName} ${isCaptain ? styles.playerNameCaptain : ''}`}>
        {player.name}
      </span>

      {/* Opponent & Points */}
      <div className={styles.playerMetaRow}>
        {isCaptain ? (
          <span className={styles.captainAvgText}>Média {player.avgPoints.toFixed(1)}</span>
        ) : (
          <>
            {player.opponent ? (
              <span className={styles.opponentText}>{player.opponent.label}</span>
            ) : (
              <span className={styles.opponentText}>Sem jogo</span>
            )}
            <span className={styles.pointsText}>{player.avgPoints.toFixed(1)}</span>
          </>
        )}
      </div>
    </button>
  )
}

export const SoccerPitch: React.FC<SoccerPitchProps> = ({
  formation,
  starters,
  roster,
  isLocked,
  onEmptySlotClick,
  onFilledSlotClick,
}) => {
  const reqs = FORMATION_REQUIREMENTS[formation] || FORMATION_REQUIREMENTS['4-3-3']

  // Group starters by position
  const startersByPos: Record<string, LineupSlotItem[]> = {
    GOL: starters.filter((s) => s.position === 'GOL'),
    LAT: starters.filter((s) => s.position === 'LAT'),
    ZAG: starters.filter((s) => s.position === 'ZAG'),
    MEI: starters.filter((s) => s.position === 'MEI'),
    ATA: starters.filter((s) => s.position === 'ATA'),
  }

  // 1. Attackers row (ATA)
  const attackersSlots: {
    pos: 'ATA'
    idx: number
    starterItem?: LineupSlotItem
    player: LineupPageData['roster'][0] | null
  }[] = []
  for (let i = 0; i < reqs.ATA; i++) {
    const starterItem = startersByPos.ATA[i]
    const player = starterItem ? roster.find((r) => r.id === starterItem.playerId) || null : null
    attackersSlots.push({ pos: 'ATA', idx: i, starterItem, player })
  }

  // 2. Midfielders row (MEI)
  const midfieldersSlots: {
    pos: 'MEI'
    idx: number
    starterItem?: LineupSlotItem
    player: LineupPageData['roster'][0] | null
  }[] = []
  for (let i = 0; i < reqs.MEI; i++) {
    const starterItem = startersByPos.MEI[i]
    const player = starterItem ? roster.find((r) => r.id === starterItem.playerId) || null : null
    midfieldersSlots.push({ pos: 'MEI', idx: i, starterItem, player })
  }

  // 3. Defenders row (DEF: LAT & ZAG)
  // Formations with 3 defenders (3-4-3, 3-5-2): ZAG, ZAG, ZAG
  // Formations with 4 defenders (4-3-3, 4-4-2, 4-5-1): LAT, ZAG, ZAG, LAT
  // Formations with 5 defenders (5-3-2, 5-4-1): LAT, ZAG, ZAG, ZAG, LAT
  let defPositions: ('LAT' | 'ZAG')[] = []
  if (reqs.LAT === 0) {
    defPositions = ['ZAG', 'ZAG', 'ZAG']
  } else if (reqs.ZAG === 2) {
    defPositions = ['LAT', 'ZAG', 'ZAG', 'LAT']
  } else {
    defPositions = ['LAT', 'ZAG', 'ZAG', 'ZAG', 'LAT']
  }

  let latCount = 0
  let zagCount = 0
  const defendersSlots = defPositions.map((pos) => {
    const idx = pos === 'LAT' ? latCount++ : zagCount++
    const starterItem = startersByPos[pos][idx]
    const player = starterItem ? roster.find((r) => r.id === starterItem.playerId) || null : null
    return { pos, idx, starterItem, player }
  })

  // 4. Goalkeeper row (GOL)
  const golStarter = startersByPos.GOL[0]
  const golPlayer = golStarter ? roster.find((r) => r.id === golStarter.playerId) || null : null

  return (
    <div className={styles.pitchContainer}>
      {/* Tactical Pitch SVG Field Geometry */}
      <svg
        className={styles.pitchSvg}
        viewBox="0 0 600 780"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer pitch border */}
        <rect
          x="16"
          y="16"
          width="568"
          height="748"
          rx="18"
          fill="none"
          stroke="rgba(56, 189, 248, 0.18)"
          strokeWidth="1.8"
        />

        {/* Corner Arcs */}
        <path
          d="M 16 42 A 26 26 0 0 0 42 16"
          fill="none"
          stroke="rgba(56, 189, 248, 0.16)"
          strokeWidth="1.6"
        />
        <path
          d="M 558 16 A 26 26 0 0 0 584 42"
          fill="none"
          stroke="rgba(56, 189, 248, 0.16)"
          strokeWidth="1.6"
        />
        <path
          d="M 16 738 A 26 26 0 0 1 42 764"
          fill="none"
          stroke="rgba(56, 189, 248, 0.16)"
          strokeWidth="1.6"
        />
        <path
          d="M 558 764 A 26 26 0 0 1 584 738"
          fill="none"
          stroke="rgba(56, 189, 248, 0.16)"
          strokeWidth="1.6"
        />

        {/* Halfway line */}
        <line
          x1="16"
          y1="390"
          x2="584"
          y2="390"
          stroke="rgba(56, 189, 248, 0.16)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />

        {/* Center circle */}
        <circle
          cx="300"
          cy="390"
          r="68"
          fill="none"
          stroke="rgba(56, 189, 248, 0.16)"
          strokeWidth="1.5"
        />
        <circle cx="300" cy="390" r="3.5" fill="rgba(56, 189, 248, 0.3)" />

        {/* Opponent Penalty Box (Top) */}
        <rect
          x="160"
          y="16"
          width="280"
          height="115"
          fill="none"
          stroke="rgba(56, 189, 248, 0.14)"
          strokeWidth="1.5"
        />
        <rect
          x="230"
          y="16"
          width="140"
          height="42"
          fill="none"
          stroke="rgba(56, 189, 248, 0.14)"
          strokeWidth="1.5"
        />
        <path
          d="M 245 131 A 62 62 0 0 0 355 131"
          fill="none"
          stroke="rgba(56, 189, 248, 0.14)"
          strokeWidth="1.5"
        />

        {/* Goalkeeper Penalty Box (Bottom) */}
        <rect
          x="160"
          y="649"
          width="280"
          height="115"
          fill="none"
          stroke="rgba(56, 189, 248, 0.14)"
          strokeWidth="1.5"
        />
        <rect
          x="230"
          y="722"
          width="140"
          height="42"
          fill="none"
          stroke="rgba(56, 189, 248, 0.14)"
          strokeWidth="1.5"
        />
        <path
          d="M 245 649 A 62 62 0 0 1 355 649"
          fill="none"
          stroke="rgba(56, 189, 248, 0.14)"
          strokeWidth="1.5"
        />
      </svg>

      {/* Row 1: Attackers (ATA) */}
      <div className={`${styles.pitchRow} ${styles.rowAttackers}`}>
        {attackersSlots.map((slot) => (
          <PitchPlayerCard
            key={`pitch-slot-ata-${slot.idx}`}
            player={slot.player}
            starterItem={slot.starterItem}
            position={slot.pos}
            isLocked={isLocked}
            onEmptyClick={() => onEmptySlotClick(slot.pos, slot.idx)}
            onFilledClick={() => slot.player && onFilledSlotClick(slot.player, slot.starterItem!, slot.idx)}
          />
        ))}
      </div>

      {/* Row 2: Midfielders (MEI) */}
      <div className={`${styles.pitchRow} ${styles.rowMidfielders}`}>
        {midfieldersSlots.map((slot) => (
          <PitchPlayerCard
            key={`pitch-slot-mei-${slot.idx}`}
            player={slot.player}
            starterItem={slot.starterItem}
            position={slot.pos}
            isLocked={isLocked}
            onEmptyClick={() => onEmptySlotClick(slot.pos, slot.idx)}
            onFilledClick={() => slot.player && onFilledSlotClick(slot.player, slot.starterItem!, slot.idx)}
          />
        ))}
      </div>

      {/* Row 3: Defenders (LAT & ZAG) */}
      <div className={`${styles.pitchRow} ${styles.rowDefenders}`}>
        {defendersSlots.map((slot, i) => (
          <PitchPlayerCard
            key={`pitch-slot-def-${slot.pos}-${slot.idx}-${i}`}
            player={slot.player}
            starterItem={slot.starterItem}
            position={slot.pos}
            isLocked={isLocked}
            onEmptyClick={() => onEmptySlotClick(slot.pos, slot.idx)}
            onFilledClick={() => slot.player && onFilledSlotClick(slot.player, slot.starterItem!, slot.idx)}
          />
        ))}
      </div>

      {/* Row 4: Goalkeeper (GOL) */}
      <div className={`${styles.pitchRow} ${styles.rowGoalkeeper}`}>
        <PitchPlayerCard
          player={golPlayer}
          starterItem={golStarter}
          position="GOL"
          isLocked={isLocked}
          onEmptyClick={() => onEmptySlotClick('GOL', 0)}
          onFilledClick={() => golPlayer && onFilledSlotClick(golPlayer, golStarter!, 0)}
        />
      </div>
    </div>
  )
}
