import { describe, it, expect } from 'vitest'
import { calculatePlayerScoring } from '@/lib/scoring/scoring-engine'

describe('Player Detail Modal Scouts & Metrics Calculation', () => {
  it('correctly aggregates multiple fixture scouts into season totals', () => {
    // Round 1 stats
    const r1Scouts = {
      position: 'ATA' as const,
      minutes: 90,
      goals: 2, // 16.0
      assists: 1, // 4.0
      shotsOnWoodwork: 0,
      shotsOnTarget: 1, // 1.2
      shotsOffTarget: 1, // 0.8
      foulsDrawn: 2, // 1.0
      penaltiesWon: 0,
      passesFailed: 5, // -0.5
      offsides: 0,
      penaltiesMissed: 0,
      cleanSheet: false,
      saves: 0,
      penaltySaves: 0,
      tackles: 1, // 1.5
      foulsCommitted: 1, // -0.3
      ownGoals: 0,
      yellowCards: 0,
      redCards: 0,
      goalsConceded: 1,
      penaltiesCommitted: 0,
    }
    const r1Pts = calculatePlayerScoring(r1Scouts)

    // Round 2 stats
    const r2Scouts = {
      position: 'ATA' as const,
      minutes: 75,
      goals: 0,
      assists: 1, // 4.0
      shotsOnWoodwork: 1, // 3.0
      shotsOnTarget: 0,
      shotsOffTarget: 2, // 1.6
      foulsDrawn: 1, // 0.5
      penaltiesWon: 0,
      passesFailed: 2, // -0.2
      offsides: 1, // -0.1
      penaltiesMissed: 0,
      cleanSheet: false,
      saves: 0,
      penaltySaves: 0,
      tackles: 0,
      foulsCommitted: 2, // -0.6
      ownGoals: 0,
      yellowCards: 1, // -1.0
      redCards: 0,
      goalsConceded: 0,
      penaltiesCommitted: 0,
    }
    const r2Pts = calculatePlayerScoring(r2Scouts)

    expect(r1Pts).toBeCloseTo(23.7, 1)
    expect(r2Pts).toBeCloseTo(7.2, 1)

    const totalPts = Number((r1Pts + r2Pts).toFixed(2))
    const avgPts = Number((totalPts / 2).toFixed(2))

    expect(totalPts).toBeCloseTo(30.9, 1)
    expect(avgPts).toBeCloseTo(15.45, 2)
  })

  it('correctly calculates defensive stats including clean sheets and saves for goalkeepers', () => {
    const gkScouts = {
      position: 'GOL' as const,
      minutes: 90,
      goals: 0,
      assists: 0,
      shotsOnWoodwork: 0,
      shotsOnTarget: 0,
      shotsOffTarget: 0,
      foulsDrawn: 0,
      penaltiesWon: 0,
      passesFailed: 1, // -0.1
      offsides: 0,
      penaltiesMissed: 0,
      cleanSheet: true, // +5.0
      saves: 4, // 4 * 1.3 = +5.2
      penaltySaves: 1, // +7.0
      tackles: 0,
      foulsCommitted: 0,
      ownGoals: 0,
      yellowCards: 0,
      redCards: 0,
      goalsConceded: 0,
      penaltiesCommitted: 0,
    }

    const gkPts = calculatePlayerScoring(gkScouts)
    // 5.0 (SG) + 5.2 (DE) + 7.0 (DP) - 0.1 (PE) = 17.1 pts
    expect(gkPts).toBeCloseTo(17.1, 1)
  })
})
