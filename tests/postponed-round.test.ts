import { describe, it, expect } from 'vitest'
import { processAutoSubstitutions, type LineupPlayerInput } from '@/lib/lineup/auto-sub'
import { calculateH2HStandings } from '@/lib/h2h/h2h-processor'

describe('Postponed Rounds & Retroactive Recalculation', () => {
  it('substitutes a starter provisionally when their match is postponed (0 min)', () => {
    // Starter is in a postponed fixture (0 min)
    const starterPostponed: LineupPlayerInput = {
      playerId: 'p1',
      name: 'Pedro (FLA)',
      position: 'ATA',
      slotPosition: 'ATA1',
      isCaptain: true,
      isStarter: true,
      minutes: 0,
      points: 0,
      matchStatus: 'postponed',
    }

    const otherStarter: LineupPlayerInput = {
      playerId: 'p2',
      name: 'Calleri (SAO)',
      position: 'ATA',
      slotPosition: 'ATA2',
      isCaptain: false,
      isStarter: true,
      minutes: 90,
      points: 8.5,
      matchStatus: 'played',
    }

    const benchReserve: LineupPlayerInput = {
      playerId: 'p3',
      name: 'Yuri Alberto (COR)',
      position: 'ATA',
      slotPosition: 'RES_ATA',
      isCaptain: false,
      isStarter: false,
      minutes: 90,
      points: 5.0,
      matchStatus: 'played',
    }

    // Run provisional Auto-Sub
    const provisional = processAutoSubstitutions(
      [starterPostponed, otherStarter],
      [benchReserve]
    )

    // Pedro was subbed out, Yuri Alberto stepped in
    expect(provisional.substitutions.length).toBe(1)
    expect(provisional.substitutions[0].outPlayer.name).toBe('Pedro (FLA)')
    expect(provisional.substitutions[0].inPlayer.name).toBe('Yuri Alberto (COR)')
    expect(provisional.substitutions[0].captainTransferred).toBe(true)

    // Yuri Alberto inherits captaincy (5.0 * 1.5 = 7.5) + Calleri (8.5) = 16.0
    expect(provisional.totalPoints).toBe(16.0)
  })

  it('retroactively restores starter and recalculates points when postponed match is played', () => {
    // The postponed match was played weeks later! Pedro now played 90 min and scored 2 goals (16 pts)!
    const starterNowPlayed: LineupPlayerInput = {
      playerId: 'p1',
      name: 'Pedro (FLA)',
      position: 'ATA',
      slotPosition: 'ATA1',
      isCaptain: true,
      isStarter: true,
      minutes: 90,
      points: 16.0,
      matchStatus: 'played',
    }

    const otherStarter: LineupPlayerInput = {
      playerId: 'p2',
      name: 'Calleri (SAO)',
      position: 'ATA',
      slotPosition: 'ATA2',
      isCaptain: false,
      isStarter: true,
      minutes: 90,
      points: 8.5,
      matchStatus: 'played',
    }

    const benchReserve: LineupPlayerInput = {
      playerId: 'p3',
      name: 'Yuri Alberto (COR)',
      position: 'ATA',
      slotPosition: 'RES_ATA',
      isCaptain: false,
      isStarter: false,
      minutes: 90,
      points: 5.0,
      matchStatus: 'played',
    }

    // Run retroactive recalculation
    const recalculated = processAutoSubstitutions(
      [starterNowPlayed, otherStarter],
      [benchReserve]
    )

    // No substitutions triggered because Pedro played!
    expect(recalculated.substitutions.length).toBe(0)
    // Pedro is captain: 16 * 1.5 = 24.0; Calleri: 8.5 -> Total = 32.5 pts!
    expect(recalculated.totalPoints).toBe(32.5)
  })

  it('retroactively updates H2H standings when postponed match turns a loss into a win', () => {
    // Before postponed match: Team A lost to Team B (16.0 vs 20.0)
    const initialMatchups = [
      {
        id: 'm1',
        fixtureRound: 28,
        homeTeamId: 'teamA',
        homeTeamName: 'Time A',
        awayTeamId: 'teamB',
        awayTeamName: 'Time B',
        homePoints: 16.0,
        awayPoints: 20.0,
        result: 'away' as const,
      },
    ]

    const initialStandings = calculateH2HStandings(initialMatchups)
    const teamAInitial = initialStandings.find((s) => s.fantasyTeamId === 'teamA')
    expect(teamAInitial?.losses).toBe(1)
    expect(teamAInitial?.h2hPoints).toBe(0)

    // After retroactive recalculation: Team A scored 32.5 with Pedro's postponed game and won 32.5 vs 20.0!
    const recalculatedMatchups = [
      {
        id: 'm1',
        fixtureRound: 28,
        homeTeamId: 'teamA',
        homeTeamName: 'Time A',
        awayTeamId: 'teamB',
        awayTeamName: 'Time B',
        homePoints: 32.5,
        awayPoints: 20.0,
        result: 'home' as const,
      },
    ]

    const recalculatedStandings = calculateH2HStandings(recalculatedMatchups)
    const teamARecalculated = recalculatedStandings.find((s) => s.fantasyTeamId === 'teamA')
    expect(teamARecalculated?.wins).toBe(1)
    expect(teamARecalculated?.losses).toBe(0)
    expect(teamARecalculated?.h2hPoints).toBe(3)
  })
})
