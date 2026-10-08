import { describe, it, expect } from 'vitest'
import { processAutoSubstitutions, type LineupPlayerInput } from '@/lib/lineup/auto-sub'

describe('Partials & Live Scoring Rules', () => {
  it('computes live partial points only for players from started matches', () => {
    const starters: LineupPlayerInput[] = [
      // Match started at 19:45 (in progress, live scouts)
      {
        playerId: 'p1',
        name: 'Atacante em Campo (19:45)',
        position: 'ATA',
        slotPosition: 'ATA_1',
        isCaptain: false,
        isStarter: true,
        minutes: 60,
        points: 8.2,
        matchStatus: 'played',
      },
      // Match starts at 21:30 (scheduled, 0 pts)
      {
        playerId: 'p2',
        name: 'Meia a Jogar (21:30)',
        position: 'MEI',
        slotPosition: 'MEI_1',
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
        name: 'Meia Reserva',
        position: 'MEI',
        slotPosition: 'RES_MEI',
        isCaptain: false,
        isStarter: false,
        minutes: 0,
        points: 0.0,
        matchStatus: 'scheduled',
      },
    ]

    const result = processAutoSubstitutions(starters, reserves)

    // Starter whose game is scheduled should NOT be subbed out during live
    expect(result.substitutions).toHaveLength(0)
    expect(result.starters[1].subbedOut).toBe(false)
    // Only the live player's points are counted in the partial score
    expect(result.totalPoints).toBe(8.2)
  })

  it('keeps captain bonus live on captain from started match', () => {
    const starters: LineupPlayerInput[] = [
      {
        playerId: 'cap1',
        name: 'Capitão em Campo',
        position: 'ATA',
        slotPosition: 'ATA_1',
        isCaptain: true,
        isStarter: true,
        minutes: 45,
        points: 10.0,
        matchStatus: 'played',
      },
    ]

    const reserves: LineupPlayerInput[] = []
    const result = processAutoSubstitutions(starters, reserves)

    expect(result.captainBonus).toBe(5.0)
    expect(result.totalPoints).toBe(15.0)
  })
})
