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

describe('Draft Pick Authorization (Commissioner Force Pick)', () => {
  function checkPickPermission(params: {
    userId: string
    expectedTeamUserId: string
    commissionerId: string
    isAutoPick?: boolean
  }): boolean {
    if (params.isAutoPick) return true
    const isOwner = params.expectedTeamUserId === params.userId
    const isCommissioner = params.commissionerId === params.userId
    return isOwner || isCommissioner
  }

  it('allows the team owner to pick on their turn', () => {
    expect(
      checkPickPermission({
        userId: 'user_team_c',
        expectedTeamUserId: 'user_team_c',
        commissionerId: 'user_commish',
      })
    ).toBe(true)
  })

  it('allows the commissioner to pick on behalf of Time C when Time C is unavailable', () => {
    expect(
      checkPickPermission({
        userId: 'user_commish',
        expectedTeamUserId: 'user_team_c',
        commissionerId: 'user_commish',
      })
    ).toBe(true)
  })

  it('rejects another random team manager from picking for Time C', () => {
    expect(
      checkPickPermission({
        userId: 'user_team_a',
        expectedTeamUserId: 'user_team_c',
        commissionerId: 'user_commish',
      })
    ).toBe(false)
  })

  it('always allows server auto-pick', () => {
    expect(
      checkPickPermission({
        userId: '',
        expectedTeamUserId: 'user_team_c',
        commissionerId: 'user_commish',
        isAutoPick: true,
      })
    ).toBe(true)
  })
})

describe('Pre-Draft Wishlist Queue Logic', () => {
  type QueueItem = { playerId: string; priority: number }

  function reorderQueue(queue: QueueItem[], playerId: string, direction: 'UP' | 'DOWN'): QueueItem[] {
    const list = [...queue].sort((a, b) => a.priority - b.priority)
    const index = list.findIndex((item) => item.playerId === playerId)
    if (index === -1) return list

    const targetIndex = direction === 'UP' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= list.length) return list

    // Swap priorities
    const currentPriority = list[index].priority
    list[index] = { ...list[index], priority: list[targetIndex].priority }
    list[targetIndex] = { ...list[targetIndex], priority: currentPriority }

    return list.sort((a, b) => a.priority - b.priority)
  }

  it('moves an item UP in priority (from #2 to #1)', () => {
    const initial: QueueItem[] = [
      { playerId: 'p1', priority: 1 },
      { playerId: 'p2', priority: 2 },
      { playerId: 'p3', priority: 3 },
    ]

    const updated = reorderQueue(initial, 'p2', 'UP')
    expect(updated[0].playerId).toBe('p2')
    expect(updated[1].playerId).toBe('p1')
    expect(updated[2].playerId).toBe('p3')
  })

  it('moves an item DOWN in priority (from #1 to #2)', () => {
    const initial: QueueItem[] = [
      { playerId: 'p1', priority: 1 },
      { playerId: 'p2', priority: 2 },
      { playerId: 'p3', priority: 3 },
    ]

    const updated = reorderQueue(initial, 'p1', 'DOWN')
    expect(updated[0].playerId).toBe('p2')
    expect(updated[1].playerId).toBe('p1')
    expect(updated[2].playerId).toBe('p3')
  })

  it('ignores move UP if item is already at the top (#1)', () => {
    const initial: QueueItem[] = [
      { playerId: 'p1', priority: 1 },
      { playerId: 'p2', priority: 2 },
    ]

    const updated = reorderQueue(initial, 'p1', 'UP')
    expect(updated[0].playerId).toBe('p1')
  })

  it('ignores move DOWN if item is already at the bottom', () => {
    const initial: QueueItem[] = [
      { playerId: 'p1', priority: 1 },
      { playerId: 'p2', priority: 2 },
    ]

    const updated = reorderQueue(initial, 'p2', 'DOWN')
    expect(updated[1].playerId).toBe('p2')
  })
})

