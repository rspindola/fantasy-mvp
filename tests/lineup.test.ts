import { describe, it, expect } from 'vitest'
import { validateLineup } from '@/lib/lineup/lineup-engine'
import { generateAutoFallbackLineup, autoCompleteLineup, checkRoundLockStatus } from '@/lib/lineup/lock'

describe('Lineup Engine & Validation', () => {
  const dummyRoster = [
    { id: 'p1', position: 'GOL' as const, avgPoints: 5.0 },
    { id: 'p2', position: 'GOL' as const, avgPoints: 4.0 },
    { id: 'p3', position: 'LAT' as const, avgPoints: 6.0 },
    { id: 'p4', position: 'LAT' as const, avgPoints: 5.5 },
    { id: 'p5', position: 'ZAG' as const, avgPoints: 6.2 },
    { id: 'p6', position: 'ZAG' as const, avgPoints: 5.8 },
    { id: 'p7', position: 'MEI' as const, avgPoints: 7.0 },
    { id: 'p8', position: 'MEI' as const, avgPoints: 6.5 },
    { id: 'p9', position: 'MEI' as const, avgPoints: 6.0 },
    { id: 'p10', position: 'ATA' as const, avgPoints: 8.0 },
    { id: 'p11', position: 'ATA' as const, avgPoints: 7.5 },
    { id: 'p12', position: 'ATA' as const, avgPoints: 7.2 },
    { id: 'p13', position: 'MEI' as const, avgPoints: 5.5 },
  ]

  const rosterIds = dummyRoster.map((r) => r.id)

  it('accepts valid 4-3-3 lineup with 11 starters and 1 captain', () => {
    const starters = [
      { playerId: 'p1', position: 'GOL' as const, isCaptain: false, isStarter: true },
      { playerId: 'p3', position: 'LAT' as const, isCaptain: false, isStarter: true },
      { playerId: 'p4', position: 'LAT' as const, isCaptain: false, isStarter: true },
      { playerId: 'p5', position: 'ZAG' as const, isCaptain: false, isStarter: true },
      { playerId: 'p6', position: 'ZAG' as const, isCaptain: false, isStarter: true },
      { playerId: 'p7', position: 'MEI' as const, isCaptain: false, isStarter: true },
      { playerId: 'p8', position: 'MEI' as const, isCaptain: false, isStarter: true },
      { playerId: 'p9', position: 'MEI' as const, isCaptain: false, isStarter: true },
      { playerId: 'p10', position: 'ATA' as const, isCaptain: true, isStarter: true },
      { playerId: 'p11', position: 'ATA' as const, isCaptain: false, isStarter: true },
      { playerId: 'p12', position: 'ATA' as const, isCaptain: false, isStarter: true },
    ]

    const result = validateLineup({ formation: '4-3-3', starters, rosterPlayerIds: rosterIds })
    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects lineup if not 11 starters', () => {
    const starters = [
      { playerId: 'p1', position: 'GOL' as const, isCaptain: true, isStarter: true },
    ]
    const result = validateLineup({ formation: '4-3-3', starters, rosterPlayerIds: rosterIds })
    expect(result.isValid).toBe(false)
  })

  it('rejects lineup if zero or multiple captains', () => {
    const starters = [
      { playerId: 'p1', position: 'GOL' as const, isCaptain: true, isStarter: true },
      { playerId: 'p3', position: 'LAT' as const, isCaptain: true, isStarter: true },
    ]
    const result = validateLineup({ formation: '4-3-3', starters, rosterPlayerIds: rosterIds })
    expect(result.isValid).toBe(false)
  })

  it('generates auto fallback 4-3-3 lineup correctly', () => {
    const fallback = generateAutoFallbackLineup(dummyRoster)
    expect(fallback.formation).toBe('4-3-3')
    expect(fallback.starters).toHaveLength(11)
    const captain = fallback.starters.find((s) => s.isCaptain)
    expect(captain).toBeDefined()
    expect(captain?.playerId).toBe('p10') // highest avgPoints (8.0)
  })

  it('validates 4-4-2 formation correctly (1 GOL, 2 LAT, 2 ZAG, 4 MEI, 2 ATA)', () => {
    const roster = [
      { id: 'g1', position: 'GOL' as const, avgPoints: 5.0 },
      { id: 'l1', position: 'LAT' as const, avgPoints: 5.0 },
      { id: 'l2', position: 'LAT' as const, avgPoints: 5.0 },
      { id: 'z1', position: 'ZAG' as const, avgPoints: 5.0 },
      { id: 'z2', position: 'ZAG' as const, avgPoints: 5.0 },
      { id: 'm1', position: 'MEI' as const, avgPoints: 5.0 },
      { id: 'm2', position: 'MEI' as const, avgPoints: 5.0 },
      { id: 'm3', position: 'MEI' as const, avgPoints: 5.0 },
      { id: 'm4', position: 'MEI' as const, avgPoints: 5.0 },
      { id: 'a1', position: 'ATA' as const, avgPoints: 5.0 },
      { id: 'a2', position: 'ATA' as const, avgPoints: 5.0 },
    ]
    const starters = roster.map((p, i) => ({
      playerId: p.id,
      position: p.position,
      isCaptain: i === 0,
      isStarter: true,
    }))
    const result = validateLineup({
      formation: '4-4-2',
      starters,
      rosterPlayerIds: roster.map((p) => p.id),
    })
    expect(result.isValid).toBe(true)
  })

  it('validates 3-4-3 formation correctly (1 GOL, 0 LAT, 3 ZAG, 4 MEI, 3 ATA)', () => {
    const roster = [
      { id: 'g1', position: 'GOL' as const, avgPoints: 5.0 },
      { id: 'z1', position: 'ZAG' as const, avgPoints: 5.0 },
      { id: 'z2', position: 'ZAG' as const, avgPoints: 5.0 },
      { id: 'z3', position: 'ZAG' as const, avgPoints: 5.0 },
      { id: 'm1', position: 'MEI' as const, avgPoints: 5.0 },
      { id: 'm2', position: 'MEI' as const, avgPoints: 5.0 },
      { id: 'm3', position: 'MEI' as const, avgPoints: 5.0 },
      { id: 'm4', position: 'MEI' as const, avgPoints: 5.0 },
      { id: 'a1', position: 'ATA' as const, avgPoints: 5.0 },
      { id: 'a2', position: 'ATA' as const, avgPoints: 5.0 },
      { id: 'a3', position: 'ATA' as const, avgPoints: 5.0 },
    ]
    const starters = roster.map((p, i) => ({
      playerId: p.id,
      position: p.position,
      isCaptain: i === 0,
      isStarter: true,
    }))
    const result = validateLineup({
      formation: '3-4-3',
      starters,
      rosterPlayerIds: roster.map((p) => p.id),
    })
    expect(result.isValid).toBe(true)
  })

  it('validates 5-3-2 formation correctly (1 GOL, 2 LAT, 3 ZAG, 3 MEI, 2 ATA)', () => {
    const roster = [
      { id: 'g1', position: 'GOL' as const, avgPoints: 5.0 },
      { id: 'l1', position: 'LAT' as const, avgPoints: 5.0 },
      { id: 'l2', position: 'LAT' as const, avgPoints: 5.0 },
      { id: 'z1', position: 'ZAG' as const, avgPoints: 5.0 },
      { id: 'z2', position: 'ZAG' as const, avgPoints: 5.0 },
      { id: 'z3', position: 'ZAG' as const, avgPoints: 5.0 },
      { id: 'm1', position: 'MEI' as const, avgPoints: 5.0 },
      { id: 'm2', position: 'MEI' as const, avgPoints: 5.0 },
      { id: 'm3', position: 'MEI' as const, avgPoints: 5.0 },
      { id: 'a1', position: 'ATA' as const, avgPoints: 5.0 },
      { id: 'a2', position: 'ATA' as const, avgPoints: 5.0 },
    ]
    const starters = roster.map((p, i) => ({
      playerId: p.id,
      position: p.position,
      isCaptain: i === 0,
      isStarter: true,
    }))
    const result = validateLineup({
      formation: '5-3-2',
      starters,
      rosterPlayerIds: roster.map((p) => p.id),
    })
    expect(result.isValid).toBe(true)
  })

  it('autoCompleteLineup fills an empty team to 11 starters with a captain', () => {
    const res = autoCompleteLineup(dummyRoster, '4-3-3', [], [])
    expect(res.formation).toBe('4-3-3')
    expect(res.starters).toHaveLength(11)
    expect(res.starters.some((s) => s.isCaptain)).toBe(true)
    const captain = res.starters.find((s) => s.isCaptain)
    expect(captain?.playerId).toBe('p10') // highest avgPoints
  })

  it('autoCompleteLineup preserves existing starters and fills remaining positions', () => {
    // Manager only picked 3 starters: 1 GOL, 1 MEI (as captain), 1 ATA
    const partialStarters = [
      { playerId: 'p2', position: 'GOL' as const, isCaptain: false },
      { playerId: 'p8', position: 'MEI' as const, isCaptain: true },
      { playerId: 'p12', position: 'ATA' as const, isCaptain: false },
    ]

    const res = autoCompleteLineup(dummyRoster, '4-3-3', partialStarters, [])
    expect(res.starters).toHaveLength(11)

    // Verify existing choices are preserved
    expect(res.starters.some((s) => s.playerId === 'p2')).toBe(true)
    expect(res.starters.some((s) => s.playerId === 'p8' && s.isCaptain)).toBe(true)
    expect(res.starters.some((s) => s.playerId === 'p12')).toBe(true)

    // No duplicate players
    const starterIds = res.starters.map((s) => s.playerId)
    expect(new Set(starterIds).size).toBe(11)
  })

  it('autoCompleteLineup respects selected formation (e.g. 4-4-2)', () => {
    const res = autoCompleteLineup(dummyRoster, '4-4-2', [], [])
    expect(res.formation).toBe('4-4-2')
    expect(res.starters).toHaveLength(11)
    const posCounts = res.starters.reduce((acc, s) => {
      acc[s.position] = (acc[s.position] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    expect(posCounts['GOL']).toBe(1)
    expect(posCounts['LAT']).toBe(2)
    expect(posCounts['ZAG']).toBe(2)
    expect(posCounts['MEI']).toBe(4)
    expect(posCounts['ATA']).toBe(2)
  })
})

describe('checkRoundLockStatus', () => {
  it('locks the market if any fixture has finished (status: FT)', async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    { id: 'f1', kickoff_at: '2026-10-18T20:00:00Z', status: 'FT', home_score: 2, away_score: 0 },
                    { id: 'f2', kickoff_at: '2026-10-18T20:00:00Z', status: 'scheduled', home_score: null, away_score: null },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      }),
    }

    const res = await checkRoundLockStatus('season-1', 31, { supabaseClient: mockSupabase as any })
    expect(res.isLocked).toBe(true)
    expect(res.roundNumber).toBe(31)
  })

  it('locks the market if any fixture is live', async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    { id: 'f1', kickoff_at: '2026-10-18T20:00:00Z', status: 'live', home_score: 1, away_score: 0 },
                    { id: 'f2', kickoff_at: '2026-10-18T20:00:00Z', status: 'scheduled', home_score: null, away_score: null },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      }),
    }

    const res = await checkRoundLockStatus('season-1', 31, { supabaseClient: mockSupabase as any })
    expect(res.isLocked).toBe(true)
  })

  it('locks the market if current time is within 30 min of kickoff', async () => {
    const nearFutureKickoff = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    { id: 'f1', kickoff_at: nearFutureKickoff, status: 'scheduled', home_score: null, away_score: null },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      }),
    }

    const res = await checkRoundLockStatus('season-1', 31, { supabaseClient: mockSupabase as any })
    expect(res.isLocked).toBe(true)
  })

  it('leaves the market unlocked if all fixtures are scheduled well in advance', async () => {
    const distantKickoff = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    const mockSupabase = {
      from: (table: string) => {
        if (table === 'fixtures') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () =>
                    Promise.resolve({
                      data: [
                        { id: 'f1', kickoff_at: distantKickoff, status: 'scheduled', home_score: null, away_score: null },
                      ],
                      error: null,
                    }),
                }),
              }),
            }),
          }
        }
        // player_fixture_stats fallback check
        return {
          select: () => ({
            in: () => Promise.resolve({ count: 0, error: null }),
          }),
        }
      },
    }

    const res = await checkRoundLockStatus('season-1', 31, { supabaseClient: mockSupabase as any })
    expect(res.isLocked).toBe(false)
  })
})

