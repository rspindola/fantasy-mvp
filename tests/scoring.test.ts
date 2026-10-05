import { describe, it, expect } from 'vitest'
import {
  calculatePlayerScoring,
  calculateTeamRoundScore,
  type PlayerScouts,
} from '@/lib/scoring/scoring-engine'

describe('Cartola FC Scoring Engine', () => {
  it('returns 0 if player has 0 minutes played', () => {
    const scouts: PlayerScouts = {
      position: 'ATA',
      minutes: 0,
      goals: 2, // Even if goals set, 0 minutes = 0 pts
      assists: 1,
      shotsOnWoodwork: 0,
      shotsOnTarget: 0,
      shotsOffTarget: 0,
      foulsDrawn: 0,
      penaltiesWon: 0,
      passesFailed: 0,
      offsides: 0,
      penaltiesMissed: 0,
      cleanSheet: false,
      saves: 0,
      penaltySaves: 0,
      tackles: 0,
      foulsCommitted: 0,
      ownGoals: 0,
      yellowCards: 0,
      redCards: 0,
      goalsConceded: 0,
      penaltiesCommitted: 0,
    }

    expect(calculatePlayerScoring(scouts)).toBe(0)
  })

  it('calculates attacker score correctly', () => {
    const scouts: PlayerScouts = {
      position: 'ATA',
      minutes: 90,
      goals: 1, // +8.0
      assists: 1, // +4.0
      shotsOnTarget: 2, // 2 * 1.2 = +2.4
      yellowCards: 1, // -1.0
      shotsOnWoodwork: 0,
      shotsOffTarget: 0,
      foulsDrawn: 0,
      penaltiesWon: 0,
      passesFailed: 0,
      offsides: 0,
      penaltiesMissed: 0,
      cleanSheet: false,
      saves: 0,
      penaltySaves: 0,
      tackles: 0,
      foulsCommitted: 0,
      ownGoals: 0,
      redCards: 0,
      goalsConceded: 0,
      penaltiesCommitted: 0,
    }

    // 8 + 4 + 2.4 - 1.0 = 13.4
    expect(calculatePlayerScoring(scouts)).toBe(13.4)
  })

  it('calculates goalkeeper score with Clean Sheet (+5.0)', () => {
    const scouts: PlayerScouts = {
      position: 'GOL',
      minutes: 90,
      cleanSheet: true, // +5.0
      saves: 3, // 3 * 1.3 = +3.9
      goalsConceded: 0,
      goals: 0,
      assists: 0,
      shotsOnWoodwork: 0,
      shotsOnTarget: 0,
      shotsOffTarget: 0,
      foulsDrawn: 0,
      penaltiesWon: 0,
      passesFailed: 0,
      offsides: 0,
      penaltiesMissed: 0,
      penaltySaves: 0,
      tackles: 0,
      foulsCommitted: 0,
      ownGoals: 0,
      yellowCards: 0,
      redCards: 0,
      penaltiesCommitted: 0,
    }

    // 5.0 + 3.9 = 8.9
    expect(calculatePlayerScoring(scouts)).toBe(8.9)
  })

  it('calculates team score and applies 1.5x captain multiplier', () => {
    const starters = [
      { points: 10.0, isCaptain: true }, // 10.0 + 5.0 bonus = 15.0
      { points: 8.0, isCaptain: false },
      { points: 5.0, isCaptain: false },
    ]

    const result = calculateTeamRoundScore(starters)
    expect(result.captainBonus).toBe(5.0)
    expect(result.totalPoints).toBe(28.0) // 10 + 8 + 5 + 5 = 28
  })

  it('calculates passes completed (+0.1) and failed (-0.1)', () => {
    const scouts: PlayerScouts = {
      position: 'MEI',
      minutes: 90,
      goals: 0,
      assists: 0,
      shotsOnWoodwork: 0,
      shotsOnTarget: 0,
      shotsOffTarget: 0,
      foulsDrawn: 0,
      penaltiesWon: 0,
      passesCompleted: 30, // 30 * +0.1 = +3.0
      passesFailed: 5, // 5 * -0.1 = -0.5
      offsides: 0,
      penaltiesMissed: 0,
      cleanSheet: false,
      saves: 0,
      penaltySaves: 0,
      tackles: 0,
      foulsCommitted: 0,
      ownGoals: 0,
      yellowCards: 0,
      redCards: 0,
      goalsConceded: 0,
      penaltiesCommitted: 0,
    }

    // 3.0 - 0.5 = 2.5
    expect(calculatePlayerScoring(scouts)).toBe(2.5)
  })

  it('calculates lateral score correctly with and without clean sheet', () => {
    const baseScouts: PlayerScouts = {
      position: 'LAT',
      minutes: 82,
      goals: 1, // +8.0
      assists: 1, // +4.0
      tackles: 7, // 7 * 1.5 = +10.5
      shotsOnTarget: 1, // +1.2
      passesCompleted: 19, // 19 * 0.1 = +1.9
      passesFailed: 8, // 8 * -0.1 = -0.8
      yellowCards: 1, // -1.0
      cleanSheet: false, // Team conceded goal (2-1)
      shotsOnWoodwork: 0,
      shotsOffTarget: 0,
      foulsDrawn: 0,
      penaltiesWon: 0,
      offsides: 0,
      penaltiesMissed: 0,
      saves: 0,
      penaltySaves: 0,
      foulsCommitted: 0,
      ownGoals: 0,
      redCards: 0,
      goalsConceded: 0,
      penaltiesCommitted: 0,
    }

    // 8 + 4 + 10.5 + 1.2 + 1.9 - 0.8 - 1.0 = 23.8
    expect(calculatePlayerScoring(baseScouts)).toBe(23.8)

    // If clean sheet was kept (+5.0): 23.8 + 5.0 = 28.8
    expect(calculatePlayerScoring({ ...baseScouts, cleanSheet: true })).toBe(28.8)
  })
})

