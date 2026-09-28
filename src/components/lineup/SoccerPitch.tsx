import React from 'react'
import type { Formation } from '@/lib/lineup/lineup-engine'
import styles from './SoccerPitch.module.css'

export interface PitchPlayerSlot {
  playerId: string
  name: string
  position: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
  clubShortName: string
  isCaptain: boolean
}

interface SoccerPitchProps {
  formation: Formation
  starters: PitchPlayerSlot[]
  onSlotClick?: (slot: PitchPlayerSlot) => void
}

export const SoccerPitch: React.FC<SoccerPitchProps> = ({
  starters,
  onSlotClick,
}) => {
  const gol = starters.filter((s) => s.position === 'GOL')
  const def = starters.filter((s) => s.position === 'ZAG' || s.position === 'LAT')
  const mei = starters.filter((s) => s.position === 'MEI')
  const ata = starters.filter((s) => s.position === 'ATA')

  return (
    <div className={styles.pitch}>
      <div className={styles.centerCircle} />

      {/* Row: Atacantes */}
      <div className={styles.row}>
        {ata.map((player) => (
          <div
            key={player.playerId}
            onClick={() => onSlotClick?.(player)}
            className={`${styles.playerSlot} ${
              player.isCaptain ? styles.playerSlotCaptain : ''
            }`}
          >
            <span className={styles.slotPosBadge} style={{ color: 'var(--pos-ata)' }}>
              ATA
            </span>
            <span className={styles.slotName}>{player.name}</span>
            <span className={styles.slotClub}>{player.clubShortName}</span>
            {player.isCaptain && <span className={styles.captainTag}>CAPITÃO</span>}
          </div>
        ))}
      </div>

      {/* Row: Meias */}
      <div className={styles.row}>
        {mei.map((player) => (
          <div
            key={player.playerId}
            onClick={() => onSlotClick?.(player)}
            className={`${styles.playerSlot} ${
              player.isCaptain ? styles.playerSlotCaptain : ''
            }`}
          >
            <span className={styles.slotPosBadge} style={{ color: 'var(--pos-mei)' }}>
              MEI
            </span>
            <span className={styles.slotName}>{player.name}</span>
            <span className={styles.slotClub}>{player.clubShortName}</span>
            {player.isCaptain && <span className={styles.captainTag}>CAPITÃO</span>}
          </div>
        ))}
      </div>

      {/* Row: Defesa (ZAG + LAT) */}
      <div className={styles.row}>
        {def.map((player) => (
          <div
            key={player.playerId}
            onClick={() => onSlotClick?.(player)}
            className={`${styles.playerSlot} ${
              player.isCaptain ? styles.playerSlotCaptain : ''
            }`}
          >
            <span
              className={styles.slotPosBadge}
              style={{
                color: player.position === 'ZAG' ? 'var(--pos-zag)' : 'var(--pos-lat)',
              }}
            >
              {player.position}
            </span>
            <span className={styles.slotName}>{player.name}</span>
            <span className={styles.slotClub}>{player.clubShortName}</span>
            {player.isCaptain && <span className={styles.captainTag}>CAPITÃO</span>}
          </div>
        ))}
      </div>

      {/* Row: Goleiro */}
      <div className={styles.row}>
        {gol.map((player) => (
          <div
            key={player.playerId}
            onClick={() => onSlotClick?.(player)}
            className={`${styles.playerSlot} ${
              player.isCaptain ? styles.playerSlotCaptain : ''
            }`}
          >
            <span className={styles.slotPosBadge} style={{ color: 'var(--pos-gol)' }}>
              GOL
            </span>
            <span className={styles.slotName}>{player.name}</span>
            <span className={styles.slotClub}>{player.clubShortName}</span>
            {player.isCaptain && <span className={styles.captainTag}>CAPITÃO</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
