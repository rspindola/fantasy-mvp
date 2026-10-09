import { describe, it, expect } from 'vitest'
import { processAutoSubstitutions, type LineupPlayerInput } from '@/lib/lineup/auto-sub'

describe('Auto-Sub Engine', () => {
  it('does not substitute when all starters played', () => {
    const starters: LineupPlayerInput[] = [
      {
        playerId: 'p1',
        name: 'Goleiro Titular',
        position: 'GOL',
        slotPosition: 'GOL_1',
        isCaptain: false,
        isStarter: true,
        minutes: 90,
        points: 7.0,
      },
      {
        playerId: 'p2',
        name: 'Atacante Titular',
        position: 'ATA',
        slotPosition: 'ATA_1',
        isCaptain: true,
        isStarter: true,
        minutes: 90,
        points: 10.0,
      },
    ]

    const reserves: LineupPlayerInput[] = [
      {
        playerId: 'r1',
        name: 'Goleiro Reserva',
        position: 'GOL',
        slotPosition: 'RES_GOL',
        isCaptain: false,
        isStarter: false,
        minutes: 90,
        points: 5.0,
      },
      {
        playerId: 'r2',
        name: 'Atacante Reserva',
        position: 'ATA',
        slotPosition: 'RES_ATA',
        isCaptain: false,
        isStarter: false,
        minutes: 90,
        points: 8.0,
      },
    ]

    const result = processAutoSubstitutions(starters, reserves)

    expect(result.substitutions).toHaveLength(0)
    expect(result.starters[0].subbedOut).toBe(false)
    expect(result.reserves[0].subbedIn).toBe(false)
    // 7.0 + 10.0 + 5.0 (captain bonus) = 22.0
    expect(result.totalPoints).toBe(22.0)
    expect(result.captainBonus).toBe(5.0)
  })

  it('substitutes a starter with 0 minutes by reserve of same position who played', () => {
    const starters: LineupPlayerInput[] = [
      {
        playerId: 'p1',
        name: 'Zagueiro Lesionado',
        position: 'ZAG',
        slotPosition: 'ZAG_1',
        isCaptain: false,
        isStarter: true,
        minutes: 0,
        points: 0.0,
      },
    ]

    const reserves: LineupPlayerInput[] = [
      {
        playerId: 'r1',
        name: 'Zagueiro Reserva',
        position: 'ZAG',
        slotPosition: 'RES_ZAG',
        isCaptain: false,
        isStarter: false,
        minutes: 90,
        points: 6.5,
      },
    ]

    const result = processAutoSubstitutions(starters, reserves)

    expect(result.substitutions).toHaveLength(1)
    expect(result.substitutions[0].outPlayer.playerId).toBe('p1')
    expect(result.substitutions[0].inPlayer.playerId).toBe('r1')
    expect(result.starters[0].subbedOut).toBe(true)
    expect(result.reserves[0].subbedIn).toBe(true)
    expect(result.totalPoints).toBe(6.5)
  })

  it('transfers captaincy to subbed-in player if DNP starter was captain', () => {
    const starters: LineupPlayerInput[] = [
      {
        playerId: 'p1',
        name: 'Meia Capitão Poupado',
        position: 'MEI',
        slotPosition: 'MEI_1',
        isCaptain: true,
        isStarter: true,
        minutes: 0,
        points: 0.0,
      },
    ]

    const reserves: LineupPlayerInput[] = [
      {
        playerId: 'r1',
        name: 'Meia Reserva',
        position: 'MEI',
        slotPosition: 'RES_MEI',
        isCaptain: false,
        isStarter: false,
        minutes: 75,
        points: 8.0,
      },
    ]

    const result = processAutoSubstitutions(starters, reserves)

    expect(result.substitutions).toHaveLength(1)
    expect(result.substitutions[0].captainTransferred).toBe(true)
    expect(result.reserves[0].isCaptain).toBe(true)
    // 8.0 + (8.0 * 0.5) = 12.0
    expect(result.captainBonus).toBe(4.0)
    expect(result.totalPoints).toBe(12.0)
  })

  it('does not substitute if reserve also had 0 minutes', () => {
    const starters: LineupPlayerInput[] = [
      {
        playerId: 'p1',
        name: 'Lateral Fora',
        position: 'LAT',
        slotPosition: 'LAT_1',
        isCaptain: false,
        isStarter: true,
        minutes: 0,
        points: 0.0,
      },
    ]

    const reserves: LineupPlayerInput[] = [
      {
        playerId: 'r1',
        name: 'Lateral Reserva Lesionado',
        position: 'LAT',
        slotPosition: 'RES_LAT',
        isCaptain: false,
        isStarter: false,
        minutes: 0,
        points: 0.0,
      },
    ]

    const result = processAutoSubstitutions(starters, reserves)

    expect(result.substitutions).toHaveLength(0)
    expect(result.starters[0].subbedOut).toBe(false)
    expect(result.reserves[0].subbedIn).toBe(false)
    expect(result.totalPoints).toBe(0.0)
  })

  it('does not substitute a starter whose match is scheduled (game not played yet)', () => {
    const starters: LineupPlayerInput[] = [
      {
        playerId: 'p1',
        name: 'Hugo Souza',
        position: 'GOL',
        slotPosition: 'GOL_1',
        isCaptain: false,
        isStarter: true,
        minutes: 0,
        points: 0.0,
        matchStatus: 'scheduled',
      },
    ]

    const reserves: LineupPlayerInput[] = [
      {
        playerId: 'r1',
        name: 'Goleiro Reserva (Jogou na sexta)',
        position: 'GOL',
        slotPosition: 'RES_GOL',
        isCaptain: false,
        isStarter: false,
        minutes: 90,
        points: 6.0,
        matchStatus: 'played',
      },
    ]

    const result = processAutoSubstitutions(starters, reserves)

    // Hugo Souza should NOT be replaced because his game is in the future
    expect(result.substitutions).toHaveLength(0)
    expect(result.starters[0].subbedOut).toBe(false)
    expect(result.reserves[0].subbedIn).toBe(false)
    expect(result.totalPoints).toBe(0.0)
  })

  it('does not substitute a starter whose match is LIVE (game currently in progress)', () => {
    const starters: LineupPlayerInput[] = [
      {
        playerId: 'p1',
        name: 'Léo Ortiz',
        position: 'ZAG',
        slotPosition: 'ZAG_1',
        isCaptain: false,
        isStarter: true,
        minutes: 0,
        points: 0.0,
        matchStatus: 'live',
      },
    ]

    const reserves: LineupPlayerInput[] = [
      {
        playerId: 'r1',
        name: 'Zagueiro Reserva (Jogou ontem)',
        position: 'ZAG',
        slotPosition: 'RES_ZAG',
        isCaptain: false,
        isStarter: false,
        minutes: 90,
        points: 8.5,
        matchStatus: 'played',
      },
    ]

    const result = processAutoSubstitutions(starters, reserves)

    // Léo Ortiz is in a match that is LIVE right now, so he MUST NOT be subbed out!
    expect(result.substitutions).toHaveLength(0)
    expect(result.starters[0].subbedOut).toBe(false)
    expect(result.reserves[0].subbedIn).toBe(false)
    expect(result.totalPoints).toBe(0.0)
  })
})

