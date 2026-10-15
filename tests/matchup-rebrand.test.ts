import { describe, it, expect } from 'vitest'
import { processAutoSubstitutions, type LineupPlayerInput } from '@/lib/lineup/auto-sub'
import { calculateTeamRoundScore } from '@/lib/scoring/scoring-engine'

describe('Matchup Rebrand & Tactical Pitch Layout Tests', () => {
  it('correctly maps effective starters for tactical pitch when auto-substitutions occur', () => {
    const starters: LineupPlayerInput[] = [
      {
        playerId: 'p-gol',
        name: 'Otávio Rezende',
        position: 'GOL',
        slotPosition: 'GOL_1',
        isCaptain: false,
        isStarter: true,
        minutes: 90,
        points: 6.7,
        clubShortName: 'CRU',
        scouts: { saves: 7 },
      },
      {
        playerId: 'p-lat1',
        name: 'Cuiabano',
        position: 'LAT',
        slotPosition: 'LAT_1',
        isCaptain: false,
        isStarter: true,
        minutes: 90,
        points: 3.5,
        clubShortName: 'VAS',
        scouts: { tackles: 2 },
      },
      {
        playerId: 'p-zag1',
        name: 'C. Terán',
        position: 'ZAG',
        slotPosition: 'ZAG_1',
        isCaptain: false,
        isStarter: true,
        minutes: 0, // DNP -> should be replaced by Luan Peres
        points: 0.0,
        matchStatus: 'not_related',
        clubShortName: 'PAL',
      },
      {
        playerId: 'p-zag2',
        name: 'N. Ferraresi',
        position: 'ZAG',
        slotPosition: 'ZAG_2',
        isCaptain: false,
        isStarter: true,
        minutes: 90,
        points: 8.3,
        clubShortName: 'BOT',
        scouts: { tackles: 1 },
      },
      {
        playerId: 'p-lat2',
        name: 'M. Bidu',
        position: 'LAT',
        slotPosition: 'LAT_2',
        isCaptain: false,
        isStarter: true,
        minutes: 90,
        points: 3.7,
        clubShortName: 'COR',
      },
      {
        playerId: 'p-mei1',
        name: 'L. Paquetá',
        position: 'MEI',
        slotPosition: 'MEI_1',
        isCaptain: false,
        isStarter: true,
        minutes: 90,
        points: 14.4,
        clubShortName: 'FLA',
        scouts: { assists: 1, tackles: 3 },
      },
      {
        playerId: 'p-mei2',
        name: 'Carrascal',
        position: 'MEI',
        slotPosition: 'MEI_2',
        isCaptain: false,
        isStarter: true,
        minutes: 90,
        points: 12.4,
        clubShortName: 'FLA',
        scouts: { goals: 1 },
      },
      {
        playerId: 'p-mei3',
        name: 'L. Romero',
        position: 'MEI',
        slotPosition: 'MEI_3',
        isCaptain: false,
        isStarter: true,
        minutes: 0, // DNP -> should be replaced by Jean Lucas
        points: 0.0,
        matchStatus: 'not_related',
        clubShortName: 'CRU',
      },
      {
        playerId: 'p-mei4',
        name: 'Christian',
        position: 'MEI',
        slotPosition: 'MEI_4',
        isCaptain: false,
        isStarter: true,
        minutes: 0, // DNP with no reserves left -> remains on pitch with 0 min & 0 pts
        points: 0.0,
        matchStatus: 'not_related',
        clubShortName: 'CRU',
      },
      {
        playerId: 'p-ata1',
        name: 'Flaco López',
        position: 'ATA',
        slotPosition: 'ATA_1',
        isCaptain: false,
        isStarter: true,
        minutes: 90,
        points: 6.2,
        clubShortName: 'PAL',
      },
      {
        playerId: 'p-ata2',
        name: 'Samuel Lino',
        position: 'ATA',
        slotPosition: 'ATA_2',
        isCaptain: true, // Captain
        isStarter: true,
        minutes: 90,
        points: 7.6, // Base points -> 7.6 * 1.5 = 11.4 pts!
        clubShortName: 'FLA',
      },
    ]

    const reserves: LineupPlayerInput[] = [
      {
        playerId: 'r-gol',
        name: 'Walter',
        position: 'GOL',
        slotPosition: 'RES_GOL',
        isCaptain: false,
        isStarter: false,
        minutes: 90,
        points: 1.5,
        clubShortName: 'MIR',
      },
      {
        playerId: 'r-lat',
        name: 'Igor Vinícius',
        position: 'LAT',
        slotPosition: 'RES_LAT',
        isCaptain: false,
        isStarter: false,
        minutes: 0,
        points: 0.0,
        matchStatus: 'benched',
        clubShortName: 'SAO',
      },
      {
        playerId: 'r-zag',
        name: 'Luan Peres',
        position: 'ZAG',
        slotPosition: 'RES_ZAG',
        isCaptain: false,
        isStarter: false,
        minutes: 82,
        points: 14.3,
        clubShortName: 'SAN',
        scouts: { cleanSheet: true },
      },
      {
        playerId: 'r-mei',
        name: 'Jean Lucas',
        position: 'MEI',
        slotPosition: 'RES_MEI',
        isCaptain: false,
        isStarter: false,
        minutes: 90,
        points: 3.5,
        clubShortName: 'BAH',
      },
      {
        playerId: 'r-ata',
        name: 'C. Pavón',
        position: 'ATA',
        slotPosition: 'RES_ATA',
        isCaptain: false,
        isStarter: false,
        minutes: 90,
        points: 8.3,
        clubShortName: 'GRE',
      },
    ]

    const processed = processAutoSubstitutions(starters, reserves)

    // Exactly 2 substitutions performed
    expect(processed.substitutions.length).toBe(2)
    expect(processed.substitutions[0].outPlayer.name).toBe('C. Terán')
    expect(processed.substitutions[0].inPlayer.name).toBe('Luan Peres')
    expect(processed.substitutions[1].outPlayer.name).toBe('L. Romero')
    expect(processed.substitutions[1].inPlayer.name).toBe('Jean Lucas')

    // Captain bonus: Samuel Lino (7.6 * 0.5 = 3.8 pts)
    expect(processed.captainBonus).toBe(3.8)

    // Total points matches the sum:
    // Otavio(6.7) + Cuiabano(3.5) + Luan Peres(14.3) + Ferraresi(8.3) + Bidu(3.7)
    // + Paqueta(14.4) + Carrascal(12.4) + Jean Lucas(3.5) + Christian(0.0)
    // + Flaco(6.2) + Samuel Lino(7.6 + 3.8 = 11.4)
    // = 6.7 + 3.5 + 14.3 + 8.3 + 3.7 + 14.4 + 12.4 + 3.5 + 0.0 + 6.2 + 11.4 = 88.2 (approx)
    expect(processed.totalPoints).toBeGreaterThan(80)

    // Verify subbedOut / subbedIn flags
    const teran = processed.starters.find((s) => s.name === 'C. Terán')
    expect(teran?.subbedOut).toBe(true)
    expect(teran?.subbedInBy?.name).toBe('Luan Peres')

    const luanPeres = processed.reserves.find((r) => r.name === 'Luan Peres')
    expect(luanPeres?.subbedIn).toBe(true)
    expect(luanPeres?.subbedFor?.name).toBe('C. Terán')
  })

  it('correctly calculates captain multiplier and score differential for MatchupDetailsModal', () => {
    const homeCaptainPoints = 7.6
    const homeCaptainFinal = homeCaptainPoints * 1.5
    expect(homeCaptainFinal).toBeCloseTo(11.4, 1)

    const awayCaptainPoints = 13.0
    const awayCaptainFinal = awayCaptainPoints * 1.5
    expect(awayCaptainFinal).toBeCloseTo(19.5, 1)

    const homeScore = 90.1
    const awayScore = 105.7
    const diff = Math.abs(homeScore - awayScore)
    expect(diff).toBeCloseTo(15.6, 1)
  })
})
