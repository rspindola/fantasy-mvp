import { describe, it, expect } from 'vitest'
import { generateBergerMatchups } from '@/lib/h2h/berger-generator'
import {
  evaluateH2HMatchupResult,
  calculateH2HStandings,
} from '@/lib/h2h/h2h-processor'
import { calculateTotalStandings } from '@/lib/standings/total-standings'

describe('Berger H2H Generator & Standings', () => {
  it('generates correct round-robin matchups for 4 teams (3 rounds)', () => {
    const teams = ['T1', 'T2', 'T3', 'T4']
    const matchups = generateBergerMatchups(teams, 1)

    // N=4 -> 3 rounds, 2 matches per round -> 6 total matches
    expect(matchups).toHaveLength(6)

    const round1 = matchups.filter((m) => m.fixtureRound === 1)
    const round2 = matchups.filter((m) => m.fixtureRound === 2)
    const round3 = matchups.filter((m) => m.fixtureRound === 3)

    expect(round1).toHaveLength(2)
    expect(round2).toHaveLength(2)
    expect(round3).toHaveLength(2)
  })

  it('handles odd number of teams with BYE filtering (3 teams -> 3 rounds)', () => {
    const teams = ['T1', 'T2', 'T3']
    const matchups = generateBergerMatchups(teams, 1)

    // 3 teams + 1 BYE -> 3 rounds, 1 active match per round -> 3 matches total
    expect(matchups).toHaveLength(3)
  })

  it('evaluates H2H matchup results correctly', () => {
    expect(evaluateH2HMatchupResult(15.5, 10.0)).toBe('home')
    expect(evaluateH2HMatchupResult(8.0, 12.0)).toBe('away')
    expect(evaluateH2HMatchupResult(10.0, 10.0)).toBe('draw')
  })

  it('calculates H2H standings table with points and tiebreakers', () => {
    const matchups = [
      {
        id: 'm1',
        fixtureRound: 1,
        homeTeamId: 't1',
        homeTeamName: 'Time Alpha',
        awayTeamId: 't2',
        awayTeamName: 'Time Beta',
        homePoints: 20.0,
        awayPoints: 10.0,
        result: 'home' as const,
      },
    ]

    const standings = calculateH2HStandings(matchups)
    expect(standings).toHaveLength(2)
    expect(standings[0].fantasyTeamId).toBe('t1')
    expect(standings[0].h2hPoints).toBe(3)
    expect(standings[0].wins).toBe(1)
    expect(standings[1].fantasyTeamId).toBe('t2')
    expect(standings[1].h2hPoints).toBe(0)
    expect(standings[1].losses).toBe(1)
  })

  it('calculates TOTAL standings leaderboard correctly', () => {
    const history = [
      {
        fantasyTeamId: 't1',
        teamName: 'Time Alpha',
        managerName: 'Pedro',
        fixtureRound: 1,
        totalPoints: 50.0,
        captainBonus: 5.0,
      },
      {
        fantasyTeamId: 't2',
        teamName: 'Time Beta',
        managerName: 'Lucas',
        fixtureRound: 1,
        totalPoints: 60.0,
        captainBonus: 6.0,
      },
    ]

    const standings = calculateTotalStandings(history)
    expect(standings[0].fantasyTeamId).toBe('t2')
    expect(standings[0].cumulativePoints).toBe(60.0)
    expect(standings[0].roundsWon).toBe(1)
    expect(standings[1].fantasyTeamId).toBe('t1')
    expect(standings[1].cumulativePoints).toBe(50.0)
  })
})
