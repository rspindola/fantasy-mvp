import { describe, it, expect } from 'vitest'
import { generateSnakeOrder } from '@/lib/draft/snake-order'
import {
  autoPickPlayer,
  getPositionDeficits,
  TARGET_POSITIONS,
  type PlayerCandidate,
} from '@/lib/draft/auto-pick'

describe('Snake Order Generator (24 Rounds)', () => {
  it('generates correct snake order for 2 teams across 24 rounds', () => {
    const teams = ['TeamA', 'TeamB']
    const slots = generateSnakeOrder(teams, 24)

    expect(slots).toHaveLength(48)
    // Round 1 (odd): TeamA, TeamB
    expect(slots[0]).toEqual({ pickNumber: 1, round: 1, fantasyTeamId: 'TeamA' })
    expect(slots[1]).toEqual({ pickNumber: 2, round: 1, fantasyTeamId: 'TeamB' })
    // Round 2 (even): TeamB, TeamA
    expect(slots[2]).toEqual({ pickNumber: 3, round: 2, fantasyTeamId: 'TeamB' })
    expect(slots[3]).toEqual({ pickNumber: 4, round: 2, fantasyTeamId: 'TeamA' })
  })

  it('generates 240 total picks for 10 teams across 24 rounds', () => {
    const teams = Array.from({ length: 10 }, (_, i) => `Team_${i + 1}`)
    const slots = generateSnakeOrder(teams, 24)

    expect(slots).toHaveLength(240)
    expect(slots[0].fantasyTeamId).toBe('Team_1')
    expect(slots[9].fantasyTeamId).toBe('Team_10')
    expect(slots[10].fantasyTeamId).toBe('Team_10') // Round 2 reverses
    expect(slots[19].fantasyTeamId).toBe('Team_1')
  })

  it('generates 480 total picks for 20 teams', () => {
    const teams = Array.from({ length: 20 }, (_, i) => `Team_${i + 1}`)
    const slots = generateSnakeOrder(teams, 24)
    expect(slots).toHaveLength(480)
  })
})

describe('Auto-Pick Algorithm (24 Roster Rules)', () => {
  const sampleAvailable: PlayerCandidate[] = [
    { id: 'p1', name: 'Pedro', position: 'ATA', avgPoints: 8.5, totalMinutes: 1200 },
    { id: 'p2', name: 'Estêvão', position: 'ATA', avgPoints: 7.8, totalMinutes: 1100 },
    { id: 'p3', name: 'Rossi', position: 'GOL', avgPoints: 5.2, totalMinutes: 1500 },
    { id: 'p4', name: 'Léo Ortiz', position: 'ZAG', avgPoints: 6.1, totalMinutes: 1400 },
    { id: 'p5', name: 'De La Cruz', position: 'MEI', avgPoints: 7.2, totalMinutes: 1300 },
  ]

  it('calculates position deficits correctly with new targets', () => {
    const currentRoster = [
      { position: 'GOL' as const },
      { position: 'ATA' as const },
      { position: 'ATA' as const },
      { position: 'ATA' as const },
      { position: 'ATA' as const },
      { position: 'ATA' as const },
      { position: 'ATA' as const }, // ATA = 6 (full)
    ]
    const deficits = getPositionDeficits(currentRoster)

    expect(deficits.GOL).toBe(1) // 2 - 1 = 1
    expect(deficits.MEI).toBe(8) // 8 - 0 = 8
    expect(deficits.ATA).toBe(0) // 6 - 6 = 0
    expect(deficits.ZAG).toBe(2) // min 2
    expect(deficits.LAT).toBe(2) // min 2
  })

  it('prioritizes position with deficit', () => {
    // Roster has 6 ATA (full), 0 GOL, 0 LAT, 0 ZAG, 0 MEI
    const currentRoster = Array.from({ length: 6 }, () => ({ position: 'ATA' as const }))

    const picked = autoPickPlayer(sampleAvailable, currentRoster)
    // Should NOT pick ATA (Pedro/Estêvão) because ATA quota (6) is full.
    // Highest deficit points is MEI (De La Cruz, 7.2)
    expect(picked?.id).toBe('p5')
    expect(picked?.position).toBe('MEI')
  })

  it('picks highest avgPoints when multiple candidates fit', () => {
    const availableGols: PlayerCandidate[] = [
      { id: 'g1', name: 'Goleiro A', position: 'GOL', avgPoints: 4.0, totalMinutes: 1000 },
      { id: 'g2', name: 'Goleiro B', position: 'GOL', avgPoints: 6.5, totalMinutes: 1000 },
    ]
    const currentRoster: any[] = []

    const picked = autoPickPlayer(availableGols, currentRoster)
    expect(picked?.id).toBe('g2') // 6.5 > 4.0
  })

  it('prioritizes queued wishlist players over higher avgPoints players', () => {
    // Available players: Pedro (8.5 avgPoints, ATA), Rossi (5.2 avgPoints, GOL)
    // Roster has 0 GOL, 0 ATA
    // User queued Rossi (GOL) in their wishlist
    const currentRoster: any[] = []
    const queuedPlayerIds = ['p3'] // Rossi (GOL)

    const picked = autoPickPlayer(sampleAvailable, currentRoster, queuedPlayerIds)
    // Even though Pedro has 8.5 avgPoints vs Rossi 5.2, Rossi was in wishlist, so Rossi is picked!
    expect(picked?.id).toBe('p3')
    expect(picked?.name).toBe('Rossi')
  })
})
